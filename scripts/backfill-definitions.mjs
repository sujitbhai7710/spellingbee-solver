#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = process.env.API_BASE || 'https://spelling-bee-api.sbsolver.workers.dev';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('=', 2);
    if (parts.length !== 2) continue;
    const key = parts[0].trim();
    let value = parts[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function resolveWorkerKey() {
  if (process.env.WORKER_ADMIN_API_KEY) return process.env.WORKER_ADMIN_API_KEY;
  if (process.env.APIKEY) return process.env.APIKEY;

  const localEnv = readEnvFile(join(repoRoot, 'cloudflare.local.env'));
  if (localEnv.WORKER_ADMIN_API_KEY) return localEnv.WORKER_ADMIN_API_KEY;
  if (localEnv.APIKEY) return localEnv.APIKEY;

  const dotEnv = readEnvFile(join(repoRoot, '.env'));
  return dotEnv.WORKER_ADMIN_API_KEY || dotEnv.APIKEY || '';
}

const WORKER_ADMIN_API_KEY = resolveWorkerKey();
const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || '';
const NVIDIA_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'qwen/qwen3-next-80b-a3b-instruct';
const NVIDIA_NIM_FALLBACK_MODELS = String(
  process.env.NVIDIA_NIM_FALLBACK_MODELS || 'minimaxai/minimax-m2.7,qwen/qwen3.5-397b-a17b',
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const NVIDIA_NIM_BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NVIDIA_NIM_TIMEOUT_MS = Number(process.env.NVIDIA_NIM_TIMEOUT_MS || 90000);
const NVIDIA_NIM_MAX_TOKENS = Number(process.env.NVIDIA_NIM_MAX_TOKENS || 2600);
const DEFINITION_BATCH_SIZE = 4;
const DEFINITION_BACKLOG_PULL_LIMIT = Number(process.env.DEFINITION_BACKLOG_PULL_LIMIT || 24);
const DEFINITION_BACKLOG_MAX_MINUTES = Number(process.env.DEFINITION_BACKLOG_MAX_MINUTES || 30);
const DEFINITION_BACKLOG_BOOTSTRAP_LIMIT = Number(process.env.DEFINITION_BACKLOG_BOOTSTRAP_LIMIT || 5000);
const DEFINITION_BACKLOG_MAX_CONSECUTIVE_FAILURES = Number(process.env.DEFINITION_BACKLOG_MAX_CONSECUTIVE_FAILURES || 3);

function loadHumanWritingGuide() {
  try {
    const skillPath = join(scriptDir, '..', 'human-writing', 'SKILL.md');
    const raw = readFileSync(skillPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed
          && trimmed !== '---'
          && !trimmed.startsWith('name:')
          && !trimmed.startsWith('description:');
      })
      .slice(0, 60)
      .join('\n');
  } catch (error) {
    console.warn('Unable to load human-writing guide, using fallback instructions.', error);
    return 'Write naturally, specifically, and conversationally. Avoid robotic filler, corporate buzzwords, and vague claims.';
  }
}

const HUMAN_WRITING_GUIDE = loadHumanWritingGuide();

function parseArgs(argv) {
  const args = {
    puzzleIds: [],
    date: '',
    force: false,
    backlog: false,
    maxMinutes: DEFINITION_BACKLOG_MAX_MINUTES,
    backlogLimit: DEFINITION_BACKLOG_PULL_LIMIT,
    bootstrapBacklog: false,
    bootstrapLimit: DEFINITION_BACKLOG_BOOTSTRAP_LIMIT,
    summaryFile: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--puzzle-id') args.puzzleIds.push(Number(argv[++i]));
    else if (arg === '--date') args.date = argv[++i] || '';
    else if (arg === '--force') args.force = true;
    else if (arg === '--backlog') args.backlog = true;
    else if (arg === '--max-minutes') args.maxMinutes = Number(argv[++i] || DEFINITION_BACKLOG_MAX_MINUTES);
    else if (arg === '--backlog-limit') args.backlogLimit = Number(argv[++i] || DEFINITION_BACKLOG_PULL_LIMIT);
    else if (arg === '--bootstrap-backlog') args.bootstrapBacklog = true;
    else if (arg === '--bootstrap-limit') args.bootstrapLimit = Number(argv[++i] || DEFINITION_BACKLOG_BOOTSTRAP_LIMIT);
    else if (arg === '--summary-file') args.summaryFile = argv[++i] || '';
  }

  return args;
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (WORKER_ADMIN_API_KEY && String(url).startsWith(API_BASE)) {
    headers.set('X-API-Key', WORKER_ADMIN_API_KEY);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}: ${await response.text()}`);
  }
  return response.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getModelSequence(preferredModel = '') {
  const baseSequence = [...new Set([NVIDIA_NIM_MODEL, ...NVIDIA_NIM_FALLBACK_MODELS])];
  if (!preferredModel) return baseSequence;
  return [...new Set([preferredModel, ...baseSequence])];
}

function clipText(value, limit = 240) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function buildModelError(message, meta = {}) {
  const error = new Error(message);
  Object.assign(error, meta);
  return error;
}

function createRunContext(label = 'definitions') {
  return {
    label,
    preferredModel: null,
    modelStats: {},
  };
}

function getModelStatsBucket(runContext, model) {
  if (!runContext) return null;
  if (!runContext.modelStats[model]) {
    runContext.modelStats[model] = {
      attempts: 0,
      successes: 0,
      httpFailures: 0,
      transportFailures: 0,
      responseFailures: 0,
      totalDurationMs: 0,
      lastError: null,
      lastSuccessAt: null,
      lastDurationMs: 0,
    };
  }
  return runContext.modelStats[model];
}

function recordModelFailure(bucket, category, durationMs, message) {
  if (!bucket) return;
  bucket.totalDurationMs += Number(durationMs || 0);
  if (category === 'http') bucket.httpFailures += 1;
  else if (category === 'transport') bucket.transportFailures += 1;
  else bucket.responseFailures += 1;
  bucket.lastError = clipText(message, 320);
  bucket.lastDurationMs = Number(durationMs || 0);
}

function recordModelSuccess(runContext, bucket, model, durationMs) {
  if (bucket) {
    bucket.successes += 1;
    bucket.totalDurationMs += Number(durationMs || 0);
    bucket.lastSuccessAt = new Date().toISOString();
    bucket.lastDurationMs = Number(durationMs || 0);
    bucket.lastError = null;
  }

  if (runContext) {
    const previousModel = runContext.preferredModel;
    runContext.preferredModel = model;
    if (previousModel !== model) {
      console.log(`[Definitions] Preferred model switched to ${model}. Future batches will try it first.`);
    }
  }
}

function summarizeAttempt(attempt) {
  return `${attempt.model} [${attempt.kind}, ${attempt.durationMs}ms]: ${attempt.message}`;
}

function buildAggregateModelFailure(batchLabel, attempts) {
  const message = `All NVIDIA models failed for ${batchLabel}. ${attempts.map(summarizeAttempt).join(' | ')}`;
  return buildModelError(message, {
    kind: 'all-models-failed',
    attempts,
    providerIssue: attempts.every((attempt) => attempt.providerIssue === true),
    transient: attempts.every((attempt) => attempt.transient === true),
  });
}

function extractAssistantText(payload) {
  return payload?.choices?.[0]?.message?.content || '';
}

function isRetryableFetchError(error) {
  const message = String(error?.message || '');
  const causeCode = error?.cause?.code || '';
  return (
    causeCode === 'UND_ERR_HEADERS_TIMEOUT'
    || causeCode === 'UND_ERR_CONNECT_TIMEOUT'
    || causeCode === 'ECONNRESET'
    || causeCode === 'ETIMEDOUT'
    || message.includes('Headers Timeout')
    || message.includes('fetch failed')
    || message.includes('aborted')
  );
}

async function requestNvidiaJson(body, options = {}) {
  const runContext = options.runContext || null;
  const batchLabel = options.batchLabel || 'definition batch';
  const validateResponse = options.validateResponse;
  const models = getModelSequence(runContext?.preferredModel || '');
  const attempts = [];

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const bucket = getModelStatsBucket(runContext, model);
    if (bucket) bucket.attempts += 1;

    const payload = {
      ...body,
      model,
    };

    const startedAt = Date.now();
    console.log(`[Definitions] ${batchLabel}: trying model ${model}${runContext?.preferredModel === model ? ' (preferred)' : ''}.`);

    try {
      const response = await fetch(`${NVIDIA_NIM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NVIDIA_NIM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NVIDIA_NIM_TIMEOUT_MS),
      });

      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        const errorText = await response.text();
        const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
        const error = buildModelError(
          `HTTP ${response.status} from ${model}: ${clipText(errorText, 260) || 'No response body'}`,
          {
            kind: 'http',
            providerIssue: true,
            transient: retryable,
            status: response.status,
            responseSnippet: clipText(errorText, 260),
          },
        );

        recordModelFailure(bucket, 'http', durationMs, error.message);
        attempts.push({
          model,
          kind: 'http',
          durationMs,
          providerIssue: true,
          transient: retryable,
          message: clipText(error.message, 320),
        });

        if (index === models.length - 1) {
          throw buildAggregateModelFailure(batchLabel, attempts);
        }

        console.warn(`[Definitions] ${batchLabel}: model ${model} failed with HTTP ${response.status} after ${durationMs}ms. Trying next model.`);
        await sleep(1200 * (index + 1));
        continue;
      }

      const responsePayload = await response.json();
      const validated = typeof validateResponse === 'function'
        ? validateResponse({ payload: responsePayload, model })
        : responsePayload;

      recordModelSuccess(runContext, bucket, model, durationMs);
      console.log(`[Definitions] ${batchLabel}: model ${model} succeeded in ${durationMs}ms.`);
      return {
        payload: responsePayload,
        model,
        durationMs,
        attempts,
        validated,
      };
    } catch (error) {
      if (error?.attempts) {
        throw error;
      }

      const durationMs = Date.now() - startedAt;
      const normalizedError = buildModelError(error instanceof Error ? error.message : String(error), {
        kind: isRetryableFetchError(error) ? 'transport' : (error?.kind || 'response'),
        providerIssue: error?.providerIssue ?? true,
        transient: error?.transient ?? isRetryableFetchError(error),
        status: error?.status || null,
        responseSnippet: error?.responseSnippet || null,
        missingWords: error?.missingWords || null,
        cause: error,
      });

      const category = normalizedError.kind === 'http'
        ? 'http'
        : normalizedError.kind === 'transport'
          ? 'transport'
          : 'response';
      recordModelFailure(bucket, category, durationMs, normalizedError.message);
      attempts.push({
        model,
        kind: normalizedError.kind || 'response',
        durationMs,
        providerIssue: normalizedError.providerIssue === true,
        transient: normalizedError.transient === true,
        message: clipText(normalizedError.message, 320),
      });

      if (index === models.length - 1) {
        throw buildAggregateModelFailure(batchLabel, attempts);
      }

      const issueLabel = normalizedError.kind === 'transport'
        ? 'network/timeout issue'
        : normalizedError.kind === 'http'
          ? `HTTP issue${normalizedError.status ? ` ${normalizedError.status}` : ''}`
          : 'response formatting issue';
      console.warn(`[Definitions] ${batchLabel}: model ${model} hit a ${issueLabel} after ${durationMs}ms. Trying next model.`);
      await sleep(1200 * (index + 1));
    }
  }

  throw buildModelError(`No NVIDIA models were available for ${batchLabel}.`, {
    kind: 'configuration',
    providerIssue: false,
    transient: false,
  });
}

async function resolvePuzzleIds(args) {
  if (args.puzzleIds.length > 0) {
    return args.puzzleIds.filter(Boolean);
  }

  if (args.date) {
    const response = await fetchJson(`${API_BASE}/api/search/date/${encodeURIComponent(args.date)}`);
    const puzzle = response.results?.[0];
    if (!puzzle) {
      throw new Error(`No puzzle found for date ${args.date}`);
    }
    return [puzzle.puzzle_id];
  }

  const today = await fetchJson(`${API_BASE}/today`);
  if (!today.puzzle?.puzzle_id) {
    throw new Error('Unable to resolve today\'s puzzle id');
  }
  return [today.puzzle.puzzle_id];
}

function chunk(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function extractJsonArray(text, model) {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw buildModelError(`Model ${model} did not return a JSON array: ${clipText(cleaned, 400)}`, {
      kind: 'response',
      providerIssue: true,
      transient: false,
      responseSnippet: clipText(cleaned, 400),
    });
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    throw buildModelError(`Model ${model} returned invalid JSON: ${clipText(cleaned, 400)}`, {
      kind: 'response',
      providerIssue: true,
      transient: false,
      responseSnippet: clipText(cleaned, 400),
      cause: error,
    });
  }
}

function normalizeGeneratedDefinitions(items, expectedWords, model) {
  const expected = expectedWords.map((word) => String(word || '').trim().toLowerCase()).filter(Boolean);
  const expectedSet = new Set(expected);
  const normalizedMap = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const word = String(item?.word || '').trim().toLowerCase();
    const definition = String(item?.definition || '').trim();
    if (!word || !definition) continue;
    if (!expectedSet.has(word)) continue;
    if (normalizedMap.has(word)) continue;
    normalizedMap.set(word, {
      word,
      definition,
      partOfSpeech: item.partOfSpeech ? String(item.partOfSpeech).trim() : null,
      synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
      antonyms: Array.isArray(item.antonyms) ? item.antonyms : [],
      usageNotes: item.usageNotes ? String(item.usageNotes).trim() : null,
      sourceProvider: 'nvidia-nim',
      sourceModel: model,
    });
  }

  const missingWords = expected.filter((word) => !normalizedMap.has(word));
  if (missingWords.length > 0) {
    throw buildModelError(
      `Model ${model} returned incomplete definitions. Missing ${missingWords.length}/${expected.length} words: ${missingWords.join(', ')}`,
      {
        kind: 'response',
        providerIssue: true,
        transient: false,
        missingWords,
      },
    );
  }

  return expected.map((word) => normalizedMap.get(word));
}

async function generateDefinitions(words, options = {}) {
  const expectedWords = words.map((word) => String(word || '').trim().toLowerCase()).filter(Boolean);
  const prompt = [
    'Return only JSON.',
    'You are writing rich, human-sounding dictionary notes for NYT Spelling Bee answer words.',
    'Use the following writing guide so the copy feels natural instead of machine-generated:',
    HUMAN_WRITING_GUIDE,
    'Return a JSON array of objects with exactly these keys:',
    'word, definition, partOfSpeech, synonyms, antonyms, usageNotes.',
    'Rules:',
    '- definition: 2 to 4 natural, information-dense sentences in plain English. Explain the core meaning, the most common sense of the word, and any important nuance. Aim for roughly 45 to 90 words.',
    '- partOfSpeech: short label like noun, verb, adjective, adverb, interjection, proper noun.',
    '- synonyms and antonyms: arrays of up to 5 single-word or short-phrase items.',
    '- usageNotes: 2 to 4 sentences in plain English. Include at least one clear example sentence that uses the word naturally. If helpful, mention tone, context, register, or a common confusion. Do not return null unless you truly have nothing useful to add.',
    '- All output must be in English only.',
    '- Preserve the input word exactly in lowercase.',
    '- Keep the writing specific, direct, and readable. Avoid textbook stiffness, corporate wording, and empty hedging.',
    '- Do not mention NYT Spelling Bee, prompts, policies, or that you are an AI.',
    `Words: ${JSON.stringify(words)}`,
  ].join('\n');

  const { model, durationMs, attempts, validated } = await requestNvidiaJson({
    temperature: 0.15,
    top_p: 0.85,
    max_tokens: NVIDIA_NIM_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  }, {
    runContext: options.runContext,
    batchLabel: options.batchLabel || `definition batch (${expectedWords.join(', ')})`,
    validateResponse: ({ payload, model: activeModel }) => {
      const parsed = extractJsonArray(extractAssistantText(payload), activeModel);
      return normalizeGeneratedDefinitions(parsed, expectedWords, activeModel);
    },
  });
  return {
    definitions: validated,
    model,
    durationMs,
    attempts,
  };
}

async function upsertDefinitions(definitions) {
  if (definitions.length === 0) return 0;
  const response = await fetchJson(`${API_BASE}/api/admin/definitions/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': WORKER_ADMIN_API_KEY,
    },
    body: JSON.stringify({ definitions }),
  });
  return Number(response.upserted || definitions.length || 0);
}

async function bootstrapDefinitionBacklog(limit) {
  const response = await fetchJson(`${API_BASE}/api/admin/definitions/backlog/bootstrap?limit=${encodeURIComponent(limit)}`, {
    method: 'POST',
  });
  return Number(response.queued || 0);
}

async function fetchDefinitionBacklogBatch(limit) {
  return fetchJson(`${API_BASE}/api/admin/definitions/backlog/pull?limit=${encodeURIComponent(limit)}`, {
    method: 'POST',
  });
}

function writeSummary(summaryFile, summary) {
  if (!summaryFile) return;
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function isProviderBackoffError(error) {
  if (error?.providerIssue === true && error?.transient === true) {
    return true;
  }

  const message = String(error?.message || '');
  return (
    message.includes('NVIDIA NIM request failed 408')
    || message.includes('NVIDIA NIM request failed 429')
    || message.includes('NVIDIA NIM request failed 500')
    || message.includes('NVIDIA NIM request failed 502')
    || message.includes('NVIDIA NIM request failed 503')
    || message.includes('NVIDIA NIM request failed 504')
    || message.includes('All NVIDIA models failed')
    || message.includes('Headers Timeout')
    || message.includes('fetch failed')
  );
}

async function processWords(words, options = {}) {
  const runContext = options.runContext || createRunContext(options.label || options.mode || 'definitions');
  const summary = {
    mode: options.mode || 'puzzle',
    label: options.label || '',
    requestedWords: words.length,
    processedWords: 0,
    generatedDefinitions: 0,
    upsertedDefinitions: 0,
    failedWords: [],
    failedBatchCount: 0,
    successfulBatchCount: 0,
    preferredModelStart: runContext.preferredModel || null,
    preferredModelEnd: null,
    modelStats: runContext.modelStats,
    failedBatchesDetailed: [],
    lastSuccessfulBatch: null,
  };

  const batches = chunk(words, DEFINITION_BATCH_SIZE);
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const batchLabel = `${options.label || summary.mode} batch ${index + 1}/${batches.length}`;
    console.log(`[Definitions] Starting ${batchLabel} with words: ${batch.join(', ')}${runContext.preferredModel ? ` | preferred=${runContext.preferredModel}` : ''}`);

    try {
      const generatedResult = await generateDefinitions(batch, {
        runContext,
        batchLabel,
      });
      const generated = generatedResult.definitions;
      const upserted = await upsertDefinitions(generated);
      summary.processedWords += batch.length;
      summary.generatedDefinitions += generated.length;
      summary.upsertedDefinitions += upserted;
      summary.successfulBatchCount += 1;
      summary.lastSuccessfulBatch = {
        batchIndex: index + 1,
        words: [...batch],
        model: generatedResult.model,
        durationMs: generatedResult.durationMs,
        priorFallbackCount: Array.isArray(generatedResult.attempts) ? generatedResult.attempts.length : 0,
      };
      console.log(`[Definitions] ${batchLabel} completed with model ${generatedResult.model}. Generated ${generated.length} definition(s), upserted ${upserted}.`);
    } catch (error) {
      summary.failedBatchCount += 1;
      summary.failedWords.push(...batch);
      summary.failedBatchesDetailed.push({
        batchIndex: index + 1,
        words: [...batch],
        message: error instanceof Error ? clipText(error.message, 600) : String(error),
        attempts: Array.isArray(error?.attempts) ? error.attempts : [],
      });
      console.error(`[Definitions] Failed ${batchLabel}: ${batch.join(', ')}`);
      console.error(error);

      if (options.stopOnFailure) {
        throw error;
      }
    }
  }

  summary.preferredModelEnd = runContext.preferredModel || null;
  return summary;
}

async function processPuzzle(puzzleId, options = {}) {
  const runContext = options.runContext || createRunContext(`puzzle-${puzzleId}`);
  let targetWords = [];

  if (options.force) {
    const puzzleResponse = await fetchJson(`${API_BASE}/api/puzzle/${puzzleId}`);
    targetWords = (puzzleResponse.words || []).map((word) => String(word.word || '').trim().toLowerCase()).filter(Boolean);
    console.log(`Puzzle ${puzzleId}: force refreshing ${targetWords.length} definition(s).`);
  } else {
    const missingResponse = await fetchJson(`${API_BASE}/api/admin/definitions/missing/puzzle/${puzzleId}`, {
      headers: {
        'X-API-Key': WORKER_ADMIN_API_KEY,
      },
    });

    targetWords = missingResponse.missingWords || [];
    console.log(`Puzzle ${puzzleId}: ${targetWords.length} missing definition(s).`);
  }

  if (targetWords.length === 0) {
    return {
      mode: 'puzzle',
      puzzleId,
      date: options.date || null,
      totalWords: 0,
      missingWordsBeforeRun: 0,
      processedWords: 0,
      generatedDefinitions: 0,
      upsertedDefinitions: 0,
      failedWords: [],
      failedBatchCount: 0,
      successfulBatchCount: 0,
      preferredModelStart: runContext.preferredModel || null,
      preferredModelEnd: runContext.preferredModel || null,
      modelStats: runContext.modelStats,
      failedBatchesDetailed: [],
      lastSuccessfulBatch: null,
    };
  }
  const summary = await processWords(targetWords, {
    mode: 'puzzle',
    label: `puzzle ${puzzleId}`,
    stopOnFailure: false,
    runContext,
  });

  return {
    ...summary,
    puzzleId,
    date: options.date || null,
    totalWords: targetWords.length,
    missingWordsBeforeRun: targetWords.length,
  };
}

async function processBacklog(options = {}) {
  const runContext = options.runContext || createRunContext('definition-backlog');
  const summary = {
    mode: 'backlog',
    bootstrapQueued: 0,
    pulls: 0,
    pulledWords: 0,
    processedWords: 0,
    generatedDefinitions: 0,
    upsertedDefinitions: 0,
    failedWords: [],
    failedBatchCount: 0,
    totalPending: 0,
    coolingDown: 0,
    stopReason: 'completed',
    preferredModelStart: runContext.preferredModel || null,
    preferredModelEnd: null,
    modelStats: runContext.modelStats,
    failedBatchesDetailed: [],
  };

  if (options.bootstrapBacklog) {
    summary.bootstrapQueued = await bootstrapDefinitionBacklog(options.bootstrapLimit);
    console.log(`Bootstrapped ${summary.bootstrapQueued} missing word(s) into the shared definition backlog.`);
  }

  const maxMinutes = Math.max(1, Number(options.maxMinutes) || DEFINITION_BACKLOG_MAX_MINUTES);
  const backlogLimit = Math.max(DEFINITION_BATCH_SIZE, Math.min(Number(options.backlogLimit) || DEFINITION_BACKLOG_PULL_LIMIT, 100));
  const deadline = Date.now() + (maxMinutes * 60 * 1000);
  let consecutiveFailures = 0;

  outer: while (Date.now() < deadline) {
    const backlog = await fetchDefinitionBacklogBatch(backlogLimit);
    summary.pulls += 1;
    summary.totalPending = Number(backlog.totalPending || 0);
    summary.coolingDown = Number(backlog.coolingDown || 0);

    const words = (backlog.words || [])
      .map((item) => String(item?.word || '').trim().toLowerCase())
      .filter(Boolean);

    console.log(
      `[Definitions] Backlog pull ${summary.pulls}: received ${words.length} word(s) | pending=${summary.totalPending} | coolingDown=${summary.coolingDown}${runContext.preferredModel ? ` | preferred=${runContext.preferredModel}` : ''}`,
    );

    if (words.length === 0) {
      summary.stopReason = summary.totalPending > 0 ? 'cooldown' : 'empty';
      break;
    }

    summary.pulledWords += words.length;

    for (const batch of chunk(words, DEFINITION_BATCH_SIZE)) {
      if (Date.now() >= deadline) {
        summary.stopReason = 'time-limit';
        break outer;
      }

      try {
        const batchSummary = await processWords(batch, {
          mode: 'backlog',
          label: 'definition backlog',
          stopOnFailure: true,
          runContext,
        });
        summary.processedWords += batchSummary.processedWords;
        summary.generatedDefinitions += batchSummary.generatedDefinitions;
        summary.upsertedDefinitions += batchSummary.upsertedDefinitions;
        consecutiveFailures = 0;
      } catch (error) {
        summary.failedBatchCount += 1;
        summary.failedWords.push(...batch);
        summary.failedBatchesDetailed.push({
          words: [...batch],
          message: error instanceof Error ? clipText(error.message, 600) : String(error),
          attempts: Array.isArray(error?.attempts) ? error.attempts : [],
        });
        consecutiveFailures += 1;
        const providerError = isProviderBackoffError(error);

        if (providerError || consecutiveFailures >= DEFINITION_BACKLOG_MAX_CONSECUTIVE_FAILURES) {
          summary.stopReason = providerError
            ? (error?.transient === true ? 'provider-backoff' : 'provider-response')
            : 'failure-threshold';
          break outer;
        }
      }
    }
  }

  if (summary.stopReason === 'completed' && Date.now() >= deadline) {
    summary.stopReason = 'time-limit';
  }

  summary.preferredModelEnd = runContext.preferredModel || null;
  return summary;
}

async function main() {
  if (!WORKER_ADMIN_API_KEY) {
    throw new Error('WORKER_ADMIN_API_KEY is required.');
  }

  if (!NVIDIA_NIM_API_KEY) {
    console.log('NVIDIA_NIM_API_KEY is not set, skipping definition generation.');
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[Definitions] Starting ${args.backlog ? 'backlog' : 'puzzle'} run | primary=${NVIDIA_NIM_MODEL} | fallbacks=${NVIDIA_NIM_FALLBACK_MODELS.join(', ') || '<none>'} | timeoutMs=${NVIDIA_NIM_TIMEOUT_MS} | maxTokens=${NVIDIA_NIM_MAX_TOKENS}`,
  );
  let summary;

  if (args.backlog) {
    summary = await processBacklog({
      ...args,
      runContext: createRunContext('definition-backlog'),
    });
    writeSummary(args.summaryFile, summary);
    console.log(`Backlog summary: ${JSON.stringify(summary)}`);
    if (summary.failedBatchCount > 0 && !['empty', 'cooldown', 'time-limit'].includes(summary.stopReason)) {
      throw new Error(
        `Backlog definition pass ended early with stopReason=${summary.stopReason}. Failed batches=${summary.failedBatchCount}. Failed words=${summary.failedWords.join(', ')}`,
      );
    }
    return;
  }

  const puzzleIds = await resolvePuzzleIds(args);
  const runContext = createRunContext('daily-definitions');
  const results = [];
  for (const puzzleId of puzzleIds) {
    results.push(await processPuzzle(puzzleId, {
      force: args.force,
      date: args.date,
      runContext,
    }));
  }

  summary = {
    mode: 'puzzle',
    puzzleIds,
    processedPuzzles: results.length,
    processedWords: results.reduce((sum, item) => sum + Number(item?.processedWords || 0), 0),
    generatedDefinitions: results.reduce((sum, item) => sum + Number(item?.generatedDefinitions || 0), 0),
    upsertedDefinitions: results.reduce((sum, item) => sum + Number(item?.upsertedDefinitions || 0), 0),
    failedBatchCount: results.reduce((sum, item) => sum + Number(item?.failedBatchCount || 0), 0),
    failedWords: results.flatMap((item) => item?.failedWords || []),
    successfulBatchCount: results.reduce((sum, item) => sum + Number(item?.successfulBatchCount || 0), 0),
    preferredModelStart: null,
    preferredModelEnd: runContext.preferredModel || null,
    modelStats: runContext.modelStats,
    failedBatchesDetailed: results.flatMap((item) => item?.failedBatchesDetailed || []),
    puzzles: results,
  };

  writeSummary(args.summaryFile, summary);
  console.log(`Definition summary: ${JSON.stringify(summary)}`);

  if (summary.failedBatchCount > 0) {
    throw new Error(`Definition generation partially failed. Failed words: ${summary.failedWords.join(', ')}`);
  }
}

await main();

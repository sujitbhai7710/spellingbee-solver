#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
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
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--puzzle-id') args.puzzleIds.push(Number(argv[++i]));
    else if (arg === '--date') args.date = argv[++i] || '';
    else if (arg === '--force') args.force = true;
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

function getModelSequence() {
  return [...new Set([NVIDIA_NIM_MODEL, ...NVIDIA_NIM_FALLBACK_MODELS])];
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

async function requestNvidiaJson(body) {
  const models = getModelSequence();
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const payload = {
      ...body,
      model,
    };

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

      if (response.ok) {
        return {
          payload: await response.json(),
          model,
        };
      }

      const errorText = await response.text();
      lastError = new Error(`NVIDIA NIM request failed ${response.status} with model ${model}: ${errorText}`);
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);

      if (!retryable || index === models.length - 1) {
        throw new Error(`All NVIDIA models failed. Final model ${model}: ${lastError.message}`);
      }

      console.warn(`NVIDIA model ${model} failed with ${response.status}. Trying next fallback model...`);
      await sleep(1200 * (index + 1));
      continue;
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(`Unknown NVIDIA NIM failure for model ${model}`);

      if (!isRetryableFetchError(lastError) || index === models.length - 1) {
        throw new Error(`All NVIDIA models failed. Final model ${model}: ${lastError.message}`);
      }

      console.warn(`NVIDIA model ${model} hit a network/timeout error. Trying next fallback model...`);
      await sleep(1200 * (index + 1));
    }
  }

  throw lastError;
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

function extractJsonArray(text) {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model did not return a JSON array: ${cleaned.slice(0, 400)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generateDefinitions(words) {
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

  const { payload, model } = await requestNvidiaJson({
    temperature: 0.15,
    top_p: 0.85,
    max_tokens: NVIDIA_NIM_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
  const text = payload.choices?.[0]?.message?.content || '';
  const parsed = extractJsonArray(text);
  return parsed.map((item) => ({
    word: String(item.word || '').trim().toLowerCase(),
    definition: String(item.definition || '').trim(),
    partOfSpeech: item.partOfSpeech ? String(item.partOfSpeech).trim() : null,
    synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
    antonyms: Array.isArray(item.antonyms) ? item.antonyms : [],
    usageNotes: item.usageNotes ? String(item.usageNotes).trim() : null,
    sourceProvider: 'nvidia-nim',
    sourceModel: model,
  })).filter((item) => item.word && item.definition);
}

async function upsertDefinitions(definitions) {
  if (definitions.length === 0) return;
  await fetchJson(`${API_BASE}/api/admin/definitions/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': WORKER_ADMIN_API_KEY,
    },
    body: JSON.stringify({ definitions }),
  });
}

async function processPuzzle(puzzleId, options = {}) {
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

  if (targetWords.length === 0) return;

  const failedBatches = [];
  for (const batch of chunk(targetWords, DEFINITION_BATCH_SIZE)) {
    try {
      const generated = await generateDefinitions(batch);
      console.log(`Generated ${generated.length} definition(s) for puzzle ${puzzleId}.`);
      await upsertDefinitions(generated);
    } catch (error) {
      failedBatches.push({
        words: [...batch],
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`Failed definition batch for puzzle ${puzzleId}: ${batch.join(', ')}`);
      console.error(error);
    }
  }

  if (failedBatches.length > 0) {
    const failedWords = failedBatches.flatMap((item) => item.words);
    throw new Error(`Definition generation partially failed for puzzle ${puzzleId}. Failed words: ${failedWords.join(', ')}`);
  }
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
  const puzzleIds = await resolvePuzzleIds(args);
  for (const puzzleId of puzzleIds) {
    await processPuzzle(puzzleId, { force: args.force });
  }
}

await main();

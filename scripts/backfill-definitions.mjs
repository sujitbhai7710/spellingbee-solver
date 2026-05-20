#!/usr/bin/env node

const API_BASE = process.env.API_BASE || 'https://spelling-bee-api.sbsolver.workers.dev';
const WORKER_ADMIN_API_KEY = process.env.WORKER_ADMIN_API_KEY || '';
const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || '';
const NVIDIA_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'qwen/qwen3-next-80b-a3b-instruct';
const NVIDIA_NIM_BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';

function parseArgs(argv) {
  const args = {
    puzzleIds: [],
    date: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--puzzle-id') args.puzzleIds.push(Number(argv[++i]));
    else if (arg === '--date') args.date = argv[++i] || '';
  }

  return args;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}: ${await response.text()}`);
  }
  return response.json();
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
    'You are generating concise dictionary metadata for NYT Spelling Bee answer words.',
    'Return a JSON array of objects with exactly these keys:',
    'word, definition, partOfSpeech, synonyms, antonyms, usageNotes.',
    'Rules:',
    '- definition: one concise dictionary-style sentence.',
    '- partOfSpeech: short label like noun, verb, adjective, adverb, interjection, proper noun.',
    '- synonyms and antonyms: arrays of up to 5 single-word or short-phrase items.',
    '- usageNotes: optional short clarification, or null.',
    '- Preserve the input word exactly in lowercase.',
    `Words: ${JSON.stringify(words)}`,
  ].join('\n');

  const response = await fetch(`${NVIDIA_NIM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_NIM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: NVIDIA_NIM_MODEL,
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA NIM request failed ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
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
    sourceModel: NVIDIA_NIM_MODEL,
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

async function processPuzzle(puzzleId) {
  const missingResponse = await fetchJson(`${API_BASE}/api/admin/definitions/missing/puzzle/${puzzleId}`, {
    headers: {
      'X-API-Key': WORKER_ADMIN_API_KEY,
    },
  });

  const missingWords = missingResponse.missingWords || [];
  console.log(`Puzzle ${puzzleId}: ${missingWords.length} missing definition(s).`);
  if (missingWords.length === 0) return;

  for (const batch of chunk(missingWords, 15)) {
    const generated = await generateDefinitions(batch);
    console.log(`Generated ${generated.length} definition(s) for puzzle ${puzzleId}.`);
    await upsertDefinitions(generated);
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
    await processPuzzle(puzzleId);
  }
}

await main();

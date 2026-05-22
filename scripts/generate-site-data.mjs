#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPuzzleDetailHTML } from '../src/lib/render-puzzle-detail.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const publicDataRoot = join(repoRoot, 'public', 'site-data');
const archiveJsonRoot = join(publicDataRoot, 'archive');
const archiveHtmlRoot = join(publicDataRoot, 'archive-html');

const API_BASE = process.env.API_BASE || 'https://spelling-bee-api.sbsolver.workers.dev';

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
  if (localEnv.APIKEY) return localEnv.APIKEY;

  const dotEnv = readEnvFile(join(repoRoot, '.env'));
  return dotEnv.APIKEY || '';
}

const WORKER_ADMIN_API_KEY = resolveWorkerKey();

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(relativePath, value) {
  const target = join(publicDataRoot, relativePath);
  ensureDir(dirname(target));
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(relativePath, value) {
  const target = join(publicDataRoot, relativePath);
  ensureDir(dirname(target));
  writeFileSync(target, value, 'utf8');
}

async function fetchJson(path) {
  const url = new URL(path, API_BASE);
  const response = await fetch(url, {
    headers: {
      'X-API-Key': WORKER_ADMIN_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}: ${await response.text()}`);
  }

  return response.json();
}

async function fetchJsonOrNull(path) {
  const url = new URL(path, API_BASE);
  const response = await fetch(url, {
    headers: {
      'X-API-Key': WORKER_ADMIN_API_KEY,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}: ${await response.text()}`);
  }

  return response.json();
}

function readDictionaryWords() {
  const raw = readFileSync(join(repoRoot, 'public', 'twl06.txt'), 'utf8');
  return [...new Set(
    raw
      .split(/\r?\n/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  )];
}

async function fetchAllArchiveSummaries() {
  const summaries = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetchJson(`/api/puzzles/list?limit=50&page=${page}`);
    const puzzles = response.puzzles || [];
    for (const puzzle of puzzles) {
      summaries.push({
        ...puzzle,
        slug: String(puzzle.date || '').toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-'),
      });
    }
    totalPages = Number(response.pagination?.total_pages || 1);
    page += 1;
  } while (page <= totalPages);

  return summaries;
}

async function fetchPuzzleBundle(puzzleId, summary = null) {
  const directBundle = await fetchJsonOrNull(`/api/admin/puzzleBundle/${puzzleId}`);
  if (directBundle) {
    return directBundle;
  }

  const [puzzleResponse, analysisResponse] = await Promise.all([
    fetchJson(`/api/puzzle/${puzzleId}`),
    fetchJson(`/api/puzzleAnalysis/${puzzleId}`),
  ]);

  const puzzle = puzzleResponse.puzzle || summary || {};
  return {
    ...puzzleResponse,
    puzzle,
    slug: summary?.slug || String(puzzle.date || '').toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-'),
    analysis: analysisResponse.analysis || null,
  };
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let index = 0;

  async function worker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(values[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, values.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!WORKER_ADMIN_API_KEY) {
    if (existsSync(join(publicDataRoot, 'today.json'))) {
      console.log('No worker key found. Reusing existing public/site-data snapshot files.');
      return;
    }
    throw new Error('WORKER_ADMIN_API_KEY or APIKEY is required to generate site data.');
  }

  console.log('Generating site snapshot files from the worker...');
  ensureDir(publicDataRoot);
  rmSync(archiveJsonRoot, { recursive: true, force: true });
  rmSync(archiveHtmlRoot, { recursive: true, force: true });
  ensureDir(archiveJsonRoot);
  ensureDir(archiveHtmlRoot);

  const [todaySummary, stats, centerFrequency, allLettersFrequency, wordLengthDistribution, recent, archiveSummaries] = await Promise.all([
    fetchJson('/today'),
    fetchJson('/api/statistics'),
    fetchJson('/api/mostCommonCenterLetters?limit=26'),
    fetchJson('/api/allLettersFrequency'),
    fetchJson('/api/wordLengthDistribution'),
    fetchJson('/api/last/8'),
    fetchAllArchiveSummaries(),
  ]);

  const todayPuzzleId = Number(todaySummary?.puzzle?.puzzle_id || 0);
  const todayBundle = todayPuzzleId > 0
    ? await fetchPuzzleBundle(todayPuzzleId, {
      ...(todaySummary?.puzzle || {}),
      slug: String(todaySummary?.puzzle?.date || '').toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-'),
    })
    : todaySummary;

  const dictionaryWords = readDictionaryWords();
  const globalRenderData = {
    centerLetterFrequency: centerFrequency.centerLetterFrequency || [],
    allLettersFrequency: allLettersFrequency.allLettersFrequency || [],
    totalPuzzles: allLettersFrequency.totalPuzzles || stats.overview?.totalPuzzles || 0,
  };

  writeJson('today.json', todayBundle);
  writeJson('stats.json', stats);
  writeJson('center-frequency.json', centerFrequency);
  writeJson('all-letters-frequency.json', allLettersFrequency);
  writeJson('word-length-distribution.json', wordLengthDistribution);
  writeJson('recent-puzzles.json', recent);
  writeJson('archive-summaries.json', archiveSummaries);
  writeJson('site-manifest.json', {
    generatedAt: new Date().toISOString(),
    todayDate: todayBundle.puzzle?.date || null,
    totalPuzzles: archiveSummaries.length,
  });

  let completed = 0;
  await mapWithConcurrency(archiveSummaries, 8, async (summary) => {
    const bundle = await fetchPuzzleBundle(summary.puzzle_id, summary);
    writeJson(join('archive', `${summary.slug}.json`), bundle);
    writeText(
      join('archive-html', `${summary.slug}.html`),
      renderPuzzleDetailHTML(bundle, {
        globalData: globalRenderData,
        dictionaryWords,
      }),
    );

    completed += 1;
    if (completed % 50 === 0 || completed === archiveSummaries.length) {
      console.log(`Generated ${completed}/${archiveSummaries.length} archive bundles`);
    }
  });

  console.log('Site snapshot generation complete.');
}

await main();

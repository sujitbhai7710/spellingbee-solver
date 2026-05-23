#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPuzzleDetailHTML } from '../src/lib/render-puzzle-detail.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const publicDataRoot = join(repoRoot, 'public', 'site-data');
const archiveJsonRoot = join(publicDataRoot, 'archive');
const archiveHtmlRoot = join(publicDataRoot, 'archive-html');

const API_BASE = process.env.API_BASE || 'https://spelling-bee-api.sbsolver.workers.dev';
const FETCH_RETRY_LIMIT = 6;
const ARCHIVE_FETCH_CONCURRENCY = 10;
const PREBUILT_ARCHIVE_WINDOW_DAYS = 30;

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

function clearDirectory(path) {
  ensureDir(path);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    rmSync(join(path, entry.name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(path) {
  const url = new URL(path, API_BASE);
  for (let attempt = 0; attempt < FETCH_RETRY_LIMIT; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'X-API-Key': WORKER_ADMIN_API_KEY,
      },
    });

    if (response.ok || response.status === 404) {
      return response;
    }

    const retryAfterHeader = Number(response.headers.get('Retry-After') || 0);
    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === FETCH_RETRY_LIMIT - 1) {
      throw new Error(`Request failed ${response.status} for ${url}: ${await response.text()}`);
    }

    const retryDelay = retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : Math.min(1500 * (attempt + 1), 8000);
    await sleep(retryDelay);
  }

  throw new Error(`Request retries exhausted for ${url}`);
}

async function fetchJson(path) {
  const response = await requestWithRetry(path);
  return response.json();
}

async function fetchJsonOrNull(path) {
  const response = await requestWithRetry(path);

  if (response.status === 404) {
    return null;
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

function slugFromDate(date) {
  return String(date || '').toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-');
}

function collectPrebuiltArchiveSlugs(archiveSummaries, todayBundle, stats, recent) {
  const slugs = new Set(
    archiveSummaries
      .slice(0, PREBUILT_ARCHIVE_WINDOW_DAYS)
      .map((summary) => String(summary.slug || slugFromDate(summary.date)))
      .filter(Boolean),
  );

  const addDate = (date) => {
    const slug = slugFromDate(date);
    if (slug) slugs.add(slug);
  };

  const addItems = (items) => {
    for (const item of items || []) {
      if (item?.date) addDate(item.date);
    }
  };

  addItems(todayBundle?.analysis?.sameCenterPuzzles);
  addItems(todayBundle?.analysis?.pangramHistoryCombined);
  addItems(recent?.puzzles);

  const extremes = stats?.extremes || {};
  [
    extremes.puzzleWithMostWords,
    extremes.puzzleWithFewestWords,
    extremes.puzzleWithMostPangrams,
    extremes.highestScore,
    extremes.lowestScore,
  ].forEach((item) => {
    if (item?.date) addDate(item.date);
  });

  return slugs;
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
  clearDirectory(archiveJsonRoot);
  clearDirectory(archiveHtmlRoot);

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
  const prebuiltArchiveSlugs = collectPrebuiltArchiveSlugs(archiveSummaries, todayBundle, stats, recent);
  const targetArchiveSummaries = archiveSummaries.filter((summary) => prebuiltArchiveSlugs.has(String(summary.slug || slugFromDate(summary.date))));

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
    prebuiltArchiveCount: targetArchiveSummaries.length,
  });

  console.log(`Prebuilding ${targetArchiveSummaries.length}/${archiveSummaries.length} archive detail fragments.`);

  let completed = 0;
  await mapWithConcurrency(targetArchiveSummaries, ARCHIVE_FETCH_CONCURRENCY, async (summary) => {
    const bundle = await fetchPuzzleBundle(summary.puzzle_id, summary);
    writeText(
      join('archive-html', `${summary.slug}.html`),
      renderPuzzleDetailHTML(bundle, {
        globalData: globalRenderData,
        dictionaryWords,
      }),
    );

    completed += 1;
    if (completed % 25 === 0 || completed === targetArchiveSummaries.length) {
      console.log(`Generated ${completed}/${targetArchiveSummaries.length} archive fragments`);
    }
  });

  console.log('Site snapshot generation complete.');
}

await main();

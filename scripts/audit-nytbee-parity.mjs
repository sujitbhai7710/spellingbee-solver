#!/usr/bin/env node

const DEFAULT_API_BASE = process.env.API_BASE || 'https://spelling-bee-api.sbsolver.workers.dev';

function parseArgs(argv) {
  const args = {
    apiBase: DEFAULT_API_BASE,
    recent: 10,
    offset: 0,
    dates: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--api-base') args.apiBase = argv[++i];
    else if (arg === '--recent') args.recent = Number(argv[++i] || '10');
    else if (arg === '--offset') args.offset = Number(argv[++i] || '0');
    else if (arg === '--dates') args.dates = String(argv[++i] || '').split(',').map((item) => item.trim()).filter(Boolean);
  }

  return args;
}

function toNytPathDate(isoDate) {
  return isoDate.replaceAll('-', '');
}

function formatDateFromNyt(dateText) {
  const cleaned = dateText.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  const parsed = new Date(`${cleaned} UTC`);
  if (Number.isNaN(parsed.getTime())) return cleaned;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function parseOrdinalPercentile(html, labelRegex) {
  const match = html.match(labelRegex);
  return match ? Number(match[1]) : null;
}

function parseSentence(html, regex) {
  const match = html.match(regex);
  return match ? formatDateFromNyt(match[1]) : null;
}

function parseNumber(html, regex) {
  const match = html.match(regex);
  return match ? Number(match[1].replaceAll(',', '')) : null;
}

function parsePangramHistoryDates(html) {
  const sectionMatch = html.match(/Other days with this pangram:\s*<\/b><\/p>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!sectionMatch) return [];
  return [...sectionMatch[1].matchAll(/Bee_\d{8}\.html">([^<]+)<\/a>/g)].map((match) => formatDateFromNyt(match[1]));
}

function normalizeDateLabel(dateText) {
  return formatDateFromNyt(dateText);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}`);
  }
  return response.json();
}

async function getRecentDates(apiBase, recent, offset) {
  const response = await fetchJson(`${apiBase}/api/puzzles?limit=${recent}&offset=${offset}`);
  return (response.puzzles || [])
    .map((puzzle) => {
      const date = new Date(`${puzzle.date} UTC`);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    });
}

async function fetchOurMetrics(apiBase, isoDate) {
  const search = await fetchJson(`${apiBase}/api/search/date/${isoDate}`);
  const puzzle = search.results?.[0];
  if (!puzzle) {
    throw new Error(`No puzzle found for ${isoDate}`);
  }

  const analysisResponse = await fetchJson(`${apiBase}/api/puzzleAnalysis/${puzzle.puzzle_id}`);
  const analysis = analysisResponse.analysis;

  return {
    isoDate,
    date: normalizeDateLabel(puzzle.date),
    scorePercentile: analysis?.score?.percentile ?? null,
    lastHighScoreDate: normalizeDateLabel(analysis?.score?.lastTimeAtOrAboveDate || ''),
    highestScore: analysis?.score?.highestScore ?? null,
    highestScoreDate: normalizeDateLabel(analysis?.score?.highestScoreDate || ''),
    lowestScore: analysis?.score?.lowestScore ?? null,
    lowestScoreDate: normalizeDateLabel(analysis?.score?.lowestScoreDate || ''),
    wordCountPercentile: analysis?.wordCount?.percentile ?? null,
    lastMoreAnswersDate: normalizeDateLabel(analysis?.wordCount?.lastTimeAboveDate || ''),
    highestWordCount: analysis?.wordCount?.highestWordCount ?? null,
    highestWordCountDate: normalizeDateLabel(analysis?.wordCount?.highestWordCountDate || ''),
    lowestWordCount: analysis?.wordCount?.lowestWordCount ?? null,
    lowestWordCountDate: normalizeDateLabel(analysis?.wordCount?.lowestWordCountDate || ''),
    requiredLength: analysis?.genius?.requiredLength ?? null,
    lastSameLengthDate: normalizeDateLabel(analysis?.genius?.lastTimeSameLengthDate || ''),
    averageWordLength: analysis?.averageWordLength?.value ?? null,
    globalAverageWordLength: analysis?.averageWordLength?.globalAverage ?? null,
    totalHistoricalAnswers: analysis?.totalHistoricalAnswers ?? null,
    totalUniqueHistoricalWords: analysis?.totalUniqueHistoricalWords ?? null,
    pangramHistoryDates: (analysis?.pangramHistoryCombined || []).map((item) => normalizeDateLabel(item.date)),
  };
}

async function fetchNytMetrics(isoDate) {
  const response = await fetch(`https://nytbee.com/Bee_${toNytPathDate(isoDate)}.html`);
  if (!response.ok) {
    throw new Error(`nytbee returned ${response.status} for ${isoDate}`);
  }

  const html = await response.text();

  return {
    isoDate,
    scorePercentile: parseOrdinalPercentile(html, /Today's score of [\d,]+ was in the\s+(\d+)(?:st|nd|rd|th)\s+percentile/i),
    lastHighScoreDate: parseSentence(html, /The last time there was a score this high\s+was on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    highestScore: parseNumber(html, /The highest score ever was ([\d,]+)/i),
    highestScoreDate: parseSentence(html, /The highest score ever was [\d,]+ on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    lowestScore: parseNumber(html, /The lowest score ever was ([\d,]+)/i),
    lowestScoreDate: parseSentence(html, /The lowest score ever was [\d,]+ on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    wordCountPercentile: parseOrdinalPercentile(html, /possible answers rank it in the\s+(\d+)(?:st|nd|rd|th)\s+percentile/i),
    lastMoreAnswersDate: parseSentence(html, /The last time there were more\s+answers than this was on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    highestWordCount: parseNumber(html, /The highest number of answers was ([\d,]+)/i),
    highestWordCountDate: parseSentence(html, /The highest number of answers was [\d,]+ on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    lowestWordCount: parseNumber(html, /The lowest number of answers was ([\d,]+)/i),
    lowestWordCountDate: parseSentence(html, /The lowest number of answers was [\d,]+ on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    requiredLength: parseNumber(html, /It takes an?\s+(\d+)-letter word for genius/i),
    lastSameLengthDate: parseSentence(html, /The last time this happened was on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i),
    averageWordLength: parseFloat((html.match(/Today's puzzle has an average word length of ([\d.]+)/i) || [])[1] || 'NaN'),
    globalAverageWordLength: parseFloat((html.match(/For all Bees, the average word length has been ([\d.]+)/i) || [])[1] || 'NaN'),
    totalHistoricalAnswers: parseNumber(html, /There have been ([\d,]+) accepted answers in the Bee/i),
    totalUniqueHistoricalWords: parseNumber(html, /with ([\d,]+) unique words/i),
    pangramHistoryDates: parsePangramHistoryDates(html),
  };
}

function compareMetrics(ourMetrics, nytMetrics) {
  const fields = [
    'scorePercentile',
    'lastHighScoreDate',
    'highestScore',
    'highestScoreDate',
    'lowestScore',
    'lowestScoreDate',
    'wordCountPercentile',
    'lastMoreAnswersDate',
    'highestWordCount',
    'highestWordCountDate',
    'lowestWordCount',
    'lowestWordCountDate',
    'requiredLength',
    'lastSameLengthDate',
    'averageWordLength',
    'globalAverageWordLength',
    'totalHistoricalAnswers',
    'totalUniqueHistoricalWords',
  ];

  const mismatches = [];
  for (const field of fields) {
    const ours = ourMetrics[field];
    const nyt = nytMetrics[field];
    if (nyt == null || Number.isNaN(nyt)) continue;
    if (ours !== nyt) {
      mismatches.push({ field, ours, nyt });
    }
  }

  const ourHistory = JSON.stringify(ourMetrics.pangramHistoryDates || []);
  const nytHistory = JSON.stringify(nytMetrics.pangramHistoryDates || []);
  if (ourHistory !== nytHistory) {
    mismatches.push({
      field: 'pangramHistoryDates',
      ours: ourMetrics.pangramHistoryDates,
      nyt: nytMetrics.pangramHistoryDates,
    });
  }

  return mismatches;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dates = args.dates.length > 0
    ? args.dates
    : await getRecentDates(args.apiBase, args.recent, args.offset);

  console.log(`Comparing ${dates.length} date(s) against nytbee using ${args.apiBase}`);
  let mismatchCount = 0;

  for (const isoDate of dates) {
    try {
      const [ours, nyt] = await Promise.all([
        fetchOurMetrics(args.apiBase, isoDate),
        fetchNytMetrics(isoDate),
      ]);

      const mismatches = compareMetrics(ours, nyt);
      if (mismatches.length === 0) {
        console.log(`OK   ${isoDate} (${ours.date})`);
        continue;
      }

      mismatchCount += mismatches.length;
      console.log(`DIFF ${isoDate} (${ours.date})`);
      for (const mismatch of mismatches) {
        console.log(`  - ${mismatch.field}: ours=${JSON.stringify(mismatch.ours)} nytbee=${JSON.stringify(mismatch.nyt)}`);
      }
    } catch (error) {
      mismatchCount += 1;
      console.log(`ERR  ${isoDate}: ${error.message}`);
    }
  }

  console.log(`Finished with ${mismatchCount} mismatch record(s).`);
  process.exitCode = mismatchCount > 0 ? 1 : 0;
}

await main();

function safeNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function safeLocale(value) {
  return typeof value === 'number' ? value.toLocaleString() : (value ?? '--');
}

function formatOrdinal(value) {
  const number = safeNum(value, 0);
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  switch (number % 10) {
    case 1: return `${number}st`;
    case 2: return `${number}nd`;
    case 3: return `${number}rd`;
    default: return `${number}th`;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function histogramPeak(bins) {
  return Math.max(...(bins || []).map((bin) => safeNum(bin.percentage, 0)), 1);
}

function formatHistogramRange(bin, decimals = 0) {
  if (!bin) return '--';
  if (decimals > 0) {
    const start = roundTo(bin.start, decimals).toFixed(decimals);
    const end = roundTo(bin.end, decimals).toFixed(decimals);
    return start === end ? start : `${start}-${end}`;
  }
  const start = Math.round(bin.start);
  const end = Math.round(bin.end);
  return start === end ? String(start) : `${start}-${end}`;
}

function getWordPoints(word) {
  if (!word) return 0;
  if (word.length === 4) return 1;
  return word.length + (word.is_pangram ? 7 : 0);
}

function buildHoneycombHTML(center, outer) {
  const outerHtml = (outer || []).map((letter, index) => `
    <div class="hex-cell hex-outer hex-pos-${index}">
      <svg viewBox="0 -17 256 256" fill="none" class="hex-svg">
        <path d="M0 111L64 0.148707L192 0.148707L256 111L192 221.851L64 221.851L0 111Z" fill="currentColor" />
      </svg>
      <span class="hex-letter">${escapeHtml(letter)}</span>
    </div>
  `).join('');

  return `
    <div class="honeycomb honeycomb-md mx-auto" style="margin-bottom:1.5rem;">
      ${outerHtml}
      <div class="hex-cell hex-center hex-pos-center">
        <svg viewBox="0 -17 256 256" fill="none" class="hex-svg">
          <path d="M0 111L64 0.148707L192 0.148707L256 111L192 221.851L64 221.851L0 111Z" fill="currentColor" />
        </svg>
        <span class="hex-letter hex-letter-center">${escapeHtml(center)}</span>
      </div>
    </div>
  `;
}

function archiveSlug(date) {
  return String(date || '').toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-');
}

function archiveLinkAttrs(date) {
  const slug = archiveSlug(date);
  return `href="/archive" data-archive-slug="${escapeHtml(slug)}" data-archive-date="${escapeHtml(date || '')}"`;
}

function renderHistogramRows(bins, peak, currentTheme, decimals = 0) {
  return (bins || []).map((bin) => {
    const barWidth = Math.max((safeNum(bin.percentage, 0) / peak) * 100, bin.isCurrent ? 3 : 1);
    const rowBg = bin.isCurrent ? currentTheme.rowBg : '';
    const labelColor = bin.isCurrent ? currentTheme.labelColor : 'text-gray-400';
    const barClass = bin.isCurrent ? currentTheme.barClass : 'bg-gray-300 text-gray-600';
    const barLabel = bin.isCurrent ? 'Current' : `${roundTo(safeNum(bin.percentage, 0), 1)}%`;
    return `
      <div class="flex items-center gap-3 ${rowBg}">
        <span class="w-20 text-xs font-bold text-right flex-shrink-0 ${labelColor}">${formatHistogramRange(bin, decimals)}</span>
        <div class="flex-1">
          <div class="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
            <div class="h-5 rounded-full flex items-center pl-2 text-[10px] font-bold ${barClass}" style="width:${barWidth}%;">${barLabel}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDiscreteHistogramRows(items, peak, currentTheme, labelSuffix = '') {
  return (items || []).map((item) => {
    const barWidth = Math.max((safeNum(item.percentage, 0) / peak) * 100, item.isCurrent ? 3 : 1);
    const rowBg = item.isCurrent ? currentTheme.rowBg : '';
    const labelColor = item.isCurrent ? currentTheme.labelColor : 'text-gray-400';
    const barClass = item.isCurrent ? currentTheme.barClass : 'bg-gray-300 text-gray-600';
    const label = `${safeNum(item.value, 0)}${labelSuffix}`;
    const barLabel = item.isCurrent ? 'Current' : `${roundTo(safeNum(item.percentage, 0), 1)}%`;
    return `
      <div class="flex items-center gap-3 ${rowBg}">
        <span class="w-20 text-xs font-bold text-right flex-shrink-0 ${labelColor}">${label}</span>
        <div class="flex-1">
          <div class="w-full bg-gray-100 rounded-full h-5 overflow-hidden">
            <div class="h-5 rounded-full flex items-center pl-2 text-[10px] font-bold ${barClass}" style="width:${barWidth}%;">${barLabel}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderPuzzleDetailHTML(bundle, options = {}) {
  const puzzle = bundle?.puzzle || {};
  const words = bundle?.words || [];
  const definitionsByWord = bundle?.definitionsByWord || {};
  const analysis = bundle?.analysis || {};
  const totalPoints = safeNum(bundle?.totalPoints);
  const center = puzzle.letters || '';
  const allLetters = puzzle.all_letters || '';
  const outerLetters = allLetters.split('').filter((letter) => letter !== center);
  const pangrams = words.filter((word) => word.is_pangram === 1);
  const regularWords = words.filter((word) => word.is_pangram !== 1);
  const perfectPangrams = bundle?.perfectPangrams || [];
  const hasPerfectPangram = !!bundle?.hasPerfectPangram;
  const globalData = options.globalData || {};
  const dictionaryWords = options.dictionaryWords || [];

  const wordsByLengthAll = {};
  const wordsByLengthRegular = {};
  const pointsByLength = {};
  const wordsByFirstLetter = {};

  for (const word of words) {
    if (!wordsByLengthAll[word.length]) wordsByLengthAll[word.length] = [];
    wordsByLengthAll[word.length].push(word);
    if (!wordsByLengthRegular[word.length] && word.is_pangram !== 1) wordsByLengthRegular[word.length] = [];
    if (word.is_pangram !== 1) wordsByLengthRegular[word.length].push(word);
    pointsByLength[word.length] = (pointsByLength[word.length] || 0) + getWordPoints(word);

    const firstLetter = word.word?.[0]?.toUpperCase();
    if (!firstLetter) continue;
    if (!wordsByFirstLetter[firstLetter]) {
      wordsByFirstLetter[firstLetter] = { count: 0, hasPangram: false };
    }
    wordsByFirstLetter[firstLetter].count += 1;
    if (word.is_pangram === 1) {
      wordsByFirstLetter[firstLetter].hasPangram = true;
    }
  }

  const sortedLengths = Object.keys(wordsByLengthAll).map(Number).sort((a, b) => a - b);
  const sortedRegularLengths = Object.keys(wordsByLengthRegular).map(Number).sort((a, b) => a - b);
  const sortedFirstLetters = Object.keys(wordsByFirstLetter).sort();
  const maxWordsByLength = Math.max(...sortedLengths.map((length) => wordsByLengthAll[length].length), 1);
  const maxPointsByLength = Math.max(...sortedLengths.map((length) => pointsByLength[length] || 0), 1);
  const maxFirstLetterCount = Math.max(...sortedFirstLetters.map((letter) => wordsByFirstLetter[letter].count), 1);

  const wordsWithDefinitions = words
    .map((word) => ({
      ...word,
      definitionMeta: definitionsByWord[word.word] || definitionsByWord[word.word?.toLowerCase()] || null,
    }))
    .filter((word) => word.definitionMeta);

  const officialWordSet = new Set(words.map((word) => word.word.toLowerCase()));
  const validLetters = new Set(allLetters.toLowerCase().split(''));
  const centerLower = center.toLowerCase();
  const nonOfficialWords = dictionaryWords
    .filter((word) => {
      if (word.length < 4) return false;
      if (!word.includes(centerLower)) return false;
      if (officialWordSet.has(word)) return false;
      return [...word].every((letter) => validLetters.has(letter));
    })
    .sort((a, b) => a.localeCompare(b));

  const centerFrequency = globalData.centerLetterFrequency || [];
  const allLettersFrequency = globalData.allLettersFrequency || [];
  const centerFreqMap = Object.fromEntries(centerFrequency.map((item) => [item.letter, item]));
  const letterFreqMap = Object.fromEntries(allLettersFrequency.map((item) => [item.letter, item]));
  const allLettersAZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const maxCenterCount = Math.max(...allLettersAZ.map((letter) => safeNum(centerFreqMap[letter]?.count || letterFreqMap[letter]?.asCenter)), 1);
  const maxValidLetterCount = Math.max(...allLettersAZ.map((letter) => safeNum(letterFreqMap[letter]?.totalAppearances)), 1);
  const currentCenterUsage = safeNum(centerFreqMap[center]?.count || letterFreqMap[center]?.asCenter);

  const scoreHistogram = analysis.score?.histogram || [];
  const wordCountHistogram = analysis.wordCount?.histogram || [];
  const geniusHistogram = analysis.genius?.histogram || [];
  const averageLengthHistogram = analysis.averageWordLength?.histogram || [];
  const scoreHistogramPeak = histogramPeak(scoreHistogram);
  const wordCountHistogramPeak = histogramPeak(wordCountHistogram);
  const geniusHistogramPeak = histogramPeak(geniusHistogram);
  const averageLengthHistogramPeak = histogramPeak(averageLengthHistogram);

  const sameCenterPuzzles = analysis.sameCenterPuzzles || [];
  const pangramHistoryCombined = analysis.pangramHistoryCombined || [];
  const commonWords = (analysis.commonWords || []).slice(0, 50);
  const maxCommonWordCount = Math.max(...commonWords.map((item) => item.count), 1);
  const allAnswerLengthDistribution = analysis.allAnswerLengthDistribution || [];
  const uniqueAnswerLengthDistribution = analysis.uniqueAnswerLengthDistribution || [];
  const maxAllAnswerLengthCount = Math.max(...allAnswerLengthDistribution.map((item) => item.count), 1);
  const maxUniqueAnswerLengthCount = Math.max(...uniqueAnswerLengthDistribution.map((item) => item.count), 1);
  const totalHistoricalAnswers = safeNum(
    analysis.totalHistoricalAnswers,
    allAnswerLengthDistribution.reduce((sum, item) => sum + safeNum(item.count), 0),
  );
  const totalUniqueHistoricalWords = safeNum(
    analysis.totalUniqueHistoricalWords,
    uniqueAnswerLengthDistribution.reduce((sum, item) => sum + safeNum(item.count), 0),
  );

  const requiredLength = safeNum(analysis.genius?.requiredLength);
  const geniusMinWords = safeNum(analysis.genius?.minWords);
  const geniusMaxWords = safeNum(analysis.genius?.maxWords);
  const averageWordLengthValue = safeNum(analysis.averageWordLength?.value);
  const averageWordLengthGlobal = safeNum(analysis.averageWordLength?.globalAverage);

  const officialAnswersHtml = `
    <details class="card-elevated p-6 mb-8 group" open>
      <summary class="font-semibold text-gray-800 cursor-pointer flex items-center justify-between">
        <h2 class="text-lg font-bold text-gray-800">Show spelling bee answers for ${escapeHtml(puzzle.date)}</h2>
        <svg class="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div class="mt-5">
        ${hasPerfectPangram && perfectPangrams.length > 0 ? `
          <div class="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <h2 class="text-sm font-bold text-emerald-800 mb-2">Perfect Pangram${perfectPangrams.length > 1 ? 's' : ''}</h2>
            <div class="flex flex-wrap gap-2">
              ${perfectPangrams.map((word) => `<span class="inline-flex items-center px-3 py-1.5 bg-emerald-100 border border-emerald-300 rounded-lg text-sm font-bold text-emerald-800 uppercase">${escapeHtml(word)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${pangrams.length > 0 ? `
          <div class="mb-6">
            <h2 class="text-lg font-bold text-gray-800 mb-3">Pangrams (${pangrams.length})</h2>
            <div class="flex flex-wrap gap-2">
              ${pangrams.map((word) => `<span class="pangram-chip"><span class="star">&#9733;</span>${escapeHtml(word.word)}<span class="text-xs text-amber-500 opacity-70">${word.length}</span></span>`).join('')}
            </div>
          </div>
        ` : ''}
        <div class="card-elevated divide-y divide-gray-50 max-h-[600px] overflow-y-auto custom-scroll">
          ${sortedRegularLengths.map((length) => `
            <div class="px-5 py-4">
              <p class="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">${length}-Letter Words (${wordsByLengthRegular[length].length})</p>
              <div class="flex flex-wrap gap-2">
                ${wordsByLengthRegular[length].map((word) => `<span class="word-chip">${escapeHtml(word.word)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </details>
  `;

  const definitionsHtml = wordsWithDefinitions.length > 0 ? `
    <details class="card-elevated p-6 mb-8 group">
      <summary class="font-semibold text-gray-800 cursor-pointer flex items-center justify-between">
        <h2 class="text-lg font-bold text-gray-800">Show spelling bee answers with means</h2>
        <svg class="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div class="mt-5">
        <div class="space-y-3">
          ${wordsWithDefinitions.map((word) => `
            <div class="rounded-xl border border-gray-100 bg-white p-4">
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold uppercase ${word.is_pangram === 1 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}">${escapeHtml(word.word)}</span>
                ${word.definitionMeta?.partOfSpeech ? `<span class="text-xs font-semibold uppercase tracking-wide text-gray-400">${escapeHtml(word.definitionMeta.partOfSpeech)}</span>` : ''}
              </div>
              <p class="text-sm text-gray-700 leading-relaxed">${escapeHtml(word.definitionMeta?.definition)}</p>
              ${word.definitionMeta?.usageNotes ? `
                <div class="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Example and usage</p>
                  <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(word.definitionMeta.usageNotes)}</p>
                </div>
              ` : ''}
              ${word.definitionMeta?.synonyms?.length > 0 ? `<p class="text-xs text-gray-500 mt-2"><strong>Synonyms:</strong> ${escapeHtml(word.definitionMeta.synonyms.join(', '))}</p>` : ''}
              ${word.definitionMeta?.antonyms?.length > 0 ? `<p class="text-xs text-gray-500 mt-1"><strong>Antonyms:</strong> ${escapeHtml(word.definitionMeta.antonyms.join(', '))}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </details>
  ` : '';

  const puzzleStatsHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Puzzle Statistics</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div class="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Number of Pangrams</p>
          <p class="text-2xl font-black text-gray-800 mt-1">${safeNum(puzzle.pangrams_count, 0)}</p>
        </div>
        <div class="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Maximum Puzzle Score</p>
          <p class="text-2xl font-black text-gray-800 mt-1">${totalPoints}</p>
        </div>
        <div class="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Number of Answers</p>
          <p class="text-2xl font-black text-gray-800 mt-1">${safeNum(puzzle.word_count, 0)}</p>
        </div>
        <div class="p-4 bg-purple-50 rounded-xl border border-purple-100">
          <p class="text-xs font-semibold text-purple-500 uppercase tracking-wide">Points Needed for Genius</p>
          <p class="text-2xl font-black text-purple-700 mt-1">${safeNum(analysis.genius?.threshold, 0)}</p>
        </div>
      </div>
      <p class="text-sm text-gray-600 leading-relaxed">
        Genius requires between <strong>${geniusMinWords}</strong> and <strong>${geniusMaxWords}</strong> words.
        You need at least a <strong>${requiredLength}-letter word</strong> to reach genius.
        If you do not get the pangrams, you need <strong>${safeNum(analysis.genius?.neededWithoutPangramsPct, 0)}%</strong> of the total points to reach genius.
        If you do get the pangrams, you only need <strong>${safeNum(analysis.genius?.neededAfterPangramsPct, 0)}%</strong> of the remaining points.
      </p>
    </div>
  `;

  const lengthBarsHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Length of Words in This Puzzle</h2>
      <div class="space-y-2.5">
        ${sortedLengths.map((length) => {
          const count = wordsByLengthAll[length].length;
          const barWidth = Math.max((count / maxWordsByLength) * 100, 4);
          return `<div class="flex items-center gap-3"><span class="w-16 text-sm font-bold text-right text-gray-600 flex-shrink-0">${length}-letter</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div class="h-6 rounded-full bg-gradient-to-r from-amber-300 to-amber-400 text-amber-900 text-xs font-bold flex items-center pl-3" style="width:${barWidth}%;">${count}</div></div></div></div>`;
        }).join('')}
      </div>
    </div>
  `;

  const pointsByLengthHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Points by Word Length</h2>
      <div class="space-y-2.5">
        ${sortedLengths.map((length) => {
          const points = safeNum(pointsByLength[length], 0);
          const barWidth = Math.max((points / maxPointsByLength) * 100, 4);
          return `<div class="flex items-center gap-3"><span class="w-16 text-sm font-bold text-right text-gray-600 flex-shrink-0">${length}-letter</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div class="h-6 rounded-full bg-gradient-to-r from-violet-300 to-violet-400 text-violet-900 text-xs font-bold flex items-center pl-3" style="width:${barWidth}%;">${points}</div></div></div></div>`;
        }).join('')}
      </div>
    </div>
  `;

  const wordsByFirstLetterHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Words by First Letter</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${sortedFirstLetters.map((letter) => {
          const info = wordsByFirstLetter[letter];
          const barWidth = Math.max((info.count / maxFirstLetterCount) * 100, 8);
          return `<div style="padding:12px;border-radius:12px;border:1px solid ${info.hasPangram ? '#FDE68A' : '#F1F5F9'};background:${info.hasPangram ? '#FFFBEB' : '#fff'}"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><span style="font-size:1.125rem;font-weight:900;color:${info.hasPangram ? '#D97706' : '#374151'}">${letter}</span><span style="font-size:0.875rem;font-weight:700;color:#6B7280;">${info.count}</span></div><div style="width:100%;background:#F1F5F9;border-radius:9999px;height:8px;"><div style="height:8px;border-radius:9999px;background:${info.hasPangram ? '#FBBF24' : '#D1D5DB'};width:${barWidth}%;"></div></div>${info.hasPangram ? '<span style="font-size:10px;color:#D97706;font-weight:700;margin-top:4px;display:block;">HAS PANGRAM</span>' : ''}</div>`;
        }).join('')}
      </div>
    </div>
  `;

  const pangramHistoryHtml = pangrams.length > 0 ? `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Other Days With This Pangram</h2>
      ${pangramHistoryCombined.length > 0
        ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${pangramHistoryCombined.map((item) => `<a ${archiveLinkAttrs(item.date)} class="block p-4 rounded-xl border border-gray-100 hover:border-amber-200 hover:bg-amber-50/50 transition-all group"><div class="flex items-center justify-between mb-2 gap-3"><span class="font-semibold text-gray-800 group-hover:text-amber-700 text-sm">${escapeHtml(item.date)}</span><span class="font-mono text-xs text-gray-400">${escapeHtml(item.all_letters)}</span></div><div class="flex flex-wrap items-center gap-2 text-xs mb-2"><span class="text-gray-500">${safeNum(item.word_count, 0)} answers</span><span class="text-amber-600 font-semibold">${safeNum(item.pangrams_count, 0)} pangram${safeNum(item.pangrams_count, 0) !== 1 ? 's' : ''}</span></div>${item.matchingWords?.length ? `<p class="text-xs text-gray-500">Matching pangrams: ${escapeHtml(item.matchingWords.join(', '))}</p>` : ''}</a>`).join('')}</div>`
        : `<div class="space-y-3">${pangrams.map((word) => `<div><p class="font-semibold text-amber-700 mb-1">${escapeHtml(word.word.toUpperCase())}</p><p class="text-sm text-gray-400 italic">No earlier puzzles found with this pangram.</p></div>`).join('')}</div>`
      }
    </div>
  ` : '';

  const compareHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">How Does This Puzzle Compare?</h2>
      <div class="mb-8">
        <h3 class="text-sm font-bold text-gray-700 mb-3">Score Percentile</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-2">This puzzle's score of <strong>${totalPoints}</strong> was in the <strong>${formatOrdinal(safeNum(analysis.score?.percentile, 0))}</strong> percentile of all puzzles available through ${escapeHtml(puzzle.date)}.</p>
        ${analysis.score?.lastTimeAtOrAboveDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-2">The last time there was a score this high was on <strong>${escapeHtml(analysis.score.lastTimeAtOrAboveDate)}</strong>.</p>` : ''}
        ${analysis.score?.highestScoreDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-2">The highest score ever was <strong>${safeNum(analysis.score.highestScore, 0)}</strong> on <strong>${escapeHtml(analysis.score.highestScoreDate)}</strong>.</p>` : ''}
        ${analysis.score?.lowestScoreDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-4">The lowest score ever was <strong>${safeNum(analysis.score.lowestScore, 0)}</strong> on <strong>${escapeHtml(analysis.score.lowestScoreDate)}</strong>.</p>` : ''}
        <div class="space-y-1.5">${renderHistogramRows(scoreHistogram, scoreHistogramPeak, { rowBg: 'bg-amber-50 -mx-2 px-2 rounded-lg py-0.5', labelColor: 'text-amber-700', barClass: 'bg-gradient-to-r from-amber-400 to-amber-500 text-white' })}</div>
        <p class="text-xs text-gray-400 mt-2">Max score in all puzzles</p>
      </div>
      <hr class="border-gray-100 my-6" />
      <div class="mb-8">
        <h3 class="text-sm font-bold text-gray-700 mb-3">Word Count Percentile</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-2">This puzzle's <strong>${safeNum(puzzle.word_count, 0)} possible answers</strong> rank it in the <strong>${formatOrdinal(safeNum(analysis.wordCount?.percentile, 0))}</strong> percentile of all puzzles available through ${escapeHtml(puzzle.date)}.</p>
        ${analysis.wordCount?.lastTimeAboveDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-2">The last time there were more answers than this was on <strong>${escapeHtml(analysis.wordCount.lastTimeAboveDate)}</strong>.</p>` : ''}
        ${analysis.wordCount?.highestWordCountDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-2">The highest number of answers was <strong>${safeNum(analysis.wordCount.highestWordCount, 0)}</strong> on <strong>${escapeHtml(analysis.wordCount.highestWordCountDate)}</strong>.</p>` : ''}
        ${analysis.wordCount?.lowestWordCountDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-4">The lowest number of answers was <strong>${safeNum(analysis.wordCount.lowestWordCount, 0)}</strong> on <strong>${escapeHtml(analysis.wordCount.lowestWordCountDate)}</strong>.</p>` : ''}
        <div class="space-y-1.5">${renderHistogramRows(wordCountHistogram, wordCountHistogramPeak, { rowBg: 'bg-violet-50 -mx-2 px-2 rounded-lg py-0.5', labelColor: 'text-violet-700', barClass: 'bg-gradient-to-r from-violet-400 to-violet-500 text-white' })}</div>
        <p class="text-xs text-gray-400 mt-2">Number of answers in all puzzles</p>
      </div>
      <hr class="border-gray-100 my-6" />
      <div class="mb-8">
        <h3 class="text-sm font-bold text-gray-700 mb-3">Length for Genius</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-2">It takes a <strong>${requiredLength}-letter word</strong> for genius.</p>
        ${analysis.genius?.lastTimeSameLengthDate ? `<p class="text-sm text-gray-600 leading-relaxed mb-4">The last time this happened was on <strong>${escapeHtml(analysis.genius.lastTimeSameLengthDate)}</strong>.</p>` : ''}
        <div class="space-y-1.5">${renderDiscreteHistogramRows(geniusHistogram, geniusHistogramPeak, { rowBg: 'bg-purple-50 -mx-2 px-2 rounded-lg py-0.5', labelColor: 'text-purple-700', barClass: 'bg-gradient-to-r from-purple-400 to-purple-500 text-white' }, '-letter')}</div>
        <p class="text-xs text-gray-400 mt-2">Length for Genius in all puzzles</p>
      </div>
      <hr class="border-gray-100 my-6" />
      <div>
        <h3 class="text-sm font-bold text-gray-700 mb-3">Average Word Length</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-2">This puzzle has an average word length of <strong>${roundTo(averageWordLengthValue, 1).toFixed(1)}</strong>.</p>
        <p class="text-sm text-gray-600 leading-relaxed mb-4">For all Bees up to that date, the average word length had been <strong>${roundTo(averageWordLengthGlobal, 1).toFixed(1)}</strong>.</p>
        <div class="space-y-1.5">${renderHistogramRows(averageLengthHistogram, averageLengthHistogramPeak, { rowBg: 'bg-emerald-50 -mx-2 px-2 rounded-lg py-0.5', labelColor: 'text-emerald-700', barClass: 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-white' }, 1)}</div>
        <p class="text-xs text-gray-400 mt-2">Average word length in all puzzles</p>
      </div>
    </div>
  `;

  const lettersHistoryHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Haven't I Seen These Letters Before?</h2>
      <p class="text-sm text-gray-500 mb-4">Historical letter frequency across all ${safeLocale(safeNum(globalData.totalPuzzles, 0))} puzzles. Letters in this puzzle are highlighted.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 class="text-sm font-bold text-gray-700 mb-3">As Center Letter</h3>
          <div class="space-y-1.5">
            ${allLettersAZ.map((letter) => {
              const count = safeNum(letterFreqMap[letter]?.asCenter, 0);
              const isCurrentCenter = letter === center;
              const isCurrentLetter = allLetters.includes(letter);
              const barWidth = Math.max((count / maxCenterCount) * 100, isCurrentCenter ? 2 : 0);
              return `<div class="flex items-center gap-2 ${isCurrentCenter ? 'bg-amber-50 -mx-2 px-2 rounded-lg py-0.5' : ''}"><span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isCurrentCenter ? 'bg-amber-400 text-white' : isCurrentLetter ? 'bg-gray-200 text-gray-600' : 'bg-gray-50 text-gray-300'}">${letter}</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-4 overflow-hidden"><div class="h-4 rounded-full ${isCurrentCenter ? 'bg-amber-400' : 'bg-gray-300'}" style="width:${barWidth}%;"></div></div></div><span class="text-[10px] font-bold w-10 text-right flex-shrink-0 ${isCurrentCenter ? 'text-amber-700' : 'text-gray-400'}">${count}</span></div>`;
            }).join('')}
          </div>
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-700 mb-3">As Valid Letter</h3>
          <div class="space-y-1.5">
            ${allLettersAZ.map((letter) => {
              const count = safeNum(letterFreqMap[letter]?.totalAppearances, 0);
              const isCurrentCenter = letter === center;
              const isCurrentLetter = allLetters.includes(letter);
              const rowClass = isCurrentCenter ? 'bg-amber-50 -mx-2 px-2 rounded-lg py-0.5' : isCurrentLetter ? 'bg-gray-50 -mx-2 px-2 rounded-lg py-0.5' : '';
              const barWidth = Math.max((count / maxValidLetterCount) * 100, isCurrentLetter ? 2 : 0);
              return `<div class="flex items-center gap-2 ${rowClass}"><span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isCurrentCenter ? 'bg-amber-400 text-white' : isCurrentLetter ? 'bg-gray-200 text-gray-600' : 'bg-gray-50 text-gray-300'}">${letter}</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-4 overflow-hidden"><div class="h-4 rounded-full ${isCurrentCenter ? 'bg-amber-400' : isCurrentLetter ? 'bg-gray-400' : 'bg-gray-200'}" style="width:${barWidth}%;"></div></div></div><span class="text-[10px] font-bold w-10 text-right flex-shrink-0 ${isCurrentLetter ? 'text-gray-600' : 'text-gray-300'}">${count}</span></div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <p class="text-sm text-gray-500 mt-4">Center letter <strong>${escapeHtml(center)}</strong> has appeared in the center <strong>${safeLocale(currentCenterUsage)}</strong> times across the full archive.</p>
      ${sameCenterPuzzles.length > 0 ? `
        <div class="mt-6 border-t border-gray-100 pt-6">
          <h3 class="text-sm font-bold text-gray-700 mb-3">Other Days With Center Letter ${escapeHtml(center)}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${sameCenterPuzzles.map((item) => `<a ${archiveLinkAttrs(item.date)} class="block p-4 rounded-xl border border-gray-100 hover:border-amber-200 hover:bg-amber-50/50 transition-all group"><div class="flex items-center justify-between mb-2"><span class="font-semibold text-gray-800 group-hover:text-amber-700 text-sm">${escapeHtml(item.date)}</span><span class="font-mono text-xs text-gray-400">${escapeHtml(item.all_letters)}</span></div><div class="flex items-center gap-3 text-xs"><span class="text-gray-500">${safeNum(item.word_count, 0)} answers</span><span class="text-amber-600 font-semibold">${safeNum(item.score, 0)} pts</span></div></a>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  const commonWordsHtml = commonWords.length > 0 ? `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Haven't I Seen These Words Before?</h2>
      <p class="text-sm text-gray-500 mb-4">The most common words in the Bee are:</p>
      <div class="grid sm:grid-cols-2 gap-2">
        ${commonWords.map((item) => `<div class="flex items-center gap-3"><span class="w-20 text-sm font-semibold text-gray-700 truncate">${escapeHtml(item.word)}</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-4 overflow-hidden"><div class="h-4 rounded-full bg-sky-400" style="width:${Math.max((safeNum(item.count, 0) / maxCommonWordCount) * 100, 3)}%;"></div></div></div><span class="text-xs font-bold text-gray-500 w-10 text-right">${safeNum(item.count, 0)}</span></div>`).join('')}
      </div>
    </div>
  ` : '';

  const historicalLengthHtml = (allAnswerLengthDistribution.length > 0 || uniqueAnswerLengthDistribution.length > 0) ? `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">How Long Are Words in the Bee?</h2>
      <p class="text-sm text-gray-500 mb-6">There have been <strong>${safeLocale(totalHistoricalAnswers)}</strong> accepted answers in the Bee, with <strong>${safeLocale(totalUniqueHistoricalWords)}</strong> unique words.</p>
      <div class="mb-8">
        <h3 class="text-sm font-bold text-gray-700 mb-3">Length of All Answers</h3>
        <div class="space-y-2">
          ${allAnswerLengthDistribution.map((item) => `<div class="flex items-center gap-3"><span class="w-16 text-sm font-bold text-right text-gray-600 flex-shrink-0">${item.length}-letter</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div class="h-6 rounded-full bg-amber-300 text-amber-900 text-xs font-bold flex items-center pl-3" style="width:${Math.max((safeNum(item.count, 0) / maxAllAnswerLengthCount) * 100, 2)}%;">${safeLocale(safeNum(item.count, 0))}</div></div></div><span class="text-xs text-gray-400 font-medium w-12 text-right flex-shrink-0">${safeNum(item.percentage, 0)}%</span></div>`).join('')}
        </div>
      </div>
      <div>
        <h3 class="text-sm font-bold text-gray-700 mb-3">Length of Unique Answers</h3>
        <div class="space-y-2">
          ${uniqueAnswerLengthDistribution.map((item) => `<div class="flex items-center gap-3"><span class="w-16 text-sm font-bold text-right text-gray-600 flex-shrink-0">${item.length}-letter</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div class="h-6 rounded-full bg-emerald-300 text-emerald-900 text-xs font-bold flex items-center pl-3" style="width:${Math.max((safeNum(item.count, 0) / maxUniqueAnswerLengthCount) * 100, 2)}%;">${safeLocale(safeNum(item.count, 0))}</div></div></div><span class="text-xs text-gray-400 font-medium w-12 text-right flex-shrink-0">${safeNum(item.percentage, 0)}%</span></div>`).join('')}
        </div>
      </div>
    </div>
  ` : '';

  const nonOfficialWordsHtml = `
    <div class="card-elevated p-6 mb-8">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Valid Dictionary Words Not in This Puzzle's Official Answers</h2>
      <p class="text-sm text-gray-500 mb-4">These are dictionary-valid words that fit this letter set but are not in the official NYT answer list.</p>
      ${nonOfficialWords.length > 0
        ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">${nonOfficialWords.map((word) => `<span class="text-sm text-gray-700">${escapeHtml(word)}</span>`).join('')}</div><p class="text-xs text-gray-400 mt-4">The New York Times likely excludes some of these as too obscure or otherwise out of scope.</p>`
        : `<p class="text-sm text-gray-400 italic">No additional dictionary words found for these letters.</p>`
      }
    </div>
  `;

  const wordsHtml = `
    <div class="card-elevated p-6">
      <h2 class="text-lg font-bold text-gray-800 mb-4">All Words (${words.length})</h2>
      <div class="card-elevated max-h-[600px] overflow-y-auto custom-scroll divide-y divide-gray-50">
        ${sortedLengths.map((length) => `
          <div class="px-5 py-4">
            <p class="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">${length}-Letter Words (${wordsByLengthAll[length].length})</p>
            <div class="flex flex-wrap gap-2">
              ${wordsByLengthAll[length].map((word) => `<span class="word-chip ${word.is_pangram === 1 ? 'border-amber-300 text-amber-700 bg-amber-50' : ''}">${escapeHtml(word.word)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return `
    <p class="text-gray-500 font-medium mb-6">${escapeHtml(puzzle.date)}</p>
    ${buildHoneycombHTML(center, outerLetters)}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <div class="stat-card"><p class="stat-value">${safeNum(puzzle.word_count, 0)}</p><p class="stat-label">Answers</p></div>
      <div class="stat-card"><p class="stat-value">${safeNum(puzzle.pangrams_count, 0)}</p><p class="stat-label">Pangrams</p></div>
      <div class="stat-card"><p class="stat-value">${totalPoints}</p><p class="stat-label">Max Score</p></div>
      <div class="stat-card"><p class="stat-value">${hasPerfectPangram ? 'Yes' : '--'}</p><p class="stat-label">Perfect Pangram</p></div>
    </div>
    ${officialAnswersHtml}
    ${definitionsHtml}
    ${puzzleStatsHtml}
    ${lengthBarsHtml}
    ${pointsByLengthHtml}
    ${wordsByFirstLetterHtml}
    ${pangramHistoryHtml}
    ${compareHtml}
    ${lettersHistoryHtml}
    ${commonWordsHtml}
    ${historicalLengthHtml}
    ${nonOfficialWordsHtml}
    ${wordsHtml}
  `;
}

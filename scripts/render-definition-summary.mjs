#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

function clipText(value, limit = 240) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function readSummary(path) {
  if (!path || !existsSync(path)) {
    console.log(`[Definition Summary] File not found: ${path}`);
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function buildConsoleLines(summary, title) {
  const lines = [];
  lines.push(`[Definition Summary] ${title}`);
  lines.push(`mode=${summary.mode || 'unknown'}`);
  if (summary.mode === 'backlog') {
    lines.push(`stopReason=${summary.stopReason || 'unknown'} | pulls=${summary.pulls || 0} | pending=${summary.totalPending || 0} | coolingDown=${summary.coolingDown || 0}`);
    lines.push(`bootstrapQueued=${summary.bootstrapQueued || 0} | pulledWords=${summary.pulledWords || 0} | processedWords=${summary.processedWords || 0}`);
  } else {
    lines.push(`processedPuzzles=${summary.processedPuzzles || 0} | processedWords=${summary.processedWords || 0}`);
  }
  lines.push(`generated=${summary.generatedDefinitions || 0} | upserted=${summary.upsertedDefinitions || 0} | failedBatches=${summary.failedBatchCount || 0}`);
  lines.push(`preferredModel=${summary.preferredModelEnd || '<none>'}`);

  const modelStats = summary.modelStats || {};
  const modelLines = Object.entries(modelStats)
    .map(([model, stats]) => ({
      model,
      attempts: Number(stats?.attempts || 0),
      successes: Number(stats?.successes || 0),
      httpFailures: Number(stats?.httpFailures || 0),
      transportFailures: Number(stats?.transportFailures || 0),
      responseFailures: Number(stats?.responseFailures || 0),
      lastError: clipText(stats?.lastError || '', 180),
    }))
    .sort((a, b) => b.successes - a.successes || b.attempts - a.attempts || a.model.localeCompare(b.model));

  if (modelLines.length > 0) {
    lines.push('modelStats:');
    for (const item of modelLines) {
      lines.push(`- ${item.model}: attempts=${item.attempts}, successes=${item.successes}, http=${item.httpFailures}, transport=${item.transportFailures}, response=${item.responseFailures}${item.lastError ? `, lastError=${item.lastError}` : ''}`);
    }
  }

  const failedDetails = Array.isArray(summary.failedBatchesDetailed) ? summary.failedBatchesDetailed.slice(0, 5) : [];
  if (failedDetails.length > 0) {
    lines.push('failedBatches:');
    for (const item of failedDetails) {
      lines.push(`- words=${(item.words || []).join(', ')} | message=${clipText(item.message, 220)}`);
    }
  }

  return lines;
}

function buildMarkdown(summary, title) {
  const lines = [];
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`- Mode: \`${summary.mode || 'unknown'}\``);
  if (summary.mode === 'backlog') {
    lines.push(`- Stop reason: \`${summary.stopReason || 'unknown'}\``);
    lines.push(`- Pulls: \`${summary.pulls || 0}\``);
    lines.push(`- Pending after run: \`${summary.totalPending || 0}\``);
    lines.push(`- Cooling down: \`${summary.coolingDown || 0}\``);
    lines.push(`- Bootstrapped: \`${summary.bootstrapQueued || 0}\``);
    lines.push(`- Pulled words: \`${summary.pulledWords || 0}\``);
  } else {
    lines.push(`- Processed puzzles: \`${summary.processedPuzzles || 0}\``);
  }
  lines.push(`- Processed words: \`${summary.processedWords || 0}\``);
  lines.push(`- Generated definitions: \`${summary.generatedDefinitions || 0}\``);
  lines.push(`- Upserted definitions: \`${summary.upsertedDefinitions || 0}\``);
  lines.push(`- Failed batches: \`${summary.failedBatchCount || 0}\``);
  lines.push(`- Preferred model at end: \`${summary.preferredModelEnd || '<none>'}\``);
  lines.push('');

  const modelStats = summary.modelStats || {};
  const entries = Object.entries(modelStats)
    .map(([model, stats]) => ({
      model,
      attempts: Number(stats?.attempts || 0),
      successes: Number(stats?.successes || 0),
      httpFailures: Number(stats?.httpFailures || 0),
      transportFailures: Number(stats?.transportFailures || 0),
      responseFailures: Number(stats?.responseFailures || 0),
      lastError: clipText(stats?.lastError || '', 120),
    }))
    .sort((a, b) => b.successes - a.successes || b.attempts - a.attempts || a.model.localeCompare(b.model));

  if (entries.length > 0) {
    lines.push('| Model | Attempts | Successes | HTTP | Transport | Response | Last Error |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const item of entries) {
      lines.push(`| ${item.model} | ${item.attempts} | ${item.successes} | ${item.httpFailures} | ${item.transportFailures} | ${item.responseFailures} | ${item.lastError || ''} |`);
    }
    lines.push('');
  }

  const failedDetails = Array.isArray(summary.failedBatchesDetailed) ? summary.failedBatchesDetailed.slice(0, 5) : [];
  if (failedDetails.length > 0) {
    lines.push('Failed batches:');
    for (const item of failedDetails) {
      lines.push(`- \`${(item.words || []).join(', ')}\``);
      lines.push(`  ${clipText(item.message, 220)}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const [, , summaryPath, titleArg] = process.argv;
const title = titleArg || 'Definition Summary';
const summary = readSummary(summaryPath);

if (!summary) {
  process.exit(0);
}

for (const line of buildConsoleLines(summary, title)) {
  console.log(line);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildMarkdown(summary, title), 'utf8');
}

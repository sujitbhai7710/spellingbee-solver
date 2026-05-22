import { readPublicJson } from '../lib/site-data';
import { buildArchivePath, dateTextToIso } from '../lib/utils';

const SITE_URL = 'https://spellingbeesolver.dev';

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toUrlEntry(loc, lastmod = null, priority = null) {
  const parts = ['  <url>', `    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
  if (priority != null) parts.push(`    <priority>${priority}</priority>`);
  parts.push('  </url>');
  return parts.join('\n');
}

export function GET() {
  const manifest = readPublicJson('site-data/site-manifest.json', {}) || {};
  const archiveSummaries = readPublicJson('site-data/archive-summaries.json', []) || [];
  const generatedAt = manifest.generatedAt ? new Date(manifest.generatedAt).toISOString() : new Date().toISOString();

  const staticUrls = [
    toUrlEntry(`${SITE_URL}/`, generatedAt, '1.0'),
    toUrlEntry(`${SITE_URL}/today`, generatedAt, '0.9'),
    toUrlEntry(`${SITE_URL}/solver`, generatedAt, '0.8'),
    toUrlEntry(`${SITE_URL}/archive`, generatedAt, '0.8'),
    toUrlEntry(`${SITE_URL}/stats`, generatedAt, '0.7'),
    toUrlEntry(`${SITE_URL}/blog`, generatedAt, '0.6'),
    toUrlEntry(`${SITE_URL}/blog/spelling-bee-rules`, generatedAt, '0.6'),
  ];

  const archiveUrls = archiveSummaries
    .filter((summary) => summary?.date && summary?.slug)
    .map((summary) => toUrlEntry(
      `${SITE_URL}${buildArchivePath(summary.date)}`,
      summary.date_iso || dateTextToIso(summary.date) || generatedAt.slice(0, 10),
      '0.7',
    ));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticUrls,
    ...archiveUrls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}

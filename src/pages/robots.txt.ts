export function GET() {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /site-data/',
    '',
    'Sitemap: https://spellingbeesolver.dev/sitemap.xml',
    'Host: https://spellingbeesolver.dev',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

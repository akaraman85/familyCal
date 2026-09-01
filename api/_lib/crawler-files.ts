export const PUBLIC_INDEXABLE_PATHS = ['/', '/privacy', '/terms'] as const

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function absolutePublicUrl(appUrl: string, path: string) {
  return new URL(path, `${appUrl}/`).href
}

export function renderSitemap(appUrl: string) {
  const urls = PUBLIC_INDEXABLE_PATHS
    .map((path) => `  <url>\n    <loc>${escapeXml(absolutePublicUrl(appUrl, path))}</loc>\n  </url>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function renderRobots(appUrl: string) {
  return [
    'User-agent: *',
    'Disallow: /api/',
    '',
    `Sitemap: ${absolutePublicUrl(appUrl, '/sitemap.xml')}`,
    '',
  ].join('\n')
}

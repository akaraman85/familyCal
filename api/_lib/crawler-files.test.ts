import assert from 'node:assert/strict'
import {
  absolutePublicUrl,
  PUBLIC_INDEXABLE_PATHS,
  renderRobots,
  renderSitemap,
} from './crawler-files.ts'

const appUrl = 'https://calendar.example.com'

assert.equal(absolutePublicUrl(appUrl, '/privacy'), 'https://calendar.example.com/privacy')

const sitemap = renderSitemap(appUrl)
assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/)
for (const path of PUBLIC_INDEXABLE_PATHS) {
  assert.match(sitemap, new RegExp(`<loc>${absolutePublicUrl(appUrl, path).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`))
}
assert.doesNotMatch(sitemap, /&amp;amp;/)

const robots = renderRobots(appUrl)
assert.match(robots, /^User-agent: \*/)
assert.match(robots, /^Disallow: \/api\/$/m)
assert.match(robots, /^Disallow: \/guest\/$/m)
assert.match(robots, /^Sitemap: https:\/\/calendar\.example\.com\/sitemap\.xml$/m)

console.log('crawler-files tests passed')

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PUBLIC_HOME_FALLBACK_MARKERS, renderPublicHomeFallback } from './home-content.ts'
import { APP_PUBLIC_NAME } from './branding.ts'

const fallback = renderPublicHomeFallback()
assert.match(fallback, new RegExp(APP_PUBLIC_NAME))
assert.match(fallback, /href="\/privacy"/)
assert.match(fallback, /href="\/terms"/)
assert.match(fallback, /href="\/login"/)
assert.match(fallback, /Family calendar <span>dashboard<\/span>/)
assert.match(fallback, /Google Calendar/)

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
for (const value of Object.values(PUBLIC_HOME_FALLBACK_MARKERS)) {
  assert.match(indexHtml, new RegExp(value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

console.log('home-content tests passed')

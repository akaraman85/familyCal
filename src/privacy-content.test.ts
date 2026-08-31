import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isPublicPrivacyPath, PRIVACY_SECTIONS, renderPrivacyHtml } from './privacy-content.ts'

assert.equal(isPublicPrivacyPath('/privacy'), true)
assert.equal(isPublicPrivacyPath('/privacy/'), true)
assert.equal(isPublicPrivacyPath('/privacy.html'), true)
assert.equal(isPublicPrivacyPath('/'), false)
assert.equal(isPublicPrivacyPath('/settings'), false)

const html = renderPrivacyHtml()
assert.match(html, /<title>Privacy policy · Family Calendar<\/title>/)
assert.match(html, /alexkaraman85@gmail.com/)
assert.match(html, /calendar\.readonly/)
assert.match(html, /AES-256-GCM/)
assert.match(html, /Vercel AI Gateway/)
assert.match(html, /href="\/terms"/)
assert.doesNotMatch(html, /APP_PASSWORD/)
assert.doesNotMatch(html, /GOOGLE_CLIENT_SECRET/)

for (const section of PRIVACY_SECTIONS) {
  assert.match(html, new RegExp(section.heading.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const paragraph of section.paragraphs) {
    assert.match(html, new RegExp(paragraph.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
}

const published = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8')
assert.equal(published, html)

console.log('privacy-content tests passed')

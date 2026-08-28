import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isPublicTermsPath, renderTermsHtml, TERMS_SECTIONS } from './terms-content.ts'
import { publicLegalDocument } from './legal.ts'

assert.equal(isPublicTermsPath('/terms'), true)
assert.equal(isPublicTermsPath('/terms/'), true)
assert.equal(isPublicTermsPath('/terms.html'), true)
assert.equal(isPublicTermsPath('/privacy'), false)
assert.equal(isPublicTermsPath('/'), false)
assert.equal(publicLegalDocument('/terms'), 'terms')
assert.equal(publicLegalDocument('/privacy'), 'privacy')
assert.equal(publicLegalDocument('/'), null)

const html = renderTermsHtml()
assert.match(html, /<title>Terms of service · Karaman Calendar<\/title>/)
assert.match(html, /alexkaraman85@gmail.com/)
assert.match(html, /read-only/)
assert.match(html, /Vercel AI Gateway/)
assert.match(html, /as-is/)
assert.match(html, /href="\/privacy"/)
assert.doesNotMatch(html, /APP_PASSWORD/)
assert.doesNotMatch(html, /GOOGLE_CLIENT_SECRET/)
assert.doesNotMatch(html, /Delaware/)
assert.doesNotMatch(html, /limited liability/)

for (const section of TERMS_SECTIONS) {
  assert.match(html, new RegExp(section.heading.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const paragraph of section.paragraphs) {
    assert.match(html, new RegExp(paragraph.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
}

const published = readFileSync(new URL('../public/terms.html', import.meta.url), 'utf8')
assert.equal(published, html)

console.log('terms-content tests passed')

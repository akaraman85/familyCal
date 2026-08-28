import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderPrivacyHtml } from '../src/privacy-content.ts'
import { renderTermsHtml } from '../src/terms-content.ts'

const privacyOutput = fileURLToPath(new URL('../public/privacy.html', import.meta.url))
writeFileSync(privacyOutput, renderPrivacyHtml())
console.log(`Wrote ${privacyOutput}`)

const termsOutput = fileURLToPath(new URL('../public/terms.html', import.meta.url))
writeFileSync(termsOutput, renderTermsHtml())
console.log(`Wrote ${termsOutput}`)

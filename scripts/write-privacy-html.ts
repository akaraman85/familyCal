import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderPrivacyHtml } from '../src/privacy-content.ts'

const output = fileURLToPath(new URL('../public/privacy.html', import.meta.url))
writeFileSync(output, renderPrivacyHtml())
console.log(`Wrote ${output}`)

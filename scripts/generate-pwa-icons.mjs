import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const ORANGE = '#e76d4d'

function calendarSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 2v4"/>
  <path d="M16 2v4"/>
  <rect width="18" height="18" x="3" y="4" rx="2"/>
  <path d="M3 10h18"/>
  <path d="M8 14h.01"/>
  <path d="M12 14h.01"/>
  <path d="M16 14h.01"/>
  <path d="M8 18h.01"/>
  <path d="M12 18h.01"/>
  <path d="M16 18h.01"/>
</svg>`
}

function roundedBackgroundSvg(size, radius) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${ORANGE}"/>
</svg>`
}

async function renderIcon({
  size,
  paddingRatio,
  radiusRatio = 0,
}) {
  const padding = Math.round(size * paddingRatio)
  const glyphSize = size - padding * 2
  const glyph = await sharp(Buffer.from(calendarSvg(glyphSize))).png().toBuffer()
  const background = radiusRatio > 0
    ? sharp(Buffer.from(roundedBackgroundSvg(size, Math.round(size * radiusRatio))))
    : sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 231, g: 109, b: 77, alpha: 1 },
      },
    })

  return background
    .composite([{ input: glyph, left: padding, top: padding }])
    .png()
    .toBuffer()
}

const faviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="${ORANGE}"/>
  <g fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4) scale(1)">
    <path d="M8 2v4"/>
    <path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
    <path d="M8 14h.01"/>
    <path d="M12 14h.01"/>
    <path d="M16 14h.01"/>
    <path d="M8 18h.01"/>
    <path d="M12 18h.01"/>
    <path d="M16 18h.01"/>
  </g>
</svg>
`.trim()

const outputs = [
  { file: 'apple-touch-icon.png', size: 180, paddingRatio: 0.22 },
  { file: 'pwa-192x192.png', size: 192, paddingRatio: 0.2, radiusRatio: 0.22 },
  { file: 'pwa-512x512.png', size: 512, paddingRatio: 0.2, radiusRatio: 0.22 },
  { file: 'pwa-192x192-maskable.png', size: 192, paddingRatio: 0.25 },
  { file: 'pwa-512x512-maskable.png', size: 512, paddingRatio: 0.25 },
  { file: 'favicon-32x32.png', size: 32, paddingRatio: 0.18, radiusRatio: 0.22 },
]

await writeFile(join(publicDir, 'favicon.svg'), `${faviconSvg}\n`)

for (const output of outputs) {
  const png = await renderIcon(output)
  await writeFile(join(publicDir, output.file), png)
  console.log(`wrote public/${output.file}`)
}

console.log('wrote public/favicon.svg')

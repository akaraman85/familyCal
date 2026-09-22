import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `missing ${selector} rule`)
  return match[1]
}

const allDay = ruleBody('.all-day-event')
assert.doesNotMatch(
  allDay,
  /(?:^|;)\s*color\s*:/,
  'all-day events should inherit calendar color-class text color',
)

const weekEvent = ruleBody('.week-event')
assert.doesNotMatch(
  weekEvent,
  /(?:^|;)\s*color\s*:/,
  'timed week events should inherit calendar color-class text color',
)

for (const [selector, color] of [
  ['.coral', 'var(--coral-ink)'],
  ['.blue', 'var(--blue-ink)'],
  ['.green', 'var(--green-ink)'],
  ['.gold', 'var(--gold-ink)'],
] as const) {
  assert.match(ruleBody(selector), new RegExp(`color\\s*:\\s*${color.replace(/[()]/g, '\\$&')}`))
}

console.log('event text color tests passed')

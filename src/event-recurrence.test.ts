import assert from 'node:assert/strict'
import { recurrenceOptionLabel, recurrenceSummary } from './event-recurrence.ts'

assert.equal(recurrenceOptionLabel(''), 'Does not repeat')
assert.equal(recurrenceOptionLabel('weekly'), 'Every week')
assert.equal(
  recurrenceSummary({ frequency: 'weekly', until: null }, new Date(2026, 8, 14)),
  'Repeats every Monday',
)
assert.equal(
  recurrenceSummary({ frequency: 'monthly', until: '2026-12-31' }, new Date(2026, 0, 31)),
  'Repeats monthly on the 31st until Dec 31, 2026',
)
assert.equal(recurrenceSummary(null, new Date(2026, 8, 14)), null)

console.log('event-recurrence tests passed')

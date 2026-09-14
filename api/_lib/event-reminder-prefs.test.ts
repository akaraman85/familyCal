import assert from 'node:assert/strict'
import {
  defaultEventReminder,
  reminderForDispatch,
  resolveEventReminder,
} from './reminder-options.ts'

const settings = {
  eventReminders: true,
  reminderMinutes: 30 as const,
  reminderFrequency: 'once' as const,
}

const override = {
  eventId: 'google:cal:abc',
  enabled: true,
  notifyMinutes: 1440 as const,
  frequency: 'daily' as const,
}

const overrides = new Map([[override.eventId, override]])

assert.deepEqual(defaultEventReminder(settings), {
  enabled: true,
  notifyMinutes: 30,
  frequency: 'once',
  custom: false,
})

assert.deepEqual(resolveEventReminder('saved:1', settings, overrides), {
  enabled: true,
  notifyMinutes: 30,
  frequency: 'once',
  custom: false,
})
assert.deepEqual(resolveEventReminder(override.eventId, settings, overrides), {
  enabled: true,
  notifyMinutes: 1440,
  frequency: 'daily',
  custom: true,
})

assert.deepEqual(
  reminderForDispatch('saved:1', settings, overrides),
  {
    eventId: 'saved:1',
    enabled: true,
    notifyMinutes: 30,
    frequency: 'once',
  },
)
assert.equal(
  reminderForDispatch(override.eventId, { ...settings, eventReminders: false }, overrides),
  null,
)
assert.equal(
  reminderForDispatch(
    'saved:quiet',
    settings,
    new Map([['saved:quiet', { ...override, eventId: 'saved:quiet', enabled: false }]]),
  ),
  null,
)

console.log('event reminder preference tests passed')

import assert from 'node:assert/strict'
import {
  eventVisibleToGuest,
  guestEvents,
  GUEST_BUSY_TITLE,
  HOUSEHOLD_CALENDAR_NAME,
  redactEventForGuest,
} from './guest-visibility.ts'
import type { CalendarEvent } from './events.ts'

const grant = {
  includeHousehold: true,
  members: [{ id: 'alex', name: 'Alex' }, { id: 'maya', name: 'Maya' }],
}

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'source' | 'calendar'>): CalendarEvent {
  return {
    title: 'Oncologist follow-up',
    startAt: '2026-09-04T15:00:00.000Z',
    endAt: '2026-09-04T16:00:00.000Z',
    allDay: false,
    location: 'Clinic',
    description: 'Bring insurance card',
    externalUrl: 'https://calendar.google.com/event',
    organizer: { email: 'alex@example.com', displayName: 'Alex', self: true },
    ...partial,
  }
}

const alexGoogle = event({
  id: 'google:1',
  source: 'google',
  calendar: 'Alex',
  google: {
    calendar: {
      id: 'primary',
      name: 'Alex',
      primary: true,
      type: 'primary',
      accessRole: 'owner',
      color: null,
    },
    accounts: [{
      id: 'acct-alex',
      memberId: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex',
      calendarType: 'primary',
      accessRole: 'owner',
    }],
  },
})

const kidGoogle = event({
  id: 'google:2',
  source: 'google',
  calendar: 'Kids',
  google: {
    calendar: {
      id: 'kids',
      name: 'Kids',
      primary: false,
      type: 'owner',
      accessRole: 'owner',
      color: null,
    },
    accounts: [{
      id: 'acct-kid',
      memberId: 'kid',
      email: 'kid@example.com',
      displayName: 'Kid',
      calendarType: 'owner',
      accessRole: 'owner',
    }],
  },
})

const household = event({
  id: 'saved:1',
  source: 'saved',
  calendar: HOUSEHOLD_CALENDAR_NAME,
})

const mayaSaved = event({
  id: 'saved:2',
  source: 'saved',
  calendar: 'Maya',
})

const unassignedGoogle = event({
  id: 'google:3',
  source: 'google',
  calendar: 'Work',
  google: {
    calendar: {
      id: 'work',
      name: 'Work',
      primary: false,
      type: 'owner',
      accessRole: 'owner',
      color: null,
    },
    accounts: [{
      id: 'acct-work',
      memberId: null,
      email: 'work@example.com',
      displayName: 'Work',
      calendarType: 'owner',
      accessRole: 'owner',
    }],
  },
})

assert.equal(eventVisibleToGuest(alexGoogle, grant), true)
assert.equal(eventVisibleToGuest(mayaSaved, grant), true)
assert.equal(eventVisibleToGuest(household, grant), true)
assert.equal(eventVisibleToGuest(kidGoogle, grant), false)
assert.equal(eventVisibleToGuest(unassignedGoogle, grant), false)
assert.equal(eventVisibleToGuest(household, { ...grant, includeHousehold: false }), false)

const sharedWithHiddenMember = event({
  id: 'google:4',
  source: 'google',
  calendar: 'Shared',
  title: 'Family dinner',
  google: {
    calendar: {
      id: 'shared',
      name: 'Shared',
      primary: false,
      type: 'owner',
      accessRole: 'owner',
      color: null,
    },
    accounts: [
      {
        id: 'acct-alex',
        memberId: 'alex',
        email: 'alex@example.com',
        displayName: 'Alex',
        calendarType: 'owner',
        accessRole: 'owner',
      },
      {
        id: 'acct-kid',
        memberId: 'kid',
        email: 'kid@example.com',
        displayName: 'Kid',
        calendarType: 'owner',
        accessRole: 'owner',
      },
    ],
  },
})
assert.equal(eventVisibleToGuest(sharedWithHiddenMember, grant), true)

const redacted = redactEventForGuest(alexGoogle)
assert.equal(redacted.title, GUEST_BUSY_TITLE)
assert.equal(redacted.calendar, GUEST_BUSY_TITLE)
assert.equal(redacted.location, null)
assert.equal(redacted.description, null)
assert.equal(redacted.externalUrl, null)
assert.equal(redacted.organizer, null)
assert.equal(redacted.source, 'saved')
assert.equal(redacted.visibility, 'busy')
assert.equal(redacted.google, undefined)
assert.equal(redacted.startAt, alexGoogle.startAt)
assert.equal(redacted.endAt, alexGoogle.endAt)
assert.doesNotMatch(JSON.stringify(redacted), /Oncologist/)
assert.doesNotMatch(JSON.stringify(redacted), /Clinic/)
assert.doesNotMatch(JSON.stringify(redacted), /alex@example.com/)

const visible = guestEvents(
  [alexGoogle, kidGoogle, household, mayaSaved, unassignedGoogle],
  grant,
)
assert.deepEqual(visible.map((item) => item.id).sort(), ['google:1', 'saved:1', 'saved:2'])
assert.ok(visible.every((item) => item.title === GUEST_BUSY_TITLE && item.visibility === 'busy'))

console.log('guest-visibility tests passed')

import assert from 'node:assert/strict'
import {
  HOUSEHOLD_CALENDAR_NAME,
  memberHasCalendarIntegration,
  membersWithCalendarIntegrations,
  resolveSavedEventCalendar,
  type FamilyMember,
} from './family.ts'

function member(partial: Partial<FamilyMember> & Pick<FamilyMember, 'id' | 'name'>): FamilyMember {
  return {
    email: null,
    role: 'Member',
    color: 'blue',
    integrations: [],
    ...partial,
  }
}

const google = {
  id: 'acct-1',
  provider: 'google-calendar',
  providerName: 'Google Calendar',
  status: 'connected' as const,
  displayName: 'Alex',
  email: 'alex@example.com',
  scopes: [],
  connectedAt: '2026-01-01T00:00:00.000Z',
}

const alex = member({
  id: 'alex',
  name: 'Alex Karaman',
  integrations: [google],
})
const jason = member({
  id: 'jason',
  name: 'Jason Karaman',
  color: 'green',
})
const members = [alex, jason]

assert.equal(memberHasCalendarIntegration(alex), true)
assert.equal(memberHasCalendarIntegration(jason), false)
assert.deepEqual(membersWithCalendarIntegrations(members).map((item) => item.id), ['alex'])
assert.equal(resolveSavedEventCalendar('Jason Karaman', members), HOUSEHOLD_CALENDAR_NAME)
assert.equal(resolveSavedEventCalendar('jason karaman', members), HOUSEHOLD_CALENDAR_NAME)
assert.equal(resolveSavedEventCalendar('Alex Karaman', members), 'Alex Karaman')
assert.equal(resolveSavedEventCalendar('Family', members), 'Family')
assert.equal(resolveSavedEventCalendar('School', members), 'School')

console.log('family tests passed')

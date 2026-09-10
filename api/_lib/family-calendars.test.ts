import assert from 'node:assert/strict'
import {
  availableFamilyCalendars,
  coerceUnconnectedMemberCalendar,
  householdCalendarForUnconnectedMembers,
  HOUSEHOLD_CALENDAR_NAME,
  resolvePlannerDefaultCalendar,
} from './family-calendars.ts'

const members = [
  { id: 'alex', display_name: 'Alex Karaman' },
  { id: 'christina', display_name: 'Christina Karaman' },
  { id: 'jason', display_name: 'Jason Karaman' },
]

const calendars = availableFamilyCalendars(members, [
  { member_id: 'alex' },
  { member_id: 'christina' },
  { member_id: null },
])

assert.deepEqual(calendars.calendars, [
  HOUSEHOLD_CALENDAR_NAME,
  'Alex Karaman',
  'Christina Karaman',
])
assert.deepEqual(calendars.withoutCalendars, ['Jason Karaman'])
assert.equal(
  resolvePlannerDefaultCalendar('Jason Karaman', calendars.calendars),
  HOUSEHOLD_CALENDAR_NAME,
)
assert.equal(
  resolvePlannerDefaultCalendar('alex karaman', calendars.calendars),
  'Alex Karaman',
)
assert.equal(
  resolvePlannerDefaultCalendar('Family', calendars.calendars),
  HOUSEHOLD_CALENDAR_NAME,
)

const remapped = householdCalendarForUnconnectedMembers(
  [
    { source: 'saved' as const, calendar: 'Jason Karaman' },
    { source: 'saved' as const, calendar: 'Alex Karaman' },
    { source: 'google' as const, calendar: 'Jason Karaman' },
  ],
  members,
  [{ member_id: 'alex' }, { member_id: 'christina' }],
)
assert.deepEqual(remapped.map((event) => event.calendar), [
  HOUSEHOLD_CALENDAR_NAME,
  'Alex Karaman',
  'Jason Karaman',
])
assert.equal(
  coerceUnconnectedMemberCalendar('Jason Karaman', calendars.withoutCalendars),
  HOUSEHOLD_CALENDAR_NAME,
)
assert.equal(
  coerceUnconnectedMemberCalendar('School', calendars.withoutCalendars),
  'School',
)

console.log('family-calendars tests passed')

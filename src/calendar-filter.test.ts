import assert from 'node:assert/strict'
import {
  calendarFilterIsNarrowed,
  clearCalendarMemberFilter,
  DEFAULT_CALENDAR_MEMBER_FILTER,
  eventCalendarFilterIds,
  eventVisibleInMemberFilter,
  hiddenCalendarFilterCount,
  HOUSEHOLD_FILTER_ID,
  persistCalendarMemberFilter,
  readCalendarMemberFilter,
  toggleHouseholdFilter,
  toggleMemberFilter,
  type FilterableCalendarEvent,
} from './calendar-filter.ts'

const members = [
  { id: 'alex', name: 'Alex' },
  { id: 'maya', name: 'Maya' },
]

function event(
  partial: Partial<FilterableCalendarEvent> & Pick<FilterableCalendarEvent, 'source' | 'calendar'>,
): FilterableCalendarEvent {
  return { ...partial }
}

const alexGoogle = event({
  source: 'google',
  calendar: 'Alex',
  google: {
    accounts: [{ memberId: 'alex' }],
  },
})

const mayaSaved = event({
  source: 'saved',
  calendar: 'Maya',
})

const household = event({
  source: 'saved',
  calendar: 'Family',
})

const memberWithoutCalendar = event({
  source: 'saved',
  calendar: 'Jason Karaman',
})

const unassignedGoogle = event({
  source: 'google',
  calendar: 'Work',
  google: {
    accounts: [{ memberId: null }],
  },
})

const sharedGoogle = event({
  source: 'google',
  calendar: 'Shared',
  google: {
    accounts: [{ memberId: 'alex' }, { memberId: 'kid' }],
  },
})

const familyGoogle = event({
  source: 'google',
  calendar: 'Shared',
  google: {
    accounts: [{ memberId: 'alex' }, { memberId: 'maya' }],
  },
})

assert.deepEqual(eventCalendarFilterIds(alexGoogle, members), ['alex'])
assert.deepEqual(eventCalendarFilterIds(mayaSaved, members), ['maya'])
assert.deepEqual(eventCalendarFilterIds(event({ source: 'saved', calendar: 'MAYA' }), members), ['maya'])
assert.deepEqual(eventCalendarFilterIds(household, members), [HOUSEHOLD_FILTER_ID])
assert.deepEqual(eventCalendarFilterIds(memberWithoutCalendar, members), [HOUSEHOLD_FILTER_ID])
assert.deepEqual(eventCalendarFilterIds(memberWithoutCalendar, [
  ...members,
  { id: 'jason', name: 'Jason Karaman', hasCalendarIntegration: false },
]), [HOUSEHOLD_FILTER_ID])
assert.deepEqual(eventCalendarFilterIds(unassignedGoogle, members), [HOUSEHOLD_FILTER_ID])
assert.deepEqual(eventCalendarFilterIds(sharedGoogle, members), ['alex'])
assert.deepEqual(eventCalendarFilterIds(familyGoogle, members), ['alex', 'maya'])

const allVisible = DEFAULT_CALENDAR_MEMBER_FILTER
assert.equal(eventVisibleInMemberFilter(alexGoogle, members, allVisible), true)
assert.equal(eventVisibleInMemberFilter(mayaSaved, members, allVisible), true)
assert.equal(eventVisibleInMemberFilter(household, members, allVisible), true)
assert.equal(eventVisibleInMemberFilter(unassignedGoogle, members, allVisible), true)

const hideAlex = toggleMemberFilter(allVisible, 'alex')
assert.equal(eventVisibleInMemberFilter(alexGoogle, members, hideAlex), false)
assert.equal(eventVisibleInMemberFilter(sharedGoogle, members, hideAlex), false)
assert.equal(eventVisibleInMemberFilter(familyGoogle, members, hideAlex), true)
assert.equal(eventVisibleInMemberFilter(mayaSaved, members, hideAlex), true)
assert.equal(eventVisibleInMemberFilter(household, members, hideAlex), true)
assert.equal(calendarFilterIsNarrowed(hideAlex, members), true)
assert.equal(hiddenCalendarFilterCount(hideAlex, members), 1)

const hideHousehold = toggleHouseholdFilter(allVisible)
assert.equal(eventVisibleInMemberFilter(household, members, hideHousehold), false)
assert.equal(eventVisibleInMemberFilter(unassignedGoogle, members, hideHousehold), false)
assert.equal(eventVisibleInMemberFilter(alexGoogle, members, hideHousehold), true)
assert.equal(hiddenCalendarFilterCount(hideHousehold, members), 1)

const hideUnknownMember = toggleMemberFilter(allVisible, 'gone')
assert.equal(calendarFilterIsNarrowed(hideUnknownMember, members), false)
assert.equal(eventVisibleInMemberFilter(alexGoogle, members, hideUnknownMember), true)

const hideEveryone = toggleHouseholdFilter(toggleMemberFilter(toggleMemberFilter(allVisible, 'alex'), 'maya'))
assert.equal(eventVisibleInMemberFilter(alexGoogle, members, hideEveryone), false)
assert.equal(eventVisibleInMemberFilter(mayaSaved, members, hideEveryone), false)
assert.equal(eventVisibleInMemberFilter(household, members, hideEveryone), false)
assert.equal(hiddenCalendarFilterCount(hideEveryone, members), 3)

assert.deepEqual(clearCalendarMemberFilter(), DEFAULT_CALENDAR_MEMBER_FILTER)
assert.equal(toggleHouseholdFilter(hideHousehold).hideHousehold, false)

const memory = new Map<string, string>()
const storage = {
  getItem(key: string) {
    return memory.get(key) ?? null
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
  removeItem(key: string) {
    memory.delete(key)
  },
}

persistCalendarMemberFilter(hideAlex, storage)
assert.deepEqual(readCalendarMemberFilter(storage), hideAlex)
persistCalendarMemberFilter(clearCalendarMemberFilter(), storage)
assert.deepEqual(readCalendarMemberFilter(storage), DEFAULT_CALENDAR_MEMBER_FILTER)
assert.equal(memory.size, 0)

persistCalendarMemberFilter(hideAlex, storage)
assert.deepEqual(readCalendarMemberFilter({
  getItem() {
    return '{not json'
  },
}), DEFAULT_CALENDAR_MEMBER_FILTER)

console.log('calendar-filter tests passed')

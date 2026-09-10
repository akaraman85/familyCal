export const CALENDAR_FILTER_STORAGE_KEY = 'karaman-calendar-member-filter'
export const HOUSEHOLD_FILTER_ID = 'household'

export type CalendarMemberFilter = {
  hideHousehold: boolean
  hiddenMemberIds: string[]
}

export type CalendarFilterMember = {
  id: string
  name: string
  hasCalendarIntegration?: boolean
}

export type FilterableCalendarEvent = {
  source: 'saved' | 'google'
  calendar: string
  google?: {
    accounts: Array<{ memberId: string | null }>
  }
}

export const DEFAULT_CALENDAR_MEMBER_FILTER: CalendarMemberFilter = {
  hideHousehold: false,
  hiddenMemberIds: [],
}

function isCalendarMemberFilter(value: unknown): value is CalendarMemberFilter {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.hideHousehold === 'boolean'
    && Array.isArray(record.hiddenMemberIds)
    && record.hiddenMemberIds.every((id) => typeof id === 'string')
}

export function readCalendarMemberFilter(
  storage?: Pick<Storage, 'getItem'>,
): CalendarMemberFilter {
  try {
    const raw = (storage ?? window.localStorage).getItem(CALENDAR_FILTER_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CALENDAR_MEMBER_FILTER }
    const parsed: unknown = JSON.parse(raw)
    if (!isCalendarMemberFilter(parsed)) return { ...DEFAULT_CALENDAR_MEMBER_FILTER }
    return {
      hideHousehold: parsed.hideHousehold,
      hiddenMemberIds: [...new Set(parsed.hiddenMemberIds)],
    }
  } catch {
    return { ...DEFAULT_CALENDAR_MEMBER_FILTER }
  }
}

export function persistCalendarMemberFilter(
  filter: CalendarMemberFilter,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
) {
  try {
    const store = storage ?? window.localStorage
    if (!filter.hideHousehold && filter.hiddenMemberIds.length === 0) {
      store.removeItem(CALENDAR_FILTER_STORAGE_KEY)
      return
    }
    store.setItem(CALENDAR_FILTER_STORAGE_KEY, JSON.stringify({
      hideHousehold: filter.hideHousehold,
      hiddenMemberIds: filter.hiddenMemberIds,
    }))
  } catch {
    // Private mode or blocked storage should still use the in-memory filter.
  }
}

export function toggleMemberFilter(
  filter: CalendarMemberFilter,
  memberId: string,
): CalendarMemberFilter {
  const hiddenMemberIds = filter.hiddenMemberIds.includes(memberId)
    ? filter.hiddenMemberIds.filter((id) => id !== memberId)
    : [...filter.hiddenMemberIds, memberId]
  return { ...filter, hiddenMemberIds }
}

export function toggleHouseholdFilter(filter: CalendarMemberFilter): CalendarMemberFilter {
  return { ...filter, hideHousehold: !filter.hideHousehold }
}

export function clearCalendarMemberFilter(): CalendarMemberFilter {
  return { hideHousehold: false, hiddenMemberIds: [] }
}

export function memberIsHidden(filter: CalendarMemberFilter, memberId: string) {
  return filter.hiddenMemberIds.includes(memberId)
}

export function calendarFilterIsNarrowed(
  filter: CalendarMemberFilter,
  members: CalendarFilterMember[],
) {
  return hiddenCalendarFilterCount(filter, members) > 0
}

export function hiddenCalendarFilterCount(
  filter: CalendarMemberFilter,
  members: CalendarFilterMember[],
) {
  const known = new Set(members.map((member) => member.id))
  const hiddenMembers = filter.hiddenMemberIds.filter((id) => known.has(id)).length
  return hiddenMembers + (filter.hideHousehold ? 1 : 0)
}

export function eventCalendarFilterIds(
  event: FilterableCalendarEvent,
  members: CalendarFilterMember[],
) {
  const knownIds = new Set(members.map((member) => member.id))
  if (event.source === 'google' || event.google?.accounts.length) {
    const memberIds = [...new Set(
      (event.google?.accounts ?? [])
        .map((account) => account.memberId)
        .filter((id): id is string => Boolean(id && knownIds.has(id))),
    )]
    return memberIds.length ? memberIds : [HOUSEHOLD_FILTER_ID]
  }

  const calendarName = event.calendar.trim().toLowerCase()
  const member = members.find((item) => (
    item.name.trim().toLowerCase() === calendarName
    && item.hasCalendarIntegration !== false
  ))
  return member ? [member.id] : [HOUSEHOLD_FILTER_ID]
}

export function eventVisibleInMemberFilter(
  event: FilterableCalendarEvent,
  members: CalendarFilterMember[],
  filter: CalendarMemberFilter,
) {
  const hiddenMembers = new Set(filter.hiddenMemberIds)
  return eventCalendarFilterIds(event, members).some((id) => (
    id === HOUSEHOLD_FILTER_ID
      ? !filter.hideHousehold
      : !hiddenMembers.has(id)
  ))
}

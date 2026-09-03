import type { CalendarEvent } from './events.js'

export const HOUSEHOLD_CALENDAR_NAME = 'Family'
export const GUEST_BUSY_TITLE = 'Busy'

export type GuestCalendarGrant = {
  includeHousehold: boolean
  members: Array<{ id: string; name: string }>
}

export function eventVisibleToGuest(
  event: CalendarEvent,
  grant: GuestCalendarGrant,
): boolean {
  const grantedIds = new Set(grant.members.map((member) => member.id))
  const grantedNames = new Set(
    grant.members.map((member) => member.name.trim().toLowerCase()),
  )

  if (event.source === 'google') {
    return (event.google?.accounts ?? []).some((account) => (
      account.memberId !== null && grantedIds.has(account.memberId)
    ))
  }

  const calendarName = event.calendar.trim().toLowerCase()
  if (grant.includeHousehold && calendarName === HOUSEHOLD_CALENDAR_NAME.toLowerCase()) {
    return true
  }
  return grantedNames.has(calendarName)
}

export function redactEventForGuest(event: CalendarEvent): CalendarEvent {
  return {
    id: event.id,
    title: GUEST_BUSY_TITLE,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    calendar: GUEST_BUSY_TITLE,
    location: null,
    description: null,
    externalUrl: null,
    organizer: null,
    source: 'saved',
    visibility: 'busy',
  }
}

export function guestEvents(events: CalendarEvent[], grant: GuestCalendarGrant) {
  return events
    .filter((event) => eventVisibleToGuest(event, grant))
    .map(redactEventForGuest)
}

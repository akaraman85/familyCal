export const HOUSEHOLD_CALENDAR_NAME = 'Family'

export function availableFamilyCalendars(
  members: Array<{ id: string; display_name: string }>,
  accounts: Array<{ member_id: string | null }>,
) {
  const connectedIds = new Set(
    accounts
      .map((account) => account.member_id)
      .filter((id): id is string => Boolean(id)),
  )
  const calendars = [HOUSEHOLD_CALENDAR_NAME]
  const withoutCalendars: string[] = []
  for (const member of members) {
    const name = member.display_name.trim()
    if (!name) continue
    if (connectedIds.has(member.id)) {
      if (!calendars.includes(name)) calendars.push(name)
    } else {
      withoutCalendars.push(name)
    }
  }
  return { calendars, withoutCalendars }
}

export function resolvePlannerDefaultCalendar(
  defaultCalendar: string,
  availableCalendars: string[],
) {
  const requested = defaultCalendar.trim()
  const match = availableCalendars.find(
    (name) => name.toLowerCase() === requested.toLowerCase(),
  )
  return match ?? HOUSEHOLD_CALENDAR_NAME
}

export function coerceUnconnectedMemberCalendar(
  calendar: string,
  withoutCalendars: string[],
  householdCalendar = HOUSEHOLD_CALENDAR_NAME,
) {
  const calendarName = calendar.trim().toLowerCase()
  if (withoutCalendars.some((name) => name.trim().toLowerCase() === calendarName)) {
    return householdCalendar
  }
  return calendar
}

export function householdCalendarForUnconnectedMembers<T extends { source: string; calendar: string }>(
  events: T[],
  members: Array<{ id: string; display_name: string }>,
  accounts: Array<{ member_id: string | null }>,
) {
  const { withoutCalendars } = availableFamilyCalendars(members, accounts)
  if (!withoutCalendars.length) return events
  return events.map((event) => {
    if (event.source !== 'saved') return event
    return {
      ...event,
      calendar: coerceUnconnectedMemberCalendar(event.calendar, withoutCalendars),
    }
  })
}

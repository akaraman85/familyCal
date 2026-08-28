export type CalendarEventData = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  calendar: string
  location: string | null
  description: string | null
  externalUrl: string | null
  organizer: {
    email: string | null
    displayName: string | null
    self: boolean
  } | null
  source: 'saved' | 'google'
  google?: {
    calendar: {
      id: string
      name: string
      primary: boolean
      type: 'primary' | 'owner' | 'editable' | 'read-only'
      accessRole: string
      color: string | null
    }
    accounts: Array<{
      id: string
      memberId: string | null
      email: string | null
      displayName: string | null
      calendarType: 'primary' | 'owner' | 'editable' | 'read-only'
      accessRole: string
    }>
  }
}

export type EventSources = {
  saved: 'ok'
  google: 'ok' | 'disconnected' | 'error' | 'reconnect'
}

async function readResponse<T>(response: Response) {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export async function loadCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  signal?: AbortSignal,
  options?: { revalidate?: boolean },
) {
  const query = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  })
  if (options?.revalidate) query.set('revalidate', '1')
  const response = await fetch(`/api/events?${query}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    signal,
  })
  return readResponse<{
    events: CalendarEventData[]
    sources: EventSources
    stale: boolean
  }>(response)
}

export type CalendarEventWrite = {
  title: string
  startAt: string
  endAt?: string | null
  calendar: string
  location?: string | null
  allDay?: boolean
  allDayDate?: string | null
  allDayEndDate?: string | null
}

export async function saveCalendarEvent(event: CalendarEventWrite) {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(event),
  })
  return readResponse<{ event: CalendarEventData }>(response)
}

export async function updateCalendarEvent(id: string, event: CalendarEventWrite) {
  const response = await fetch('/api/events', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id, ...event }),
  })
  return readResponse<{ event: CalendarEventData }>(response)
}

export async function deleteCalendarEvent(id: string) {
  const response = await fetch('/api/events', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id }),
  })
  if (response.ok) return
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Unable to delete event')
}

export async function saveCalendarEvents(events: Array<{
  title: string
  startAt: string
  endAt?: string | null
  calendar: string
  location?: string | null
  allDay?: boolean
  allDayDate?: string | null
  allDayEndDate?: string | null
}>, requestId: string, proposalToken: string, sessionId: string, revision: number) {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      events,
      requestId,
      proposalToken,
      sessionId,
      revision,
    }),
  })
  return readResponse<{ events: CalendarEventData[] }>(response)
}

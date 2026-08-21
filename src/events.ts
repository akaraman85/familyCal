export type CalendarEventData = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  calendar: string
  location: string | null
  source: 'saved' | 'google'
}

export type EventSources = {
  saved: 'ok'
  google: 'ok' | 'disconnected' | 'error'
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
) {
  const query = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  })
  const response = await fetch(`/api/events?${query}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    signal,
  })
  return readResponse<{ events: CalendarEventData[]; sources: EventSources }>(response)
}

export async function saveCalendarEvent(event: {
  title: string
  startAt: string
  endAt?: string | null
  calendar: string
  location?: string | null
}) {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(event),
  })
  return readResponse<{ event: CalendarEventData }>(response)
}

export async function saveCalendarEvents(events: Array<{
  title: string
  startAt: string
  endAt?: string | null
  calendar: string
  location?: string | null
  allDay?: boolean
}>, requestId: string) {
  const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ events, requestId }),
  })
  return readResponse<{ events: CalendarEventData[] }>(response)
}

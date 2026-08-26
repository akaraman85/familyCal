import { loadConnectedGoogleEvents } from './connected-events.js'
import { listSavedEvents, type CalendarEvent } from './events.js'

export const EVENT_SEARCH_MAX_RANGE_MS = 370 * 24 * 60 * 60 * 1000
export const EVENT_SEARCH_DEFAULT_LIMIT = 50

export type EventSearchSource = 'saved' | 'google' | 'all'

export type EventSearchConfig = {
  databaseUrl: string
  ownerId: string
  encryptionKey: string
  clientId: string
  clientSecret: string
  timeMin: Date
  timeMax: Date
  query?: string
  calendar?: string
  source?: EventSearchSource
  revalidate?: boolean
  limit?: number
}

export type EventSearchSources = {
  saved: 'ok' | 'skipped'
  google: 'ok' | 'disconnected' | 'error' | 'skipped'
}

export type EventSearchResult = {
  events: CalendarEvent[]
  totalCount: number
  truncated: boolean
  sources: EventSearchSources
  stale: boolean
  timeMin: string
  timeMax: string
}

export class EventSearchRangeError extends Error {}

export function validateEventSearchRange(timeMin: Date, timeMax: Date) {
  if (
    Number.isNaN(timeMin.getTime())
    || Number.isNaN(timeMax.getTime())
    || timeMax <= timeMin
    || timeMax.getTime() - timeMin.getTime() > EVENT_SEARCH_MAX_RANGE_MS
  ) {
    throw new EventSearchRangeError(
      'timeMin and timeMax must define a valid range of 370 days or less',
    )
  }
}

function matchesQuery(event: CalendarEvent, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return (
    event.title.toLowerCase().includes(normalized)
    || (event.location?.toLowerCase().includes(normalized) ?? false)
    || event.calendar.toLowerCase().includes(normalized)
  )
}

function matchesCalendar(event: CalendarEvent, calendar: string) {
  const normalized = calendar.trim().toLowerCase()
  if (!normalized) return true
  return event.calendar.toLowerCase().includes(normalized)
}

export async function searchCalendarEvents(config: EventSearchConfig): Promise<EventSearchResult> {
  validateEventSearchRange(config.timeMin, config.timeMax)
  const source = config.source ?? 'all'
  const limit = config.limit ?? EVENT_SEARCH_DEFAULT_LIMIT

  const [savedEvents, google] = await Promise.all([
    source === 'google'
      ? Promise.resolve([] as CalendarEvent[])
      : listSavedEvents(
        config.databaseUrl,
        config.ownerId,
        config.timeMin,
        config.timeMax,
      ),
    source === 'saved'
      ? Promise.resolve({
        events: [] as CalendarEvent[],
        status: 'disconnected' as const,
        stale: false,
      })
      : loadConnectedGoogleEvents({
        databaseUrl: config.databaseUrl,
        encryptionKey: config.encryptionKey,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        ownerId: config.ownerId,
        timeMin: config.timeMin,
        timeMax: config.timeMax,
        revalidate: config.revalidate ?? false,
      }),
  ])

  let events = [...savedEvents, ...google.events]
    .sort((left, right) => left.startAt.localeCompare(right.startAt))

  if (config.calendar) {
    events = events.filter((event) => matchesCalendar(event, config.calendar!))
  }
  if (config.query) {
    events = events.filter((event) => matchesQuery(event, config.query!))
  }

  const totalCount = events.length
  const truncated = totalCount > limit
  if (truncated) {
    events = events.slice(0, limit)
  }

  return {
    events,
    totalCount,
    truncated,
    sources: {
      saved: source === 'google' ? 'skipped' : 'ok',
      google: source === 'saved'
        ? 'skipped'
        : google.status,
    },
    stale: source === 'saved' ? false : google.stale,
    timeMin: config.timeMin.toISOString(),
    timeMax: config.timeMax.toISOString(),
  }
}

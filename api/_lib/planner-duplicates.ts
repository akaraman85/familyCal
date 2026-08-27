import type { CalendarEvent } from './events.js'
import { EventSearchRangeError, searchCalendarEvents } from './event-search.js'
import {
  MAX_PLANNER_WARNINGS,
  MAX_PROPOSED_EVENTS,
} from './planner-limits.js'

const DAY_MS = 24 * 60 * 60 * 1000
const EXISTING_EVENT_SEARCH_LIMIT = 250

type DatedEvent = {
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  allDayDate: string | null
  allDayEndDate: string | null
}

export type PlannerDuplicateProposal = {
  result: 'proposal' | 'needs_clarification' | 'calendar_info'
  message: string
  events: Array<DatedEvent & {
    calendar: string
    location: string | null
  }>
  warnings: string[]
}

export function normalizePlannerTitle(title: string) {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function isDateOnly(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export function plannerEventDateKey(
  event: DatedEvent,
  timeZone: string,
) {
  if (event.allDay && event.allDayDate && isDateOnly(event.allDayDate)) {
    return event.allDayDate
  }
  return calendarDateKey(event.startAt, timeZone)
}

function calendarDateKey(value: string, timeZone: string) {
  if (isDateOnly(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function duplicateKey(title: string, dateKey: string) {
  return `${normalizePlannerTitle(title)}|${dateKey}`
}

function warningDateLabel(dateKey: string) {
  if (!isDateOnly(dateKey)) return dateKey
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function alreadyOnCalendarWarning(title: string, dateKey: string) {
  return `Already on the calendar: ${title} (${warningDateLabel(dateKey)})`
}

function eventInstant(event: DatedEvent, field: 'start' | 'end') {
  if (field === 'start') {
    if (event.allDay && event.allDayDate && isDateOnly(event.allDayDate)) {
      return new Date(`${event.allDayDate}T00:00:00Z`)
    }
    return new Date(event.startAt)
  }
  if (event.endAt) return new Date(event.endAt)
  if (event.allDay && event.allDayEndDate && isDateOnly(event.allDayEndDate)) {
    return new Date(`${event.allDayEndDate}T00:00:00Z`)
  }
  return eventInstant(event, 'start')
}

function searchWindow(events: DatedEvent[]) {
  const instants = events.flatMap((event) => [
    eventInstant(event, 'start'),
    eventInstant(event, 'end'),
  ]).filter((date) => !Number.isNaN(date.getTime()))
  if (!instants.length) return null
  const start = Math.min(...instants.map((date) => date.getTime()))
  const end = Math.max(...instants.map((date) => date.getTime()))
  return {
    timeMin: new Date(start - DAY_MS),
    timeMax: new Date(end + DAY_MS),
  }
}

export function partitionExistingProposedEvents<T extends DatedEvent>(
  proposed: T[],
  existing: CalendarEvent[],
  timeZone: string,
) {
  const existingKeys = new Set(
    existing.flatMap((event) => {
      const title = normalizePlannerTitle(event.title)
      if (!title) return []
      return [duplicateKey(event.title, calendarDateKey(event.startAt, timeZone))]
    }),
  )
  const events: T[] = []
  const duplicateWarnings: string[] = []
  for (const event of proposed) {
    const title = normalizePlannerTitle(event.title)
    const dateKey = plannerEventDateKey(event, timeZone)
    if (title && existingKeys.has(duplicateKey(event.title, dateKey))) {
      duplicateWarnings.push(alreadyOnCalendarWarning(event.title, dateKey))
      continue
    }
    events.push(event)
  }
  return { events, duplicateWarnings }
}

export async function omitExistingProposedEvents(input: {
  proposal: PlannerDuplicateProposal
  databaseUrl: string
  ownerId: string
  encryptionKey: string
  googleClientId: string
  googleClientSecret: string
  timeZone: string
}): Promise<{ proposal: PlannerDuplicateProposal, duplicateCount: number }> {
  const { proposal } = input
  if (!proposal.events.length) {
    return { proposal, duplicateCount: 0 }
  }
  const window = searchWindow(proposal.events)
  if (!window) return { proposal, duplicateCount: 0 }

  let existing: CalendarEvent[] = []
  try {
    const searchResult = await searchCalendarEvents({
      databaseUrl: input.databaseUrl,
      ownerId: input.ownerId,
      encryptionKey: input.encryptionKey,
      clientId: input.googleClientId,
      clientSecret: input.googleClientSecret,
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      source: 'all',
      limit: EXISTING_EVENT_SEARCH_LIMIT,
    })
    existing = searchResult.events
  } catch (error) {
    if (!(error instanceof EventSearchRangeError)) {
      console.error('Unable to compare planner events with the calendar', error)
    }
    return { proposal, duplicateCount: 0 }
  }

  const { events, duplicateWarnings } = partitionExistingProposedEvents(
    proposal.events,
    existing,
    input.timeZone,
  )
  if (!duplicateWarnings.length) {
    return { proposal, duplicateCount: 0 }
  }

  const warnings = [...duplicateWarnings, ...proposal.warnings]
    .slice(0, MAX_PLANNER_WARNINGS)
  if (!events.length && proposal.result === 'proposal') {
    return {
      proposal: {
        result: 'calendar_info',
        message: 'Every extracted event is already on the calendar. Nothing new to add.',
        events: [],
        warnings,
      },
      duplicateCount: duplicateWarnings.length,
    }
  }
  return {
    proposal: {
      ...proposal,
      events: events.slice(0, MAX_PROPOSED_EVENTS),
      warnings,
    },
    duplicateCount: duplicateWarnings.length,
  }
}

import { eventOverlapsRange, eventTimeRange } from './event-range.js'

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type RecurrenceFrequency = typeof RECURRENCE_FREQUENCIES[number]
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type RecurrenceRule = {
  frequency: RecurrenceFrequency
  until: string | null
  weekdays?: IsoWeekday[] | null
}

export const MAX_RECURRENCE_OCCURRENCES = 400
export const WEEKDAY_VALUES: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

const DAY_MS = 24 * 60 * 60 * 1000

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

export function isoWeekdayUtc(date: Date): IsoWeekday {
  const day = date.getUTCDay()
  return (day === 0 ? 7 : day) as IsoWeekday
}

export function parseWeekdays(value: unknown): IsoWeekday[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const unique = [...new Set(
    value.map((item) => typeof item === 'number' ? item : Number(item)),
  )].filter((day) => WEEKDAY_VALUES.includes(day as IsoWeekday)).sort((left, right) => left - right)
  return unique.length ? unique as IsoWeekday[] : null
}

export function parseSavedEventRef(id: string) {
  if (!id.startsWith('saved:')) return null
  const rest = id.slice('saved:'.length)
  const separator = rest.indexOf('::')
  if (separator === -1) return { eventId: rest, occurrenceKey: null as string | null }
  return {
    eventId: rest.slice(0, separator),
    occurrenceKey: rest.slice(separator + 2) || null,
  }
}

export function savedEventSeriesId(id: string) {
  const parsed = parseSavedEventRef(id)
  return parsed ? `saved:${parsed.eventId}` : id
}

export function occurrenceEventId(eventId: string, occurrenceKey: string) {
  return `saved:${eventId}::${occurrenceKey}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function utcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || utcDateKey(date) !== value) return null
  return date
}

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && parseDateOnly(value))
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function nextWeeklyStart(start: Date, weekdays: Set<IsoWeekday>, from: Date) {
  const daysBehind = Math.max(0, Math.floor((from.getTime() - start.getTime()) / DAY_MS))
  let cursor = addUtcDays(start, daysBehind)
  for (let step = 0; step < 7; step += 1) {
    if (weekdays.has(isoWeekdayUtc(cursor))) return cursor
    cursor = addUtcDays(cursor, 1)
  }
  return cursor
}

function addUtcMonths(date: Date, months: number) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const day = date.getUTCDate()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    year,
    month,
    Math.min(day, lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ))
}

export function shiftOccurrenceStart(start: Date, frequency: RecurrenceFrequency, index: number) {
  if (index <= 0) return new Date(start.getTime())
  if (frequency === 'daily') return addUtcDays(start, index)
  if (frequency === 'weekly') return addUtcDays(start, index * 7)
  if (frequency === 'monthly') return addUtcMonths(start, index)
  return addUtcMonths(start, index * 12)
}

function estimatedIndex(start: Date, target: Date, frequency: RecurrenceFrequency) {
  const diffMs = target.getTime() - start.getTime()
  if (diffMs <= 0) return 0
  if (frequency === 'daily') return Math.floor(diffMs / DAY_MS)
  if (frequency === 'weekly') return Math.floor(diffMs / (7 * DAY_MS))
  if (frequency === 'monthly') return Math.floor(diffMs / (30 * DAY_MS))
  return Math.floor(diffMs / (365 * DAY_MS))
}

function occurrenceKey(startAt: string, allDay: boolean) {
  return allDay ? startAt.slice(0, 10) : startAt
}

function onOrBeforeUntil(startAt: string, until: string | null) {
  if (!until) return true
  return startAt.slice(0, 10) <= until
}

function utcClockMs(date: Date) {
  return (
    date.getUTCHours() * 3_600_000
    + date.getUTCMinutes() * 60_000
    + date.getUTCSeconds() * 1000
    + date.getUTCMilliseconds()
  )
}

function occurrenceEndOffsetMs(seriesStart: Date, originalEnd: number | null, allDay: boolean) {
  if (originalEnd === null) return null
  const raw = originalEnd - seriesStart.getTime()
  if (raw < 0 || Number.isNaN(raw)) return null
  if (allDay || raw < DAY_MS) return raw
  // A timed series whose first end is a later date almost always stored the
  // repeat-until date as the event end. Repeat the clock-time length instead
  // so each occurrence is 10:00–10:30, not a multi-day block.
  const clock = utcClockMs(new Date(originalEnd)) - utcClockMs(seriesStart)
  return clock > 0 ? clock : clock + DAY_MS
}

type ExpandableEvent = {
  id: string
  startAt: string
  endAt: string | null
  allDay: boolean
}

export function expandRecurringEvent<T extends ExpandableEvent>(
  event: T,
  rule: RecurrenceRule | null,
  timeMin: Date,
  timeMax: Date,
): Array<T & { recurrence: RecurrenceRule | null }> {
  if (!rule) {
    return eventOverlapsRange(event, timeMin, timeMax) ? [{ ...event, recurrence: null }] : []
  }

  const parsed = parseSavedEventRef(event.id)
  const eventId = parsed?.eventId
  if (!eventId) return eventOverlapsRange(event, timeMin, timeMax) ? [{ ...event, recurrence: rule }] : []

  const range = eventTimeRange(event)
  if (Number.isNaN(range.start)) return []
  const seriesStart = new Date(range.start)
  const originalEnd = event.endAt
    ? (event.allDay ? Date.parse(`${event.endAt.slice(0, 10)}T00:00:00.000Z`) : Date.parse(event.endAt))
    : null
  const endOffsetMs = occurrenceEndOffsetMs(
    seriesStart,
    originalEnd !== null && !Number.isNaN(originalEnd) ? originalEnd : null,
    event.allDay,
  )
  const durationMs = Math.max(0, endOffsetMs ?? (range.end - range.start))
  const weekdays = rule.frequency === 'weekly'
    ? new Set(rule.weekdays?.length ? rule.weekdays : [isoWeekdayUtc(seriesStart)])
    : null

  const expanded: Array<T & { recurrence: RecurrenceRule | null }> = []
  const pushOccurrence = (occurrenceStart: Date) => {
    const startAt = event.allDay ? utcDateKey(occurrenceStart) : occurrenceStart.toISOString()
    if (!onOrBeforeUntil(startAt, rule.until)) return false
    if (occurrenceStart.getTime() >= timeMax.getTime()) return false
    const endAt = endOffsetMs === null
      ? null
      : event.allDay
        ? utcDateKey(new Date(occurrenceStart.getTime() + endOffsetMs))
        : new Date(occurrenceStart.getTime() + endOffsetMs).toISOString()
    const occurrence = {
      ...event,
      id: occurrenceEventId(eventId, occurrenceKey(startAt, event.allDay)),
      startAt,
      endAt: event.allDay && endAt && endAt <= startAt ? null : endAt,
      recurrence: rule,
    }
    if (eventOverlapsRange(occurrence, timeMin, timeMax)) expanded.push(occurrence)
    return true
  }

  if (weekdays) {
    let cursor = nextWeeklyStart(seriesStart, weekdays, new Date(timeMin.getTime() - durationMs))
    if (cursor.getTime() < seriesStart.getTime()) cursor = seriesStart
    for (let steps = 0; steps < MAX_RECURRENCE_OCCURRENCES * 7; steps += 1) {
      if (cursor.getTime() >= timeMax.getTime()) break
      const startAt = event.allDay ? utcDateKey(cursor) : cursor.toISOString()
      if (!onOrBeforeUntil(startAt, rule.until)) break
      if (weekdays.has(isoWeekdayUtc(cursor))) {
        if (!pushOccurrence(cursor)) break
        if (expanded.length >= MAX_RECURRENCE_OCCURRENCES) break
      }
      cursor = addUtcDays(cursor, 1)
    }
    return expanded
  }

  let index = estimatedIndex(seriesStart, new Date(timeMin.getTime() - durationMs), rule.frequency)
  while (index > 0) {
    const previous = shiftOccurrenceStart(seriesStart, rule.frequency, index - 1)
    if (previous.getTime() + durationMs < timeMin.getTime()) break
    index -= 1
  }

  for (let count = 0; count < MAX_RECURRENCE_OCCURRENCES; count += 1, index += 1) {
    const occurrenceStart = shiftOccurrenceStart(seriesStart, rule.frequency, index)
    const startAt = event.allDay ? utcDateKey(occurrenceStart) : occurrenceStart.toISOString()
    if (!onOrBeforeUntil(startAt, rule.until)) break
    if (!pushOccurrence(occurrenceStart)) break
  }
  return expanded
}

export function recurrenceFromRow(
  frequency: string | null,
  until: string | Date | null,
  weekdays?: unknown,
): RecurrenceRule | null {
  if (!isRecurrenceFrequency(frequency)) return null
  const untilValue = until
    ? (typeof until === 'string' ? until.slice(0, 10) : utcDateKey(until))
    : null
  return {
    frequency,
    until: isIsoDate(untilValue) ? untilValue : null,
    weekdays: frequency === 'weekly' ? parseWeekdays(weekdays) : null,
  }
}

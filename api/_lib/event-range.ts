const DAY_MS = 24 * 60 * 60 * 1000

type TimedEvent = {
  startAt: string
  endAt: string | null
  allDay: boolean
}

function parseInstant(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00.000Z`)
  }
  return Date.parse(value)
}

export function eventTimeRange(event: TimedEvent) {
  if (event.allDay) {
    const start = parseInstant(event.startAt)
    let end = event.endAt ? parseInstant(event.endAt) : start + DAY_MS
    if (Number.isNaN(end) || end <= start) end = start + DAY_MS
    return { start, end }
  }
  const start = Date.parse(event.startAt)
  const end = event.endAt ? Date.parse(event.endAt) : start
  return { start, end: Number.isNaN(end) ? start : end }
}

export function eventOverlapsRange(
  event: TimedEvent,
  timeMin: Date,
  timeMax: Date,
) {
  const { start, end } = eventTimeRange(event)
  if (Number.isNaN(start)) return false
  return start < timeMax.getTime() && end >= timeMin.getTime()
}

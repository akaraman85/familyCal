import { format, isSameDay, startOfDay } from 'date-fns'
import type { CalendarEventWrite } from './events'

export const TIMELINE_START_MINUTES = 7 * 60
export const TIMELINE_END_MINUTES = 23 * 60
export const TIMELINE_RANGE_MINUTES = TIMELINE_END_MINUTES - TIMELINE_START_MINUTES
export const TIMELINE_LABEL_HOURS = [8, 10, 12, 14, 16, 18, 20, 22]
export const SNAP_MINUTES = 15
export const DEFAULT_EVENT_MINUTES = 60
export const POINTER_MOVE_THRESHOLD_PX = 8
export const WEEK_GUTTER_WIDTH = 56

export type EventDraft = {
  date: string
  time: string
  endTime: string
  endDate: string
  allDay: boolean
}

export type GridEvent = {
  id: string
  source: 'saved' | 'google'
  date: Date
  endDate?: Date
  allDay: boolean
  title: string
  calendar: string
  location?: string
}

export type MovePreview = {
  eventId: string
  start: Date
  end: Date | null
  allDay: boolean
}

export type SlotPreview = {
  kind: 'hover' | 'create'
  allDay: boolean
  startDay: Date
  endDay: Date
  startMinutes: number
  endMinutes: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function snapMinutes(
  minutes: number,
  min = TIMELINE_START_MINUTES,
  max = TIMELINE_END_MINUTES,
) {
  const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
  return clamp(snapped, min, max)
}

export function minutesFromClientY(clientY: number, rect: DOMRect) {
  if (rect.height <= 0) return TIMELINE_START_MINUTES
  const ratio = clamp((clientY - rect.top) / rect.height, 0, 1)
  return snapMinutes(TIMELINE_START_MINUTES + ratio * TIMELINE_RANGE_MINUTES)
}

export function dayIndexFromClientX(
  clientX: number,
  rect: DOMRect,
  dayCount: number,
  gutterWidth = 0,
) {
  if (dayCount <= 1) return 0
  const usable = Math.max(1, rect.width - gutterWidth)
  const x = clientX - rect.left - gutterWidth
  return clamp(Math.floor(x / (usable / dayCount)), 0, dayCount - 1)
}

export function dateAtMinutes(day: Date, minutes: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes, 0, 0)
}

export function formatMinutesAsTime(minutes: number) {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(wrapped / 60)
  const mins = wrapped % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function timeAfter(startTime: string, durationMinutes = DEFAULT_EVENT_MINUTES) {
  const [hours = 9, minutes = 0] = startTime.split(':').map(Number)
  return formatMinutesAsTime(hours * 60 + minutes + durationMinutes)
}

export function draftForDate(day: Date, allDay = false): EventDraft {
  if (allDay) {
    return {
      date: format(day, 'yyyy-MM-dd'),
      time: '09:00',
      endTime: timeAfter('09:00'),
      endDate: '',
      allDay: true,
    }
  }
  return slotToDraft(day, 9 * 60, 9 * 60 + DEFAULT_EVENT_MINUTES)
}

export function slotToDraft(
  day: Date,
  startMinutes: number,
  endMinutes = startMinutes + DEFAULT_EVENT_MINUTES,
): EventDraft {
  const start = dateAtMinutes(day, Math.min(startMinutes, endMinutes))
  const end = dateAtMinutes(day, Math.max(startMinutes, endMinutes))
  if (end.getTime() <= start.getTime()) {
    end.setMinutes(start.getMinutes() + DEFAULT_EVENT_MINUTES)
  }
  return {
    date: format(start, 'yyyy-MM-dd'),
    time: format(start, 'HH:mm'),
    endTime: format(end, 'HH:mm'),
    endDate: isSameDay(start, end) ? '' : format(end, 'yyyy-MM-dd'),
    allDay: false,
  }
}

export function allDayRangeDraft(startDay: Date, endDay: Date): EventDraft {
  const start = startOfDay(startDay <= endDay ? startDay : endDay)
  const end = startOfDay(startDay <= endDay ? endDay : startDay)
  return {
    date: format(start, 'yyyy-MM-dd'),
    time: '09:00',
    endTime: timeAfter('09:00'),
    endDate: isSameDay(start, end) ? '' : format(end, 'yyyy-MM-dd'),
    allDay: true,
  }
}

export function timelinePercent(minutes: number) {
  return `${((minutes - TIMELINE_START_MINUTES) / TIMELINE_RANGE_MINUTES) * 100}%`
}

export function previewStyle(startMinutes: number, endMinutes: number) {
  const start = Math.min(startMinutes, endMinutes)
  const end = Math.max(startMinutes, endMinutes)
  const top = (start - TIMELINE_START_MINUTES) / TIMELINE_RANGE_MINUTES * 100
  const height = Math.max(
    ((end - start) / TIMELINE_RANGE_MINUTES) * 100,
    (SNAP_MINUTES / TIMELINE_RANGE_MINUTES) * 100,
  )
  return {
    top: `${top}%`,
    height: `${Math.min(height, 100 - top)}%`,
  }
}

export function timelinePosition(event: { allDay: boolean; date: Date; endDate?: Date }) {
  if (event.allDay) return null
  const startMinutes = event.date.getHours() * 60 + event.date.getMinutes()
  const duration = event.endDate
    ? Math.max(1, (event.endDate.getTime() - event.date.getTime()) / 60_000)
    : DEFAULT_EVENT_MINUTES
  const endMinutes = startMinutes + duration
  if (
    startMinutes >= TIMELINE_END_MINUTES
    || endMinutes <= TIMELINE_START_MINUTES
  ) {
    return null
  }
  const visibleStart = Math.max(startMinutes, TIMELINE_START_MINUTES)
  const visibleEnd = Math.min(endMinutes, TIMELINE_END_MINUTES)
  const top = (visibleStart - TIMELINE_START_MINUTES) / TIMELINE_RANGE_MINUTES * 100
  const height = Math.min(
    (visibleEnd - visibleStart) / TIMELINE_RANGE_MINUTES * 100,
    100 - top,
  )
  return {
    top: `${top}%`,
    height: `${height}%`,
  }
}

export function applyMovePreview<T extends GridEvent>(events: T[], preview: MovePreview | null): T[] {
  if (!preview) return events
  return events.map((event) => (
    event.id === preview.eventId
      ? {
          ...event,
          date: preview.start,
          endDate: preview.end ?? undefined,
          allDay: preview.allDay,
        }
      : event
  ))
}

export function movedEventBounds(event: GridEvent, start: Date, allDay: boolean) {
  if (allDay) {
    const nextStart = startOfDay(start)
    if (!event.allDay || !event.endDate) {
      return { start: nextStart, end: null as Date | null }
    }
    const spanMs = event.endDate.getTime() - event.date.getTime()
    return {
      start: nextStart,
      end: spanMs > 0 ? new Date(nextStart.getTime() + spanMs) : null,
    }
  }
  if (event.allDay || !event.endDate) {
    return { start, end: null as Date | null }
  }
  const durationMs = Math.max(
    SNAP_MINUTES * 60_000,
    event.endDate.getTime() - event.date.getTime(),
  )
  return { start, end: new Date(start.getTime() + durationMs) }
}

export function movedEventWrite(
  event: GridEvent,
  start: Date,
  end: Date | null,
  allDay: boolean,
): CalendarEventWrite {
  const location = event.location || undefined
  if (allDay) {
    const allDayDate = format(start, 'yyyy-MM-dd')
    const allDayEndDate = end && !isSameDay(start, end)
      ? format(end, 'yyyy-MM-dd')
      : null
    return {
      title: event.title,
      calendar: event.calendar,
      location,
      startAt: new Date(`${allDayDate}T00:00:00`).toISOString(),
      endAt: allDayEndDate ? new Date(`${allDayEndDate}T00:00:00`).toISOString() : null,
      allDay: true,
      allDayDate,
      allDayEndDate,
    }
  }
  return {
    title: event.title,
    calendar: event.calendar,
    location,
    startAt: start.toISOString(),
    endAt: end?.toISOString() ?? null,
    allDay: false,
    allDayDate: null,
    allDayEndDate: null,
  }
}

export function pointerMovedEnough(
  originX: number,
  originY: number,
  clientX: number,
  clientY: number,
) {
  return Math.hypot(clientX - originX, clientY - originY) >= POINTER_MOVE_THRESHOLD_PX
}

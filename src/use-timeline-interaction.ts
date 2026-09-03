import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  allDayRangeDraft,
  dateAtMinutes,
  dayIndexFromClientX,
  DEFAULT_EVENT_MINUTES,
  minutesFromClientY,
  movedEventBounds,
  pointerMovedEnough,
  slotToDraft,
  type EventDraft,
  type GridEvent,
  type MovePreview,
  type SlotPreview,
} from './calendar-slot'

type DragSession<T extends GridEvent> = {
  pointerId: number
  pointerType: string
  originX: number
  originY: number
  moved: boolean
} & (
  | {
      kind: 'create'
      allDay: boolean
      startDay: Date
      startMinutes: number
    }
  | {
      kind: 'move'
      event: T
      allDay: boolean
    }
)

export function useTimelineInteraction<T extends GridEvent>({
  days,
  gutterWidth = 0,
  onCreate,
  onMove,
  onSelect,
  readOnly = false,
}: {
  days: Date[]
  gutterWidth?: number
  onCreate: (draft: EventDraft) => void
  onMove: (event: T, start: Date, end: Date | null, allDay: boolean) => void
  onSelect: (event: T) => void
  readOnly?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef(days)
  daysRef.current = days
  const sessionRef = useRef<DragSession<T> | null>(null)
  const ignoreClickRef = useRef(false)
  const [slotPreview, setSlotPreview] = useState<SlotPreview | null>(null)
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null)
  const [dragging, setDragging] = useState(false)

  const clearSession = useCallback((pointerId?: number) => {
    const session = sessionRef.current
    if (!session || (pointerId !== undefined && session.pointerId !== pointerId)) return
    sessionRef.current = null
    setSlotPreview(null)
    setMovePreview(null)
    setDragging(false)
    const node = containerRef.current
    if (node?.hasPointerCapture(session.pointerId)) {
      node.releasePointerCapture(session.pointerId)
    }
  }, [])

  const resolveTarget = useCallback((clientX: number, clientY: number, allDay: boolean) => {
    const node = containerRef.current
    const currentDays = daysRef.current
    if (!node || !currentDays.length) return null
    const rect = node.getBoundingClientRect()
    const day = currentDays[dayIndexFromClientX(clientX, rect, currentDays.length, gutterWidth)]
    const minutes = allDay ? 0 : minutesFromClientY(clientY, rect)
    return { day, minutes }
  }, [gutterWidth])

  const captureIfNeeded = (event: ReactPointerEvent<HTMLElement>) => {
    const node = containerRef.current
    if (!node) return
    if (event.pointerType === 'mouse' || sessionRef.current?.kind === 'move') {
      node.setPointerCapture(event.pointerId)
    }
  }

  const startCreate = (event: ReactPointerEvent<HTMLElement>, day: Date, allDay = false) => {
    if (readOnly || event.button !== 0 || sessionRef.current) return
    ignoreClickRef.current = false
    const target = resolveTarget(event.clientX, event.clientY, allDay)
    sessionRef.current = {
      kind: 'create',
      allDay,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
      startDay: day,
      startMinutes: target?.minutes ?? 0,
    }
    captureIfNeeded(event)
  }

  const startMove = (event: ReactPointerEvent<HTMLElement>, gridEvent: T) => {
    event.stopPropagation()
    ignoreClickRef.current = false
    if (readOnly || event.button !== 0 || sessionRef.current || gridEvent.source !== 'saved') return
    sessionRef.current = {
      kind: 'move',
      allDay: gridEvent.allDay,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
      event: gridEvent,
    }
    captureIfNeeded(event)
  }

  const updateSession = (event: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const target = resolveTarget(event.clientX, event.clientY, session.allDay)
    if (!target) return
    if (!session.moved && !pointerMovedEnough(session.originX, session.originY, event.clientX, event.clientY)) {
      return
    }
    if (session.pointerType !== 'mouse' && session.kind === 'create') return
    session.moved = true
    setDragging(true)
    if (session.kind === 'create') {
      setMovePreview(null)
      setSlotPreview({
        kind: 'create',
        allDay: session.allDay,
        startDay: session.startDay,
        endDay: session.allDay ? target.day : session.startDay,
        startMinutes: session.allDay ? 0 : session.startMinutes,
        endMinutes: session.allDay ? 0 : target.minutes,
      })
      return
    }
    const bounds = movedEventBounds(
      session.event,
      session.allDay ? target.day : dateAtMinutes(target.day, target.minutes),
      session.allDay,
    )
    setSlotPreview(null)
    setMovePreview({
      eventId: session.event.id,
      start: bounds.start,
      end: bounds.end,
      allDay: session.allDay,
    })
  }

  const finishSession = (event: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const target = resolveTarget(event.clientX, event.clientY, session.allDay)
    const moved = session.moved
    const kind = session.kind
    if (kind === 'create') {
      const allowTouchCreate = session.pointerType !== 'mouse' ? !moved : true
      if (allowTouchCreate && target) {
        if (session.allDay) {
          onCreate(allDayRangeDraft(session.startDay, moved ? target.day : session.startDay))
        } else {
          const endMinutes = moved ? target.minutes : session.startMinutes + DEFAULT_EVENT_MINUTES
          onCreate(slotToDraft(
            session.startDay,
            session.startMinutes,
            endMinutes === session.startMinutes
              ? session.startMinutes + DEFAULT_EVENT_MINUTES
              : endMinutes,
          ))
        }
      }
    } else if (kind === 'move') {
      if (moved && target) {
        ignoreClickRef.current = true
        const bounds = movedEventBounds(
          session.event,
          session.allDay ? target.day : dateAtMinutes(target.day, target.minutes),
          session.allDay,
        )
        onMove(session.event, bounds.start, bounds.end, session.allDay)
      } else if (!moved) {
        ignoreClickRef.current = true
        onSelect(session.event)
      }
      window.setTimeout(() => {
        ignoreClickRef.current = false
      }, 0)
    }
    clearSession(event.pointerId)
  }

  const onGridPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    updateSession(event)
  }

  const onGridPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    finishSession(event)
  }

  const onGridPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    clearSession(event.pointerId)
  }

  const onColumnPointerDown = (event: ReactPointerEvent<HTMLElement>, day: Date, allDay = false) => {
    if ((event.target as Element | null)?.closest('[data-calendar-event]')) return
    startCreate(event, day, allDay)
  }

  const onColumnPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current
    if (!session || session.kind !== 'create' || session.pointerType === 'mouse') return
    finishSession(event)
  }

  const onHoverMove = (event: ReactPointerEvent<HTMLElement> | { clientX: number; clientY: number }, day: Date) => {
    if (readOnly || sessionRef.current) return
    const target = resolveTarget(event.clientX, event.clientY, false)
    if (!target) return
    setSlotPreview({
      kind: 'hover',
      allDay: false,
      startDay: day,
      endDay: day,
      startMinutes: target.minutes,
      endMinutes: target.minutes + DEFAULT_EVENT_MINUTES,
    })
  }

  const onHoverLeave = () => {
    if (sessionRef.current) return
    setSlotPreview((current) => current?.kind === 'hover' ? null : current)
  }

  const onEventClick = (event: { preventDefault: () => void; stopPropagation: () => void }, gridEvent: T) => {
    if (ignoreClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      ignoreClickRef.current = false
      return
    }
    onSelect(gridEvent)
  }

  const eventPointerProps = (gridEvent: T) => ({
    'data-calendar-event': gridEvent.id,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startMove(event, gridEvent),
    onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      onEventClick(event, gridEvent)
    },
  })

  return {
    containerRef,
    slotPreview,
    movePreview,
    dragging,
    onGridPointerMove,
    onGridPointerUp,
    onGridPointerCancel,
    onColumnPointerDown,
    onColumnPointerUp,
    onHoverMove,
    onHoverLeave,
    eventPointerProps,
    onEventClick,
  }
}

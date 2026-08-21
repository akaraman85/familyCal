import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export type PlannerConfirmationEvent = {
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  allDayDate: string | null
  allDayEndDate: string | null
  calendar: string
  location: string | null
}

type ConfirmationPayload = {
  requestId: string
  ownerId: string
  eventsHash: string
  expiresAt: number
}

function secret() {
  const value = process.env.AUTH_SESSION_SECRET?.trim()
  if (!value) throw new Error('AUTH_SESSION_SECRET is required')
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32) {
    throw new Error('AUTH_SESSION_SECRET must be a base64-encoded 32-byte key')
  }
  return decoded
}

function eventsHash(events: PlannerConfirmationEvent[]) {
  const canonical = events.map((event) => ({
    title: event.title.trim(),
    startAt: new Date(event.startAt).toISOString(),
    endAt: event.endAt ? new Date(event.endAt).toISOString() : null,
    allDay: event.allDay,
    allDayDate: event.allDayDate,
    allDayEndDate: event.allDayEndDate,
    calendar: event.calendar.trim(),
    location: event.location?.trim() || null,
  }))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('base64url')
}

function signature(encoded: string) {
  return createHmac('sha256', secret()).update(encoded).digest('base64url')
}

export function signPlannerProposal(input: {
  requestId: string
  ownerId: string
  events: PlannerConfirmationEvent[]
}) {
  const payload: ConfirmationPayload = {
    requestId: input.requestId,
    ownerId: input.ownerId,
    eventsHash: eventsHash(input.events),
    expiresAt: Date.now() + 30 * 60 * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyPlannerProposal(input: {
  token: string
  requestId: string
  ownerId: string
  events: PlannerConfirmationEvent[]
}) {
  const [encoded, suppliedSignature, extra] = input.token.split('.')
  if (!encoded || !suppliedSignature || extra) return false
  const expectedSignature = signature(encoded)
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (
    supplied.length !== expected.length
    || !timingSafeEqual(supplied, expected)
  ) {
    return false
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as ConfirmationPayload
    return payload.requestId === input.requestId
      && payload.ownerId === input.ownerId
      && payload.eventsHash === eventsHash(input.events)
      && Number.isFinite(payload.expiresAt)
      && payload.expiresAt >= Date.now()
  } catch {
    return false
  }
}

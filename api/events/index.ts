import {
  createSavedEvent,
  createSavedEvents,
  listSavedEvents,
  PlannerSessionConflictError,
  updateSavedEvent,
  type CalendarEvent,
} from '../_lib/events.js'
import { requireAuthentication } from '../_lib/auth.js'
import {
  listCalendarExclusions,
  listIntegrationAccountsWithCredentials,
} from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
import { verifyPlannerProposal } from '../_lib/planner-confirmation.js'
import {
  errorMessage,
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import {
  getGoogleAccessToken,
  GOOGLE_CALENDAR_PROVIDER_ID,
  hasGoogleCalendarReadScope,
  listAllGoogleEvents,
} from '../_lib/providers/google-calendar.js'

const MAX_RANGE_MS = 370 * 24 * 60 * 60 * 1000

class ValidationError extends Error {}

const CALENDAR_TYPE_RANK = {
  'read-only': 0,
  editable: 1,
  owner: 2,
  primary: 3,
} as const

function queryValue(request: ApiRequest, name: string) {
  const value = request.query?.[name]
  if (Array.isArray(value)) return value[0]
  if (value) return value
  return new URL(request.url ?? '/', 'http://localhost').searchParams.get(name) ?? undefined
}

function parseRange(request: ApiRequest) {
  const timeMin = new Date(queryValue(request, 'timeMin') ?? '')
  const timeMax = new Date(queryValue(request, 'timeMax') ?? '')
  if (
    Number.isNaN(timeMin.getTime())
    || Number.isNaN(timeMax.getTime())
    || timeMax <= timeMin
    || timeMax.getTime() - timeMin.getTime() > MAX_RANGE_MS
  ) {
    throw new ValidationError('timeMin and timeMax must define a valid range of 370 days or less')
  }
  return { timeMin, timeMax }
}

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new ValidationError('Invalid event field')
  }
  return value.trim()
}

function isIsoDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function parseEvent(body: Record<string, unknown>) {
  const title = optionalString(body.title, 200)
  const calendar = optionalString(body.calendar, 100)
  const location = optionalString(body.location, 500)
  if (!title || !calendar || typeof body.startAt !== 'string') {
    throw new ValidationError('Title, calendar, and start time are required')
  }

  const startAt = new Date(body.startAt)
  const endAt = body.endAt ? new Date(String(body.endAt)) : null
  if (
    Number.isNaN(startAt.getTime())
    || (endAt && (Number.isNaN(endAt.getTime()) || endAt <= startAt))
  ) {
    throw new ValidationError('Event dates are invalid')
  }
  const allDay = body.allDay === true
  const allDayDate = typeof body.allDayDate === 'string'
    ? body.allDayDate
    : null
  const allDayEndDate = typeof body.allDayEndDate === 'string'
    ? body.allDayEndDate
    : null
  if (
    allDay
    && (
      !isIsoDate(allDayDate)
      || (
        allDayEndDate !== null
        && (!isIsoDate(allDayEndDate) || allDayEndDate <= allDayDate!)
      )
    )
  ) {
    throw new ValidationError('All-day event date is invalid')
  }
  return {
    title,
    startAt: startAt.toISOString(),
    endAt: endAt?.toISOString() ?? null,
    allDay,
    allDayDate: allDay ? allDayDate : null,
    allDayEndDate: allDay ? allDayEndDate : null,
    calendar,
    location,
  }
}

function parseSavedEventId(id: unknown) {
  if (typeof id !== 'string' || !id.startsWith('saved:')) {
    throw new ValidationError('Only saved family events can be updated')
  }
  const eventId = id.slice('saved:'.length)
  if (!eventId || eventId.length > 80) {
    throw new ValidationError('Event is invalid')
  }
  return eventId
}

async function getEvents(request: ApiRequest, response: ApiResponse) {
  try {
    const env = integrationEnv()
    const { timeMin, timeMax } = parseRange(request)
    const savedEvents = await listSavedEvents(
      env.databaseUrl,
      env.ownerId,
      timeMin,
      timeMax,
    )
    let googleEvents: CalendarEvent[] = []
    let googleStatus: 'ok' | 'disconnected' | 'error' = 'disconnected'
    const [googleAccounts, exclusions] = await Promise.all([
      listIntegrationAccountsWithCredentials(
        env.databaseUrl,
        env.ownerId,
        GOOGLE_CALENDAR_PROVIDER_ID,
      ),
      listCalendarExclusions(
        env.databaseUrl,
        env.ownerId,
        GOOGLE_CALENDAR_PROVIDER_ID,
      ),
    ])

    if (googleAccounts.length) {
      const readableAccounts = googleAccounts.filter((account) => (
        hasGoogleCalendarReadScope(account.scopes)
      ))
      googleStatus = readableAccounts.length ? 'ok' : 'error'
      const eventsById = new Map<string, CalendarEvent>()
      for (const account of readableAccounts) {
        try {
          const accessToken = await getGoogleAccessToken({
            databaseUrl: env.databaseUrl,
            encryptionKey: env.encryptionKey,
            clientId: env.googleClientId,
            clientSecret: env.googleClientSecret,
          }, account)
          const excludedCalendarIds = new Set(
            exclusions
              .filter((row) => row.external_account_id === account.external_account_id)
              .map((row) => row.calendar_id),
          )
          const accountEvents = await listAllGoogleEvents(
            accessToken,
            timeMin,
            timeMax,
            { account, excludedCalendarIds },
          )
          for (const event of accountEvents) {
            const existing = eventsById.get(event.id)
            if (existing?.google && event.google) {
              if (
                CALENDAR_TYPE_RANK[event.google.calendar.type]
                > CALENDAR_TYPE_RANK[existing.google.calendar.type]
              ) {
                existing.google.calendar = event.google.calendar
                existing.calendar = event.calendar
              }
              for (const sourceAccount of event.google.accounts) {
                if (!existing.google.accounts.some(({ id }) => id === sourceAccount.id)) {
                  existing.google.accounts.push(sourceAccount)
                }
              }
            } else {
              eventsById.set(event.id, event)
            }
          }
        } catch (error) {
          googleStatus = 'error'
          console.error(`Unable to load Google Calendar events for ${account.external_account_id}`, error)
        }
      }
      googleEvents = [...eventsById.values()]
    }

    const events = [...savedEvents, ...googleEvents]
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
    sendJson(response, 200, {
      events,
      sources: { saved: 'ok', google: googleStatus },
    })
  } catch (error) {
    console.error('Unable to load calendar events', error)
    sendJson(response, error instanceof ValidationError ? 400 : 500, {
      error: error instanceof ValidationError
        ? error.message
        : 'Calendar events are unavailable',
    })
  }
}

async function postEvent(request: ApiRequest, response: ApiResponse) {
  try {
    const env = integrationEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return

    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Event details are invalid')
    }
    const body = rawBody as Record<string, unknown>
    if (Array.isArray(body.events)) {
      if (!body.events.length || body.events.length > 20) {
        throw new ValidationError('Create between 1 and 20 events at a time')
      }
      const events = body.events.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new ValidationError('Event details are invalid')
        }
        return parseEvent(item as Record<string, unknown>)
      })
      const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
      if (!requestId || requestId.length > 100) {
        throw new ValidationError('Planner request ID is required')
      }
      const proposalToken = typeof body.proposalToken === 'string'
        ? body.proposalToken
        : ''
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const revision = typeof body.revision === 'number' ? body.revision : NaN
      if (!proposalToken || !verifyPlannerProposal({
        token: proposalToken,
        requestId,
        ownerId: env.ownerId,
        sessionId,
        revision,
        events,
      })) {
        sendJson(response, 403, {
          error: 'Planner proposal expired or changed. Prepare it again.',
        })
        return
      }
      const created = await createSavedEvents(
        env.databaseUrl,
        env.ownerId,
        events,
        requestId,
        { sessionId, revision },
      )
      sendJson(response, 201, { events: created })
      return
    }

    const event = await createSavedEvent(
      env.databaseUrl,
      env.ownerId,
      parseEvent(body),
    )
    sendJson(response, 201, { event })
  } catch (error) {
    console.error('Unable to save calendar event', error)
    if (error instanceof PlannerSessionConflictError) {
      sendJson(response, 409, { error: error.message })
      return
    }
    const validationError = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, validationError ? 400 : 500, {
      error: validationError ? errorMessage(error) : 'The event could not be saved',
    })
  }
}

async function patchEvent(request: ApiRequest, response: ApiResponse) {
  try {
    const env = integrationEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return

    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Event details are invalid')
    }
    const body = rawBody as Record<string, unknown>
    const updated = await updateSavedEvent(
      env.databaseUrl,
      env.ownerId,
      parseSavedEventId(body.id),
      parseEvent(body),
    )
    if (!updated) {
      sendJson(response, 404, { error: 'Event not found' })
      return
    }
    sendJson(response, 200, { event: updated })
  } catch (error) {
    console.error('Unable to update calendar event', error)
    const validationError = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, validationError ? 400 : 500, {
      error: validationError ? errorMessage(error) : 'The event could not be updated',
    })
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'POST', 'PATCH'])) return
  if (!requireAuthentication(request, response)) return
  if (request.method === 'POST') return postEvent(request, response)
  if (request.method === 'PATCH') return patchEvent(request, response)
  return getEvents(request, response)
}

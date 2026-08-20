import {
  createSavedEvent,
  listSavedEvents,
  type CalendarEvent,
} from '../_lib/events.js'
import { getIntegrationAccount } from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
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
  listAllGoogleEvents,
} from '../_lib/providers/google-calendar.js'

const MAX_RANGE_MS = 370 * 24 * 60 * 60 * 1000

class ValidationError extends Error {}

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
    const googleAccount = await getIntegrationAccount(
      env.databaseUrl,
      env.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
    )

    if (googleAccount) {
      try {
        const accessToken = await getGoogleAccessToken({
          databaseUrl: env.databaseUrl,
          encryptionKey: env.encryptionKey,
          ownerId: env.ownerId,
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
        })
        googleEvents = await listAllGoogleEvents(accessToken, timeMin, timeMax)
        googleStatus = 'ok'
      } catch (error) {
        googleStatus = 'error'
        console.error('Unable to load Google Calendar events', error)
      }
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

    const body = await readJsonBody(request) as Record<string, unknown>
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

    const event = await createSavedEvent(env.databaseUrl, env.ownerId, {
      title,
      startAt: startAt.toISOString(),
      endAt: endAt?.toISOString() ?? null,
      calendar,
      location,
    })
    sendJson(response, 201, { event })
  } catch (error) {
    console.error('Unable to save calendar event', error)
    const validationError = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, validationError ? 400 : 500, {
      error: validationError ? errorMessage(error) : 'The event could not be saved',
    })
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'POST'])) return
  if (request.method === 'POST') return postEvent(request, response)
  return getEvents(request, response)
}

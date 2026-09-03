import { requireAdmin } from '../../_lib/auth.js'
import { invalidateConnectedCalendarCache } from '../../_lib/connected-events.js'
import {
  getIntegrationAccount,
  setCalendarIncluded,
} from '../../_lib/db.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import { GOOGLE_CALENDAR_PROVIDER_ID } from '../../_lib/providers/google-calendar.js'

class ValidationError extends Error {}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['PATCH'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = integrationEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Calendar preference is invalid')
    }
    const body = rawBody as Record<string, unknown>
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
    const calendarId = typeof body.calendarId === 'string' ? body.calendarId.trim() : ''
    if (
      !accountId
      || !calendarId
      || calendarId.length > 1024
      || typeof body.included !== 'boolean'
    ) {
      throw new ValidationError('Calendar preference is invalid')
    }

    const account = await getIntegrationAccount(
      env.databaseUrl,
      env.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
      accountId,
    )
    if (!account) {
      sendJson(response, 404, { error: 'Google account not found' })
      return
    }

    await setCalendarIncluded(
      env.databaseUrl,
      env.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
      accountId,
      calendarId,
      body.included,
    )
    await invalidateConnectedCalendarCache(
      env.databaseUrl,
      env.ownerId,
      accountId,
    )
    sendJson(response, 200, {
      accountId,
      calendarId,
      included: body.included,
    })
  } catch (error) {
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    console.error('Unable to update Google calendar preference', error)
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Calendar preference is invalid')
        : 'Calendar preference could not be saved',
    })
  }
}

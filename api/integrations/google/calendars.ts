import { requireAuthentication } from '../../_lib/auth.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  errorMessage,
  requireMethod,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import {
  getGoogleAccessToken,
  listGoogleCalendars,
} from '../../_lib/providers/google-calendar.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    const accessToken = await getGoogleAccessToken({
      databaseUrl: env.databaseUrl,
      encryptionKey: env.encryptionKey,
      ownerId: env.ownerId,
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    })
    const calendars = await listGoogleCalendars(accessToken)
    sendJson(response, 200, {
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.summary,
        primary: calendar.primary ?? false,
        accessRole: calendar.accessRole,
        color: calendar.backgroundColor ?? null,
      })),
    })
  } catch (error) {
    console.error('Unable to list Google calendars', error)
    const message = errorMessage(error)
    sendJson(response, message === 'Google Calendar is not connected' ? 404 : 502, {
      error: message,
    })
  }
}

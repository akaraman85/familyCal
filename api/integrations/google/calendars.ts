import { requireAuthentication } from '../../_lib/auth.js'
import { listIntegrationAccountsWithCredentials } from '../../_lib/db.js'
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
  GOOGLE_CALENDAR_PROVIDER_ID,
  listGoogleCalendars,
} from '../../_lib/providers/google-calendar.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    const accounts = await listIntegrationAccountsWithCredentials(
      env.databaseUrl,
      env.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
    )
    const calendars = []
    for (const account of accounts) {
      const accessToken = await getGoogleAccessToken({
        databaseUrl: env.databaseUrl,
        encryptionKey: env.encryptionKey,
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
      }, account)
      const accountCalendars = await listGoogleCalendars(accessToken)
      calendars.push(...accountCalendars.map((calendar) => ({
        accountId: account.external_account_id,
        id: calendar.id,
        name: calendar.summary,
        primary: calendar.primary ?? false,
        accessRole: calendar.accessRole,
        color: calendar.backgroundColor ?? null,
      })))
    }
    sendJson(response, 200, {
      calendars,
    })
  } catch (error) {
    console.error('Unable to list Google calendars', error)
    const message = errorMessage(error)
    sendJson(response, 502, {
      error: message,
    })
  }
}

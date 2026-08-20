import { requireAuthentication } from '../../_lib/auth.js'
import { decryptJson } from '../../_lib/crypto.js'
import {
  deleteIntegrationAccount,
  getIntegrationAccount,
  type StoredCredentials,
} from '../../_lib/db.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import {
  GOOGLE_CALENDAR_PROVIDER_ID,
  revokeGoogleToken,
} from '../../_lib/providers/google-calendar.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return

    const account = await getIntegrationAccount(
      env.databaseUrl,
      env.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
    )
    if (account) {
      const credentials = decryptJson<StoredCredentials>(
        account.encrypted_credentials,
        env.encryptionKey,
      )
      await revokeGoogleToken(credentials.refreshToken ?? credentials.accessToken)
      await deleteIntegrationAccount(
        env.databaseUrl,
        env.ownerId,
        GOOGLE_CALENDAR_PROVIDER_ID,
      )
    }

    response.statusCode = 204
    response.setHeader('Cache-Control', 'no-store')
    response.end()
  } catch (error) {
    console.error('Unable to disconnect Google Calendar', error)
    sendJson(response, 502, {
      error: 'Google Calendar could not be disconnected. Please try again.',
    })
  }
}

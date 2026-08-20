import { requireAuthentication } from '../../_lib/auth.js'
import { hashState, randomState } from '../../_lib/crypto.js'
import { createOAuthState } from '../../_lib/db.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  redirect,
  requireMethod,
  setOAuthCookie,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import { buildGoogleAuthorizationUrl } from '../../_lib/providers/google-calendar.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    const state = randomState()
    await createOAuthState(env.databaseUrl, hashState(state), env.ownerId)
    setOAuthCookie(response, state, new URL(env.appUrl).protocol === 'https:')
    redirect(response, buildGoogleAuthorizationUrl({
      appUrl: env.appUrl,
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    }, state))
  } catch (error) {
    console.error('Unable to start Google Calendar authorization', error)
    response.statusCode = 302
    response.setHeader('Location', '/?integration=google-calendar&status=error')
    response.end()
  }
}

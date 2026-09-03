import { requireAdmin } from '../../_lib/auth.js'
import { decryptJson, encryptJson, hashState } from '../../_lib/crypto.js'
import {
  consumeOAuthState,
  getIntegrationAccount,
  upsertIntegrationAccount,
  type StoredCredentials,
} from '../../_lib/db.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  clearOAuthCookie,
  getCookie,
  redirect,
  requireMethod,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import {
  credentialsFromGoogleToken,
  exchangeGoogleCode,
  getGoogleUserInfo,
  GOOGLE_CALENDAR_PROVIDER_ID,
  GOOGLE_CALENDAR_SCOPES,
} from '../../_lib/providers/google-calendar.js'

function queryValue(request: ApiRequest, name: string) {
  const value = request.query?.[name]
  if (Array.isArray(value)) return value[0]
  if (value) return value

  const requestUrl = new URL(request.url ?? '/', 'http://localhost')
  return requestUrl.searchParams.get(name) ?? undefined
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!await requireAdmin(request, response)) return

  let appUrl = ''
  let secureCookie = false
  try {
    const env = integrationEnv()
    appUrl = env.appUrl
    secureCookie = new URL(env.appUrl).protocol === 'https:'
    const code = queryValue(request, 'code')
    const state = queryValue(request, 'state')
    const cookieState = getCookie(request, 'google_oauth_state')
    const oauthError = queryValue(request, 'error')

    if (oauthError) throw new Error(`Google authorization failed: ${oauthError}`)
    if (!code || !state || !cookieState || cookieState !== state) {
      throw new Error('Invalid Google OAuth callback state')
    }

    const memberId = await consumeOAuthState(
      env.databaseUrl,
      hashState(state),
      env.ownerId,
    )
    if (!memberId) throw new Error('Google OAuth state is invalid or expired')

    const token = await exchangeGoogleCode({
      appUrl: env.appUrl,
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    }, code)
    const user = await getGoogleUserInfo(token.access_token!)
    const existing = await getIntegrationAccount(
      env.databaseUrl,
      env.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
      user.sub,
    )
    const existingCredentials = existing
      ? decryptJson<StoredCredentials>(existing.encrypted_credentials, env.encryptionKey)
      : undefined
    const credentials = credentialsFromGoogleToken(
      token,
      existing?.status === 'connected' ? existingCredentials?.refreshToken : undefined,
    )

    await upsertIntegrationAccount(env.databaseUrl, {
      owner_id: env.ownerId,
      member_id: memberId,
      provider: GOOGLE_CALENDAR_PROVIDER_ID,
      status: 'connected',
      external_account_id: user.sub,
      display_name: user.name ?? null,
      account_email: user.email ?? null,
      scopes: token.scope?.split(' ') ?? GOOGLE_CALENDAR_SCOPES,
      encrypted_credentials: encryptJson(credentials, env.encryptionKey),
    })

    clearOAuthCookie(response, secureCookie)
    redirect(response, `${env.appUrl}/?integration=google-calendar&status=connected`)
  } catch (error) {
    console.error('Google Calendar OAuth callback failed', error)
    clearOAuthCookie(response, secureCookie)
    redirect(response, `${appUrl}/?integration=google-calendar&status=error`)
  }
}

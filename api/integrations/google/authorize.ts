import { requireAuthentication } from '../../_lib/auth.js'
import { hashState, randomState } from '../../_lib/crypto.js'
import {
  createOAuthState,
  getFamilyMember,
} from '../../_lib/db.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  redirect,
  requireMethod,
  setOAuthCookie,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import { buildGoogleAuthorizationUrl } from '../../_lib/providers/google-calendar.js'

function queryValue(request: ApiRequest, name: string) {
  const value = request.query?.[name]
  if (Array.isArray(value)) return value[0]
  if (value) return value
  return new URL(request.url ?? '/', 'http://localhost').searchParams.get(name) ?? undefined
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    const memberId = queryValue(request, 'memberId')
    if (!memberId) throw new Error('A family member must be selected')
    const member = await getFamilyMember(env.databaseUrl, env.ownerId, memberId)
    if (!member) throw new Error('Family member not found')

    const state = randomState()
    await createOAuthState(env.databaseUrl, hashState(state), env.ownerId, member.id)
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

import {
  authConfig,
  createGuestSession,
  publicGuestUser,
  publicSessionUser,
  setSessionCookie,
} from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import { findGuestByToken, guestIsUsable } from '../_lib/guests.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return

  try {
    const config = authConfig()
    if (!requireSameOrigin(request, response, config.appUrl)) return
    const body = await readJsonBody(request) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token || token.length > 200) {
      sendJson(response, 400, { error: 'Invite link is invalid' })
      return
    }

    const env = appEnv()
    const guest = await findGuestByToken(env.databaseUrl, token)
    if (!guest || guest.owner_id !== env.ownerId || !guestIsUsable(guest)) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      sendJson(response, 401, { error: 'This invite expired or was revoked' })
      return
    }

    setSessionCookie(response, createGuestSession(guest, config), config)
    sendJson(response, 200, { user: publicSessionUser(publicGuestUser(guest)) })
  } catch (error) {
    console.error('Guest sign-in failed', error)
    sendJson(response, 500, { error: 'Guest access is unavailable' })
  }
}

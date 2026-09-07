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
  queryValue,
  readJsonBody,
  redirect,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import {
  guestInviteExpiredLocation,
  guestInviteSuccessLocation,
  guestInviteToken,
} from '../_lib/app-routes.js'

function requestPathname(request: ApiRequest) {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname
  } catch {
    return '/'
  }
}

function guestTokenFromRequest(request: ApiRequest) {
  const fromQuery = queryValue(request, 'token')?.trim() ?? ''
  if (fromQuery) return fromQuery
  return guestInviteToken(requestPathname(request)) ?? ''
}

async function redeemGuestToken(token: string) {
  if (!token || token.length > 200) return null
  const env = appEnv()
  const guest = await findGuestByToken(env.databaseUrl, token)
  if (!guest || guest.owner_id !== env.ownerId || !guestIsUsable(guest)) return null
  return guest
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method === 'GET') {
    try {
      const config = authConfig()
      const guest = await redeemGuestToken(guestTokenFromRequest(request))
      if (!guest) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        redirect(response, guestInviteExpiredLocation())
        return
      }

      setSessionCookie(response, createGuestSession(guest, config), config)
      redirect(response, guestInviteSuccessLocation())
    } catch (error) {
      console.error('Guest sign-in failed', error)
      redirect(response, guestInviteExpiredLocation())
    }
    return
  }

  if (!requireMethod(request, response, ['POST'])) return

  try {
    const config = authConfig()
    if (!requireSameOrigin(request, response, config.appUrl)) return
    const body = await readJsonBody(request) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const guest = await redeemGuestToken(token)
    if (!guest) {
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

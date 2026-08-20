import { authConfig, clearSessionCookie } from '../_lib/auth.js'
import {
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
    clearSessionCookie(response, config)
    sendJson(response, 200, { authenticated: false })
  } catch (error) {
    console.error('Logout failed', error)
    sendJson(response, 500, { error: 'Authentication is unavailable' })
  }
}

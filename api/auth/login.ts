import {
  authConfig,
  createSession,
  setSessionCookie,
  validCredentials,
} from '../_lib/auth.js'
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
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!validCredentials(username, password, config)) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      sendJson(response, 401, { error: 'Invalid username or password' })
      return
    }

    setSessionCookie(response, createSession(config.username, config), config)
    sendJson(response, 200, { user: { role: 'admin', username: config.username } })
  } catch (error) {
    console.error('Login failed', error)
    sendJson(response, 500, { error: 'Authentication is unavailable' })
  }
}

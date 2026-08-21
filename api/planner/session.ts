import { requireAuthentication } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { resetPlannerSession } from '../_lib/planner-sessions.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['DELETE'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      sendJson(response, 400, { error: 'Planner session is invalid' })
      return
    }
    const body = rawBody as { sessionId?: unknown }
    if (typeof body.sessionId !== 'string' || !body.sessionId || body.sessionId.length > 100) {
      sendJson(response, 400, { error: 'Planner session is invalid' })
      return
    }
    await resetPlannerSession(
      env.databaseUrl,
      env.ownerId,
      body.sessionId,
    )
    response.statusCode = 204
    response.setHeader('Cache-Control', 'no-store')
    response.end()
  } catch (error) {
    console.error('Unable to reset planner session', error)
    sendJson(response, error instanceof SyntaxError ? 400 : 500, {
      error: error instanceof SyntaxError
        ? 'Planner session is invalid'
        : 'Planner session could not be reset',
    })
  }
}

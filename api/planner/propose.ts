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
import { proposeCalendarEvents } from '../_lib/planner.js'
import { getPlannerSettings } from '../_lib/planner-settings.js'

const MAX_MESSAGE_LENGTH = 12_000

class ValidationError extends Error {}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const body = await readJsonBody(request) as Record<string, unknown>
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Planner requests must be 1–${MAX_MESSAGE_LENGTH} characters`)
    }

    const settings = await getPlannerSettings(env.databaseUrl, env.ownerId)
    if (!settings.enabled) {
      sendJson(response, 409, {
        error: 'The AI planner is disabled. Enable it in Settings.',
      })
      return
    }

    const result = await proposeCalendarEvents({
      databaseUrl: env.databaseUrl,
      ownerId: env.ownerId,
      message,
      settings,
      now: new Date(),
    })
    sendJson(response, 200, result)
  } catch (error) {
    console.error('Unable to create AI calendar proposal', error)
    sendJson(response, error instanceof ValidationError ? 400 : 502, {
      error: error instanceof ValidationError
        ? error.message
        : 'The AI planner could not prepare this request. Check AI Gateway setup and try again.',
    })
  }
}

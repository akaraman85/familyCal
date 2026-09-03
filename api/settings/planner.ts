import { requireAdmin } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  getPlannerSettings,
  isPlannerModelProfile,
  isValidTimezone,
  savePlannerSettings,
} from '../_lib/planner-settings.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

class ValidationError extends Error {}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'PUT'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = appEnv()
    if (request.method === 'GET') {
      const settings = await getPlannerSettings(env.databaseUrl, env.ownerId)
      sendJson(response, 200, { settings })
      return
    }

    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Planner settings are invalid')
    }
    const body = rawBody as Record<string, unknown>
    const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : ''
    const defaultCalendar = typeof body.defaultCalendar === 'string'
      ? body.defaultCalendar.trim()
      : ''
    if (
      typeof body.enabled !== 'boolean'
      || !isPlannerModelProfile(body.modelProfile)
      || !timezone
      || !isValidTimezone(timezone)
      || !defaultCalendar
      || defaultCalendar.length > 100
    ) {
      throw new ValidationError('Planner settings are invalid')
    }

    const settings = await savePlannerSettings(env.databaseUrl, env.ownerId, {
      enabled: body.enabled,
      modelProfile: body.modelProfile,
      timezone,
      defaultCalendar,
    })
    sendJson(response, 200, { settings })
  } catch (error) {
    console.error('Unable to manage AI planner settings', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Planner settings are invalid')
        : 'AI planner settings are unavailable',
    })
  }
}

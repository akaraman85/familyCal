import { requireAdmin, requireAuthentication } from '../_lib/auth.js'
import {
  getCalendarSettings,
  isCalendarView,
  isWeekStart,
  saveCalendarSettings,
} from '../_lib/calendar-settings.js'
import { appEnv } from '../_lib/env.js'
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
  const user = await requireAuthentication(request, response)
  if (!user) return

  try {
    const env = appEnv()
    if (request.method === 'GET') {
      const settings = await getCalendarSettings(env.databaseUrl, env.ownerId)
      sendJson(response, 200, { settings })
      return
    }

    if (!await requireAdmin(request, response)) return
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Calendar preferences are invalid')
    }
    const body = rawBody as Record<string, unknown>
    if (
      !isCalendarView(body.defaultView)
      || !isWeekStart(body.weekStartsOn)
      || typeof body.showWeekends !== 'boolean'
      || typeof body.dailyAgendaEmail !== 'boolean'
    ) {
      throw new ValidationError('Calendar preferences are invalid')
    }

    const settings = await saveCalendarSettings(env.databaseUrl, env.ownerId, {
      defaultView: body.defaultView,
      weekStartsOn: body.weekStartsOn,
      showWeekends: body.showWeekends,
      dailyAgendaEmail: body.dailyAgendaEmail,
    })
    sendJson(response, 200, { settings })
  } catch (error) {
    console.error('Unable to manage calendar preferences', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Calendar preferences are invalid')
        : 'Calendar preferences are unavailable',
    })
  }
}

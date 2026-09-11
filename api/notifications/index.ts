import { requireAdmin } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  getNotificationSettings,
  isReminderMinutes,
  listPushDevices,
  saveNotificationSettings,
  vapidConfig,
  vapidConfigurationIssue,
} from '../_lib/push.js'
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
    const vapid = vapidConfig()
    const configurationIssue = vapidConfigurationIssue()
    if (request.method === 'GET') {
      const [settings, devices] = await Promise.all([
        getNotificationSettings(env.databaseUrl, env.ownerId),
        listPushDevices(env.databaseUrl, env.ownerId),
      ])
      sendJson(response, 200, {
        configured: Boolean(vapid),
        publicKey: vapid?.publicKey ?? null,
        configurationIssue: configurationIssue === 'missing' ? null : configurationIssue,
        settings,
        devices,
      })
      return
    }

    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Notification preferences are invalid')
    }
    const body = rawBody as Record<string, unknown>
    if (typeof body.eventReminders !== 'boolean' || !isReminderMinutes(body.reminderMinutes)) {
      throw new ValidationError('Notification preferences are invalid')
    }

    const settings = await saveNotificationSettings(env.databaseUrl, env.ownerId, {
      eventReminders: body.eventReminders,
      reminderMinutes: body.reminderMinutes,
    })
    sendJson(response, 200, { settings })
  } catch (error) {
    console.error('Unable to manage notification preferences', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Notification preferences are invalid')
        : 'Notification preferences are unavailable',
    })
  }
}

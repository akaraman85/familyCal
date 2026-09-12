import { requireAdmin } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  deleteEventReminderPreference,
  saveEventReminderPreference,
} from '../_lib/event-reminder-prefs.js'
import {
  getNotificationSettings,
} from '../_lib/push.js'
import {
  isEventReminderId,
  isNotifyMinutes,
  isReminderFrequency,
} from '../_lib/reminder-options.js'
import {
  errorMessage,
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

class ValidationError extends Error {}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['PUT', 'DELETE'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Event reminder is invalid')
    }
    const body = rawBody as Record<string, unknown>
    if (!isEventReminderId(body.eventId)) {
      throw new ValidationError('Event reminder is invalid')
    }

    if (request.method === 'DELETE') {
      await deleteEventReminderPreference(env.databaseUrl, env.ownerId, body.eventId)
      const settings = await getNotificationSettings(env.databaseUrl, env.ownerId)
      sendJson(response, 200, {
        reminder: {
          enabled: settings.eventReminders,
          notifyMinutes: settings.reminderMinutes,
          frequency: settings.reminderFrequency,
          custom: false,
        },
      })
      return
    }

    if (
      typeof body.enabled !== 'boolean'
      || !isNotifyMinutes(body.notifyMinutes)
      || !isReminderFrequency(body.frequency)
    ) {
      throw new ValidationError('Event reminder is invalid')
    }

    const reminder = await saveEventReminderPreference(env.databaseUrl, env.ownerId, {
      eventId: body.eventId,
      enabled: body.enabled,
      notifyMinutes: body.notifyMinutes,
      frequency: body.frequency,
    })
    sendJson(response, 200, { reminder })
  } catch (error) {
    console.error('Unable to save event reminder', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Event reminder is invalid')
        : 'Event reminder could not be saved',
    })
  }
}

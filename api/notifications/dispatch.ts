import { searchCalendarEvents } from '../_lib/event-search.js'
import { appEnv, integrationEnv } from '../_lib/env.js'
import { getPlannerSettings } from '../_lib/planner-settings.js'
import {
  cleanupNotificationDeliveries,
  claimNotificationDelivery,
  countPushSubscriptions,
  cronSecret,
  getNotificationSettings,
  releaseNotificationDelivery,
  REMINDER_LOOKBACK_MS,
  sendPushPayload,
  vapidConfig,
} from '../_lib/push.js'
import { dueReminders, reminderPayload } from '../_lib/reminders.js'
import {
  requireMethod,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

const MAX_REMINDERS_PER_RUN = 10

function encryptionKey() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY?.trim()
  if (!value) throw new Error('Missing required environment variable: INTEGRATION_ENCRYPTION_KEY')
  return value
}

function authorizedCron(request: ApiRequest) {
  const secret = cronSecret()
  if (!secret) return false
  return request.headers.authorization === `Bearer ${secret}`
}

function googleConfig() {
  try {
    const env = integrationEnv()
    return {
      encryptionKey: env.encryptionKey,
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      source: 'all' as const,
    }
  } catch {
    return {
      encryptionKey: encryptionKey(),
      clientId: '',
      clientSecret: '',
      source: 'saved' as const,
    }
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!authorizedCron(request)) {
    sendJson(response, 401, { error: 'Authentication required' })
    return
  }

  try {
    if (!vapidConfig()) {
      sendJson(response, 200, { sent: 0, skipped: 'not-configured' })
      return
    }

    const env = appEnv()
    const key = encryptionKey()
    const [settings, devices, planner] = await Promise.all([
      getNotificationSettings(env.databaseUrl, env.ownerId),
      countPushSubscriptions(env.databaseUrl, env.ownerId),
      getPlannerSettings(env.databaseUrl, env.ownerId),
    ])

    if (!settings.eventReminders || devices === 0) {
      sendJson(response, 200, { sent: 0, skipped: 'disabled' })
      return
    }

    await cleanupNotificationDeliveries(env.databaseUrl)

    const now = new Date()
    const google = googleConfig()
    const search = await searchCalendarEvents({
      databaseUrl: env.databaseUrl,
      ownerId: env.ownerId,
      encryptionKey: google.encryptionKey || key,
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      timeMin: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      timeMax: new Date(now.getTime() + 36 * 60 * 60 * 1000),
      source: google.source,
      revalidate: false,
      limit: Number.POSITIVE_INFINITY,
    })

    const due = dueReminders(search.events, now, {
      timezone: planner.timezone,
      reminderMinutes: settings.reminderMinutes,
      lookbackMs: REMINDER_LOOKBACK_MS,
    }).slice(0, MAX_REMINDERS_PER_RUN)

    let sent = 0
    for (const reminder of due) {
      const claimed = await claimNotificationDelivery(
        env.databaseUrl,
        env.ownerId,
        reminder.event.id,
        'reminder',
        reminder.eventStartAt,
      )
      if (!claimed) continue
      try {
        const result = await sendPushPayload(
          env.databaseUrl,
          env.ownerId,
          key,
          reminderPayload(reminder.event, planner.timezone),
        )
        if (result.sent === 0) {
          await releaseNotificationDelivery(
            env.databaseUrl,
            env.ownerId,
            reminder.event.id,
            'reminder',
            reminder.eventStartAt,
          )
          continue
        }
        sent += result.sent
      } catch (error) {
        await releaseNotificationDelivery(
          env.databaseUrl,
          env.ownerId,
          reminder.event.id,
          'reminder',
          reminder.eventStartAt,
        )
        throw error
      }
    }

    sendJson(response, 200, { sent, due: due.length })
  } catch (error) {
    console.error('Unable to dispatch event reminders', error)
    sendJson(response, 500, { error: 'Event reminders could not be sent' })
  }
}

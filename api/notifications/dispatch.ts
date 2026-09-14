import { isAuthorizedCronRequest } from '../_lib/cron-auth.js'
import { searchCalendarEvents } from '../_lib/event-search.js'
import { appEnv, integrationEnv } from '../_lib/env.js'
import { listEventReminderPreferences } from '../_lib/event-reminder-prefs.js'
import { reminderForDispatch } from '../_lib/reminder-options.js'
import { getPlannerSettings } from '../_lib/planner-settings.js'
import {
  cleanupNotificationDeliveries,
  claimNotificationDelivery,
  countPushSubscriptions,
  getNotificationSettings,
  releaseNotificationDelivery,
  REMINDER_LOOKBACK_MS,
  REMINDER_SEARCH_MS,
  sendPushPayload,
  vapidConfig,
} from '../_lib/push.js'
import { dueReminders, reminderPayload } from '../_lib/reminders.js'
import {
  requestHeader,
  requireMethod,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

const MAX_REMINDERS_PER_RUN = 25

function encryptionKey() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY?.trim()
  if (!value) throw new Error('Missing required environment variable: INTEGRATION_ENCRYPTION_KEY')
  return value
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
  if (!isAuthorizedCronRequest(request)) {
    console.warn('Rejected notification dispatch', {
      hasAuthorization: Boolean(requestHeader(request, 'authorization')),
      hasCronSchedule: Boolean(requestHeader(request, 'x-vercel-cron-schedule')),
      userAgent: requestHeader(request, 'user-agent') ?? null,
    })
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
    const [settings, devices, planner, overrides] = await Promise.all([
      getNotificationSettings(env.databaseUrl, env.ownerId),
      countPushSubscriptions(env.databaseUrl, env.ownerId),
      getPlannerSettings(env.databaseUrl, env.ownerId),
      listEventReminderPreferences(env.databaseUrl, env.ownerId),
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
      timeMin: new Date(now.getTime() - REMINDER_SEARCH_MS),
      timeMax: new Date(now.getTime() + REMINDER_SEARCH_MS),
      source: google.source,
      revalidate: false,
      limit: Number.POSITIVE_INFINITY,
    })

    const due = dueReminders(search.events, now, {
      timezone: planner.timezone,
      lookbackMs: REMINDER_LOOKBACK_MS,
      scheduleFor: (event) => reminderForDispatch(event.id, settings, overrides),
    }).slice(0, MAX_REMINDERS_PER_RUN)

    let sent = 0
    for (const reminder of due) {
      const claimed = await claimNotificationDelivery(
        env.databaseUrl,
        env.ownerId,
        reminder.event.id,
        'reminder',
        reminder.eventStartAt,
        reminder.fireKey,
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
            reminder.fireKey,
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
          reminder.fireKey,
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

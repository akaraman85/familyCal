import { isAppleTouchDevice, isStandaloneApp } from './install-app'
import {
  DEFAULT_NOTIFY_MINUTES,
  DEFAULT_REMINDER_FREQUENCY,
  isNotifyMinutes,
  isReminderFrequency,
  NOTIFY_MINUTES,
  notifyMinutesLabel,
  reminderFrequencyHint,
  reminderFrequencyLabel,
  REMINDER_FREQUENCIES,
  type NotifyMinutes,
  type ReminderFrequency,
} from '../api/_lib/reminder-options.ts'
import type { EventReminder } from './events'

export const REMINDER_MINUTES = NOTIFY_MINUTES
export type ReminderMinutes = NotifyMinutes
export {
  NOTIFY_MINUTES,
  notifyMinutesLabel,
  reminderFrequencyHint,
  reminderFrequencyLabel,
  REMINDER_FREQUENCIES,
  isNotifyMinutes,
  isReminderFrequency,
}
export type { NotifyMinutes, ReminderFrequency }

export type NotificationSettings = {
  eventReminders: boolean
  reminderMinutes: NotifyMinutes
  reminderFrequency: ReminderFrequency
}

export type PushDevice = {
  id: string
  userAgent: string | null
  createdAt: string
}

export type NotificationStatus = {
  configured: boolean
  publicKey: string | null
  settings: NotificationSettings
  devices: PushDevice[]
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  eventReminders: true,
  reminderMinutes: DEFAULT_NOTIFY_MINUTES,
  reminderFrequency: DEFAULT_REMINDER_FREQUENCY,
}

export const SETTINGS_TAB_KEY = 'karaman-settings-tab'
export const NOTIFICATION_HINT_KEY = 'karaman-notification-hint-dismissed'

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as {
    error?: string
  } & T
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

export function iosNeedsHomeScreen() {
  return isAppleTouchDevice() && !isStandaloneApp()
}

export function canRequestPushPermission() {
  return pushSupported() && !iosNeedsHomeScreen()
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }
  return output
}

export async function loadNotificationStatus() {
  const response = await fetch('/api/notifications', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<NotificationStatus>(response)
}

export async function updateNotificationSettings(settings: NotificationSettings) {
  const response = await fetch('/api/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(settings),
  })
  return responseJson<{ settings: NotificationSettings }>(response)
}

async function registration() {
  return navigator.serviceWorker.ready
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null
  const serviceWorker = await registration()
  return serviceWorker.pushManager.getSubscription()
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
  await responseJson<{ ok: true }>(response)
}

export async function enablePushNotifications(publicKey: string) {
  if (!canRequestPushPermission()) {
    throw new Error('Open Karaman from the Home Screen to allow notifications')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for Karaman on this device'
        : 'Notification permission is required',
    )
  }
  const serviceWorker = await registration()
  const existing = await serviceWorker.pushManager.getSubscription()
  if (existing) await existing.unsubscribe()
  const subscription = await serviceWorker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await saveSubscription(subscription)
  return subscription
}

export async function disablePushNotifications() {
  const subscription = await currentPushSubscription()
  if (!subscription) return
  await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  }).then(async (response) => {
    if (response.status !== 204 && !response.ok) {
      await responseJson(response)
    }
  })
  await subscription.unsubscribe()
}

export async function sendTestNotification() {
  const subscription = await currentPushSubscription()
  if (!subscription) throw new Error('Enable notifications on this device first')
  const response = await fetch('/api/notifications/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
  await responseJson<{ ok: true }>(response)
}

export async function syncPushSubscription() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const subscription = await currentPushSubscription()
    if (!subscription) return
    await saveSubscription(subscription)
  } catch {
    // Keep calendar use working if this device cannot refresh its subscription.
  }
}

export async function updateEventReminder(
  eventId: string,
  reminder: Pick<EventReminder, 'enabled' | 'notifyMinutes' | 'frequency'>,
) {
  const response = await fetch('/api/notifications/event', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ eventId, ...reminder }),
  })
  return responseJson<{ reminder: EventReminder }>(response)
}

export async function resetEventReminder(eventId: string) {
  const response = await fetch('/api/notifications/event', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ eventId }),
  })
  return responseJson<{ reminder: EventReminder }>(response)
}

export function remindersMatchDefault(
  reminder: Pick<EventReminder, 'enabled' | 'notifyMinutes' | 'frequency'>,
  settings: NotificationSettings,
) {
  return reminder.enabled === settings.eventReminders
    && reminder.notifyMinutes === settings.reminderMinutes
    && reminder.frequency === settings.reminderFrequency
}

export function openNotificationSettings() {
  try {
    sessionStorage.setItem(SETTINGS_TAB_KEY, 'notifications')
  } catch {
    // Ignore private-mode storage failures.
  }
}

export function consumeSettingsTab(): 'general' | 'planner' | 'notifications' {
  try {
    const tab = sessionStorage.getItem(SETTINGS_TAB_KEY)
    sessionStorage.removeItem(SETTINGS_TAB_KEY)
    if (tab === 'planner' || tab === 'notifications') return tab
  } catch {
    // Ignore private-mode storage failures.
  }
  return 'general'
}

export function deviceLabel(userAgent: string | null) {
  const value = userAgent ?? ''
  if (/iPad/i.test(value) || (/Macintosh/i.test(value) && /Mobile/i.test(value))) return 'iPad'
  if (/iPhone/i.test(value)) return 'iPhone'
  if (/Android/i.test(value)) return 'Android'
  if (/Mac OS X/i.test(value)) return 'Mac'
  if (/Windows/i.test(value)) return 'Windows'
  if (/Linux/i.test(value)) return 'Linux'
  return 'This device'
}

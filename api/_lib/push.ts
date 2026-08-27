import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { neon } from '@neondatabase/serverless'
import { decryptJson, encryptJson } from './crypto.js'
import { appEnv } from './env.js'

const require = createRequire(import.meta.url)
const webpush = require('web-push') as typeof import('web-push')

export const REMINDER_MINUTES = [15, 30, 60] as const
export const ALL_DAY_REMINDER_HOUR = 8
export const REMINDER_LOOKBACK_MS = 2 * 60 * 60 * 1000

export type ReminderMinutes = (typeof REMINDER_MINUTES)[number]

export type NotificationSettings = {
  eventReminders: boolean
  reminderMinutes: ReminderMinutes
}

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export type StoredPushDevice = {
  id: string
  userAgent: string | null
  createdAt: string
}

export type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

type NotificationSettingsRow = {
  event_reminders: boolean
  reminder_minutes: number
}

type PushSubscriptionRow = {
  id: string
  endpoint_hash: string
  encrypted_subscription: string
  user_agent: string | null
  created_at: string
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  eventReminders: true,
  reminderMinutes: 30,
}

export function isReminderMinutes(value: unknown): value is ReminderMinutes {
  return typeof value === 'number' && (REMINDER_MINUTES as readonly number[]).includes(value)
}

export function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  const explicitSubject = process.env.VAPID_SUBJECT?.trim()
  const appUrl = appEnv().appUrl
  return {
    publicKey,
    privateKey,
    subject: explicitSubject
      || (appUrl.startsWith('https:') ? appUrl : 'mailto:karaman@localhost'),
  }
}

export function cronSecret() {
  return process.env.CRON_SECRET?.trim() || null
}

export function endpointHash(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex')
}

function serializeSettings(row: NotificationSettingsRow | undefined): NotificationSettings {
  if (!row || !isReminderMinutes(row.reminder_minutes)) {
    return DEFAULT_NOTIFICATION_SETTINGS
  }
  return {
    eventReminders: row.event_reminders,
    reminderMinutes: row.reminder_minutes,
  }
}

export function isPushSubscriptionJSON(value: unknown): value is PushSubscriptionJSON {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Record<string, unknown>
  const keys = body.keys
  return typeof body.endpoint === 'string'
    && body.endpoint.startsWith('https://')
    && body.endpoint.length <= 2048
    && Boolean(keys)
    && typeof keys === 'object'
    && !Array.isArray(keys)
    && typeof (keys as Record<string, unknown>).p256dh === 'string'
    && typeof (keys as Record<string, unknown>).auth === 'string'
    && String((keys as Record<string, unknown>).p256dh).length <= 256
    && String((keys as Record<string, unknown>).auth).length <= 256
}

export async function getNotificationSettings(databaseUrl: string, ownerId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT event_reminders, reminder_minutes
       FROM notification_settings
      WHERE owner_id = $1
      LIMIT 1`,
    [ownerId],
  ) as NotificationSettingsRow[]
  return serializeSettings(rows[0])
}

export async function saveNotificationSettings(
  databaseUrl: string,
  ownerId: string,
  settings: NotificationSettings,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO notification_settings (
       owner_id, event_reminders, reminder_minutes
     ) VALUES ($1, $2, $3)
     ON CONFLICT (owner_id) DO UPDATE SET
       event_reminders = EXCLUDED.event_reminders,
       reminder_minutes = EXCLUDED.reminder_minutes,
       updated_at = NOW()
     RETURNING event_reminders, reminder_minutes`,
    [ownerId, settings.eventReminders, settings.reminderMinutes],
  ) as NotificationSettingsRow[]
  return serializeSettings(rows[0])
}

export async function upsertPushSubscription(
  databaseUrl: string,
  ownerId: string,
  encryptionKey: string,
  subscription: PushSubscriptionJSON,
  userAgent: string | null,
) {
  const sql = neon(databaseUrl)
  const hash = endpointHash(subscription.endpoint)
  const encrypted = encryptJson(subscription, encryptionKey)
  const rows = await sql.query(
    `INSERT INTO push_subscriptions (
       id, owner_id, endpoint_hash, encrypted_subscription, user_agent
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id, endpoint_hash) DO UPDATE SET
       encrypted_subscription = EXCLUDED.encrypted_subscription,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW()
     RETURNING id, endpoint_hash, encrypted_subscription, user_agent, created_at`,
    [
      randomUUID(),
      ownerId,
      hash,
      encrypted,
      userAgent,
    ],
  ) as PushSubscriptionRow[]
  return rows[0]
}

export async function deletePushSubscription(
  databaseUrl: string,
  ownerId: string,
  endpoint: string,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `DELETE FROM push_subscriptions
      WHERE owner_id = $1 AND endpoint_hash = $2
    RETURNING id`,
    [ownerId, endpointHash(endpoint)],
  )
  return rows.length === 1
}

export async function listPushDevices(databaseUrl: string, ownerId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT id, user_agent, created_at
       FROM push_subscriptions
      WHERE owner_id = $1
      ORDER BY created_at`,
    [ownerId],
  ) as Array<{ id: string; user_agent: string | null; created_at: string }>
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  } satisfies StoredPushDevice))
}

export async function countPushSubscriptions(databaseUrl: string, ownerId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT COUNT(*)::int AS count
       FROM push_subscriptions
      WHERE owner_id = $1`,
    [ownerId],
  ) as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

async function loadSubscriptions(
  databaseUrl: string,
  ownerId: string,
  encryptionKey: string,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT id, endpoint_hash, encrypted_subscription, user_agent, created_at
       FROM push_subscriptions
      WHERE owner_id = $1`,
    [ownerId],
  ) as PushSubscriptionRow[]
  return rows.map((row) => ({
    ...row,
    subscription: decryptJson<PushSubscriptionJSON>(row.encrypted_subscription, encryptionKey),
  }))
}

function isGoneStatus(statusCode: number | undefined) {
  return statusCode === 404 || statusCode === 410
}

export async function sendPushPayload(
  databaseUrl: string,
  ownerId: string,
  encryptionKey: string,
  payload: PushPayload,
  options?: { endpoint?: string; ttl?: number },
) {
  const vapid = vapidConfig()
  if (!vapid) throw new Error('Web push is not configured')

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const subscriptions = await loadSubscriptions(databaseUrl, ownerId, encryptionKey)
  const targets = options?.endpoint
    ? subscriptions.filter((row) => row.subscription.endpoint === options.endpoint)
    : subscriptions
  const body = JSON.stringify(payload)
  let sent = 0

  for (const target of targets) {
    try {
      await webpush.sendNotification(target.subscription, body, {
        TTL: options?.ttl ?? 3600,
        urgency: 'normal',
      })
      sent += 1
    } catch (error) {
      const statusCode = (
        error && typeof error === 'object' && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : undefined
      )
      if (isGoneStatus(statusCode)) {
        await deletePushSubscription(databaseUrl, ownerId, target.subscription.endpoint)
        continue
      }
      console.error('Unable to send web push notification', error)
    }
  }

  return { attempted: targets.length, sent }
}

export async function claimNotificationDelivery(
  databaseUrl: string,
  ownerId: string,
  eventId: string,
  kind: string,
  eventStartAt: string,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO notification_deliveries (
       owner_id, event_id, kind, event_start_at
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING event_id`,
    [ownerId, eventId, kind, eventStartAt],
  )
  return rows.length === 1
}

export async function releaseNotificationDelivery(
  databaseUrl: string,
  ownerId: string,
  eventId: string,
  kind: string,
  eventStartAt: string,
) {
  const sql = neon(databaseUrl)
  await sql.query(
    `DELETE FROM notification_deliveries
      WHERE owner_id = $1
        AND event_id = $2
        AND kind = $3
        AND event_start_at = $4`,
    [ownerId, eventId, kind, eventStartAt],
  )
}

export async function cleanupNotificationDeliveries(databaseUrl: string) {
  const sql = neon(databaseUrl)
  await sql.query(
    `DELETE FROM notification_deliveries
      WHERE sent_at < NOW() - INTERVAL '14 days'`,
  )
}

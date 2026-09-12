export const NOTIFY_MINUTES = [0, 5, 15, 30, 60, 120, 1440, 2880] as const
export type NotifyMinutes = (typeof NOTIFY_MINUTES)[number]

export const REMINDER_FREQUENCIES = [
  'once',
  'every_15m',
  'every_30m',
  'hourly',
  'daily',
] as const
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number]

export const FREQUENCY_INTERVAL_MINUTES: Record<ReminderFrequency, number | null> = {
  once: null,
  every_15m: 15,
  every_30m: 30,
  hourly: 60,
  daily: 1440,
}

export const DEFAULT_NOTIFY_MINUTES: NotifyMinutes = 30
export const DEFAULT_REMINDER_FREQUENCY: ReminderFrequency = 'once'
export const ALL_DAY_REMINDER_HOUR = 8
export const MAX_EVENT_REMINDER_ID_LENGTH = 400

export function isNotifyMinutes(value: unknown): value is NotifyMinutes {
  return typeof value === 'number' && (NOTIFY_MINUTES as readonly number[]).includes(value)
}

export function isReminderFrequency(value: unknown): value is ReminderFrequency {
  return typeof value === 'string'
    && (REMINDER_FREQUENCIES as readonly string[]).includes(value)
}

export function isEventReminderId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 7
    && value.length <= MAX_EVENT_REMINDER_ID_LENGTH
    && (value.startsWith('saved:') || value.startsWith('google:'))
}

export function notifyMinutesLabel(minutes: NotifyMinutes, allDay = false) {
  if (minutes === 0) return allDay ? 'Morning of (8:00 AM)' : 'At the start'
  if (minutes === 5) return '5 minutes before'
  if (minutes === 15) return '15 minutes before'
  if (minutes === 30) return '30 minutes before'
  if (minutes === 60) return '1 hour before'
  if (minutes === 120) return '2 hours before'
  if (minutes === 1440) return '1 day before'
  return '2 days before'
}

export function reminderFrequencyLabel(frequency: ReminderFrequency) {
  if (frequency === 'once') return 'Once'
  if (frequency === 'every_15m') return 'Every 15 minutes'
  if (frequency === 'every_30m') return 'Every 30 minutes'
  if (frequency === 'hourly') return 'Hourly'
  return 'Daily'
}

export function reminderFrequencyHint(allDay = false) {
  return allDay
    ? 'Repeating reminders continue through the last morning of the event.'
    : 'Repeating reminders continue until the event starts.'
}

export type ReminderDefaults = {
  eventReminders: boolean
  reminderMinutes: NotifyMinutes
  reminderFrequency: ReminderFrequency
}

export type EventReminderPreference = {
  eventId: string
  enabled: boolean
  notifyMinutes: NotifyMinutes
  frequency: ReminderFrequency
}

export type ResolvedEventReminder = {
  enabled: boolean
  notifyMinutes: NotifyMinutes
  frequency: ReminderFrequency
  custom: boolean
}

export const FALLBACK_EVENT_REMINDER: ResolvedEventReminder = {
  enabled: true,
  notifyMinutes: DEFAULT_NOTIFY_MINUTES,
  frequency: DEFAULT_REMINDER_FREQUENCY,
  custom: false,
}

export function defaultEventReminder(settings: ReminderDefaults): ResolvedEventReminder {
  return {
    enabled: settings.eventReminders,
    notifyMinutes: settings.reminderMinutes,
    frequency: settings.reminderFrequency,
    custom: false,
  }
}

export function resolveEventReminder(
  eventId: string,
  settings: ReminderDefaults,
  overrides: Map<string, EventReminderPreference>,
): ResolvedEventReminder {
  const override = overrides.get(eventId)
  if (!override) return defaultEventReminder(settings)
  return {
    enabled: override.enabled,
    notifyMinutes: override.notifyMinutes,
    frequency: override.frequency,
    custom: true,
  }
}

export function reminderForDispatch(
  eventId: string,
  settings: ReminderDefaults,
  overrides: Map<string, EventReminderPreference>,
): EventReminderPreference | null {
  if (!settings.eventReminders) return null
  const override = overrides.get(eventId)
  if (!override) {
    return {
      eventId,
      enabled: true,
      notifyMinutes: settings.reminderMinutes,
      frequency: settings.reminderFrequency,
    }
  }
  if (!override.enabled) return null
  return override
}

export function attachEventReminders<T extends { id: string }>(
  events: T[],
  settings: ReminderDefaults,
  overrides: Map<string, EventReminderPreference>,
) {
  return events.map((event) => ({
    ...event,
    reminder: resolveEventReminder(event.id, settings, overrides),
  }))
}

import { useEffect, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import type { EventReminder } from './events'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationStatus,
  NOTIFY_MINUTES,
  notifyMinutesLabel,
  reminderFrequencyHint,
  reminderFrequencyLabel,
  REMINDER_FREQUENCIES,
  resetEventReminder,
  updateEventReminder,
  type NotificationSettings,
  type NotifyMinutes,
  type ReminderFrequency,
} from './notifications'

export type EventReminderFormValue = {
  enabled: boolean
  notifyMinutes: NotifyMinutes
  frequency: ReminderFrequency
}

export function defaultReminderForm(settings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS): EventReminderFormValue {
  return {
    enabled: settings.eventReminders,
    notifyMinutes: settings.reminderMinutes,
    frequency: settings.reminderFrequency,
  }
}

export function EventReminderFields({
  value,
  onChange,
  disabled,
  allDay,
}: {
  value: EventReminderFormValue
  onChange: (next: EventReminderFormValue) => void
  disabled?: boolean
  allDay?: boolean
}) {
  return (
    <div className="event-reminder-fields">
      <label className="event-edit-toggle">
        <span>Notify me</span>
        <button
          type="button"
          role="switch"
          aria-checked={value.enabled}
          className={`toggle ${value.enabled ? 'on' : ''}`}
          disabled={disabled}
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
        >
          <i />
        </button>
      </label>
      <div className="field-row">
        <label className="field">
          <span>When</span>
          <select
            value={value.notifyMinutes}
            disabled={disabled || !value.enabled}
            onChange={(change) => onChange({
              ...value,
              notifyMinutes: Number(change.target.value) as NotifyMinutes,
            })}
          >
            {NOTIFY_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>{notifyMinutesLabel(minutes, allDay)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Frequency</span>
          <select
            value={value.frequency}
            disabled={disabled || !value.enabled}
            onChange={(change) => onChange({
              ...value,
              frequency: change.target.value as ReminderFrequency,
            })}
          >
            {REMINDER_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>{reminderFrequencyLabel(frequency)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="event-reminder-hint">{reminderFrequencyHint(allDay)}</p>
    </div>
  )
}

export function EventReminderEditor({
  eventId,
  reminder,
  allDay,
  onSaved,
}: {
  eventId: string
  reminder?: EventReminder
  allDay: boolean
  onSaved: (reminder: EventReminder) => void
}) {
  const [familyDefault, setFamilyDefault] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS)
  const [value, setValue] = useState<EventReminderFormValue>(() => reminder ?? defaultReminderForm())
  const [custom, setCustom] = useState(Boolean(reminder?.custom))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(reminder ?? defaultReminderForm(familyDefault))
    setCustom(Boolean(reminder?.custom))
  }, [eventId, reminder, familyDefault])

  useEffect(() => {
    setSaved(false)
    setError(null)
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    loadNotificationStatus()
      .then((status) => {
        if (!cancelled) setFamilyDefault(status.settings)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const persist = async (next: EventReminderFormValue, previous: EventReminderFormValue) => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateEventReminder(eventId, next)
      setValue({
        enabled: result.reminder.enabled,
        notifyMinutes: result.reminder.notifyMinutes,
        frequency: result.reminder.frequency,
      })
      setCustom(true)
      setSaved(true)
      onSaved(result.reminder)
    } catch (caught) {
      setValue(previous)
      setError(caught instanceof Error ? caught.message : 'Unable to save reminder')
    } finally {
      setSaving(false)
    }
  }

  const useFamilyDefault = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await resetEventReminder(eventId)
      setValue({
        enabled: result.reminder.enabled,
        notifyMinutes: result.reminder.notifyMinutes,
        frequency: result.reminder.frequency,
      })
      setCustom(false)
      setSaved(true)
      onSaved(result.reminder)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to restore family default')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="event-reminder-editor" aria-label="Event notifications">
      <div className="event-reminder-heading">
        <Bell size={16} aria-hidden="true" />
        <div>
          <b>Notifications</b>
          <span>{custom ? 'Custom for this event' : 'Using family default'}</span>
        </div>
      </div>
      <EventReminderFields
        value={value}
        allDay={allDay}
        disabled={saving}
        onChange={(next) => {
          const previous = value
          setValue(next)
          setSaved(false)
          void persist(next, previous)
        }}
      />
      <div className="event-reminder-actions">
        {custom && (
          <button type="button" className="event-reminder-reset" disabled={saving} onClick={() => void useFamilyDefault()}>
            Use family default
          </button>
        )}
        {saved && (
          <span>
            <Check size={14} />
            Saved
          </span>
        )}
      </div>
      {error && <div className="modal-error" role="alert">{error}</div>}
    </section>
  )
}

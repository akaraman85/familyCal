import { useEffect, useState } from 'react'
import { Bell, Check, LoaderCircle, Share, X } from 'lucide-react'
import { IosInstallGuide, isStandaloneApp } from './install-app'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_HINT_KEY,
  canRequestPushPermission,
  currentPushSubscription,
  deviceLabel,
  disablePushNotifications,
  enablePushNotifications,
  iosNeedsHomeScreen,
  loadNotificationStatus,
  openNotificationSettings,
  pushSupported,
  sendTestNotification,
  updateNotificationSettings,
  type NotificationSettings,
  type NotificationStatus,
  type ReminderMinutes,
} from './notifications'

export function NotificationOptInHint({ onOpen }: { onOpen: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isStandaloneApp() || !pushSupported()) return
    if (window.localStorage.getItem(NOTIFICATION_HINT_KEY) === '1') return
    if (Notification.permission === 'granted') return
    setVisible(true)
  }, [])

  if (!visible) return null

  return (
    <div className="ios-install-hint" role="status">
      <Bell size={18} aria-hidden="true" />
      <p>
        <strong>Turn on event reminders.</strong>
        {' '}Allow notifications in Settings so this device can alert you before family events.
      </p>
      <button
        type="button"
        className="ios-install-hint-action"
        onClick={() => {
          openNotificationSettings()
          onOpen()
        }}
      >
        Settings
      </button>
      <button
        type="button"
        className="ios-install-hint-dismiss"
        aria-label="Dismiss notification hint"
        onClick={() => {
          window.localStorage.setItem(NOTIFICATION_HINT_KEY, '1')
          setVisible(false)
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

export function NotificationsSettings() {
  const [status, setStatus] = useState<NotificationStatus | null>(null)
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>(
    pushSupported() ? Notification.permission : 'denied',
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState(false)
  const homeScreenRequired = iosNeedsHomeScreen()
  const canEnable = canRequestPushPermission() && Boolean(status?.configured && status.publicKey)

  const refresh = async () => {
    const next = await loadNotificationStatus()
    setStatus(next)
    setSettings(next.settings)
    setPermission(pushSupported() ? Notification.permission : 'denied')
    setSubscribed(Boolean(await currentPushSubscription()))
  }

  useEffect(() => {
    refresh()
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Unable to load notification settings')
      })
      .finally(() => setLoading(false))
  }, [])

  const saveSettings = async (next: NotificationSettings) => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateNotificationSettings(next)
      setSettings(result.settings)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save notification preferences')
    } finally {
      setSaving(false)
    }
  }

  const enable = async () => {
    if (!status?.publicKey) return
    setEnabling(true)
    setError(null)
    setTested(false)
    try {
      await enablePushNotifications(status.publicKey)
      window.localStorage.setItem(NOTIFICATION_HINT_KEY, '1')
      await refresh()
    } catch (caught) {
      setPermission(pushSupported() ? Notification.permission : 'denied')
      setError(caught instanceof Error ? caught.message : 'Unable to enable notifications')
    } finally {
      setEnabling(false)
    }
  }

  const disable = async () => {
    setEnabling(true)
    setError(null)
    try {
      await disablePushNotifications()
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to disable notifications')
    } finally {
      setEnabling(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setTested(false)
    setError(null)
    try {
      await sendTestNotification()
      setTested(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send a test notification')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="settings-content">
      <div className="settings-section">
        <h2>This device</h2>
        <p>
          iPhone and iPad must allow notifications from the Home Screen app.
          Android and desktop browsers can allow them here as well.
        </p>
        {loading && (
          <div className="integration-loading">
            <LoaderCircle size={16} />
            Loading notification status
          </div>
        )}
        {!loading && homeScreenRequired && (
          <div className="gateway-status">
            <Share size={17} />
            <span>
              <b>Open Karaman from the Home Screen</b>
              <small>
                Safari tabs cannot receive push notifications. Add the app, then tap
                Enable notifications in this screen.
              </small>
            </span>
          </div>
        )}
        {!loading && !pushSupported() && (
          <div className="gateway-status">
            <Bell size={17} />
            <span>
              <b>This browser cannot receive web push</b>
              <small>Use Safari on iPhone/iPad after installing, or Chrome/Edge/Firefox on other devices.</small>
            </span>
          </div>
        )}
        {!loading && status && !status.configured && (
          <div className="gateway-status">
            <Bell size={17} />
            <span>
              <b>Server delivery is not configured</b>
              <small>Set VAPID keys on the deployment, then return here to allow this device.</small>
            </span>
          </div>
        )}
        {!loading && permission === 'denied' && !homeScreenRequired && (
          <div className="gateway-status">
            <Bell size={17} />
            <span>
              <b>Notifications are blocked</b>
              <small>
                On iPhone, open Settings → Karaman → Notifications. On other devices, allow
                notifications for this site in the browser settings.
              </small>
            </span>
          </div>
        )}
        <label>
          <span>
            <b>Event reminders on this device</b>
            <small>
              {subscribed
                ? 'This device will receive reminders for upcoming family and Google events.'
                : 'Allow notifications so reminders can appear even when Karaman is closed.'}
            </small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={subscribed}
            className={`toggle ${subscribed ? 'on' : ''}`}
            disabled={(!canEnable && !subscribed) || enabling}
            onClick={() => void (subscribed ? disable() : enable())}
          >
            <i />
          </button>
        </label>
        <div className="settings-actions">
          <button
            type="button"
            className="secondary"
            disabled={!subscribed || testing || enabling}
            onClick={() => void sendTest()}
          >
            {testing ? 'Sending…' : 'Send test notification'}
          </button>
          {tested && (
            <span>
              <Check size={14} />
              Sent
            </span>
          )}
        </div>
        {status && status.devices.length > 0 && (
          <ul className="notification-devices">
            {status.devices.map((device) => (
              <li key={device.id}>{deviceLabel(device.userAgent)}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="settings-section">
        <h2>Family reminders</h2>
        <p>These choices apply to every device that has notifications enabled.</p>
        <label>
          <span>
            <b>Remind before events</b>
            <small>Timed events send a reminder before they start. All-day events send at 8:00 AM in the household timezone.</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.eventReminders}
            className={`toggle ${settings.eventReminders ? 'on' : ''}`}
            disabled={loading || saving}
            onClick={() => {
              const next = { ...settings, eventReminders: !settings.eventReminders }
              setSettings(next)
              setSaved(false)
              void saveSettings(next)
            }}
          >
            <i />
          </button>
        </label>
        <label>
          <span>
            <b>Reminder time</b>
            <small>How far in advance to notify for timed events</small>
          </span>
          <select
            value={settings.reminderMinutes}
            disabled={loading || saving || !settings.eventReminders}
            onChange={(event) => {
              const next = {
                ...settings,
                reminderMinutes: Number(event.target.value) as ReminderMinutes,
              }
              setSettings(next)
              setSaved(false)
              void saveSettings(next)
            }}
          >
            <option value={15}>15 minutes before</option>
            <option value={30}>30 minutes before</option>
            <option value={60}>60 minutes before</option>
          </select>
        </label>
        {saved && (
          <div className="settings-actions">
            <span>
              <Check size={14} />
              Saved
            </span>
          </div>
        )}
      </div>
      {homeScreenRequired && <IosInstallGuide />}
      {error && <div className="modal-error" role="alert">{error}</div>}
    </div>
  )
}

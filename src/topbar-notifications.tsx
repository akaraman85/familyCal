import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Bell, Share, X } from 'lucide-react'
import {
  isAppleTouchDevice,
  isStandaloneApp,
} from './install-app'
import {
  NOTIFICATION_HINT_KEY,
  openNotificationSettings,
  pushSupported,
} from './notifications'

const IOS_INSTALL_DISMISS_KEY = 'karaman-ios-install-hint-dismissed'

type NotificationTone = 'info' | 'warning'

type AppNotification = {
  id: string
  type: string
  tone: NotificationTone
  icon: ReactNode
  title: string
  body: string
  action?: { label: string; onClick: () => void }
  dismissible?: boolean
  onDismiss?: () => void
}

function shouldShowInstallHint() {
  if (isStandaloneApp() || !isAppleTouchDevice()) return false
  return window.localStorage.getItem(IOS_INSTALL_DISMISS_KEY) !== '1'
}

function shouldShowReminderHint() {
  if (!isStandaloneApp() || !pushSupported()) return false
  if (window.localStorage.getItem(NOTIFICATION_HINT_KEY) === '1') return false
  return Notification.permission !== 'granted'
}

export function TopbarNotifications({
  showHints,
  eventsError,
  eventSourceNotice,
  googleReconnect,
  onOpenSettings,
  onOpenIntegrations,
}: {
  showHints: boolean
  eventsError: string | null
  eventSourceNotice: string | null
  googleReconnect: boolean
  onOpenSettings: () => void
  onOpenIntegrations: () => void
}) {
  const [open, setOpen] = useState(false)
  const [installVisible, setInstallVisible] = useState(false)
  const [reminderVisible, setReminderVisible] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInstallVisible(shouldShowInstallHint())
    setReminderVisible(shouldShowReminderHint())
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const notifications = useMemo(() => {
    const items: AppNotification[] = []

    if (showHints && installVisible) {
      items.push({
        id: 'install',
        type: 'Setup',
        tone: 'info',
        icon: <Share size={16} />,
        title: 'Install Karaman',
        body: 'Tap Share, then Add to Home Screen to use it like an app on this iPhone or iPad.',
        dismissible: true,
        onDismiss: () => {
          window.localStorage.setItem(IOS_INSTALL_DISMISS_KEY, '1')
          setInstallVisible(false)
        },
      })
    }

    if (showHints && reminderVisible) {
      items.push({
        id: 'reminders',
        type: 'Reminders',
        tone: 'info',
        icon: <Bell size={16} />,
        title: 'Turn on event reminders',
        body: 'Allow notifications in Settings so this device can alert you before family events.',
        action: {
          label: 'Open Settings',
          onClick: () => {
            openNotificationSettings()
            onOpenSettings()
            setOpen(false)
          },
        },
        dismissible: true,
        onDismiss: () => {
          window.localStorage.setItem(NOTIFICATION_HINT_KEY, '1')
          setReminderVisible(false)
        },
      })
    }

    if (eventsError) {
      items.push({
        id: 'events-error',
        type: 'Calendar',
        tone: 'warning',
        icon: <AlertTriangle size={16} />,
        title: 'Events could not load',
        body: eventsError,
      })
    } else if (eventSourceNotice) {
      items.push({
        id: 'google-source',
        type: 'Calendar sync',
        tone: 'warning',
        icon: <AlertTriangle size={16} />,
        title: googleReconnect ? 'Google account needs reconnecting' : 'Google Calendar issue',
        body: eventSourceNotice,
        action: googleReconnect
          ? {
              label: 'Open Integrations',
              onClick: () => {
                onOpenIntegrations()
                setOpen(false)
              },
            }
          : undefined,
      })
    }

    return items
  }, [
    showHints,
    installVisible,
    reminderVisible,
    eventsError,
    eventSourceNotice,
    googleReconnect,
    onOpenSettings,
    onOpenIntegrations,
  ])

  if (!notifications.length) return null

  return (
    <div className="view-dropdown notifications-dropdown" ref={menuRef}>
      <button
        type="button"
        className="notifications-trigger"
        aria-expanded={open}
        aria-label={`${notifications.length} notification${notifications.length === 1 ? '' : 's'}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={17} />
        <span className="notifications-badge" aria-hidden="true">{notifications.length}</span>
      </button>
      {open && (
        <div className="glass-menu notifications-menu" role="menu" aria-label="Notifications">
          <div className="notifications-menu-header">
            <b>Notifications</b>
            <span>{notifications.length}</span>
          </div>
          <div className="notifications-menu-list">
            {notifications.map((item) => (
              <article
                key={item.id}
                className={`notification-item notification-item-${item.tone}`}
                role="menuitem"
              >
                <div className="notification-item-head">
                  <span className="notification-item-icon" aria-hidden="true">{item.icon}</span>
                  <div className="notification-item-copy">
                    <span className="notification-item-type">{item.type}</span>
                    <b>{item.title}</b>
                  </div>
                  {item.dismissible && item.onDismiss ? (
                    <button
                      type="button"
                      className="notification-item-dismiss"
                      aria-label={`Dismiss ${item.title}`}
                      onClick={item.onDismiss}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                <p>{item.body}</p>
                {item.action ? (
                  <button
                    type="button"
                    className="notification-item-action"
                    onClick={item.action.onClick}
                  >
                    {item.action.label}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

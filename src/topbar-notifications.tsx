import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
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
const MENU_WIDTH = 360
const VIEWPORT_MARGIN = 12
const MENU_GAP = 8

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

function anchorNotificationsMenu(
  trigger: HTMLElement,
  panel: HTMLElement,
): CSSProperties {
  const margin = VIEWPORT_MARGIN
  const gap = MENU_GAP
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(MENU_WIDTH, window.innerWidth - margin * 2)
  const height = panel.getBoundingClientRect().height

  let top = rect.bottom + gap
  const spaceBelow = window.innerHeight - rect.bottom - margin
  const spaceAbove = rect.top - margin

  if (height > spaceBelow && spaceAbove > spaceBelow) {
    top = rect.top - gap - height
  }

  top = Math.max(margin, Math.min(top, window.innerHeight - margin - height))

  let left = rect.right - width
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

  return {
    position: 'fixed',
    top,
    left,
    width,
    maxHeight: window.innerHeight - top - margin,
  }
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInstallVisible(shouldShowInstallHint())
    setReminderVisible(shouldShowReminderHint())
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return

    const updatePosition = () => {
      if (!triggerRef.current || !panelRef.current) return
      setMenuStyle(anchorNotificationsMenu(triggerRef.current, panelRef.current))
    }

    updatePosition()
    const frame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, installVisible, reminderVisible, eventsError, eventSourceNotice])

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
    <div className="notifications-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="notifications-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${notifications.length} notification${notifications.length === 1 ? '' : 's'}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={17} />
        <span className="notifications-badge" aria-hidden="true">{notifications.length}</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="glass-menu notifications-menu"
          style={menuStyle}
          role="menu"
          aria-label="Notifications"
        >
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
        </div>,
        document.body,
      )}
    </div>
  )
}

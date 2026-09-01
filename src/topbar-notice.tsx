import { type ReactNode } from 'react'
import { X } from 'lucide-react'

export function TopbarNotice({
  icon,
  children,
  action,
  onDismiss,
  tone = 'info',
  role = 'status',
}: {
  icon?: ReactNode
  children: ReactNode
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
  tone?: 'info' | 'warning'
  role?: 'status' | 'alert'
}) {
  return (
    <div className={`topbar-notice topbar-notice-${tone}`} role={role}>
      {icon ? <span className="topbar-notice-icon" aria-hidden="true">{icon}</span> : null}
      <p>{children}</p>
      {action ? (
        <button type="button" className="topbar-notice-action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="topbar-notice-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}

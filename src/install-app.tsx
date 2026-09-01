import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import { TopbarNotice } from './topbar-notice'

const DISMISS_KEY = 'karaman-ios-install-hint-dismissed'

type SafariNavigator = Navigator & { standalone?: boolean }

export function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || Boolean((navigator as SafariNavigator).standalone)
}

export function isAppleTouchDevice() {
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function IosInstallHint({ variant = 'banner' }: { variant?: 'banner' | 'topbar' }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandaloneApp() || !isAppleTouchDevice()) return
    if (window.localStorage.getItem(DISMISS_KEY) === '1') return
    setVisible(true)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (variant === 'topbar') {
    return (
      <TopbarNotice
        icon={<Share size={15} />}
        onDismiss={dismiss}
      >
        <strong>Install Karaman.</strong>
        {' '}Tap Share, then Add to Home Screen.
      </TopbarNotice>
    )
  }

  return (
    <div className="ios-install-hint" role="status">
      <Share size={18} aria-hidden="true" />
      <p>
        <strong>Install Karaman.</strong>
        {' '}Tap Share, then <strong>Add to Home Screen</strong> to use it like an app on this iPhone or iPad.
      </p>
      <button
        type="button"
        className="ios-install-hint-dismiss"
        aria-label="Dismiss install hint"
        onClick={dismiss}
      >
        <X size={16} />
      </button>
    </div>
  )
}

export function IosInstallGuide() {
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setInstalled(isStandaloneApp())
  }, [])

  return (
    <div className="install-guide">
      <h2>Install on iPhone &amp; iPad</h2>
      {installed ? (
        <>
          <p>Karaman is installed on this device. Open it from the Home Screen anytime, without Safari’s toolbar.</p>
          <p className="install-guide-note">Event reminders: open Settings → Notifications and allow notifications from this Home Screen app.</p>
        </>
      ) : (
        <>
          <p>Add the family calendar to your Home Screen so it opens full screen, like a native app.</p>
          <ol>
            <li>Open this site in <strong>Safari</strong> (not a private tab).</li>
            <li>Tap the <strong>Share</strong> button — the square with an arrow pointing up.</li>
            <li>Scroll and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
          <p className="install-guide-note">On iPad, Share is in the Safari toolbar at the top. After installing, look for the orange Karaman icon on your Home Screen.</p>
        </>
      )}
    </div>
  )
}

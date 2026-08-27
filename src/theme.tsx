import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export const THEME_STORAGE_KEY = 'karaman-theme'
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = 'light' | 'dark'

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f5f4f0',
  dark: '#161513',
}

export const THEME_OPTIONS: {
  value: ThemePreference
  label: string
  hint: string
}[] = [
  { value: 'system', label: 'Device', hint: 'Match this device' },
  { value: 'light', label: 'Light', hint: 'Always use light' },
  { value: 'dark', label: 'Dark', hint: 'Always use dark' },
]

type ThemeContextValue = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private mode or blocked storage should still follow the device theme.
  }
  return 'system'
}

export function persistThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Ignore persistence failures; the in-memory preference still applies.
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement
  if (preference === 'light' || preference === 'dark') root.dataset.theme = preference
  else delete root.dataset.theme

  const resolved = resolveTheme(preference)
  const themeColor = THEME_COLORS[resolved]
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference))

  useEffect(() => {
    applyThemePreference(preference)
    setResolved(resolveTheme(preference))
    if (preference !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      applyThemePreference('system')
      setResolved(resolveTheme('system'))
    }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    persistThemePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}

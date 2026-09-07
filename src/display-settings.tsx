import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export const EVENT_TEXT_SIZE_STORAGE_KEY = 'karaman-event-text-size'
export const EVENT_TEXT_SIZE_PREFERENCES = ['compact', 'default', 'large'] as const
export type EventTextSizePreference = (typeof EVENT_TEXT_SIZE_PREFERENCES)[number]

export const EVENT_TEXT_SIZE_OPTIONS: {
  value: EventTextSizePreference
  label: string
  hint: string
}[] = [
  { value: 'compact', label: 'Compact', hint: 'Smaller event labels for dense views' },
  { value: 'default', label: 'Default', hint: 'Balanced readability across views' },
  { value: 'large', label: 'Large', hint: 'Larger event labels for easier reading' },
]

type DisplaySettingsContextValue = {
  eventTextSize: EventTextSizePreference
  setEventTextSize: (preference: EventTextSizePreference) => void
}

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null)

export function readEventTextSizePreference(): EventTextSizePreference {
  try {
    const stored = window.localStorage.getItem(EVENT_TEXT_SIZE_STORAGE_KEY)
    if (stored === 'compact' || stored === 'large') return stored
  } catch {
    // Private mode or blocked storage should still use the default size.
  }
  return 'default'
}

export function persistEventTextSizePreference(preference: EventTextSizePreference) {
  try {
    if (preference === 'default') window.localStorage.removeItem(EVENT_TEXT_SIZE_STORAGE_KEY)
    else window.localStorage.setItem(EVENT_TEXT_SIZE_STORAGE_KEY, preference)
  } catch {
    // Ignore persistence failures; the in-memory preference still applies.
  }
}

export function applyEventTextSizePreference(preference: EventTextSizePreference) {
  const root = document.documentElement
  if (preference === 'default') delete root.dataset.eventTextSize
  else root.dataset.eventTextSize = preference
}

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [eventTextSize, setEventTextSizeState] = useState<EventTextSizePreference>(readEventTextSizePreference)

  useEffect(() => {
    applyEventTextSizePreference(eventTextSize)
  }, [eventTextSize])

  const setEventTextSize = useCallback((next: EventTextSizePreference) => {
    persistEventTextSizePreference(next)
    setEventTextSizeState(next)
  }, [])

  const value = useMemo(
    () => ({ eventTextSize, setEventTextSize }),
    [eventTextSize, setEventTextSize],
  )

  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>
}

export function useDisplaySettings() {
  const value = useContext(DisplaySettingsContext)
  if (!value) throw new Error('useDisplaySettings must be used within DisplaySettingsProvider')
  return value
}

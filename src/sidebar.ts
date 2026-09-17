export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'karaman-sidebar-collapsed'

export function readSidebarCollapsed(
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  try {
    return (storage ?? window.localStorage).getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    // Private mode or blocked storage should still use the expanded rail.
  }
  return false
}

export function persistSidebarCollapsed(
  collapsed: boolean,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
) {
  try {
    const store = storage ?? window.localStorage
    if (collapsed) store.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    else store.removeItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
  } catch {
    // Ignore persistence failures; the in-memory preference still applies.
  }
}

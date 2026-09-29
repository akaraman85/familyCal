import type { AppPage } from './routes'

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'karaman-sidebar-collapsed'

export type SidebarNavSectionId = 'views' | 'workspace' | 'tools'
export type SidebarNavPage = Exclude<AppPage, 'Settings'>

export type SidebarNavSection = {
  id: SidebarNavSectionId
  label: string | null
  pages: SidebarNavPage[]
  includeAiPlanner?: boolean
}

export function sidebarNavSections(isGuest: boolean): SidebarNavSection[] {
  const views: SidebarNavSection = {
    id: 'views',
    label: null,
    pages: ['Calendar', 'Agenda'],
  }

  if (isGuest) return [views]

  return [
    views,
    {
      id: 'workspace',
      label: 'Workspace',
      pages: ['Integrations', 'Family'],
    },
    {
      id: 'tools',
      label: 'Tools',
      pages: ['Todos'],
      includeAiPlanner: true,
    },
  ]
}

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

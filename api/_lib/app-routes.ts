export function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function isPublicHomePath(pathname: string) {
  return normalizePathname(pathname) === '/'
}

export function isLoginPath(pathname: string) {
  return normalizePathname(pathname) === '/login'
}

export function guestInviteToken(pathname: string) {
  const match = normalizePathname(pathname).match(/^\/guest\/([^/]+)$/)
  return match?.[1] ?? null
}

export function isGuestInvitePath(pathname: string) {
  return guestInviteToken(pathname) !== null
}

export function isLegalDocumentPath(pathname: string) {
  const path = normalizePathname(pathname)
  return path === '/privacy' || path === '/privacy.html' || path === '/terms' || path === '/terms.html'
}

export const APP_PAGE_PATHS = {
  Calendar: '/calendar',
  Agenda: '/agenda',
  Integrations: '/integrations',
  Family: '/family',
  Settings: '/settings',
} as const

export type AppPage = keyof typeof APP_PAGE_PATHS

export function appPagePath(page: AppPage) {
  return APP_PAGE_PATHS[page]
}

export function appPageFromPath(pathname: string): AppPage | null {
  const path = normalizePathname(pathname)
  for (const [page, pagePath] of Object.entries(APP_PAGE_PATHS) as Array<[AppPage, string]>) {
    if (pagePath === path) return page
  }
  return null
}

export function isAppPath(pathname: string) {
  return appPageFromPath(pathname) !== null
}

export function isAdminOnlyAppPage(page: AppPage) {
  return page === 'Integrations' || page === 'Family' || page === 'Settings'
}

export function defaultAuthenticatedPath() {
  return APP_PAGE_PATHS.Calendar
}

export function loginLocation() {
  return '/login'
}

export function authenticatedLocation(search = '', isGuest = false) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (!isGuest && params.has('integration')) {
    const query = params.toString()
    return `${APP_PAGE_PATHS.Integrations}${query ? `?${query}` : ''}`
  }
  return defaultAuthenticatedPath()
}

export function googleOAuthReturnLocation(status: 'connected' | 'error') {
  return `${APP_PAGE_PATHS.Integrations}?integration=google-calendar&status=${status}`
}

export const GUEST_INVITE_ERROR_PARAM = 'invite'
export const GUEST_INVITE_EXPIRED_VALUE = 'expired'

export function guestInviteSuccessLocation() {
  return defaultAuthenticatedPath()
}

export function guestInviteExpiredLocation() {
  return `/?${GUEST_INVITE_ERROR_PARAM}=${GUEST_INVITE_EXPIRED_VALUE}`
}

export function guestInviteErrorFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get(GUEST_INVITE_ERROR_PARAM) === GUEST_INVITE_EXPIRED_VALUE
}

export function looksLikeStaticAsset(pathname: string) {
  return /\.[a-zA-Z0-9]+$/.test(normalizePathname(pathname))
}

export type NavigationDecision = 'continue' | { redirect: string }

export type NavigationSession = {
  hasSession?: boolean
  isGuest?: boolean
  search?: string
}

export function navigationDecision(
  pathname: string,
  session: NavigationSession = {},
): NavigationDecision {
  const hasSession = session.hasSession === true
  const isGuest = session.isGuest === true
  const search = session.search ?? ''

  if (
    isLegalDocumentPath(pathname)
    || isGuestInvitePath(pathname)
    || looksLikeStaticAsset(pathname)
  ) {
    return 'continue'
  }

  if (isPublicHomePath(pathname)) {
    return hasSession ? { redirect: authenticatedLocation(search, isGuest) } : 'continue'
  }

  if (isLoginPath(pathname)) {
    return hasSession ? { redirect: authenticatedLocation(search, isGuest) } : 'continue'
  }

  const page = appPageFromPath(pathname)
  if (page) {
    if (!hasSession) return { redirect: loginLocation() }
    if (isGuest && isAdminOnlyAppPage(page)) return { redirect: defaultAuthenticatedPath() }
    return 'continue'
  }

  return { redirect: hasSession ? authenticatedLocation(search, isGuest) : '/' }
}

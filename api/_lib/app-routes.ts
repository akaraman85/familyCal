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

export const GUEST_INVITE_ERROR_PARAM = 'invite'
export const GUEST_INVITE_EXPIRED_VALUE = 'expired'

export function guestInviteSuccessLocation() {
  return '/'
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

export function navigationDecision(pathname: string, hasSession = false): NavigationDecision {
  if (
    isPublicHomePath(pathname)
    || isLegalDocumentPath(pathname)
    || isGuestInvitePath(pathname)
    || looksLikeStaticAsset(pathname)
  ) {
    return 'continue'
  }
  if (isLoginPath(pathname)) {
    return hasSession ? { redirect: '/' } : 'continue'
  }
  return { redirect: '/' }
}

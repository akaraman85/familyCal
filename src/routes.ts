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

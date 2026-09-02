export function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function isPublicHomePath(pathname: string) {
  return normalizePathname(pathname) === '/'
}

export function isLoginPath(pathname: string) {
  return normalizePathname(pathname) === '/login'
}

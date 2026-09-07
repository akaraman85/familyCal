import { next } from '@vercel/functions'
import { sessionPayloadFromCookieHeader, trySessionSecret } from './api/_lib/session-cookie.js'
import { navigationDecision } from './api/_lib/app-routes.js'

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/',
    '/login',
    '/login/',
    '/((?!api/|guest/|login/?$|privacy(?:\\.html)?/?$|terms(?:\\.html)?/?$|.*\\..*|$).*)',
  ],
}

export default function middleware(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next()
  }

  const url = new URL(request.url)
  const secret = trySessionSecret()
  const payload = secret
    ? sessionPayloadFromCookieHeader(request.headers.get('cookie'), secret)
    : null
  const decision = navigationDecision(url.pathname, {
    hasSession: Boolean(payload),
    isGuest: payload?.role === 'guest',
    search: url.search,
  })
  if (decision === 'continue') return next()
  return Response.redirect(new URL(decision.redirect, url), 302)
}

import { next } from '@vercel/functions'
import { sessionPayloadFromCookieHeader, trySessionSecret } from './api/_lib/session-cookie.js'
import { navigationDecision } from './api/_lib/app-routes.js'

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/login',
    '/login/',
    '/((?!api/|guest/|login/?$|privacy(?:\\.html)?/?$|terms(?:\\.html)?/?$|.*\\..*|$).*)',
  ],
}

export default function middleware(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next()
  }

  const secret = trySessionSecret()
  const hasSession = Boolean(
    secret && sessionPayloadFromCookieHeader(request.headers.get('cookie'), secret),
  )
  const decision = navigationDecision(new URL(request.url).pathname, hasSession)
  if (decision === 'continue') return next()
  return Response.redirect(new URL(decision.redirect, request.url), 302)
}

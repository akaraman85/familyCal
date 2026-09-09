import { requestHeader, type RequestWithHeaders } from './http.js'
import { safeEqual } from './session-cookie.js'

export const VERCEL_CRON_USER_AGENT = 'vercel-cron/1.0'

export function cronSecret() {
  return process.env.CRON_SECRET?.trim() || null
}

function bearerToken(authorization: string) {
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  return match?.[1]?.trim() || undefined
}

export function isVercelCronRequest(request: RequestWithHeaders) {
  return requestHeader(request, 'user-agent') === VERCEL_CRON_USER_AGENT
    && Boolean(requestHeader(request, 'x-vercel-cron-schedule'))
}

export function isAuthorizedCronRequest(request: RequestWithHeaders, secret = cronSecret()) {
  const authorization = requestHeader(request, 'authorization')
  const token = authorization ? bearerToken(authorization) : undefined
  if (secret && token) return safeEqual(token, secret)

  // Vercel Cron always sends these headers. The bearer token is only attached
  // when CRON_SECRET is set, and it can be missing on Fluid invocations.
  return isVercelCronRequest(request)
}

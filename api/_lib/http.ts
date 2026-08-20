import type { IncomingMessage, ServerResponse } from 'node:http'

export type ApiRequest = IncomingMessage & {
  body?: unknown
  query?: Record<string, string | string[]>
}

export type ApiResponse = ServerResponse

export function sendJson(response: ApiResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

export function redirect(response: ApiResponse, location: string) {
  response.statusCode = 302
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Location', location)
  response.end()
}

export function requireMethod(
  request: ApiRequest,
  response: ApiResponse,
  allowed: string[],
) {
  if (request.method && allowed.includes(request.method)) return true

  response.setHeader('Allow', allowed.join(', '))
  sendJson(response, 405, { error: 'Method not allowed' })
  return false
}

export function requireSameOrigin(
  request: ApiRequest,
  response: ApiResponse,
  appUrl: string,
) {
  const origin = request.headers.origin
  if (origin === new URL(appUrl).origin) return true

  sendJson(response, 403, { error: 'Invalid request origin' })
  return false
}

export function getCookie(request: ApiRequest, name: string) {
  const cookies = request.headers.cookie?.split(';') ?? []
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

export function setOAuthCookie(response: ApiResponse, state: string, secure: boolean) {
  response.setHeader(
    'Set-Cookie',
    `google_oauth_state=${encodeURIComponent(state)}; Path=/api/integrations/google/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`,
  )
}

export function clearOAuthCookie(response: ApiResponse, secure: boolean) {
  response.setHeader(
    'Set-Cookie',
    `google_oauth_state=; Path=/api/integrations/google/callback; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  )
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error'
}

export async function readJsonBody(request: ApiRequest) {
  if (request.body !== undefined) {
    if (typeof request.body === 'string') return JSON.parse(request.body) as unknown
    return request.body
  }

  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

import assert from 'node:assert/strict'
import { retainInflight } from '../api/_lib/connected-events.ts'
import {
  buildGoogleAuthorizationUrl,
  GoogleAuthRevokedError,
  isGoogleAuthRevokedError,
  isRevokedGoogleGrant,
  parseGoogleTokenResponse,
} from '../api/_lib/providers/google-calendar.ts'

const PRODUCTION_REVOKE_MESSAGE = 'Token has been expired or revoked.'

assert.equal(isRevokedGoogleGrant('invalid_grant', PRODUCTION_REVOKE_MESSAGE), true)
assert.equal(isRevokedGoogleGrant('invalid_grant', 'Bad Request'), true)
assert.equal(isRevokedGoogleGrant(undefined, PRODUCTION_REVOKE_MESSAGE), true)
assert.equal(isRevokedGoogleGrant('invalid_client', 'Unauthorized'), false)

assert.throws(
  () => parseGoogleTokenResponse({
    error: 'invalid_grant',
    error_description: PRODUCTION_REVOKE_MESSAGE,
  }, false),
  (error: unknown) => (
    isGoogleAuthRevokedError(error)
    && error instanceof GoogleAuthRevokedError
    && error.message !== PRODUCTION_REVOKE_MESSAGE
    && /reconnect/i.test(error.message)
  ),
)

assert.equal(
  isGoogleAuthRevokedError(new Error(PRODUCTION_REVOKE_MESSAGE)),
  true,
)

const token = parseGoogleTokenResponse({
  access_token: 'ya29.token',
  expires_in: 3600,
  refresh_token: '1//refresh',
  token_type: 'Bearer',
}, true)
assert.equal(token.access_token, 'ya29.token')
assert.equal(token.expires_in, 3600)

assert.throws(
  () => parseGoogleTokenResponse({ error: 'invalid_client' }, false),
  (error: unknown) => error instanceof Error
    && !(error instanceof GoogleAuthRevokedError)
    && error.message === 'invalid_client',
)

const authorizeUrl = new URL(buildGoogleAuthorizationUrl({
  appUrl: 'https://calendar.example',
  clientId: 'client-id',
  clientSecret: 'client-secret',
}, 'state-value'))
assert.equal(authorizeUrl.searchParams.get('access_type'), 'offline')
assert.match(authorizeUrl.searchParams.get('prompt') ?? '', /consent/)
assert.equal(authorizeUrl.searchParams.get('response_type'), 'code')

const inflight = new Map<string, Promise<string>>()
const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}
process.on('unhandledRejection', onUnhandled)
try {
  const failed = retainInflight(inflight, 'account-1', async () => {
    throw new Error(PRODUCTION_REVOKE_MESSAGE)
  })
  await assert.rejects(failed, /expired or revoked/)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(unhandled.length, 0)
  assert.equal(inflight.size, 0)
} finally {
  process.off('unhandledRejection', onUnhandled)
}

const shared = new Map<string, Promise<string>>()
let starts = 0
const first = retainInflight(shared, 'same', async () => {
  starts += 1
  return 'ok'
})
const second = retainInflight(shared, 'same', async () => {
  starts += 1
  return 'other'
})
assert.equal(await first, 'ok')
assert.equal(await second, 'ok')
assert.equal(starts, 1)

console.log('google-calendar-auth tests passed')

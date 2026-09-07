import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  parseSessionPayload,
  sessionPayloadFromCookieHeader,
  SESSION_COOKIE,
  signature,
  trySessionSecret,
} from './session-cookie.ts'

const previousSecret = process.env.AUTH_SESSION_SECRET
const secret = Buffer.alloc(32, 7)

function tokenFor(payload: object, key = secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, key)}`
}

delete process.env.AUTH_SESSION_SECRET
assert.equal(trySessionSecret(), null)
process.env.AUTH_SESSION_SECRET = secret.toString('base64')
assert.deepEqual(trySessionSecret(), secret)

const valid = tokenFor({ role: 'admin', username: 'alex', exp: Math.floor(Date.now() / 1000) + 60 })
assert.equal(parseSessionPayload(valid, secret)?.username, 'alex')
assert.equal(
  sessionPayloadFromCookieHeader(`${SESSION_COOKIE}=${encodeURIComponent(valid)}`, secret)?.username,
  'alex',
)

const expired = tokenFor({ role: 'admin', username: 'alex', exp: Math.floor(Date.now() / 1000) - 10 })
assert.equal(parseSessionPayload(expired, secret), null)

const forged = `${valid.split('.')[0]}.${createHmac('sha256', Buffer.alloc(32, 1)).update('nope').digest('base64url')}`
assert.equal(parseSessionPayload(forged, secret), null)
assert.equal(sessionPayloadFromCookieHeader('other=1', secret), null)

if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET
else process.env.AUTH_SESSION_SECRET = previousSecret

console.log('session-cookie tests passed')

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  decodeVapidKey,
  isValidVapidPrivateKey,
  isValidVapidPublicKey,
  normalizeVapidKey,
  vapidConfigurationIssue,
} from './push.ts'

const webpush = createRequire(import.meta.url)('web-push') as typeof import('web-push')
const keys = webpush.generateVAPIDKeys()

assert.equal(normalizeVapidKey(`  "${keys.publicKey}"  `), keys.publicKey)
assert.equal(
  normalizeVapidKey(`VAPID_PUBLIC_KEY=${keys.publicKey}`),
  keys.publicKey,
)

assert.equal(isValidVapidPublicKey(keys.publicKey), true)
assert.equal(isValidVapidPrivateKey(keys.privateKey), true)
assert.equal(isValidVapidPublicKey(keys.privateKey), false)
assert.equal(isValidVapidPrivateKey(keys.publicKey), false)
assert.equal(decodeVapidKey(keys.publicKey).length, 65)
assert.equal(decodeVapidKey(keys.privateKey).length, 32)

const previousPublic = process.env.VAPID_PUBLIC_KEY
const previousPrivate = process.env.VAPID_PRIVATE_KEY

process.env.VAPID_PUBLIC_KEY = keys.privateKey
process.env.VAPID_PRIVATE_KEY = keys.publicKey
assert.equal(vapidConfigurationIssue(), 'public_key_is_private')

process.env.VAPID_PUBLIC_KEY = 'not-a-vapid-key'
process.env.VAPID_PRIVATE_KEY = keys.privateKey
assert.equal(vapidConfigurationIssue(), 'invalid_public_key')

process.env.VAPID_PUBLIC_KEY = keys.publicKey
process.env.VAPID_PRIVATE_KEY = 'not-a-vapid-key'
assert.equal(vapidConfigurationIssue(), 'invalid_private_key')

process.env.VAPID_PUBLIC_KEY = keys.publicKey
process.env.VAPID_PRIVATE_KEY = keys.privateKey
assert.equal(vapidConfigurationIssue(), null)

if (previousPublic === undefined) delete process.env.VAPID_PUBLIC_KEY
else process.env.VAPID_PUBLIC_KEY = previousPublic
if (previousPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY
else process.env.VAPID_PRIVATE_KEY = previousPrivate

console.log('push tests passed')

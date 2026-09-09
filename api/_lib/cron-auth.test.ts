import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cronSecret,
  isAuthorizedCronRequest,
  isVercelCronRequest,
} from './cron-auth.js'
import { requestHeader } from './http.js'

const previousSecret = process.env.CRON_SECRET

function nodeRequest(headers: Record<string, string | string[] | undefined>) {
  return { headers }
}

test.after(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
})

test('requestHeader reads IncomingMessage headers and Web Headers', () => {
  assert.equal(
    requestHeader(nodeRequest({ authorization: ' Bearer secret\n' }), 'authorization'),
    'Bearer secret',
  )
  assert.equal(
    requestHeader(nodeRequest({ authorization: ['Bearer one', 'Bearer two'] }), 'authorization'),
    'Bearer one',
  )

  const headers = new Headers({ Authorization: 'Bearer from-web' })
  assert.equal(requestHeader({ headers }, 'authorization'), 'Bearer from-web')
})

test('cronSecret trims configured values', () => {
  delete process.env.CRON_SECRET
  assert.equal(cronSecret(), null)

  process.env.CRON_SECRET = '  abc+def==\n'
  assert.equal(cronSecret(), 'abc+def==')
})

test('authorizes matching bearer tokens from Node and Web header bags', () => {
  process.env.CRON_SECRET = 'abc+def=='
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({ authorization: 'Bearer abc+def==' })),
    true,
  )
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({ authorization: 'bearer abc+def==' })),
    true,
  )
  assert.equal(
    isAuthorizedCronRequest({
      headers: new Headers({ authorization: 'Bearer abc+def==' }),
    }),
    true,
  )
})

test('rejects missing or mismatched bearer tokens', () => {
  process.env.CRON_SECRET = 'expected-secret'
  assert.equal(isAuthorizedCronRequest(nodeRequest({})), false)
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({ authorization: 'Bearer other-secret' })),
    false,
  )
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({
      authorization: 'Bearer other-secret',
      'user-agent': 'vercel-cron/1.0',
      'x-vercel-cron-schedule': '*/5 * * * *',
    })),
    false,
  )
})

test('authorizes Vercel Cron platform headers when the bearer is absent', () => {
  process.env.CRON_SECRET = 'expected-secret'
  assert.equal(
    isVercelCronRequest(nodeRequest({
      'user-agent': 'vercel-cron/1.0',
      'x-vercel-cron-schedule': '*/5 * * * *',
    })),
    true,
  )
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({
      'user-agent': 'vercel-cron/1.0',
      'x-vercel-cron-schedule': '*/5 * * * *',
    })),
    true,
  )
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({
      'user-agent': 'Mozilla/5.0',
      'x-vercel-cron-schedule': '*/5 * * * *',
    })),
    false,
  )
})

test('authorizes Vercel Cron when CRON_SECRET is not configured', () => {
  delete process.env.CRON_SECRET
  assert.equal(isAuthorizedCronRequest(nodeRequest({})), false)
  assert.equal(
    isAuthorizedCronRequest(nodeRequest({
      'user-agent': 'vercel-cron/1.0',
      'x-vercel-cron-schedule': '*/5 * * * *',
    })),
    true,
  )
})

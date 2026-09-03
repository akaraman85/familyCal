import assert from 'node:assert/strict'
import { guestInviteToken, isGuestInvitePath, isLoginPath, isPublicHomePath, normalizePathname } from './routes.ts'

assert.equal(normalizePathname('/'), '/')
assert.equal(normalizePathname('/login/'), '/login')
assert.equal(normalizePathname('/privacy/'), '/privacy')
assert.equal(isPublicHomePath('/'), true)
assert.equal(isPublicHomePath('/login'), false)
assert.equal(isLoginPath('/login'), true)
assert.equal(isLoginPath('/login/'), true)
assert.equal(isLoginPath('/'), false)
assert.equal(isGuestInvitePath('/guest/abc'), true)
assert.equal(isGuestInvitePath('/guest/abc/'), true)
assert.equal(isGuestInvitePath('/guest'), false)
assert.equal(guestInviteToken('/guest/abc123'), 'abc123')
assert.equal(guestInviteToken('/login'), null)

console.log('routes tests passed')

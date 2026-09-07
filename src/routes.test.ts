import assert from 'node:assert/strict'
import {
  guestInviteErrorFromSearch,
  guestInviteExpiredLocation,
  guestInviteSuccessLocation,
  guestInviteToken,
  isGuestInvitePath,
  isLegalDocumentPath,
  isLoginPath,
  isPublicHomePath,
  looksLikeStaticAsset,
  navigationDecision,
  normalizePathname,
} from '../api/_lib/app-routes.ts'

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
assert.equal(isLegalDocumentPath('/privacy'), true)
assert.equal(isLegalDocumentPath('/privacy.html'), true)
assert.equal(isLegalDocumentPath('/terms/'), true)
assert.equal(isLegalDocumentPath('/login'), false)
assert.equal(guestInviteSuccessLocation(), '/')
assert.equal(guestInviteExpiredLocation(), '/?invite=expired')
assert.equal(guestInviteErrorFromSearch('?invite=expired'), true)
assert.equal(guestInviteErrorFromSearch('invite=expired'), true)
assert.equal(guestInviteErrorFromSearch('?invite=other'), false)
assert.equal(guestInviteErrorFromSearch(''), false)
assert.equal(looksLikeStaticAsset('/sw.js'), true)
assert.equal(looksLikeStaticAsset('/unknown'), false)
assert.equal(navigationDecision('/'), 'continue')
assert.equal(navigationDecision('/login'), 'continue')
assert.deepEqual(navigationDecision('/login', true), { redirect: '/' })
assert.equal(navigationDecision('/guest/token123'), 'continue')
assert.equal(navigationDecision('/privacy'), 'continue')
assert.equal(navigationDecision('/terms.html'), 'continue')
assert.equal(navigationDecision('/sw.js'), 'continue')
assert.equal(navigationDecision('/pwa-192x192.png'), 'continue')
assert.equal(navigationDecision('/assets/index-abc.js'), 'continue')
assert.deepEqual(navigationDecision('/unknown'), { redirect: '/' })
assert.deepEqual(navigationDecision('/calendar/day'), { redirect: '/' })

console.log('routes tests passed')

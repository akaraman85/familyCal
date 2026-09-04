import assert from 'node:assert/strict'
import test from 'node:test'
import { guestInviteEmailContent, isValidGuestInviteUrl } from './guest-invite-email.js'

test('guest invite email content includes the invite link and expiry', () => {
  const expiresAt = new Date('2026-09-10T12:00:00.000Z')
  const content = guestInviteEmailContent({
    guestName: 'Alex',
    guestEmail: 'alex@example.com',
    inviteUrl: 'https://calendar.example.com/guest/abc123',
    expiresAt,
  })

  assert.match(content.subject, /guest invite/i)
  assert.match(content.text, /https:\/\/calendar\.example\.com\/guest\/abc123/)
  assert.match(content.html, /https:\/\/calendar\.example\.com\/guest\/abc123/)
  assert.match(content.text, /September 10, 2026/)
})

test('guest invite url validation accepts only app guest links', () => {
  const appUrl = 'https://calendar.example.com'
  assert.equal(
    isValidGuestInviteUrl(appUrl, 'https://calendar.example.com/guest/token123'),
    true,
  )
  assert.equal(
    isValidGuestInviteUrl(appUrl, 'https://evil.example.com/guest/token123'),
    false,
  )
  assert.equal(
    isValidGuestInviteUrl(appUrl, 'https://calendar.example.com/guest/token/extra'),
    false,
  )
})

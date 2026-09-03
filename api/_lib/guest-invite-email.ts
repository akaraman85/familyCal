import { format } from 'date-fns'
import { sendEmail } from './email.js'

const APP_NAME = 'Family Calendar'

export type GuestInviteEmailInput = {
  guestName: string
  guestEmail: string
  inviteUrl: string
  expiresAt: Date
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function guestInviteEmailContent(input: GuestInviteEmailInput) {
  const expiryLabel = format(input.expiresAt, 'MMMM d, yyyy')
  const subject = `Your ${APP_NAME} guest invite`
  const text = [
    `Hi ${input.guestName},`,
    '',
    `You've been invited to view busy times on ${APP_NAME}.`,
    '',
    `Open your invite: ${input.inviteUrl}`,
    '',
    `This link expires on ${expiryLabel}. If it stops working, ask the calendar owner for a new one.`,
    '',
    `You will only see when people are busy — never event names, locations, or other details.`,
  ].join('\n')

  const html = `
    <p>Hi ${escapeHtml(input.guestName)},</p>
    <p>You've been invited to view busy times on <strong>${APP_NAME}</strong>.</p>
    <p><a href="${escapeHtml(input.inviteUrl)}">Open your calendar invite</a></p>
    <p>This link expires on <strong>${escapeHtml(expiryLabel)}</strong>. If it stops working, ask the calendar owner for a new one.</p>
    <p>You will only see when people are busy — never event names, locations, or other details.</p>
  `.trim()

  return { subject, html, text }
}

export async function sendGuestInviteEmail(input: GuestInviteEmailInput) {
  const content = guestInviteEmailContent(input)
  await sendEmail({
    to: input.guestEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
  })
}

export function isValidGuestInviteUrl(appUrl: string, inviteUrl: string) {
  const prefix = `${appUrl.replace(/\/$/, '')}/guest/`
  if (!inviteUrl.startsWith(prefix)) return false
  const token = inviteUrl.slice(prefix.length)
  return token.length > 0 && !token.includes('/')
}

import { Resend } from 'resend'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured. Set RESEND_API_KEY and EMAIL_FROM.')
    this.name = 'EmailNotConfiguredError'
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

function emailFromAddress() {
  return process.env.EMAIL_FROM?.trim() || ''
}

function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || ''
}

export function isEmailConfigured() {
  return Boolean(resendApiKey() && emailFromAddress())
}

export async function sendEmail(message: EmailMessage) {
  const apiKey = resendApiKey()
  const from = emailFromAddress()
  if (!apiKey || !from) {
    throw new EmailNotConfiguredError()
  }

  const resend = new Resend(apiKey)
  const result = await resend.emails.send({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })

  if (result.error) {
    throw new EmailDeliveryError(result.error.message || 'Unable to send email')
  }
}

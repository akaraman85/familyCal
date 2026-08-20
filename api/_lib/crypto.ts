import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

type EncryptedValue = {
  v: 1
  iv: string
  tag: string
  data: string
}

function decodeKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  }
  return key
}

export function encryptJson(value: unknown, encodedKey: string) {
  const key = decodeKey(encodedKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])

  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  } satisfies EncryptedValue)
}

export function decryptJson<T>(encrypted: string, encodedKey: string): T {
  const payload = JSON.parse(encrypted) as EncryptedValue
  if (payload.v !== 1) throw new Error('Unsupported encrypted credential version')

  const decipher = createDecipheriv(
    'aes-256-gcm',
    decodeKey(encodedKey),
    Buffer.from(payload.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString('utf8')) as T
}

export function randomState() {
  return randomBytes(32).toString('base64url')
}

export function hashState(state: string) {
  return createHash('sha256').update(state).digest('hex')
}

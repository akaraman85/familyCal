type IntegrationEnv = {
  appUrl: string
  databaseUrl: string
  encryptionKey: string
  googleClientId: string
  googleClientSecret: string
  ownerId: string
}

type StorageEnv = Pick<IntegrationEnv, 'databaseUrl' | 'ownerId'>

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function storageEnv(): StorageEnv {
  return {
    databaseUrl: required('DATABASE_URL'),
    ownerId: required('INTEGRATION_OWNER_ID'),
  }
}

export function integrationEnv(): IntegrationEnv {
  const appUrl = required('PUBLIC_APP_URL').replace(/\/$/, '')
  const parsedUrl = new URL(appUrl)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('PUBLIC_APP_URL must use http or https')
  }

  return {
    ...storageEnv(),
    appUrl,
    encryptionKey: required('INTEGRATION_ENCRYPTION_KEY'),
    googleClientId: required('GOOGLE_CLIENT_ID'),
    googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  }
}

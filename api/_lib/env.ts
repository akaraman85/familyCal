type AppEnv = {
  appUrl: string
  databaseUrl: string
  ownerId: string
}

type IntegrationEnv = AppEnv & {
  encryptionKey: string
  googleClientId: string
  googleClientSecret: string
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function appEnv(): AppEnv {
  const appUrl = required('PUBLIC_APP_URL').replace(/\/$/, '')
  const parsedUrl = new URL(appUrl)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('PUBLIC_APP_URL must use http or https')
  }

  return {
    appUrl,
    databaseUrl: required('DATABASE_URL'),
    ownerId: required('INTEGRATION_OWNER_ID'),
  }
}

export function integrationEnv(): IntegrationEnv {
  return {
    ...appEnv(),
    encryptionKey: required('INTEGRATION_ENCRYPTION_KEY'),
    googleClientId: required('GOOGLE_CLIENT_ID'),
    googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  }
}

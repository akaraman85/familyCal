export const integrationProviders = {
  'google-calendar': {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Read calendars and events from a Google account.',
    capabilities: ['calendar.read'],
  },
} as const

export type IntegrationProviderId = keyof typeof integrationProviders

export function isIntegrationProvider(value: string): value is IntegrationProviderId {
  return value in integrationProviders
}

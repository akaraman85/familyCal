import { requireAdmin } from '../../_lib/auth.js'
import {
  listCalendarExclusions,
  listIntegrationAccountsWithCredentials,
  updateIntegrationAccountStatus,
} from '../../_lib/db.js'
import { integrationEnv } from '../../_lib/env.js'
import {
  requireMethod,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../_lib/http.js'
import {
  getGoogleAccessToken,
  googleCalendarType,
  GOOGLE_CALENDAR_PROVIDER_ID,
  hasGoogleCalendarReadScope,
  isGoogleAuthRevokedError,
  listGoogleCalendars,
} from '../../_lib/providers/google-calendar.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = integrationEnv()
    const [accounts, exclusions] = await Promise.all([
      listIntegrationAccountsWithCredentials(
        env.databaseUrl,
        env.ownerId,
        GOOGLE_CALENDAR_PROVIDER_ID,
      ),
      listCalendarExclusions(
        env.databaseUrl,
        env.ownerId,
        GOOGLE_CALENDAR_PROVIDER_ID,
      ),
    ])
    const calendars = []
    const reconnectAccountIds: string[] = []
    let unexpectedFailure = false
    for (const account of accounts) {
      // A user can grant profile access while declining Calendar access. The
      // account remains visible in the UI so they can repair the grant, but it
      // must not prevent authorized accounts from loading.
      if (!hasGoogleCalendarReadScope(account.scopes)) continue
      if (account.status === 'error') {
        reconnectAccountIds.push(account.external_account_id)
        continue
      }
      try {
        const accessToken = await getGoogleAccessToken({
          databaseUrl: env.databaseUrl,
          encryptionKey: env.encryptionKey,
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
        }, account)
        const accountCalendars = await listGoogleCalendars(accessToken)
        const excludedIds = new Set(
          exclusions
            .filter((row) => row.external_account_id === account.external_account_id)
            .map((row) => row.calendar_id),
        )
        calendars.push(...accountCalendars.map((calendar) => ({
          accountId: account.external_account_id,
          memberId: account.member_id,
          id: calendar.id,
          name: calendar.summary,
          primary: calendar.primary ?? false,
          type: googleCalendarType(calendar),
          accessRole: calendar.accessRole,
          color: calendar.backgroundColor ?? null,
          included: !excludedIds.has(calendar.id),
        })))
      } catch (error) {
        if (isGoogleAuthRevokedError(error)) {
          console.error(
            `Google Calendar grant revoked for ${account.external_account_id}`,
            error,
          )
          reconnectAccountIds.push(account.external_account_id)
          try {
            await updateIntegrationAccountStatus(
              env.databaseUrl,
              env.ownerId,
              GOOGLE_CALENDAR_PROVIDER_ID,
              account.external_account_id,
              'error',
            )
          } catch (statusError) {
            console.error(
              `Unable to mark Google account ${account.external_account_id} as needing reconnect`,
              statusError,
            )
          }
          continue
        }
        unexpectedFailure = true
        console.error(
          `Unable to list Google calendars for ${account.external_account_id}`,
          error,
        )
      }
    }
    if (unexpectedFailure && !calendars.length && !reconnectAccountIds.length) {
      sendJson(response, 502, {
        error: 'Unable to list Google calendars',
      })
      return
    }
    sendJson(response, 200, {
      calendars,
      reconnectAccountIds,
    })
  } catch (error) {
    console.error('Unable to list Google calendars', error)
    sendJson(response, 502, {
      error: 'Unable to list Google calendars',
    })
  }
}

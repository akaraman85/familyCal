import { neon } from '@neondatabase/serverless'

export const PLANNER_MODEL_PROFILES = {
  fast: 'openai/gpt-5.6-luna',
  balanced: 'openai/gpt-5.6-terra',
  quality: 'openai/gpt-5.6-sol',
} as const

export type PlannerModelProfile = keyof typeof PLANNER_MODEL_PROFILES

export type PlannerSettings = {
  enabled: boolean
  modelProfile: PlannerModelProfile
  timezone: string
  defaultCalendar: string
}

type PlannerSettingsRow = {
  enabled: boolean
  model_profile: PlannerModelProfile
  timezone: string
  default_calendar: string
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  enabled: true,
  modelProfile: 'balanced',
  timezone: 'America/New_York',
  defaultCalendar: 'Family',
}

function serialize(row: PlannerSettingsRow | undefined): PlannerSettings {
  if (!row) return DEFAULT_PLANNER_SETTINGS
  return {
    enabled: row.enabled,
    modelProfile: row.model_profile,
    timezone: row.timezone,
    defaultCalendar: row.default_calendar,
  }
}

export function isPlannerModelProfile(value: unknown): value is PlannerModelProfile {
  return typeof value === 'string' && value in PLANNER_MODEL_PROFILES
}

export function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export async function getPlannerSettings(databaseUrl: string, ownerId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT enabled, model_profile, timezone, default_calendar
       FROM ai_planner_settings
      WHERE owner_id = $1
      LIMIT 1`,
    [ownerId],
  ) as PlannerSettingsRow[]
  return serialize(rows[0])
}

export async function savePlannerSettings(
  databaseUrl: string,
  ownerId: string,
  settings: PlannerSettings,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO ai_planner_settings (
       owner_id, enabled, model_profile, timezone, default_calendar
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       model_profile = EXCLUDED.model_profile,
       timezone = EXCLUDED.timezone,
       default_calendar = EXCLUDED.default_calendar,
       updated_at = NOW()
     RETURNING enabled, model_profile, timezone, default_calendar`,
    [
      ownerId,
      settings.enabled,
      settings.modelProfile,
      settings.timezone,
      settings.defaultCalendar,
    ],
  ) as PlannerSettingsRow[]
  return serialize(rows[0])
}

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const migrationUrl = new URL('../db/migrations/001_integrations.sql', import.meta.url)
const migration = await readFile(fileURLToPath(migrationUrl), 'utf8')
const sql = neon(databaseUrl)

await sql.query(migration)
console.log('Integration database migration completed')

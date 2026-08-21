import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Pool } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}
if (databaseUrl === '[SENSITIVE]') {
  throw new Error(
    'DATABASE_URL is redacted. Run migrations inside Vercel or provide a Neon connection string.',
  )
}

const migrationsUrl = new URL('../db/migrations/', import.meta.url)
const migrationDirectory = fileURLToPath(migrationsUrl)
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort()
const pool = new Pool({ connectionString: databaseUrl, max: 1 })
const client = await pool.connect()

try {
  await client.query('BEGIN')
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext(current_database()),
       hashtext('karaman-calendar-migrations')
     )`,
  )
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       checksum TEXT NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  )

  const appliedResult = await client.query(
    'SELECT filename, checksum FROM schema_migrations',
  )
  const applied = new Map(
    appliedResult.rows.map((row) => [row.filename, row.checksum]),
  )

  for (const file of migrationFiles) {
    const migration = await readFile(new URL(file, migrationsUrl), 'utf8')
    const checksum = createHash('sha256').update(migration).digest('hex')
    const existingChecksum = applied.get(file)
    if (existingChecksum) {
      if (existingChecksum !== checksum) {
        throw new Error(
          `Migration ${file} changed after it was applied; create a new migration instead`,
        )
      }
      console.log(`Already applied ${file}`)
      continue
    }

    await client.query(migration)
    await client.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
      [file, checksum],
    )
    console.log(`Applied ${file}`)
  }

  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  client.release()
  await pool.end()
}

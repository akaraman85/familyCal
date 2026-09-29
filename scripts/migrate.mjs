import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'
import { sqlStatements } from './sql-statements.mjs'

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
const migrationFiles = (await readdir(migrationsUrl))
  .filter((file) => file.endsWith('.sql'))
  .sort()

const sql = neon(databaseUrl, { fullResults: true })

try {
  await sql.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       checksum TEXT NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  )

  const appliedResult = await sql.query(
    'SELECT filename, checksum FROM schema_migrations',
  )
  const applied = new Map(
    appliedResult.rows.map((row) => [row.filename, row.checksum]),
  )

  const pending = []
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
    pending.push({ file, migration, checksum })
  }

  if (pending.length > 0) {
    await sql.transaction((txn) => [
      txn.query(
        `SELECT pg_advisory_xact_lock(
           hashtext(current_database()),
           hashtext('karaman-calendar-migrations')
         )`,
      ),
      ...pending.flatMap(({ file, migration, checksum }) => [
        ...sqlStatements(migration).map((statement) => txn.query(statement)),
        txn.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, checksum],
        ),
      ]),
    ])

    for (const { file } of pending) console.log(`Applied ${file}`)
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  throw new Error(
    `Database migration failed over Neon HTTP. ${detail}`,
    { cause: error },
  )
}

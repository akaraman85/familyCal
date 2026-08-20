import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const migrationsUrl = new URL('../db/migrations/', import.meta.url)
const migrationDirectory = fileURLToPath(migrationsUrl)
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort()
const sql = neon(databaseUrl)

for (const file of migrationFiles) {
  const migration = await readFile(new URL(file, migrationsUrl), 'utf8')
  await sql.query(migration)
  console.log(`Applied ${file}`)
}

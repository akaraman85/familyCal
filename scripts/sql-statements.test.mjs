import assert from 'node:assert/strict'
import { sqlStatements } from './sql-statements.mjs'

assert.deepEqual(sqlStatements(''), [])
assert.deepEqual(sqlStatements('   ;  \n'), [])
assert.deepEqual(sqlStatements('SELECT 1'), ['SELECT 1'])
assert.deepEqual(
  sqlStatements(`
    CREATE TABLE IF NOT EXISTS todos (id TEXT);
    CREATE INDEX IF NOT EXISTS todos_idx ON todos (id);
  `),
  [
    'CREATE TABLE IF NOT EXISTS todos (id TEXT)',
    'CREATE INDEX IF NOT EXISTS todos_idx ON todos (id)',
  ],
)

console.log('sql-statements tests passed')

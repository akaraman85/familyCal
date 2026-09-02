import assert from 'node:assert/strict'
import { isLoginPath, isPublicHomePath, normalizePathname } from './routes.ts'

assert.equal(normalizePathname('/'), '/')
assert.equal(normalizePathname('/login/'), '/login')
assert.equal(normalizePathname('/privacy/'), '/privacy')
assert.equal(isPublicHomePath('/'), true)
assert.equal(isPublicHomePath('/login'), false)
assert.equal(isLoginPath('/login'), true)
assert.equal(isLoginPath('/login/'), true)
assert.equal(isLoginPath('/'), false)

console.log('routes tests passed')

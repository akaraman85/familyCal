import assert from 'node:assert/strict'
import {
  persistSidebarCollapsed,
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from './sidebar.ts'

const memory = new Map<string, string>()
const storage = {
  getItem(key: string) {
    return memory.get(key) ?? null
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
  removeItem(key: string) {
    memory.delete(key)
  },
}

assert.equal(readSidebarCollapsed(storage), false)

persistSidebarCollapsed(true, storage)
assert.equal(memory.get(SIDEBAR_COLLAPSED_STORAGE_KEY), '1')
assert.equal(readSidebarCollapsed(storage), true)

persistSidebarCollapsed(false, storage)
assert.equal(memory.has(SIDEBAR_COLLAPSED_STORAGE_KEY), false)
assert.equal(readSidebarCollapsed(storage), false)

assert.equal(readSidebarCollapsed({
  getItem() {
    throw new Error('blocked')
  },
}), false)

console.log('sidebar tests passed')

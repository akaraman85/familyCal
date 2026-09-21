import assert from 'node:assert/strict'
import {
  canUsePointerMagnet,
  isTypingTarget,
  prefersFinePointer,
  prefersReducedMotion,
} from './motion-preference.ts'

function media(matches: Record<string, boolean>) {
  return (query: string) => ({ matches: Boolean(matches[query]) }) as MediaQueryList
}

assert.equal(prefersReducedMotion(media({ '(prefers-reduced-motion: reduce)': true })), true)
assert.equal(prefersReducedMotion(media({ '(prefers-reduced-motion: reduce)': false })), false)

assert.equal(
  prefersFinePointer(media({ '(pointer: fine)': true, '(hover: hover)': true })),
  true,
)
assert.equal(
  prefersFinePointer(media({ '(pointer: fine)': true, '(hover: hover)': false })),
  false,
)

assert.equal(
  canUsePointerMagnet(media({
    '(prefers-reduced-motion: reduce)': false,
    '(pointer: fine)': true,
    '(hover: hover)': true,
  })),
  true,
)
assert.equal(
  canUsePointerMagnet(media({
    '(prefers-reduced-motion: reduce)': true,
    '(pointer: fine)': true,
    '(hover: hover)': true,
  })),
  false,
)

assert.equal(isTypingTarget(null), false)
console.log('motion-preference tests passed')

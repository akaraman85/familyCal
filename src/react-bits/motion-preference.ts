export function prefersReducedMotion(media = window.matchMedia) {
  return media('(prefers-reduced-motion: reduce)').matches
}

export function prefersFinePointer(media = window.matchMedia) {
  return media('(pointer: fine)').matches && media('(hover: hover)').matches
}

export function canUsePointerMagnet(media = window.matchMedia) {
  return !prefersReducedMotion(media) && prefersFinePointer(media)
}

export function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof Element === 'undefined') return false
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, option, [contenteditable="true"]'))
}

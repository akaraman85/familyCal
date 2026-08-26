declare const __APP_BUILD_ID__: string

const STORAGE_KEY = 'karaman.build-id'

export async function ensureLatestApp() {
  const buildId = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev'
  const previous = localStorage.getItem(STORAGE_KEY)

  if (!previous) {
    localStorage.setItem(STORAGE_KEY, buildId)
    return
  }

  if (previous === buildId) return

  localStorage.setItem(STORAGE_KEY, buildId)

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }

  window.location.reload()
}

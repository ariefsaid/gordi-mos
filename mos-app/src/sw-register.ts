import { APP_BASE_PATH, appUrl } from '@/config/app-build-settings'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(appUrl('/sw.js'), { scope: APP_BASE_PATH })
  })
}

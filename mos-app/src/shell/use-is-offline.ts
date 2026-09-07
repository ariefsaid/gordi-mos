import { useSyncExternalStore } from 'react'

/**
 * True while the browser reports no connection. `useSyncExternalStore` rather than state + effects
 * so the first render already carries the right answer — a shell that mounts offline must say so
 * immediately, not after a paint.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
    () => false,
  )
}

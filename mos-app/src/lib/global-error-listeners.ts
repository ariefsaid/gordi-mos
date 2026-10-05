import { reportError } from './telemetry'

export type GlobalErrorTarget = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  location: Pick<Location, 'pathname'>
}

export function installGlobalErrorListeners(
  target: GlobalErrorTarget = window,
  report: typeof reportError = reportError,
): () => void {
  const onError = (event: ErrorEvent) => {
    report(event.error ?? event.message, { route: target.location.pathname })
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    report(event.reason, { route: target.location.pathname })
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}

/**
 * Route-level error page for react-router errorElement.
 *
 * Catches errors thrown in loaders/actions/render within RouterProvider,
 * displays a calm fallback UI, and reports to telemetry. Complements the
 * ErrorBoundary wrapping <App/> in main.tsx (belt+suspenders).
 */

import { useRouteError } from 'react-router-dom'
import { reportError } from '@/lib/telemetry'
import { ErrorFallback } from './ErrorFallback'

/**
 * isRouteError — narrow type to check if error is a react-router Route error
 */
function isRouteError(error: unknown): error is { status?: number; statusText?: string; data?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'statusText' in error || 'data' in error)
  )
}

export function RouteErrorBoundary() {
  const error = useRouteError()

  // Report to telemetry
  reportError(error, {
    location: 'RouteErrorBoundary',
    isRouteError: isRouteError(error),
    ...(isRouteError(error) && {
      status: error.status,
      statusText: error.statusText,
    }),
  })

  return <ErrorFallback />
}
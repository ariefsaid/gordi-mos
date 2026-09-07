/**
 * Route-level error page for react-router errorElement.
 *
 * Catches errors thrown in loaders/actions/render within RouterProvider,
 * displays a calm fallback UI, and reports to telemetry. Complements the
 * ErrorBoundary wrapping <App/> in main.tsx (belt+suspenders).
 */

import { useRevalidator, useRouteError } from 'react-router-dom'
import { reportError } from '@/lib/telemetry'
import { isNetworkError } from '@/lib/network-error'
import { PageFrame } from '@/shell/page-frame'
import { NetworkErrorState } from '@/components/ui/state-kit'
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
  const revalidator = useRevalidator()

  // Report to telemetry
  reportError(error, {
    location: 'RouteErrorBoundary',
    isRouteError: isRouteError(error),
    ...(isRouteError(error) && {
      status: error.status,
      statusText: error.statusText,
    }),
  })

  // Offline is an error, not a crash: a read that failed on the network gets the in-frame
  // ErrorState with Retry, never the full-screen crash screen (DESIGN.md § Components → State
  // conformance matrix). Retry re-issues the read.
  if (isNetworkError(error)) {
    return (
      <PageFrame>
        <NetworkErrorState onRetry={() => revalidator.revalidate()} />
      </PageFrame>
    )
  }

  return <ErrorFallback />
}
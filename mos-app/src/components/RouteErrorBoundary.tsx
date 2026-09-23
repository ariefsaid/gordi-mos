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

  // Network read → in-frame NetworkErrorState with Retry; anything else → the crash screen.
  // See lib/network-error.ts.
  if (isNetworkError(error)) {
    return (
      <PageFrame>
        <NetworkErrorState onRetry={() => revalidator.revalidate()} />
      </PageFrame>
    )
  }

  return <ErrorFallback />
}
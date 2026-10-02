import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { isProfilePathAvailable, profileLandingPath } from '@/config/build-settings'

/**
 * Café screens link to Tasks with `?occurrence=<runId>` so operators can inspect the tasks for
 * that Process run. Preserve that contextual capability without exposing the general Work
 * collection or unscoped Task records in the Cafe release.
 */
export function CafeOccurrenceTaskRoute({ children }: { children: ReactNode }): React.JSX.Element {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const occurrences = params.getAll('occurrence')
  const hasCafeTaskContext = occurrences.length === 1 && occurrences[0].trim().length > 0 && !params.has('create')
  return hasCafeTaskContext ? <>{children}</> : <Navigate to={profileLandingPath('cafe')} replace />
}

/** Future and unknown Work URLs also return to the profile landing instead of the shell 404. */
export function CafeProfileFallbackRoute({ children }: { children: ReactNode }): React.JSX.Element {
  const { pathname } = useLocation()
  return isProfilePathAvailable(pathname, 'cafe')
    ? <>{children}</>
    : <Navigate to={profileLandingPath('cafe')} replace />
}

import { useMatches } from 'react-router-dom'
import { ContextRow } from './context-row'

function hasNotFoundHandle(handle: unknown): boolean {
  if (typeof handle !== 'object' || handle === null || Array.isArray(handle)) return false
  const value = handle as Record<string, unknown>
  return value.kind === 'infrastructure' && value.reason === 'not-found'
}

/** Bind the shell context to the route outcome selected by the data router. */
export function MatchedRouteContextRow() {
  const routeIsNotFound = useMatches().some(({ handle }) => hasNotFoundHandle(handle))
  return <ContextRow routeIsNotFound={routeIsNotFound} />
}

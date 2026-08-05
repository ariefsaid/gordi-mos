// Helpers for asserting against the PRODUCTION route table (src/router.tsx).
//
// Why these exist (#217): assertions about redirects kept being written against a synthetic route
// tree mounted inside the test itself, so they stayed green whether or not the real table served
// the destination. Everything here resolves through `routeConfig` and react-router's own matcher,
// so deleting a route from the real table turns the assertion red.

import { isValidElement, type ReactNode } from 'react'
import { Navigate, matchRoutes, type RouteObject } from 'react-router-dom'
import { routeConfig } from '@/router'

/** Every route entry in the table, flattened depth-first (pathless layout routes included). */
export function allRoutes(routes: RouteObject[] = routeConfig): RouteObject[] {
  return routes.flatMap((r) => [r, ...(r.children ? allRoutes(r.children) : [])])
}

/** True when the route element is a redirect (a `<Navigate>`) rather than a rendered surface. */
export function isRedirect(element: ReactNode): boolean {
  return isValidElement(element) && element.type === Navigate
}

/** The `to` / `replace` a redirect element carries. Throws if the element is not a redirect. */
export function redirectProps(element: ReactNode): { to: string; replace: boolean } {
  if (!isRedirect(element)) throw new Error('route element is not a <Navigate> redirect')
  const props = (element as React.ReactElement<{ to: string; replace?: boolean }>).props
  return { to: String(props.to), replace: props.replace === true }
}

/**
 * Resolve `path` against the production table with react-router's own matcher and return the leaf
 * match. `undefined` means nothing matched at all; a leaf whose `path` is `'*'` means it fell
 * through to the not-found catch-all — i.e. the path is a dead end, not a live surface.
 */
export function leafInThisTable(path: string) {
  const matches = matchRoutes(routeConfig, path)
  return matches?.[matches.length - 1]
}

// Helpers for asserting against the PRODUCTION route table (src/router.tsx).
//
// Why these exist (#217): assertions about redirects kept being written against a synthetic route
// tree mounted inside the test itself, so they stayed green whether or not the real table served
// the destination. Everything here resolves through `routeConfig` and react-router's own matcher,
// so deleting a route from the real table turns the assertion red.

import { isValidElement, type ReactNode } from 'react'
import { expect } from 'vitest'
import { Navigate, matchRoutes, type RouteObject } from 'react-router-dom'
import { routeConfig } from '@/router'
import { RequireCapability } from '@/auth/require-capability'
import { RequireAccessRole } from '@/auth/require-access-role'
import { AdminRoute } from '@/auth/admin-route'

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

/** The pathname half of a redirect target — `matchRoutes` matches paths, not query strings. */
export function pathnameOf(to: string): string {
  return to.split('#')[0].split('?')[0]
}

/**
 * Every ROUTE GATE on the ancestor chain a path resolves through, as stable strings (#220).
 *
 * `ProtectedRoute` is deliberately not listed: it wraps every authenticated route, so it can never
 * make one destination less reachable than another. What is listed is the set of gates that bounce
 * a SUBSET of authenticated viewers — a capability gate, an access-role gate, or the admin gate.
 * Each of those bounces is a second navigation, which is exactly what "one hop" has to exclude.
 */
export function gatesOnPath(path: string): string[] {
  const matches = matchRoutes(routeConfig, pathnameOf(path)) ?? []
  return matches.flatMap(({ route }) => {
    const el = route.element
    if (!isValidElement(el)) return []
    if (el.type === RequireCapability) {
      return [`capability:${(el.props as { capability: string }).capability}`]
    }
    if (el.type === RequireAccessRole) {
      const { anyOf } = el.props as { anyOf: readonly string[] }
      return [`accessRole:${[...anyOf].sort().join('|')}`]
    }
    if (el.type === AdminRoute) return ['admin']
    return []
  })
}

/**
 * ONE HOP, asserted against the production table (FR-015 / AC-017).
 *
 * The name has to earn itself. Before #220 this assertion proved only that *a non-redirect leaf
 * exists at the destination*: the merge gate on #218 re-pointed a redirect at a page sitting
 * behind a capability gate — a real two-hop dead end for every non-holder — and all 22 router
 * tests stayed green. Four things are checked here; the first and the last are what #220 added:
 *
 *  1. something in the real table matches the destination at all. A lookup that returns nothing
 *     must fail, not let the remaining assertions pass vacuously.
 *  2. the leaf is not the `*` not-found catch-all.
 *  3. the leaf is not itself a redirect — that is literally hop two.
 *  4. the destination carries no route gate the SOURCE path does not already carry.
 *
 * Clause 4 is a deliberate generalization of #220's wording ("no ancestor of the destination is a
 * gate"). Taken literally that rule is unsatisfiable for a retired path whose canonical
 * replacement is *itself* gated — `/dashboard` → `/money` is the live example. What actually
 * makes a hop a single hop is that the redirect adds no NEW bounce: park the retired path inside
 * the same gate as its replacement and a non-holder is turned away once, at the source, instead of
 * being forwarded to a page that turns them away again. So the check is differential. For a source
 * carrying no gates at all it collapses to #220's literal rule.
 */
export function expectOneHop(sourcePath: string, to: string): void {
  const dest = pathnameOf(to)
  const leaf = leafInThisTable(dest)
  expect(leaf, `nothing in the route table matches ${dest}`).toBeDefined()
  expect(leaf?.route.path, `${dest} falls through to the not-found catch-all`).not.toBe('*')
  expect(isRedirect(leaf?.route.element), `${dest} is itself a redirect — that is hop two`).toBe(
    false,
  )
  const sourceGates = gatesOnPath(sourcePath)
  const added = gatesOnPath(dest).filter((g) => !sourceGates.includes(g))
  expect(added, `${sourcePath} → ${dest} adds gates the source does not carry`).toEqual([])
}

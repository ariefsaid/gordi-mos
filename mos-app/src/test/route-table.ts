// Helpers for asserting against the PRODUCTION route table (src/router.tsx).
//
// Why these exist (#217): assertions about redirects kept being written against a synthetic route
// tree mounted inside the test itself, so they stayed green whether or not the real table served
// the destination. Everything here resolves through `routeConfig` and react-router's own matcher,
// so deleting a route from the real table turns the assertion red.

import { Suspense, isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { Navigate, matchRoutes, type RouteObject } from 'react-router-dom'
import { routeConfig } from '@/router'
import { RouteRedirect } from '@/shell/route-redirect'
import { LoadingShell } from '@/components/ui/state-kit'
import { RequireCapability } from '@/auth/require-capability'
import { RequireAccessRole } from '@/auth/require-access-role'
import { AdminRoute } from '@/auth/admin-route'
import { can } from '@/lib/capabilities'

/** Every route entry in the table, flattened depth-first (pathless layout routes included). */
export function allRoutes(routes: RouteObject[] = routeConfig): RouteObject[] {
  return routes.flatMap((r) => [r, ...(r.children ? allRoutes(r.children) : [])])
}

export interface FlatRoute {
  /** The route's FULL path, resolved through its ancestors (`new` → `/work/tasks/new`). */
  path: string
  route: RouteObject
}

function joinPath(parent: string, segment: string): string {
  const joined = segment.startsWith('/') ? segment : `${parent}/${segment}`
  const collapsed = joined.replace(/\/+/g, '/')
  return collapsed === '/' ? collapsed : collapsed.replace(/\/$/, '')
}

/**
 * The table flattened with each route's FULL path resolved. Pathless routes (the auth gates, the
 * shell layout route, the capability gates) inherit their parent's path and are kept, so a caller
 * can still see them — filter on `route.element` when only surfaces matter.
 */
export function flattenRoutes(routes: readonly RouteObject[] = routeConfig, parent = ''): FlatRoute[] {
  return routes.flatMap((route) => {
    const path = route.index || route.path === undefined ? parent || '/' : joinPath(parent, route.path)
    return [{ path, route }, ...(route.children ? flattenRoutes(route.children, path) : [])]
  })
}

/**
 * True when the route element forwards somewhere else instead of rendering a surface.
 *
 * Two shapes count: `<RouteRedirect>` (every entry in the redirect map) and a bare `<Navigate>`
 * (what a flag-off route falls back to). Both are hops, and the one-hop assertion has to see
 * both — a destination that is itself a flag-off `<Navigate>` is as much a second hop as one that
 * is a redirect-map entry.
 */
export function isRedirect(element: ReactNode): boolean {
  return isValidElement(element) && (element.type === Navigate || element.type === RouteRedirect)
}

/**
 * The `to` a redirect element carries, and whether it replaces the history entry.
 *
 * `<RouteRedirect>` takes no `replace` prop because it always replaces — that is part of what the
 * component IS, and `route-redirect.test.tsx` proves it behaviourally (navigate through one, then
 * go Back, and land where you came from rather than back on the retired path). Reading `true` off
 * the component's identity here would be circular if that test did not exist; it does.
 */
export function redirectProps(element: ReactNode): { to: string; replace: boolean } {
  if (!isRedirect(element)) throw new Error('route element is not a redirect')
  const el = element as ReactElement<{ to: string; replace?: boolean }>
  if (el.type === RouteRedirect) return { to: String(el.props.to), replace: true }
  return { to: String(el.props.to), replace: el.props.replace === true }
}

export interface EnumeratedRedirect {
  from: string
  to: string
  replace: boolean
  /**
   * `map` — an entry of the redirect map: a retired path forwarding to its canonical replacement.
   * `flag-fallback` — a route that exists but is switched off, sending the viewer home. Both are
   * held to one hop; only `map` entries owe the caller their query string.
   */
  kind: 'map' | 'flag-fallback'
}

/** Every forwarding route, read off the real table rather than a hand-kept list. */
export function allRedirects(): EnumeratedRedirect[] {
  return flattenRoutes()
    .filter(({ route }) => isRedirect(route.element))
    .map(({ path, route }) => ({
      from: path,
      ...redirectProps(route.element),
      kind: (route.element as ReactElement).type === RouteRedirect ? ('map' as const) : ('flag-fallback' as const),
    }))
}

/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors React.lazy's own type parameter */
type MaybePreloadable = ComponentType<any> & {
  preload?: () => Promise<{ default: ComponentType<any> }>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The code-split payload behind a route element, or `undefined` when the element is not a
 * `<Suspense fallback={<LoadingShell/>}>` wrapper around a lazily-loaded component.
 *
 * The fallback identity is part of the check on purpose: a route split behind some other spinner
 * is still a split route, but it is not behind the app's ONE loading grammar, which is what
 * AC-019 asks for.
 */
export function lazyPayloadOf(element: ReactNode): MaybePreloadable | undefined {
  if (!isValidElement(element)) return undefined
  const el = element as ReactElement<{ fallback?: ReactNode; children?: ReactNode }>
  if (el.type !== Suspense) return undefined
  const fallback = el.props.fallback
  if (!isValidElement(fallback) || fallback.type !== LoadingShell) return undefined
  const child = el.props.children
  if (!isValidElement(child)) return undefined
  const payload = child.type as MaybePreloadable
  return typeof payload?.preload === 'function' ? payload : undefined
}

/**
 * The component a route ACTUALLY renders, resolved by running the route's own module loader.
 *
 * This is the difference between proving the wiring and trusting a label: the caller compares the
 * result against a statically imported page component by identity, so re-pointing a route at a
 * different module turns the assertion red no matter what the route's name or comment says.
 */
export async function resolvePageAt(path: string): Promise<ComponentType<unknown> | undefined> {
  const leaf = leafInThisTable(path)
  const payload = lazyPayloadOf(leaf?.route.element)
  if (!payload?.preload) return undefined
  return (await payload.preload()).default as ComponentType<unknown>
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
 * Does the ROUTE admit a viewer holding these access roles? (OD-WAY-51.)
 *
 * Evaluates the same three gates `gatesOnPath` enumerates, with the same logic the gate
 * components themselves use — `can()` for a capability gate, membership for an access-role gate,
 * `admin` for the admin gate. `ProtectedRoute` is not consulted: every path here is behind it, so
 * it can never distinguish two authenticated viewers.
 *
 * This is what lets the nav guard derive what SHOULD be rendered from the route table, instead of
 * from a hand-picked list of personas that can only ever confirm what someone already thought of.
 */
export function routeAdmits(path: string, accessRoles: readonly string[]): boolean {
  const matches = matchRoutes(routeConfig, pathnameOf(path)) ?? []
  return matches.every(({ route }) => {
    const el = route.element
    if (!isValidElement(el)) return true
    if (el.type === RequireCapability) {
      return can(accessRoles, (el.props as { capability: string }).capability)
    }
    if (el.type === RequireAccessRole) {
      const { anyOf } = el.props as { anyOf: readonly string[] }
      return anyOf.some((r) => accessRoles.includes(r))
    }
    if (el.type === AdminRoute) return accessRoles.includes('admin')
    return true
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

/**
 * AC-017 over the WHOLE redirect map, as one reusable suite.
 *
 * It lives here rather than in a single spec file because the map's shape depends on the feature
 * flags: with `SHOW_PLAN_BUDGET` and `SHOW_FOLLOWUPS` off, `/plan/budget` and `/plan/pricing` are
 * flag fallbacks to `/`, and their real destinations — `/money/budget`, `/money/pricing` — are
 * never asserted at all. Running the same enumeration under both flag configurations is what makes
 * every published row of the map actually backed by a test rather than by the half of the table
 * the default configuration happens to expose.
 *
 * Call it from a spec that has already mocked `config/features` the way it wants.
 */
export function describeRedirectMap(configuration: string): void {
  const redirects = allRedirects()

  describe(`AC-017 (${configuration}): every retired route reaches its replacement in one hop`, () => {
    it('the map is not empty — the enumeration itself has to be able to fail', () => {
      // The floor dropped from 15 with the ship gate (#444): six retired paths named a surface
      // that is now hidden (`/dashboard` → `/money`, `/objectives` → `/work/objectives`, …), and
      // rather than forward a viewer onto a route that forwards them again they now name Home,
      // which moves them into the `flag-fallback` bucket. They are still enumerated and still
      // held to one hop by the cases below — only this bucket count shrank.
      expect(redirects.filter((r) => r.kind === 'map').length).toBeGreaterThan(10)
    })

    it.each(redirects.map((r) => [r.from, r.to, r.kind] as const))(
      '%s → %s (%s) lands on a live surface, adds no gate, and does not chain',
      (from, to) => {
        expectOneHop(from, to)
      },
    )

    it.each(redirects.map((r) => [r.from, r.replace] as const))(
      '%s replaces its history entry, so Back does not re-enter it',
      (_from, replace) => {
        expect(replace).toBe(true)
      },
    )

    it('no redirect names another redirect — the whole map is depth one', () => {
      const chained = redirects.filter(({ to }) => {
        const leaf = leafInThisTable(pathnameOf(to))
        return isRedirect(leaf?.route.element)
      })
      expect(chained).toEqual([])
    })
  })
}

// Route classification — every entry in the route table declares what KIND of thing it is.
//
// Three kinds, and the set is closed:
//   • page           — a surface a viewer lands on, tagged with its page family (page-families.ts)
//   • redirect       — a retired path whose only job is to forward to its canonical replacement
//   • infrastructure — auth gates, the shell layout route, capability gates, the not-found
//                      catch-all, and DEV-only harnesses: routes with no surface of their own
//
// `assertRouteClassification` throws on any route that declares no handle, or declares a malformed
// one. Because it runs over the REAL `routeConfig` in a test, adding a route without classifying it
// fails the suite — which is what keeps the table enumerable for the routing ACs (AC-017…AC-021).
//
// Ported from `v4-redesign`. The v4 file named every export `v3*` (`v3Page`, `V3RouteHandle`,
// `collectV3Routes`) — a leftover from the v3 redesign line that had nothing to do with what the
// code does. Carrying a stale version number into the v4 port would credit the wrong thing, so the
// names describe the mechanism instead. Behaviour is unchanged.

import type { RouteObject } from 'react-router-dom'
import { PAGE_FAMILIES, type PageFamily } from './page-families'

export type InfrastructureReason =
  | 'auth'
  | 'layout'
  | 'capability'
  | 'public'
  | 'dev-only'
  | 'not-found'

export type RouteHandle =
  | { kind: 'page'; family: PageFamily }
  | { kind: 'redirect'; target: string }
  | { kind: 'infrastructure'; reason: InfrastructureReason }

export interface ClassifiedRoute {
  path: string
  handle: RouteHandle
}

const INFRASTRUCTURE_REASONS: readonly InfrastructureReason[] = [
  'auth',
  'layout',
  'capability',
  'public',
  'dev-only',
  'not-found',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = [...keys].sort()
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  )
}

function isPageFamily(value: unknown): value is PageFamily {
  return typeof value === 'string' && (PAGE_FAMILIES as readonly string[]).includes(value)
}

function isInfrastructureReason(value: unknown): value is InfrastructureReason {
  return typeof value === 'string' && INFRASTRUCTURE_REASONS.includes(value as InfrastructureReason)
}

function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  const collapsed = withLeadingSlash.replace(/\/+/g, '/')
  if (collapsed === '/') return collapsed
  return collapsed.replace(/\/$/, '')
}

function resolveRoutePath(parentPath: string, route: RouteObject): string {
  if (route.index || route.path === undefined) return parentPath || '/'
  const routePath = route.path
  if (routePath.startsWith('/')) return normalizePath(routePath)
  return normalizePath(`${parentPath}/${routePath}`)
}

function readHandle(route: RouteObject, path: string): RouteHandle {
  if (!isRecord(route.handle)) {
    throw new Error(`Route "${path}" is missing a route handle`)
  }

  const handle = route.handle
  if (typeof handle.kind !== 'string') {
    throw new Error(`Route "${path}" has a handle without a valid kind`)
  }

  if (handle.kind === 'page') {
    if (!hasExactKeys(handle, ['kind', 'family']) || !isPageFamily(handle.family)) {
      throw new Error(`Route "${path}" has an invalid page family handle`)
    }
    return { kind: 'page', family: handle.family }
  }

  if (handle.kind === 'redirect') {
    if (!hasExactKeys(handle, ['kind', 'target']) || typeof handle.target !== 'string') {
      throw new Error(`Route "${path}" has an invalid redirect handle`)
    }
    if (
      !handle.target.startsWith('/') ||
      handle.target.startsWith('//') ||
      /\s/.test(handle.target)
    ) {
      throw new Error(`Route "${path}" has an invalid redirect target`)
    }
    return { kind: 'redirect', target: handle.target }
  }

  if (handle.kind === 'infrastructure') {
    if (!hasExactKeys(handle, ['kind', 'reason']) || !isInfrastructureReason(handle.reason)) {
      throw new Error(`Route "${path}" has an invalid infrastructure reason`)
    }
    return { kind: 'infrastructure', reason: handle.reason }
  }

  throw new Error(`Route "${path}" has an unknown handle kind`)
}

function collectRoutes(
  routes: readonly RouteObject[],
  parentPath: string,
  result: ClassifiedRoute[],
) {
  for (const route of routes) {
    const path = resolveRoutePath(parentPath, route)
    result.push({ path, handle: readHandle(route, path) })
    if (route.children) collectRoutes(route.children, path, result)
  }
}

export function pageHandle(family: PageFamily): RouteHandle {
  return { kind: 'page', family }
}

export function redirectHandle(target: string): RouteHandle {
  return { kind: 'redirect', target }
}

export function infrastructureHandle(reason: InfrastructureReason): RouteHandle {
  return { kind: 'infrastructure', reason }
}

export function collectClassifiedRoutes(
  routes: readonly RouteObject[],
  parentPath = '',
): ClassifiedRoute[] {
  const result: ClassifiedRoute[] = []
  collectRoutes(routes, normalizePath(parentPath || '/'), result)
  return result
}

export function assertRouteClassification(routes: readonly RouteObject[]): void {
  collectClassifiedRoutes(routes)
}

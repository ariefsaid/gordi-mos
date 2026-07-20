import type { RouteObject } from 'react-router-dom'
import {
  PAGE_FAMILIES,
  type PageFamily,
} from './page-families'

export type InfrastructureReason =
  | 'auth'
  | 'layout'
  | 'capability'
  | 'public'
  | 'dev-only'
  | 'not-found'

export type V3RouteHandle =
  | { kind: 'page'; family: PageFamily }
  | { kind: 'redirect'; target: string }
  | { kind: 'infrastructure'; reason: InfrastructureReason }

export interface ClassifiedV3Route {
  path: string
  handle: V3RouteHandle
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
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
}

function isPageFamily(value: unknown): value is PageFamily {
  return typeof value === 'string' && (PAGE_FAMILIES as readonly string[]).includes(value)
}

function isInfrastructureReason(value: unknown): value is InfrastructureReason {
  return typeof value === 'string' && INFRASTRUCTURE_REASONS.includes(value as InfrastructureReason)
}

function resolveRoutePath(parentPath: string, route: RouteObject): string {
  if (route.index || route.path === undefined) return parentPath || '/'

  const routePath = route.path
  if (routePath.startsWith('/')) return normalizePath(routePath)
  return normalizePath(`${parentPath}/${routePath}`)
}

function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  const collapsed = withLeadingSlash.replace(/\/+/g, '/')
  if (collapsed === '/') return collapsed
  return collapsed.replace(/\/$/, '')
}

function readHandle(route: RouteObject, path: string): V3RouteHandle {
  if (!isRecord(route.handle)) {
    throw new Error(`Route "${path}" is missing a V3 route handle`)
  }

  const handle = route.handle
  if (typeof handle.kind !== 'string') {
    throw new Error(`Route "${path}" has a V3 handle without a valid kind`)
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
    if (!handle.target.startsWith('/') || handle.target.startsWith('//') || /\s/.test(handle.target)) {
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

  throw new Error(`Route "${path}" has an unknown V3 handle kind`)
}

function collectRoutes(
  routes: readonly RouteObject[],
  parentPath: string,
  result: ClassifiedV3Route[],
) {
  for (const route of routes) {
    const path = resolveRoutePath(parentPath, route)
    result.push({ path, handle: readHandle(route, path) })
    if (route.children) collectRoutes(route.children, path, result)
  }
}

export function v3Page(family: PageFamily): V3RouteHandle {
  return { kind: 'page', family }
}

export function v3Redirect(target: string): V3RouteHandle {
  return { kind: 'redirect', target }
}

export function v3Infrastructure(reason: InfrastructureReason): V3RouteHandle {
  return { kind: 'infrastructure', reason }
}

export function collectV3Routes(
  routes: readonly RouteObject[],
  parentPath = '',
): ClassifiedV3Route[] {
  const result: ClassifiedV3Route[] = []
  collectRoutes(routes, normalizePath(parentPath || '/'), result)
  return result
}

export function assertV3RouteConfig(routes: readonly RouteObject[]): void {
  collectV3Routes(routes)
}

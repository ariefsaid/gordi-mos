import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import { routeConfig } from '@/router'
import {
  assertRouteClassification,
  collectClassifiedRoutes,
  type RouteHandle,
} from './route-classification'

describe('route classification', () => {
  it('rejects a route object that declares no handle', () => {
    const routes: RouteObject[] = [{ path: '/unclassified', element: null }]
    expect(() => assertRouteClassification(routes)).toThrow(/handle/i)
  })

  it('rejects an unknown page family', () => {
    const routes: RouteObject[] = [
      { path: '/legacy', element: null, handle: { kind: 'page', family: 'legacy-page' } },
    ]
    expect(() => assertRouteClassification(routes)).toThrow(/family/i)
  })

  it('rejects a redirect handle whose target is not an absolute in-app path', () => {
    const routes: RouteObject[] = [
      { path: '/away', element: null, handle: { kind: 'redirect', target: '//elsewhere' } },
    ]
    expect(() => assertRouteClassification(routes)).toThrow(/target/i)
  })

  it('classifies every route in the real routeConfig — an unclassified route fails the suite', () => {
    expect(() => assertRouteClassification(routeConfig)).not.toThrow()

    const families = new Set(
      collectClassifiedRoutes(routeConfig)
        .map(({ handle }) => handle)
        .filter((handle): handle is Extract<RouteHandle, { kind: 'page' }> => handle.kind === 'page')
        .map(({ family }) => family),
    )
    expect(families).toEqual(new Set(['workspace', 'focused-record', 'management']))
  })

  it("each redirect's declared target matches the path its element actually forwards to", () => {
    // The handle is metadata; the element is the behaviour. Nothing keeps them in step except
    // this, and a handle that disagrees with its element is a comment that lies.
    const declared = collectClassifiedRoutes(routeConfig)
      .filter(({ handle }) => handle.kind === 'redirect')
      .map(({ path, handle }) => [path, (handle as Extract<RouteHandle, { kind: 'redirect' }>).target])
    expect(declared.length).toBeGreaterThan(15)

    const flat = new Map<string, unknown>()
    const walk = (routes: readonly RouteObject[], parent: string) => {
      for (const route of routes) {
        const path =
          route.index || route.path === undefined
            ? parent || '/'
            : `${route.path.startsWith('/') ? '' : parent}/${route.path}`.replace(/\/+/g, '/')
        flat.set(path === '/' ? path : path.replace(/\/$/, ''), route.element)
        if (route.children) walk(route.children, path === '/' ? '' : path.replace(/\/$/, ''))
      }
    }
    walk(routeConfig, '')

    for (const [path, target] of declared) {
      const element = flat.get(path) as { props?: { to?: string } } | undefined
      expect(element?.props?.to, `${path} declares ${target}`).toBe(target)
    }
  })
})

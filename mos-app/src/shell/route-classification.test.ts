import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import { routeConfig } from '@/router'
import { assertV3RouteConfig, collectV3Routes } from './route-classification'

describe('V3 route classification', () => {
  it('rejects a route object without a V3 handle', () => {
    const routes: RouteObject[] = [{ path: '/unclassified', element: null }]

    expect(() => assertV3RouteConfig(routes)).toThrow(/handle/i)
  })

  it('rejects an unknown page family', () => {
    const routes: RouteObject[] = [
      {
        path: '/legacy',
        element: null,
        handle: { kind: 'page', family: 'legacy-page' },
      },
    ]

    expect(() => assertV3RouteConfig(routes)).toThrow(/family/i)
  })

  it('classifies every route in the real routeConfig into the three page families or infrastructure', () => {
    expect(() => assertV3RouteConfig(routeConfig)).not.toThrow()

    const families = new Set(
      collectV3Routes(routeConfig)
        .map(({ handle }) => handle)
        .filter((handle): handle is { kind: 'page'; family: 'workspace' | 'focused-record' | 'management' } => handle.kind === 'page')
        .map(({ family }) => family),
    )
    expect(families).toEqual(new Set(['workspace', 'focused-record', 'management']))
  })
})

// @vitest-environment-options {"url": "http://localhost:4400/"}
import { isValidElement } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyShipGate, ungatedRouteTable } from '@/router'
import { isShipGated } from '@/lib/ship-gate'
import { admittedModules, destinationForPath, goToEntries, pageGroupsFor } from './module-registry'
import { ADMIN_SECTIONS, sectionForPath, visibleSections } from './sections'

const PREVIEW_PATHS = ['/cafe/locations', '/cafe/locations/change-location', '/cafe/locations/move', '/cafe/stock-comparison', '/admin/modules', '/admin/access/modules']

function findRoute(routes: RouteObject[], target: string, parent = ''): RouteObject | undefined {
  for (const route of routes) {
    const path = route.path === undefined ? parent : `${parent}/${route.path}`.replace(/\/+/g, '/')
    if (route.path !== undefined && path === target) return route
    const inner = route.children ? findRoute(route.children, target, path) : undefined
    if (inner) return inner
  }
  return undefined
}
const closed = (route: RouteObject | undefined) => isValidElement(route?.element) && route.element.type === Navigate

const cafePaths = (roles: string[]) =>
  pageGroupsFor(admittedModules(roles).find((m) => m.id === 'cafe')!, roles).flatMap((group) => group.items.map((item) => item.path))

afterEach(() => vi.unstubAllEnvs())

describe('preview ship state without the local opt-in (the default, and every production build)', () => {
  it.each(PREVIEW_PATHS)('%s is gated and its route forwards away', (path) => {
    expect(isShipGated(path)).toBe(true)
    expect(findRoute(ungatedRouteTable, path)).toBeDefined()
    expect(closed(findRoute(applyShipGate(ungatedRouteTable), path))).toBe(true)
  })

  it('keeps the preview out of the Café menu, the command menu and the route owner lookup', () => {
    expect(cafePaths(['admin'])).toContain('/cafe/transfer-routes')
    expect(cafePaths(['admin'])).not.toContain('/cafe/locations')
    expect(cafePaths(['admin'])).not.toContain('/cafe/stock-comparison')
    expect(goToEntries(['admin']).map((entry) => entry.path)).not.toContain('/cafe/stock-comparison')
    expect(sectionForPath('/cafe/stock-comparison')).toBeNull()
    expect(goToEntries(['admin']).map((entry) => entry.path)).not.toContain('/cafe/locations')
    expect(sectionForPath('/cafe/locations')).toBeNull()
    expect(goToEntries(['admin']).map((entry) => entry.path)).toContain('/cafe/transfer-routes')
    expect(sectionForPath('/cafe/transfer-routes')?.labelKey).toBe('nav.cafe.transferRoutes')
    expect(destinationForPath('/admin/modules')).toBeNull()
    expect(visibleSections(ADMIN_SECTIONS, ['admin']).map((section) => section.path)).toEqual(['/admin/people', '/admin/teams', '/admin/access', '/admin/agents'])
  })

  it('keeps the old Access › Modules path closed too: it forwards away, never to the new page', () => {
    expect(isShipGated('/admin/access/modules')).toBe(true)
    expect(findRoute(ungatedRouteTable, '/admin/access/modules')).toBeDefined()
    expect(closed(findRoute(applyShipGate(ungatedRouteTable), '/admin/access/modules'))).toBe(true)
  })

  it('never gates the existing Transfer and Access routes', () => {
    expect(closed(findRoute(applyShipGate(ungatedRouteTable), '/cafe/transfer'))).toBe(false)
    expect(closed(findRoute(applyShipGate(ungatedRouteTable), '/admin/access'))).toBe(false)
    expect(cafePaths(['admin'])).toContain('/cafe/transfer')
  })
})

describe('preview ship state with the full local opt-in', () => {
  const optIn = () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_FUTURE_PREVIEW', '1')
  }

  it.each(PREVIEW_PATHS)('%s routes, and every navigation surface asks the same authority', (path) => {
    optIn()
    expect(isShipGated(path)).toBe(false)
    expect(closed(findRoute(applyShipGate(ungatedRouteTable), path))).toBe(false)
  })

  it('shows released Transfer routes in the Café Setup group and the command menu', () => {
    optIn() // Allows neighboring preview entries so the registry order is visible.
    expect(isShipGated('/cafe/transfer-routes')).toBe(false)
    const paths = cafePaths(['member'])
    expect(paths.indexOf('/cafe/transfer-routes')).toBe(paths.indexOf('/cafe/recipes') + 1)
    expect(paths.indexOf('/cafe/locations')).toBe(paths.indexOf('/cafe/transfer-routes') + 1)
    expect(goToEntries(['member']).map((entry) => entry.path)).toContain('/cafe/locations')
    expect(sectionForPath('/cafe/locations')?.labelKey).toBe('nav.cafe.locations')
    expect(goToEntries(['member']).map((entry) => entry.path)).toContain('/cafe/transfer-routes')
    expect(sectionForPath('/cafe/transfer-routes')?.labelKey).toBe('nav.cafe.transferRoutes')
    expect(destinationForPath('/admin/modules')?.id).toBe('admin')
    expect(visibleSections(ADMIN_SECTIONS, ['admin']).map((section) => section.path)).toEqual(['/admin/people', '/admin/teams', '/admin/access', '/admin/modules', '/admin/agents'])
  })

  it('shows Stock comparison right after Count for Count reviewers only', () => {
    optIn()
    for (const reviewer of ['ops_lead', 'admin', 'supervisor']) {
      const paths = cafePaths([reviewer])
      expect(paths.indexOf('/cafe/stock-comparison')).toBe(paths.indexOf('/cafe/count') + 1)
      expect(goToEntries([reviewer]).map((entry) => entry.path)).toContain('/cafe/stock-comparison')
    }
    for (const other of ['member', 'finance', 'manager']) {
      expect(cafePaths([other])).not.toContain('/cafe/stock-comparison')
      expect(goToEntries([other]).map((entry) => entry.path)).not.toContain('/cafe/stock-comparison')
    }
    expect(sectionForPath('/cafe/stock-comparison')?.labelKey).toBe('nav.cafe.stockComparison')
  })

  it('forwards the old Access › Modules path to the new page', () => {
    optIn()
    const legacy = findRoute(applyShipGate(ungatedRouteTable), '/admin/access/modules')
    expect(closed(legacy)).toBe(false)
    expect(isValidElement(legacy?.element) && (legacy.element.props as { to?: string }).to).toBe('/admin/modules')
  })

  it('is refused again when any one condition of the opt-in is missing', () => {
    optIn()
    vi.stubEnv('VITE_FUTURE_PREVIEW', '')
    expect(isShipGated('/cafe/locations')).toBe(true)
    optIn()
    vi.stubEnv('MODE', 'production')
    expect(isShipGated('/cafe/locations')).toBe(true)
    optIn()
    vi.stubEnv('VITE_FUTURE_PREVIEW_PORT', '4401')
    expect(isShipGated('/cafe/locations')).toBe(true)
  })
})

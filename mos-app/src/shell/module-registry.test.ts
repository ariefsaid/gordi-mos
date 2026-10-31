// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ModuleId } from '@/lib/db/module-settings'
import { effectiveModuleAccess } from '@/lib/module-access'
import {
  admittedModules, currentPagePath, destinationForPath, FIXED_AREAS, footerAreas, profileArea, globalNavigationDestinations, goToEntries, navModeFor, pageCount, pageGroupsFor,
  moneyDestinationForViewer, moneySectionsForViewer, phoneModuleForViewer, rememberModule, rowState, viewerAdmittedToRoute,
} from './module-registry'

const allModulesOn = (_moduleId: ModuleId, roleAdmitted = true) => roleAdmitted
const cafe = (roles: string[]) => admittedModules(roles, allModulesOn).find((m) => m.id === 'cafe')!
const cafePaths = (roles: string[]) => pageGroupsFor(cafe(roles), roles, allModulesOn).flatMap((group) => group.items.map((item) => item.path))

describe('the Staff module is its own switch', () => {
  it('shows for every role and ignores the Work switch', () => {
    const staffOnly = (moduleId: string) => moduleId === 'staff'
    expect(admittedModules(['member'], staffOnly).map((m) => m.id)).toEqual(['staff'])
    expect(goToEntries(['member'], staffOnly).map((e) => e.path)).toContain('/staff/shifts')
    expect(viewerAdmittedToRoute('/staff/shifts', ['member'], staffOnly)).toBe(true)
  })

  it('disappears from navigation and route admission when Staff is off for the org', () => {
    const staffOff = (moduleId: string) => moduleId !== 'staff'
    expect(admittedModules(['member'], staffOff).map((m) => m.id)).not.toContain('staff')
    expect(goToEntries(['member'], staffOff).map((e) => e.path)).not.toContain('/staff/shifts')
    expect(viewerAdmittedToRoute('/staff/shifts', ['member'], staffOff)).toBe(false)
  })
})

describe('the module registry feeds every navigation surface', () => {
  it('lists admitted modules in registry order, and never a ship-gated one', () => {
    expect(admittedModules(['finance'], allModulesOn).map((m) => m.id)).toEqual(['money', 'cafe', 'staff'])
    expect(admittedModules(['admin'], allModulesOn).map((m) => m.id)).not.toContain('ecommerce')
    expect(admittedModules(['admin'], allModulesOn).map((m) => m.id)).not.toContain('roastery')
  })


  it('keeps every admitted root available through the shared global navigation list', () => {
    const paths = globalNavigationDestinations(['finance'], allModulesOn).map((destination) => destination.primaryPath ?? destination.links[0].path)
    for (const path of ['/', '/work', '/money', '/cafe']) expect(paths).toContain(path)
    expect(paths).not.toContain('/inbox')
    expect(globalNavigationDestinations(['admin'], allModulesOn).map((destination) => destination.id)).not.toContain('money')
  })

  it('counts only enabled modules and removes disabled Work and module pages', () => {
    const cafeOnly = (moduleId: string) => moduleId === 'cafe'
    expect(admittedModules(['finance'], cafeOnly).map((module) => module.id)).toEqual(['cafe'])
    expect(navModeFor(['finance'], cafeOnly)).toBe('sidebar')
    expect(pageGroupsFor(FIXED_AREAS[1], ['ops_lead'], () => false)).toEqual([])
    const paths = goToEntries(['finance'], (moduleId) => moduleId !== 'money').map((entry) => entry.path)
    expect(paths).not.toContain('/money')
    expect(paths).not.toContain('/money/pending-bills')
    expect(paths).toContain('/')
    expect(paths).toContain('/inbox')
  })

  it('keeps org-off above personal Allow for Money pages and route admission', () => {
    const isOn = (_moduleId: ModuleId, roleAdmitted = true) => effectiveModuleAccess({
      released: true, orgEnabled: false, override: 'allow', roleAdmitted,
    }).available
    expect(moneySectionsForViewer(['finance'], isOn)).toEqual([])
    expect(moneyDestinationForViewer(['finance'], isOn)).toBeNull()
    expect(viewerAdmittedToRoute('/cafe/records', ['member'], isOn)).toBe(false)
    expect(viewerAdmittedToRoute('/money', ['finance'], isOn)).toBe(false)
  })

  it('retains personal Allow and Block when explicit module checks resolve role admission', () => {
    const allow = (_moduleId: ModuleId, roleAdmitted = true) => effectiveModuleAccess({
      released: true, orgEnabled: true, override: 'allow', roleAdmitted,
    }).available
    expect(admittedModules(['member'], allow).map((module) => module.id)).toContain('money')
    expect(viewerAdmittedToRoute('/money', ['member'], allow)).toBe(true)
    expect(admittedModules(['finance'], () => false)).toEqual([])
  })

  it('groups Café as home, Today, Stock, Close, Setup with Receipt issues straight after Receive', () => {
    const groups = pageGroupsFor(cafe(['ops_lead']), ['ops_lead'], allModulesOn)
    expect(groups.map((group) => group.headingKey)).toEqual([undefined, 'cafe.nav.today', 'cafe.nav.stock', 'cafe.nav.close', 'cafe.nav.setup'])
    expect(groups[1].items.map((item) => item.path)).toEqual(['/cafe/records', '/cafe/plan', '/cafe/production', '/cafe/transfer', '/cafe/waste'])
    expect(groups[2].items.map((item) => item.path)).toEqual(['/cafe/count', '/cafe/stock-comparison', '/cafe/receive', '/cafe/receive/issues', '/cafe/request', '/cafe/stock'])
    expect(groups[3].items.map((item) => item.path)).toEqual(['/cafe/review', '/cafe/pushes'])
  })

  it('keeps the admission gates: Review for leads and supervisors, Pushes for outbox readers, no old review rows', () => {
    expect(cafePaths([])).not.toContain('/cafe/review')
    expect(cafePaths(['supervisor'])).toContain('/cafe/review')
    expect(cafePaths(['supervisor'])).not.toContain('/cafe/pushes')
    expect(cafePaths(['ops_lead'])).toContain('/cafe/pushes')
    expect(pageGroupsFor(cafe(['manager']), ['manager'], allModulesOn, { canReadCafePushes: true })
      .flatMap((group) => group.items.map((item) => item.path))).toContain('/cafe/pushes')
    expect(pageGroupsFor(cafe(['manager']), ['manager'], allModulesOn)
      .flatMap((group) => group.items.map((item) => item.path))).not.toContain('/cafe/pushes')
    for (const roles of [[], ['supervisor'], ['ops_lead']]) {
      expect(cafePaths(roles)).not.toContain('/cafe/receive/review')
      expect(cafePaths(roles)).not.toContain('/cafe/request/review')
    }
  })

  it('admits Retail Ops readers to the direct Pushes route through the shared authority fact', () => {
    expect(viewerAdmittedToRoute('/cafe/pushes', ['manager'], allModulesOn, { canReadCafePushes: true })).toBe(true)
    expect(viewerAdmittedToRoute('/cafe/pushes', ['manager'], allModulesOn)).toBe(false)
  })

  it('omits an empty group rather than printing its heading', () => {
    expect(pageGroupsFor(cafe([]), [], allModulesOn).map((group) => group.headingKey)).toEqual([undefined, 'cafe.nav.today', 'cafe.nav.stock', 'cafe.nav.setup'])
  })

  it('treats a single-page module as one row with no branch', () => {
    const money = admittedModules(['manager'], allModulesOn).find((m) => m.id === 'money')!
    expect(pageCount(pageGroupsFor(money, ['manager'], allModulesOn))).toBe(1)
  })

  it('marks the longest matching page current, so Receipt issues is not Receive', () => {
    const groups = pageGroupsFor(cafe(['ops_lead']), ['ops_lead'], allModulesOn)
    expect(currentPagePath(groups, '/cafe/receive/issues')).toBe('/cafe/receive/issues')
    expect(currentPagePath(groups, '/cafe/receive')).toBe('/cafe/receive')
    expect(currentPagePath(groups, '/cafe')).toBe('/cafe')
  })

  it('names an area row a location while a page inside it is current, and the page itself otherwise', () => {
    expect(rowState('/cafe/review', '/cafe', '/cafe', '/cafe/review')).toBe('location')
    expect(rowState('/work', '/work', '/work', undefined)).toBe('page')
    expect(rowState('/profile/connected-agents', '/profile', '/profile', undefined)).toBe('location')
    expect(rowState('/money', '/cafe', '/cafe', undefined)).toBeUndefined()
    expect(rowState('/work', '/', '/', undefined)).toBeUndefined()
  })

  it('pins Admin settings only for admins; Personal profile lives in the account menu', () => {
    expect(footerAreas([]).map((d) => d.id)).toEqual([])
    expect(footerAreas(['admin']).map((d) => d.id)).toEqual(['admin'])
    expect(profileArea()?.primaryPath).toBe('/profile')
  })

  it('owns Inbox as a destination with no menu row, so the bell and breadcrumb still resolve it', () => {
    expect(destinationForPath('/inbox')?.id).toBe('inbox')
  })

})

describe('⌘K Go to reads the same registry', () => {
  const ids = (roles: string[]) => goToEntries(roles, allModulesOn).map((entry) => entry.path)

  it('offers every root, page and Review queue the viewer may open', () => {
    const paths = ids(['ops_lead'])
    for (const path of ['/', '/work', '/inbox', '/cafe', '/cafe/records', '/cafe/stock-comparison', '/cafe/receive/issues', '/cafe/review', '/cafe/review?queue=receipts', '/cafe/review?queue=requests', '/cafe/review?queue=failed-sends', '/cafe/pushes', '/profile']) {
      expect(paths).toContain(path)
    }
  })

  it('offers Pushes in Go to when the server reader fact admits a manager', () => {
    const paths = goToEntries(['manager'], allModulesOn, { canReadCafePushes: true }).map((entry) => entry.path)
    expect(paths).toContain('/cafe/pushes')
  })

  it('never offers a queue or page the viewer cannot open', () => {
    expect(ids(['supervisor'])).toContain('/cafe/review?queue=receipts')
    expect(ids(['supervisor'])).not.toContain('/cafe/review?queue=failed-sends')
    expect(ids([])).not.toContain('/cafe/review')
    expect(ids([])).not.toContain('/admin/people')
    expect(ids(['admin'])).toContain('/admin/people')
  })

  it('names where a page lives: Module › Group', () => {
    const count = goToEntries(['ops_lead'], allModulesOn).find((entry) => entry.path === '/cafe/count')!
    expect(count.trail).toEqual(['dest.cafe', 'cafe.nav.stock'])
  })
})

describe('the phone module tab', () => {
  beforeEach(() => window.localStorage.clear())

  it('names the module whose page is open', () => {
    expect(phoneModuleForViewer([], ['finance'], '/money/pending-bills', allModulesOn)?.id).toBe('money')
    expect(phoneModuleForViewer(['cafe'], ['finance'], '/money', allModulesOn)?.id).toBe('money')
  })

  it('elsewhere falls back to the last module visited, then the affiliation default', () => {
    expect(phoneModuleForViewer(['cafe'], ['finance'], '/', allModulesOn)?.id).toBe('cafe')
    rememberModule('money')
    expect(phoneModuleForViewer(['cafe'], ['finance'], '/work/tasks', allModulesOn)?.id).toBe('money')
  })

  it('does not restore a switched-off module through last-visit or affiliation fallback', () => {
    rememberModule('money')
    expect(phoneModuleForViewer(['money'], ['finance'], '/', (moduleId) => moduleId !== 'money')).toBeNull()
  })

  it('omits the slot when there is nothing to name, rather than making a module up', () => {
    expect(phoneModuleForViewer([], ['finance'], '/', allModulesOn)).toBeNull()
  })
})

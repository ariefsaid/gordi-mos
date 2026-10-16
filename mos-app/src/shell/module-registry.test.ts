import { beforeEach, describe, expect, it } from 'vitest'
import {
  admittedModules, currentPagePath, destinationForPath, FIXED_AREAS, footerAreas, goToEntries, navModeFor, pageCount, pageGroupsFor,
  phoneModuleForViewer, rememberModule, rowState,
} from './module-registry'

const cafe = (roles: string[]) => admittedModules(roles).find((m) => m.id === 'cafe')!
const cafePaths = (roles: string[]) => pageGroupsFor(cafe(roles), roles).flatMap((group) => group.items.map((item) => item.path))

describe('the module registry feeds every navigation surface', () => {
  it('lists admitted modules in registry order, and never a ship-gated one', () => {
    expect(admittedModules(['finance']).map((m) => m.id)).toEqual(['money', 'cafe'])
    expect(admittedModules(['admin']).map((m) => m.id)).not.toContain('ecommerce')
    expect(admittedModules(['admin']).map((m) => m.id)).not.toContain('roastery')
  })

  it('picks the shell by admitted module count, never by role', () => {
    expect(navModeFor([])).toBe('sidebar')
    expect(navModeFor(['ops_lead'])).toBe('sidebar')
    expect(navModeFor(['finance'])).toBe('panel')
    expect(navModeFor(['supervisor'])).toBe('panel')
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

  it('groups Café as home, Today, Stock, Close, Setup with Receipt issues straight after Receive', () => {
    const groups = pageGroupsFor(cafe(['ops_lead']), ['ops_lead'])
    expect(groups.map((group) => group.headingKey)).toEqual([undefined, 'cafe.nav.today', 'cafe.nav.stock', 'cafe.nav.close', 'cafe.nav.setup'])
    expect(groups[1].items.map((item) => item.path)).toEqual(['/cafe/records', '/cafe/plan', '/cafe/production', '/cafe/transfer', '/cafe/waste'])
    expect(groups[2].items.map((item) => item.path)).toEqual(['/cafe/count', '/cafe/stock-comparison', '/cafe/receive', '/cafe/receive/issues', '/cafe/request', '/cafe/stock'])
    expect(groups[3].items.map((item) => item.path)).toEqual(['/cafe/review', '/cafe/pushes'])
  })

  it('keeps the admission gates: Review for leads and supervisors, Sent to ESB for leads only, no old review rows', () => {
    expect(cafePaths([])).not.toContain('/cafe/review')
    expect(cafePaths(['supervisor'])).toContain('/cafe/review')
    expect(cafePaths(['supervisor'])).not.toContain('/cafe/pushes')
    expect(cafePaths(['ops_lead'])).toContain('/cafe/pushes')
    for (const roles of [[], ['supervisor'], ['ops_lead']]) {
      expect(cafePaths(roles)).not.toContain('/cafe/receive/review')
      expect(cafePaths(roles)).not.toContain('/cafe/request/review')
    }
  })

  it('omits an empty group rather than printing its heading', () => {
    expect(pageGroupsFor(cafe([]), []).map((group) => group.headingKey)).toEqual([undefined, 'cafe.nav.today', 'cafe.nav.stock', 'cafe.nav.setup'])
  })

  it('treats a single-page module as one row with no branch', () => {
    const money = admittedModules(['manager']).find((m) => m.id === 'money')!
    expect(pageCount(pageGroupsFor(money, ['manager']))).toBe(1)
  })

  it('marks the longest matching page current, so Receipt issues is not Receive', () => {
    const groups = pageGroupsFor(cafe(['ops_lead']), ['ops_lead'])
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

  it('pins Admin settings only for admins, and Personal profile for everyone', () => {
    expect(footerAreas([]).map((d) => d.id)).toEqual(['profile'])
    expect(footerAreas(['admin']).map((d) => d.id)).toEqual(['admin', 'profile'])
  })

  it('owns Inbox as a destination with no menu row, so the bell and breadcrumb still resolve it', () => {
    expect(destinationForPath('/inbox')?.id).toBe('inbox')
  })
})

describe('⌘K Go to reads the same registry', () => {
  const ids = (roles: string[]) => goToEntries(roles).map((entry) => entry.path)

  it('offers every root, page and Review queue the viewer may open', () => {
    const paths = ids(['ops_lead'])
    for (const path of ['/', '/work', '/inbox', '/cafe', '/cafe/records', '/cafe/stock-comparison', '/cafe/receive/issues', '/cafe/review', '/cafe/review?queue=receipts', '/cafe/review?queue=requests', '/cafe/review?queue=failed-sends', '/cafe/pushes', '/profile']) {
      expect(paths).toContain(path)
    }
  })

  it('never offers a queue or page the viewer cannot open', () => {
    expect(ids(['supervisor'])).toContain('/cafe/review?queue=receipts')
    expect(ids(['supervisor'])).not.toContain('/cafe/review?queue=failed-sends')
    expect(ids([])).not.toContain('/cafe/review')
    expect(ids([])).not.toContain('/admin/people')
    expect(ids(['admin'])).toContain('/admin/people')
  })

  it('names where a page lives: Module › Group', () => {
    const count = goToEntries(['ops_lead']).find((entry) => entry.path === '/cafe/count')!
    expect(count.trail).toEqual(['dest.cafe', 'cafe.nav.stock'])
  })
})

describe('the phone module tab', () => {
  beforeEach(() => window.localStorage.clear())

  it('names the module whose page is open', () => {
    expect(phoneModuleForViewer([], ['finance'], '/money/pending-bills')?.id).toBe('money')
    expect(phoneModuleForViewer(['cafe'], ['finance'], '/money')?.id).toBe('money')
  })

  it('elsewhere falls back to the last module visited, then the affiliation default', () => {
    expect(phoneModuleForViewer(['cafe'], ['finance'], '/')?.id).toBe('cafe')
    rememberModule('money')
    expect(phoneModuleForViewer(['cafe'], ['finance'], '/work/tasks')?.id).toBe('money')
  })

  it('does not restore a switched-off module through last-visit or affiliation fallback', () => {
    rememberModule('money')
    expect(phoneModuleForViewer(['money'], ['finance'], '/', (moduleId) => moduleId !== 'money')).toBeNull()
  })

  it('omits the slot when there is nothing to name, rather than making a module up', () => {
    expect(phoneModuleForViewer([], ['finance'], '/')).toBeNull()
  })
})

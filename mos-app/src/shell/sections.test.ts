import { describe, expect, it } from 'vitest'
import { CAFE_ROUTE_SECTIONS, CAFE_SECTIONS, sectionForPath, visibleSections } from './sections'

describe('Café navigation registry', () => {
  it('has one route record per path and preserves the four ordered job groups', () => {
    const paths = CAFE_ROUTE_SECTIONS.map(section => section.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(CAFE_SECTIONS.filter(section => !section.parentPath).map(section => section.path)).toEqual([
      '/cafe', '/cafe/records', '/cafe/plan', '/cafe/production', '/cafe/transfer', '/cafe/waste',
      '/cafe/count', '/cafe/stock-comparison', '/cafe/receive', '/cafe/request', '/cafe/stock',
      '/cafe/review', '/cafe/pushes', '/cafe/items', '/cafe/recipes', '/cafe/transfer-routes', '/cafe/locations',
    ])
    expect(CAFE_SECTIONS.filter(section => !section.parentPath).map(section => section.group)).toEqual([
      'cafe.nav.today', 'cafe.nav.today', 'cafe.nav.today', 'cafe.nav.today', 'cafe.nav.today', 'cafe.nav.today',
      'cafe.nav.stock', 'cafe.nav.stock', 'cafe.nav.stock', 'cafe.nav.stock', 'cafe.nav.stock',
      'cafe.nav.close', 'cafe.nav.close', 'cafe.nav.setup', 'cafe.nav.setup', 'cafe.nav.setup', 'cafe.nav.setup',
    ])
  })

  it('keeps Receipt issues under Receive and gives the old review paths no menu entry of their own', () => {
    const nested = CAFE_SECTIONS.filter(section => section.parentPath)
    expect(nested.map(section => [section.path, section.parentPath])).toEqual([
      ['/cafe/receive/issues', '/cafe/receive'],
    ])
    expect(sectionForPath('/cafe/receive/issues')?.labelKey).toBe('cafe.pageTitle.receiptIssues')
    // Receipt review and Request review redirect into Review's queues, so they resolve to their job, not to a menu row.
    expect(CAFE_SECTIONS.some(section => section.path === '/cafe/receive/review' || section.path === '/cafe/request/review')).toBe(false)
  })

  it('keeps the admission gates: Issues for everyone, Review for leads and supervisors, Sent to ESB for leads', () => {
    const nested = (roles: string[]) => visibleSections(CAFE_SECTIONS, roles).filter(section => section.parentPath).map(section => section.path)
    expect(nested([])).toEqual(['/cafe/receive/issues'])
    expect(nested(['supervisor'])).toEqual(['/cafe/receive/issues'])
    expect(nested(['ops_lead'])).toEqual(['/cafe/receive/issues'])
    expect(visibleSections(CAFE_SECTIONS, []).some(section => section.path === '/cafe/review' || section.path === '/cafe/pushes')).toBe(false)
    expect(visibleSections(CAFE_SECTIONS, ['supervisor']).some(section => section.path === '/cafe/review')).toBe(true)
    expect(visibleSections(CAFE_SECTIONS, ['supervisor']).some(section => section.path === '/cafe/pushes')).toBe(false)
  })
})

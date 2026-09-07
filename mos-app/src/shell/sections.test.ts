/**
 * sections.test.ts — Redesign Step 2 (T5). CAFE_SECTIONS remap (Kitchen → Café,
 * /cafe/* paths), events/money/signals/profile sections added, retired /updates
 * + /ops entries dropped. ADMIN_SECTIONS kept. FR-027 prep.
 */
import { SHIP_GATED_PATHS } from '@/lib/ship-gate'
import { describe, it, expect } from 'vitest'
import { SECTIONS, CAFE_SECTIONS, ADMIN_SECTIONS, sectionForPath, sectionHasPrefixChild } from './sections'

describe('T5: SECTIONS — workspace fallback registry', () => {
  it('home section resolves for /', () => {
    const s = sectionForPath('/')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Home')
  })

  it('retired /updates and /ops entries are absent', () => {
    expect(SECTIONS.some((s) => s.path === '/updates')).toBe(false)
    expect(SECTIONS.some((s) => s.path === '/ops')).toBe(false)
    expect(sectionForPath('/updates')).toBeNull()
    expect(sectionForPath('/ops')).toBeNull()
  })
})

describe('T5: CAFE_SECTIONS — the Café module\'s rail children (Issue 781, OD-WAY-95 (1)(3))', () => {
  // Issue 781: the Café root IS the Log now (KitchenLogPage at /cafe), and the opening is a door
  // row inside that root. So the rail children list carries neither Opening nor Log — a rail
  // that repeated the module root as a child would be a Café inside a Café — leaving Plan,
  // Stock, and the two role-gated leads' doors.
  it('exports Plan · Stock, then the two lead doors, in canonical order', () => {
    expect(CAFE_SECTIONS.map((s) => s.path)).toEqual([
      '/cafe/plan',
      '/cafe/stock',
      '/cafe/review',
      '/cafe/pushes',
    ])
  })

  it('carries neither Opening nor Log — /cafe IS the capture list, and the opening is a door row inside it (DESIGN.md § Navigation A1)', () => {
    expect(CAFE_SECTIONS.some((s) => s.path === '/cafe')).toBe(false)
    expect(CAFE_SECTIONS.some((s) => s.path === '/cafe/log')).toBe(false)
  })

  it('each section has a path, label, labelKey, and Icon', () => {
    CAFE_SECTIONS.forEach((s) => {
      expect(s.path).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.labelKey).toBeTruthy()
      expect(typeof s.Icon).toBe('function')
    })
  })

  it('sectionForPath resolves /cafe/review and /cafe/pushes', () => {
    expect(sectionForPath('/cafe/review')!.label).toBe('Review')
    expect(sectionForPath('/cafe/pushes')!.label).toBe('Pushes')
  })

  it('sectionForPath resolves /cafe/plan/anything by prefix (the specific leaf, not the /cafe root)', () => {
    expect(sectionForPath('/cafe/plan/anything')!.path).toBe('/cafe/plan')
  })

  it('Issue 781: sectionForPath resolves the exact /cafe path to the module root (Café), not a sub-route', () => {
    // The Log leaf is gone from CAFE_SECTIONS; /cafe now falls through to the SECTIONS registry
    // and resolves to the Café module root — the same name the rail draws for the Module.
    expect(sectionForPath('/cafe')!.label).toBe('Café')
  })
})

describe('T5: ADMIN_SECTIONS — kept (People)', () => {
  it('resolves /admin/people to People', () => {
    expect(ADMIN_SECTIONS.some((s) => s.path === '/admin/people')).toBe(true)
    expect(sectionForPath('/admin/people')!.label).toBe('People')
  })
})

describe('T5: new destination sections resolve', () => {
  it('sectionForPath resolves /profile and /work/signals', () => {
    expect(sectionForPath('/events')).toBeNull()
    expect(sectionForPath('/profile')!.label).toBe('Personal Profile')
    expect(sectionForPath('/work/signals')!.label).toBe('Signals')
  })

  it('sectionForPath resolves a sub-route by prefix', () => {
    // Was `/money/detail` → `/money`; Money is ship-gated (#444) and resolves to nothing now,
    // so the PREFIX behaviour itself is proven on a path that is still live. /cafe/plan carries
    // its own CAFE_SECTIONS entry, and a deeper path under it should still resolve to it.
    expect(sectionForPath('/cafe/plan/anything')!.path).toBe('/cafe/plan')
  })

  // #444 — the gate closes resolution, not just rendering. The router forwards a gated path home,
  // so the breadcrumb should never be asked; a resolver that still named the hidden surface would
  // be a second source of truth waiting to leak one.
  it.each([...SHIP_GATED_PATHS])(
    'sectionForPath finds nothing at the ship-gated %s',
    (path) => {
      expect(sectionForPath(path)).toBeNull()
    },
  )

  it('keeps non-navigation gated sections in the fallback registry', () => {
    const paths = SECTIONS.map((s) => s.path)
    for (const p of ['/money', '/work/objectives', '/ecommerce', '/roastery']) {
      expect(paths, `${p} was deleted from SECTIONS rather than gated`).toContain(p)
    }
  })
})

describe('T5: sectionForPath — fallbacks', () => {
  it('returns null for a truly unknown path', () => {
    expect(sectionForPath('/unknown-xyz')).toBeNull()
  })
})

describe('the Café children carry marks of their own (#457)', () => {
  // Several rungs, one picture: each Café tab gets its own mark so compact rail and phone drawer entries remain identifiable.
  it('the four children use four distinct components', () => {
    const icons = CAFE_SECTIONS.map((s) => s.Icon)
    expect(icons).toHaveLength(4)
    expect(new Set(icons).size).toBe(4)
  })

  it('none of them is a mark another destination already draws', () => {
    // The breadcrumb registries — SECTIONS and ADMIN_SECTIONS — and nothing more: the rail's own
    // rungs are inline literals in destinations.tsx, so a child borrowing ShieldIcon or WorkIcon
    // passes this. rail-glyph-uniqueness.test.tsx closes that by comparing what the rail actually
    // renders; this stays because it is fast and names the component.
    const elsewhere = new Set(
      [...SECTIONS, ...ADMIN_SECTIONS].filter((s) => !s.path.startsWith('/cafe/')).map((s) => s.Icon),
    )
    for (const s of CAFE_SECTIONS) {
      expect(elsewhere.has(s.Icon), `${s.path} borrows a mark from another destination`).toBe(false)
    }
  })
})

describe('sectionHasPrefixChild', () => {
  it('is false for every Café child — none of the four is another\'s parent', () => {
    // With Opening/Log gone, no CAFE_SECTIONS entry is a prefix of any other.
    for (const s of CAFE_SECTIONS) {
      expect(sectionHasPrefixChild(s, CAFE_SECTIONS), s.path).toBe(false)
    }
  })
})

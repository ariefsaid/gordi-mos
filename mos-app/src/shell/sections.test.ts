/**
 * sections.test.ts — Redesign Step 2 (T5). CAFE_SECTIONS remap (Kitchen → Café,
 * /cafe/* paths), events/money/signals/profile sections added, retired /updates
 * + /ops entries dropped. ADMIN_SECTIONS kept. FR-027 prep.
 */
import { describe, it, expect } from 'vitest'
import { SECTIONS, CAFE_SECTIONS, ADMIN_SECTIONS, sectionForPath } from './sections'

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

describe('T5: CAFE_SECTIONS — Kitchen re-homed under /cafe/*', () => {
  // Step 7 (cafe-retrofit.spec.md, RATIFY-7D): /cafe now hosts the "Start today's opening" home
  // (Opening) ahead of the re-homed kitchen screens (Log · Plan · Stock · Review · Pushes).
  it('exports Opening + the 5 café sections in canonical order', () => {
    expect(CAFE_SECTIONS.map((s) => s.path)).toEqual([
      '/cafe',
      '/cafe/log',
      '/cafe/plan',
      '/cafe/stock',
      '/cafe/review',
      '/cafe/pushes',
    ])
  })

  it('each section has a path, label, labelKey, and Icon', () => {
    CAFE_SECTIONS.forEach((s) => {
      expect(s.path).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.labelKey).toBeTruthy()
      expect(typeof s.Icon).toBe('function')
    })
  })

  it('sectionForPath resolves /cafe/log, /cafe/review, /cafe/pushes', () => {
    expect(sectionForPath('/cafe/log')!.label).toBe('Log')
    expect(sectionForPath('/cafe/review')!.label).toBe('Review')
    expect(sectionForPath('/cafe/pushes')!.label).toBe('Pushes')
  })

  it('sectionForPath resolves /cafe/plan/anything by prefix (the specific leaf, not the /cafe root)', () => {
    expect(sectionForPath('/cafe/plan/anything')!.path).toBe('/cafe/plan')
  })

  it('RATIFY-7D: sectionForPath resolves the exact /cafe path to Opening (not a sub-route)', () => {
    expect(sectionForPath('/cafe')!.label).toBe('Opening')
  })
})

describe('T5: ADMIN_SECTIONS — kept (People)', () => {
  it('resolves /admin/people to People', () => {
    expect(ADMIN_SECTIONS.some((s) => s.path === '/admin/people')).toBe(true)
    expect(sectionForPath('/admin/people')!.label).toBe('People')
  })
})

describe('T5: new destination sections resolve', () => {
  it('sectionForPath resolves Work Events, /money, /profile, /work/signals', () => {
    expect(sectionForPath('/work/events')!.label).toBe('Events')
    expect(sectionForPath('/events')).toBeNull()
    expect(sectionForPath('/money')!.label).toBe('Money')
    expect(sectionForPath('/profile')!.label).toBe('Personal Profile')
    expect(sectionForPath('/work/signals')!.label).toBe('Signals')
  })

  it('sectionForPath resolves /money/detail by prefix', () => {
    expect(sectionForPath('/money/detail')!.path).toBe('/money')
  })
})

describe('T5: sectionForPath — fallbacks', () => {
  it('returns null for a truly unknown path', () => {
    expect(sectionForPath('/unknown-xyz')).toBeNull()
  })
})

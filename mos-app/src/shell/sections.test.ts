/**
 * Unit tests for sectionForPath — covering both SECTIONS and KITCHEN_SECTIONS.
 * AC-KIT-006: kitchen paths resolve to a named section (non-empty breadcrumb).
 */
import { describe, it, expect } from 'vitest'
import { sectionForPath, KITCHEN_SECTIONS } from './sections'

describe('sectionForPath — workspace sections', () => {
  it('returns My Week for /', () => {
    const s = sectionForPath('/')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('My Week')
  })

  it('returns Tasks for /tasks', () => {
    const s = sectionForPath('/tasks')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Tasks')
  })

  it('returns Tasks for /tasks/some-id (prefix match)', () => {
    const s = sectionForPath('/tasks/abc-123')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Tasks')
  })

  it('returns null for an unknown path', () => {
    expect(sectionForPath('/unknown-xyz')).toBeNull()
  })
})

// AC-KIT-006: kitchen paths must resolve so the breadcrumb is non-empty.
describe('AC-KIT-006: sectionForPath — kitchen sections', () => {
  it('returns Log section for /kitchen/log', () => {
    const s = sectionForPath('/kitchen/log')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Log')
    expect(s!.path).toBe('/kitchen/log')
  })

  it('returns Plan section for /kitchen/plan', () => {
    const s = sectionForPath('/kitchen/plan')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Plan')
  })

  it('returns Stock section for /kitchen/stock', () => {
    const s = sectionForPath('/kitchen/stock')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Stock')
  })

  it('returns Review section for /kitchen/review', () => {
    const s = sectionForPath('/kitchen/review')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Review')
  })

  it('returns Pushes section for /kitchen/pushes', () => {
    const s = sectionForPath('/kitchen/pushes')
    expect(s).not.toBeNull()
    expect(s!.label).toBe('Pushes')
  })

  it('does NOT match /kitchen root (no trailing section)', () => {
    // /kitchen itself has no section entry — sections are leaf paths
    expect(sectionForPath('/kitchen')).toBeNull()
  })
})

describe('KITCHEN_SECTIONS export', () => {
  it('exports exactly 5 kitchen sections in the canonical order', () => {
    expect(KITCHEN_SECTIONS).toHaveLength(5)
    const labels = KITCHEN_SECTIONS.map((s) => s.label)
    expect(labels).toEqual(['Log', 'Plan', 'Stock', 'Review', 'Pushes'])
  })

  it('each section has a path, label, and Icon', () => {
    KITCHEN_SECTIONS.forEach((s) => {
      expect(s.path).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(typeof s.Icon).toBe('function')
    })
  })
})

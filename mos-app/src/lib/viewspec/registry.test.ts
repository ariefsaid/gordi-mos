import { describe, it, expect } from 'vitest'
import { registry } from './registry'

describe('registry — AC-UV-007', () => {
  it('exposes exactly the 5 live + 2 stub primitives', () => {
    expect(registry.keys().sort()).toEqual(['ChartFrame', 'CutToggle', 'DataTable', 'FreshnessLabel', 'KPITile', 'data-grid', 'doc-editor'])
  })
  it('5 live primitives have status "live"', () => {
    for (const n of ['KPITile', 'ChartFrame', 'CutToggle', 'DataTable', 'FreshnessLabel']) {
      expect(registry.get(n)?.status).toBe('live')
    }
  })
  it('2 stub primitives have status "stub"', () => {
    expect(registry.get('doc-editor')?.status).toBe('stub')
    expect(registry.get('data-grid')?.status).toBe('stub')
  })
  it('get returns undefined for unknown (never throws)', () => {
    expect(registry.get('nope')).toBeUndefined()
  })
})

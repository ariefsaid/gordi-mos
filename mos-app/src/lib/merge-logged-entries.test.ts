import { describe, expect, it } from 'vitest'
import { mergeSameLoggedEntries } from './merge-logged-entries'

const entry = (key: string, qty: number, over: object = {}) =>
  ({ key, item_unit_id: 'u1', unit_name: 'porsi', qty_porsi: qty, entry_quantity: qty, entry_unit_factor: 1, entry_unit_name: 'porsi', ...over })

describe('mergeSameLoggedEntries', () => {
  it('reads two 3-porsi entries as one 6 porsi, not "3 porsi" twice', () => {
    expect(mergeSameLoggedEntries([entry('log:a', 3), entry('log:b', 3)])).toEqual([entry('log:a', 6)])
  })
  it('keeps different multiples and unknown units apart', () => {
    const half = entry('log:c', 1, { entry_quantity: 2, entry_unit_factor: 0.5, entry_unit_name: 'each' })
    const unknown = { key: 'unknown:x', item_unit_id: null, unit_name: null, qty_porsi: 1 }
    expect(mergeSameLoggedEntries([entry('log:a', 3), half, unknown, unknown])).toHaveLength(4)
  })
})

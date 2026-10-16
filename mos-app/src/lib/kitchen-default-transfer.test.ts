import { describe, expect, it } from 'vitest'
import { defaultTransferMovement } from './kitchen-action-label'
import type { KitchenMovement, PlanMap, ProductionStream } from './db/kitchen-logs.types'

const hq = { id: 'b1', code: 'ghq', name: 'Gordi HQ' }
const origin: ProductionStream = { branch: hq, activity: 'bar', produces: true }
const toCikal: KitchenMovement = { action: 'transfer', destinationBranchId: 'b2' }
const toKitchen: KitchenMovement = { action: 'transfer', destinationBranchId: 'b1' }

describe('where a transfer starts', () => {
  it('prefers the viewer\'s own branch\'s other stream over another branch listed first', () => {
    expect(defaultTransferMovement([toCikal, toKitchen], origin, {})).toBe(toKitchen)
  })
  it('prefers a destination with something planned today', () => {
    const plan: PlanMap = { w1: { 'transfer:b2': 3 } }
    expect(defaultTransferMovement([toKitchen, toCikal], origin, plan)).toBe(toCikal)
  })
  it('falls back to the first destination, and to nothing when there is none', () => {
    expect(defaultTransferMovement([toCikal], origin, {})).toBe(toCikal)
    expect(defaultTransferMovement([], origin, {})).toBeUndefined()
  })
})

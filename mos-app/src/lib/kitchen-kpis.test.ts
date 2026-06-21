// computeKitchenKpis — pure derived-KPI selector (plan §5, parity-critical P-1).
// No React, no DB. Reads only line.plan_qty + line.qty_porsi for the current action_type.
// Worked example = mock C's numbers (plan §5.1): 180 / 140 / 175 / 35 / 78% / 4 / 46 / 6.

import { describe, it, expect } from 'vitest'
import { computeKitchenKpis } from './kitchen-kpis'
import type { KitchenLogLine, KitchenActionType } from '@/lib/db/kitchen-logs.types'

function line(
  wip_item_id: string,
  qty_porsi: number,
  plan_qty: number,
): KitchenLogLine {
  return {
    wip_item_id,
    qty_porsi,
    notes: '',
    plan_qty,
    stok: 0,
    tersedia: 0,
    dirty: qty_porsi > 0,
    error: '',
    capError: '',
  }
}

// The mock-C/A fixture for Production (plan §5.1):
// 6 planned: Nasi 48/50, Risoles 36/30, Ayam Gulai 25/25, Pisang 22/40, Sayur 9/15,
// Ayam Goreng Lengkuas 0/20; 3 off-plan logged: Ayam Suwir 12, Bakwan 15, Sambal 8.
const MOCK_C_LINES: Record<string, KitchenLogLine> = {
  nasi: line('nasi', 48, 50),
  risoles: line('risoles', 36, 30),
  gulai: line('gulai', 25, 25),
  pisang: line('pisang', 22, 40),
  sayur: line('sayur', 9, 15),
  goreng: line('goreng', 0, 20),
  suwir: line('suwir', 12, 0),
  bakwan: line('bakwan', 15, 0),
  sambal: line('sambal', 8, 0),
}

const PROD: KitchenActionType = 'Production'

describe('computeKitchenKpis — mock-C fixture (plan §5.1)', () => {
  const kpis = computeKitchenKpis(MOCK_C_LINES, PROD)

  it('plannedTotal = Σ plan_qty over planned items = 180', () => {
    expect(kpis.plannedTotal).toBe(180)
  })

  it('madeOfPlan = Σ qty_porsi over planned items (uncapped) = 140', () => {
    expect(kpis.madeOfPlan).toBe(140)
  })

  it('madeSoFar = Σ qty_porsi over ALL staged (qty>0) = 175', () => {
    expect(kpis.madeSoFar).toBe(175)
  })

  it('madeOffPlan = madeSoFar − madeOfPlan = 35', () => {
    expect(kpis.madeOffPlan).toBe(35)
  })

  it('pctComplete = round(madeOfPlan/plannedTotal*100) = 78', () => {
    expect(kpis.pctComplete).toBe(78)
  })

  it('itemsRemaining = count of planned items where qty < plan = 4', () => {
    expect(kpis.itemsRemaining).toBe(4)
  })

  it('unitsShort = Σ max(plan−qty, 0) over planned = 46', () => {
    expect(kpis.unitsShort).toBe(46)
  })

  it('plannedDishCount = count of planned items = 6', () => {
    expect(kpis.plannedDishCount).toBe(6)
  })
})

describe('computeKitchenKpis — edge cases', () => {
  it('no plan for this action_type (plannedTotal===0): pctComplete=0, madeSoFar counts off-plan', () => {
    const onlyOffPlan: Record<string, KitchenLogLine> = {
      a: line('a', 5, 0),
      b: line('b', 0, 0),
    }
    const k = computeKitchenKpis(onlyOffPlan, PROD)
    expect(k.plannedTotal).toBe(0)
    expect(k.madeOfPlan).toBe(0)
    expect(k.madeSoFar).toBe(5)
    expect(k.madeOffPlan).toBe(5)
    expect(k.pctComplete).toBe(0) // never divides by zero
    expect(k.itemsRemaining).toBe(0)
    expect(k.unitsShort).toBe(0)
    expect(k.plannedDishCount).toBe(0)
  })

  it('zero entered (all qty 0): madeSoFar=0, itemsRemaining=count of planned, pctComplete=0', () => {
    const zero: Record<string, KitchenLogLine> = {
      a: line('a', 0, 10),
      b: line('b', 0, 5),
    }
    const k = computeKitchenKpis(zero, PROD)
    expect(k.madeSoFar).toBe(0)
    expect(k.madeOfPlan).toBe(0)
    expect(k.plannedTotal).toBe(15)
    expect(k.itemsRemaining).toBe(2)
    expect(k.unitsShort).toBe(15)
    expect(k.pctComplete).toBe(0)
  })

  it('over-plan: pctComplete can exceed 100, itemsRemaining=0', () => {
    const over: Record<string, KitchenLogLine> = {
      a: line('a', 12, 10),
    }
    const k = computeKitchenKpis(over, PROD)
    expect(k.pctComplete).toBe(120)
    expect(k.itemsRemaining).toBe(0)
    expect(k.unitsShort).toBe(0)
  })

  it('empty lines map → all zeros', () => {
    const k = computeKitchenKpis({}, PROD)
    expect(k).toEqual({
      plannedTotal: 0,
      madeOfPlan: 0,
      madeSoFar: 0,
      madeOffPlan: 0,
      pctComplete: 0,
      itemsRemaining: 0,
      unitsShort: 0,
      plannedDishCount: 0,
    })
  })
})

// B4 (OD-K-5 redesign plan §2.4): computeStockKpis — the pure Stock KPI selector.
// Maps KitchenStockRow[] onto the reused KitchenKpis shape. Derived display only
// (P-1): client-side over already-fetched rows — no fetch/RPC/persistence. Pure
// (no React); unit-tested directly (mirrors kitchen-kpis.test.ts / kitchen-plan-kpis).
//
// OQ-3 note (flagged): KitchenKpiStrip reuses the Log-centric tile labels. The Stock
// mapping surfaces the four meaningful stock numbers onto the 4 slots:
//   tile 1 "Planned total"   → Items count          (itemCount)
//   tile 2 "Made so far"     → On-hand total        (Σ stok)
//   tile 3 "% complete"      → Deficit rate %       (neg / items * 100)
//   tile 4 "Items remaining" → Available total      (Σ tersedia)
// The labels are a known OQ-3 mismatch (owner deferred the strip generalization);
// the underlying numbers are faithful and no false-deficit alarm is shown.
//
// (computeReviewKpis is deferred to Phase F — the Review screen is out of scope this
// round and the selector has no A–E consumer; building it now would be dead code.)

import { describe, it, expect } from 'vitest'
import { computeStockKpis, computeStockKpiStripData } from './kitchen-stock-kpis'
import { translateFor } from '@/i18n/use-t'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

function row(wip_item_id: string, name: string, stok: number, tersedia: number): KitchenStockRow {
  return { wip_item_id, wip_item_name: name, stok, tersedia }
}

const ROWS: KitchenStockRow[] = [
  row('w1', 'Ayam Bakar', 12, 8),
  row('w2', 'Nasi Goreng', -3, -3),   // negative stock
  row('w3', 'Risoles', 0, 0),         // zero stock
  row('w4', 'Sate', 20, 15),
]

describe('computeStockKpis — the four meaningful stock numbers', () => {
  const kpis = computeStockKpis(ROWS)

  it('Items count = number of rows', () => {
    expect(kpis.plannedTotal).toBe(4) // mapped onto the tile-1 value slot
  })

  it('On-hand total = Σ stok (negatives preserved in the sum)', () => {
    expect(kpis.madeSoFar).toBe(12 + -3 + 0 + 20) // = 29
  })

  it('Available total = Σ tersedia (negatives preserved in the sum)', () => {
    expect(kpis.itemsRemaining).toBe(8 + -3 + 0 + 15) // = 20
  })

  it('Deficit rate = round(negative-item count / items * 100) → tile-3 % slot', () => {
    // 1 of 4 items is negative → 25%
    expect(kpis.pctComplete).toBe(25)
  })
})

describe('computeStockKpis — negatives drive the deficit rate (never clamped)', () => {
  it('two negatives of five → 40% deficit rate', () => {
    const kpis = computeStockKpis([
      row('w1', 'A', -1, -1),
      row('w2', 'B', -2, -2),
      row('w3', 'C', 5, 5),
      row('w4', 'D', 5, 5),
      row('w5', 'E', 5, 5),
    ])
    expect(kpis.pctComplete).toBe(40)
  })

  it('no negatives → 0% deficit', () => {
    const kpis = computeStockKpis([row('w1', 'A', 5, 3), row('w2', 'B', 0, 0)])
    expect(kpis.pctComplete).toBe(0)
  })
})

describe('computeStockKpis — no false-deficit delta (OQ-3)', () => {
  it('madeOfPlan === plannedTotal so the strip never shows a false "−N vs plan" on stock', () => {
    const kpis = computeStockKpis(ROWS)
    expect(kpis.madeOfPlan).toBe(kpis.plannedTotal)
  })
})

describe('computeStockKpis — edge: empty roster', () => {
  it('all-zero KitchenKpis when there are no rows', () => {
    expect(computeStockKpis([])).toEqual({
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

// #411 review: this function had NO direct test — the "existing pure-compute tests keep their
// single-argument call shape (they then assert the en fallback)" comment on its optional `t`
// described tests that did not exist; every real caller passes `t`. `t` is now required, and
// this is the coverage the comment claimed. It also pins the two sub-lines the port rewrote:
// the on-hand tile carries the unit of its headline number, and the available tile says what
// the figure is (transfer-ready), not that it accumulates.
describe('computeStockKpiStripData — the translated strip (#411)', () => {
  const strip = computeStockKpiStripData(ROWS, translateFor('en'))

  it('names the on-hand tile in its own unit', () => {
    const onHand = strip.tiles[0]
    expect(onHand.label).toBe('Total on-hand')
    expect(onHand.value).toBe('29') // 12 − 3 + 0 + 20
    expect(onHand.sub).toBe('portions')
  })

  it('describes the available total as transfer-ready, and claims nothing about accumulation', () => {
    const available = strip.tiles[3]
    expect(available.label).toBe('Available total')
    expect(available.value).toBe('20') // 8 − 3 + 0 + 15
    expect(available.sub).toBe('transfer-ready')
    expect(available.delta).not.toMatch(/cumulative/i)
  })

  it('resolves through the injected translator, not a private English copy', () => {
    const id = computeStockKpiStripData(ROWS, translateFor('id'))
    expect(id.tiles[0].label).toBe('Total stok fisik')
    expect(id.tiles[0].sub).toBe('porsi')
    expect(id.tiles[3].sub).toBe('siap ditransfer')
  })
})

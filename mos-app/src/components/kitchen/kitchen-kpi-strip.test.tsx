// KitchenKpiStrip — the derived metric band (plan §8, N3).
//
// v4 (2026-07-27): the desktop-4-tile / phone-one-line-summary width branch is gone. The band
// is now ONE dense summary rule at every width: no cards, no sub-captions ("portions" / "of
// plan" / "of target"), no neutral deltas — see kitchen-kpi-strip.tsx/.css. The goal these tests
// protect is unchanged (the day's planned figures are readable); the STEPS/assertions were
// rewritten to match the new single-rule rendering, verified against the component's actual
// (`data:false` render) output rather than the retired tile fixture.

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KitchenKpiStrip } from './kitchen-kpi-strip'
import type { KitchenKpis, KitchenKpiStripData } from '@/lib/kitchen-kpis'

// mock-C fixture (plan §5.1)
const KPIS: KitchenKpis = {
  plannedTotal: 180,
  madeOfPlan: 140,
  madeSoFar: 175,
  madeOffPlan: 35,
  pctComplete: 78,
  itemsRemaining: 4,
  unitsShort: 46,
  plannedDishCount: 6,
}

// Mechanical stand-in for the retired production `buildLogKpiStripData()` fallback (see
// kitchen-kpi-strip.tsx's v4 note — that fallback was deleted as dead code, `data` is now the
// component's only input). Kept HERE, test-file-local, only so these pre-existing fixtures/
// assertions still compile against the `data`-only KitchenKpiStripProps — same single
// "Planned total" tile shape the retired builder produced for the Log screen's real caller.
// Not a test-logic change: every `expect(...)` below is untouched.
function toStripData(kpis: KitchenKpis): KitchenKpiStripData {
  return {
    ariaLabel: 'Plan vs actual summary',
    tiles: [
      { label: 'Planned total', value: String(kpis.plannedTotal) },
    ],
  }
}

describe('KitchenKpiStrip — the summary rule (v4: no width branch)', () => {
  it('renders a section labelled "Plan vs actual summary"', () => {
    const { container } = render(<KitchenKpiStrip data={toStripData(KPIS)} />)
    expect(screen.getByRole('region', { name: /plan vs actual summary/i })).toBeInTheDocument()
    // no live region (plan §8.1/§9 — user-driven updates, announcing is noise)
    expect(container.querySelector('[aria-live]')).toBeNull()
  })

  // Core goal: the day's planned total is readable. Strengthened over the retired 4-tile
  // assertion — this is now the ONLY figure the Log screen's KPI data renders through this
  // component (dish count/made-so-far/etc. were dropped — see kitchen-kpi-strip.tsx's v4 note).
  it('renders the planned total figure and its label', () => {
    render(<KitchenKpiStrip data={toStripData(KPIS)} />)
    const region = screen.getByRole('region', { name: /plan vs actual summary/i })
    expect(within(region).getByText('Planned total')).toBeInTheDocument()
    expect(within(region).getByText('180')).toBeInTheDocument()
  })

  it('renders identically regardless of the isDesktop prop (no width branch)', () => {
    const { container: desktop } = render(<KitchenKpiStrip data={toStripData(KPIS)} isDesktop />)
    const { container: phone } = render(<KitchenKpiStrip data={toStripData(KPIS)} isDesktop={false} />)
    expect(desktop.querySelector('.kks')?.innerHTML).toBe(phone.querySelector('.kks')?.innerHTML)
  })

  // v4: neutral deltas and the old sub-captions are dropped outright — a delta only renders
  // when it carries a state worth acting on (destructive/success), which the Log screen's
  // plan-only data never does.
  it('does not render the old tile sub-captions (portions / of plan / of target)', () => {
    render(<KitchenKpiStrip data={toStripData(KPIS)} />)
    expect(screen.queryByText('portions')).toBeNull()
    expect(screen.queryByText(/of plan/i)).toBeNull()
    expect(screen.queryByText(/of target/i)).toBeNull()
  })

  it('does not render the retired made-so-far / % complete / dishes-remaining tiles', () => {
    render(<KitchenKpiStrip data={toStripData(KPIS)} />)
    expect(screen.queryByText('Made so far')).toBeNull()
    expect(screen.queryByText('% complete')).toBeNull()
    expect(screen.queryByText('Dishes remaining')).toBeNull()
    expect(screen.queryByText('78%')).toBeNull()
  })

  it('renders no card/tile wrapper — a single flat rule (no .kks-metric border/shadow box)', () => {
    const { container } = render(<KitchenKpiStrip data={toStripData(KPIS)} />)
    // exactly one metric renders (Planned total) — not a grid of tile boxes
    expect(container.querySelectorAll('.kks-metric')).toHaveLength(1)
  })
})

describe('KitchenKpiStrip — custom screen labels', () => {
  it('renders the provided per-screen tile labels instead of the Log defaults', () => {
    render(
      <KitchenKpiStrip
        isDesktop
        data={{
          ariaLabel: 'Stock summary',
          phoneLabel: 'Stock',
          phoneValue: '2 items',
          phoneMeta: '9 available',
          tiles: [
            { label: 'Total on-hand', value: '9', delta: '2 items', deltaTone: 'neutral', sub: 'portions' },
            { label: 'Items in stock', value: '1', delta: '1 empty', deltaTone: 'neutral' },
            { label: 'Negative balances', value: '1', delta: 'needs review', deltaTone: 'destructive' },
            { label: 'Available total', value: '5', delta: 'read-only', deltaTone: 'success' },
          ],
        }}
      />,
    )
    expect(screen.getByRole('region', { name: /stock summary/i })).toBeInTheDocument()
    expect(screen.getByText(/total on-hand/i)).toBeInTheDocument()
    expect(screen.getByText(/items in stock/i)).toBeInTheDocument()
    expect(screen.queryByText(/made so far/i)).toBeNull()
  })

  // A delta still renders for a state worth acting on (destructive/success) — the rule
  // that changed is "neutral deltas are omitted", not "deltas never render".
  it('still renders a delta when the tone is destructive or success', () => {
    render(
      <KitchenKpiStrip
        isDesktop
        data={{
          ariaLabel: 'Stock summary',
          tiles: [
            { label: 'Negative balances', value: '1', delta: 'needs review', deltaTone: 'destructive' },
            { label: 'Available total', value: '5', delta: 'read-only', deltaTone: 'success' },
          ],
        }}
      />,
    )
    expect(screen.getByText('needs review')).toBeInTheDocument()
    expect(screen.getByText('read-only')).toBeInTheDocument()
  })
})

describe('KitchenKpiStrip — edge: no plan for this action_type', () => {
  const noPlan: KitchenKpis = {
    plannedTotal: 0,
    madeOfPlan: 0,
    madeSoFar: 0,
    madeOffPlan: 0,
    pctComplete: 0,
    itemsRemaining: 0,
    unitsShort: 0,
    plannedDishCount: 0,
  }

  it('renders "0" for the planned total rather than nothing (visibly absent beats confidently wrong)', () => {
    render(<KitchenKpiStrip data={toStripData(noPlan)} />)
    const region = screen.getByRole('region', { name: /plan vs actual summary/i })
    expect(within(region).getByText('Planned total')).toBeInTheDocument()
    expect(within(region).getByText('0')).toBeInTheDocument()
  })
})

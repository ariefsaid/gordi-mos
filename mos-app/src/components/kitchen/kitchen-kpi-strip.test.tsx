// KitchenKpiStrip — the derived KPI band (plan §8, N3).
// Desktop: 4 DESIGN.md KPI tiles. Phone: one-line "Today · N planned · NN%" summary.
// Branches on isDesktop (one branch in the DOM — P-4).

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KitchenKpiStrip } from './kitchen-kpi-strip'
import type { KitchenKpis } from '@/lib/kitchen-kpis'

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

describe('KitchenKpiStrip — desktop branch', () => {
  it('renders a section labelled "Plan vs actual summary"', () => {
    const { container } = render(<KitchenKpiStrip kpis={KPIS} isDesktop actionType="Production" />)
    expect(screen.getByRole('region', { name: /plan vs actual summary/i })).toBeInTheDocument()
    // no live region (plan §8.1/§9 — user-driven updates, announcing is noise)
    expect(container.querySelector('[aria-live]')).toBeNull()
  })

  it('renders 4 KPI tiles with the fixture values', () => {
    render(<KitchenKpiStrip kpis={KPIS} isDesktop actionType="Production" />)
    const region = screen.getByRole('region', { name: /plan vs actual summary/i })
    // Planned total = 180
    expect(within(region).getByText('180')).toBeInTheDocument()
    // Made so far = 175
    expect(within(region).getByText('175')).toBeInTheDocument()
    // % complete = 78%
    expect(within(region).getByText('78%')).toBeInTheDocument()
    // Items remaining = 4
    expect(within(region).getByText('4')).toBeInTheDocument()
  })

  it('renders the delta chips: "6 dishes", off-plan "+35", short "−46 units short"', () => {
    render(<KitchenKpiStrip kpis={KPIS} isDesktop actionType="Production" />)
    const region = screen.getByRole('region', { name: /plan vs actual summary/i })
    // Planned-total delta: dish count
    expect(within(region).getByText(/6 dishes/i)).toBeInTheDocument()
    // Made-sofar: behind plan by 40 → destructive delta
    expect(within(region).getByText(/−40 vs plan/i)).toBeInTheDocument()
    // off-plan sub
    expect(within(region).getByText(/\+35 off-plan/i)).toBeInTheDocument()
    // items-remaining delta: units short
    expect(within(region).getByText(/−46 units short/i)).toBeInTheDocument()
  })

  it('renders tile captions (portions / of plan / of target)', () => {
    render(<KitchenKpiStrip kpis={KPIS} isDesktop actionType="Production" />)
    expect(screen.getByText(/portions/i)).toBeInTheDocument()
    expect(screen.getAllByText(/of plan/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/of target/i)).toBeInTheDocument()
  })
})

describe('KitchenKpiStrip — phone branch (one-line summary)', () => {
  it('renders the compact "Today · N planned · NN%" summary line', () => {
    render(<KitchenKpiStrip kpis={KPIS} isDesktop={false} actionType="Production" />)
    expect(screen.getByText(/today/i)).toBeInTheDocument()
    expect(screen.getByText(/6 planned/i)).toBeInTheDocument()
    expect(screen.getByText(/78%/i)).toBeInTheDocument()
  })

  it('does NOT render the 4 desktop tiles on phone', () => {
    render(<KitchenKpiStrip kpis={KPIS} isDesktop={false} actionType="Production" />)
    // the desktop region is absent on phone (one branch in the DOM — P-4)
    expect(screen.queryByRole('region', { name: /plan vs actual summary/i })).toBeNull()
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

  it('desktop: renders 0 / 0 / —% / 0 with "no plan set" deltas', () => {
    render(<KitchenKpiStrip kpis={noPlan} isDesktop actionType="Production" />)
    const region = screen.getByRole('region', { name: /plan vs actual summary/i })
    expect(within(region).getByText('—%')).toBeInTheDocument()
    expect(within(region).getAllByText(/no plan set/i).length).toBeGreaterThan(0)
  })

  it('phone: summary shows 0 planned and —%', () => {
    render(<KitchenKpiStrip kpis={noPlan} isDesktop={false} actionType="Production" />)
    expect(screen.getByText(/0 planned/i)).toBeInTheDocument()
    expect(screen.getByText(/—%/i)).toBeInTheDocument()
  })
})

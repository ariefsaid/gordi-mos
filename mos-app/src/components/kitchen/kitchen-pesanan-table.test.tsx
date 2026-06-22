// D1 (OD-K-5 redesign §5.2 PN-1): KitchenPesananTable — the desktop read-only pesanan
// <table>. One table with date group-headers (KitchenGroupHeader variant=table) + the
// 3 columns Item · Action · Planned (right-aligned tabular). Read-only — NO affordance.
// Imports the shared kitchen-table.css grammar (.kt-*). Token-only (DESIGN.md).

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KitchenPesananTable } from './kitchen-pesanan-table'
import type { PesananRow } from '@/lib/db/kitchen-logs.types'

const GROUPS: { date: string; items: PesananRow[] }[] = [
  {
    date: '2026-06-21',
    items: [
      { log_date: '2026-06-21', wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', action_type: 'Production', qty_porsi: 12 },
      { log_date: '2026-06-21', wip_item_id: 'w2', wip_item_name: 'Nasi Putih', action_type: 'Production', qty_porsi: 50 },
    ],
  },
  {
    date: '2026-06-28',
    items: [
      { log_date: '2026-06-28', wip_item_id: 'w3', wip_item_name: 'Risoles', action_type: 'Transfer to Radiant', qty_porsi: 8 },
    ],
  },
]

describe('KitchenPesananTable — structure (read-only)', () => {
  it('renders a labelled semantic table', () => {
    render(<KitchenPesananTable groups={GROUPS} />)
    const table = screen.getByRole('table')
    expect(table).toHaveAccessibleName(/planned items|pesanan/i)
  })

  it('renders Item · Action · Planned column headers (Planned right-aligned)', () => {
    render(<KitchenPesananTable groups={GROUPS} />)
    expect(screen.getByRole('columnheader', { name: /item/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /action/i })).toBeInTheDocument()
    const plannedTh = screen.getByRole('columnheader', { name: /planned/i })
    expect(plannedTh).toBeInTheDocument()
    expect(plannedTh.className).toContain('kt-th-num')
  })

  it('renders one row per planned item (across all dates)', () => {
    render(<KitchenPesananTable groups={GROUPS} />)
    // 3 items total across 2 dates (the group-header rows are not item rows)
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Putih')).toBeInTheDocument()
    expect(screen.getByText('Risoles')).toBeInTheDocument()
  })

  it('shows the planned qty per item (tabular, right-aligned)', () => {
    render(<KitchenPesananTable groups={GROUPS} />)
    const ayamRow = screen.getByText('Ayam Bakar').closest('tr')!
    expect(within(ayamRow).getByText('12')).toBeInTheDocument()
  })
})

describe('KitchenPesananTable — grouped by date', () => {
  it('renders a date group header per date with its item count', () => {
    const { container } = render(<KitchenPesananTable groups={GROUPS} />)
    const labels = Array.from(container.querySelectorAll('.kgh-label')).map(el => el.textContent)
    expect(labels).toEqual(['2026-06-21', '2026-06-28'])
  })
})

describe('KitchenPesananTable — read-only (AC-024)', () => {
  it('renders NO edit / save / approve / submit control', () => {
    render(<KitchenPesananTable groups={GROUPS} />)
    expect(screen.queryByRole('button', { name: /save|edit|approve|submit/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('KitchenPesananTable — edge: empty groups', () => {
  it('renders nothing when there are no date groups', () => {
    const { container } = render(<KitchenPesananTable groups={[]} />)
    expect(container.querySelector('table')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

// D2 (OD-K-5 redesign §5.2 PN-2): KitchenPesananCards — the phone reflow for pesanan.
// One card per date (KitchenGroupHeader variant=cards + a compact list of item rows).
// Read-only — NO affordance (AC-024). No stepper. Token-only (DESIGN.md); .kpcn-*.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KitchenPesananCards } from './kitchen-pesanan-cards'
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

describe('KitchenPesananCards — structure (read-only)', () => {
  it('renders every planned item across all dates', () => {
    render(<KitchenPesananCards groups={GROUPS} />)
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Putih')).toBeInTheDocument()
    expect(screen.getByText('Risoles')).toBeInTheDocument()
  })

  it('shows the planned qty per item', () => {
    render(<KitchenPesananCards groups={GROUPS} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})

describe('KitchenPesananCards — grouped by date', () => {
  it('renders a date group header per date with its item count', () => {
    const { container } = render(<KitchenPesananCards groups={GROUPS} />)
    const labels = Array.from(container.querySelectorAll('.kgh-label')).map(el => el.textContent)
    expect(labels).toEqual(['2026-06-21', '2026-06-28'])
  })
})

describe('KitchenPesananCards — read-only (AC-024)', () => {
  it('renders NO edit / save / approve / submit / stepper control', () => {
    render(<KitchenPesananCards groups={GROUPS} />)
    expect(screen.queryByRole('button', { name: /save|edit|approve|submit/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders NO table (phone cards branch — one branch in the DOM, P-4)', () => {
    render(<KitchenPesananCards groups={GROUPS} />)
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('KitchenPesananCards — edge: empty groups', () => {
  it('renders nothing when there are no date groups', () => {
    const { container } = render(<KitchenPesananCards groups={[]} />)
    expect(container.querySelector('.kpcn-section')).toBeNull()
  })
})

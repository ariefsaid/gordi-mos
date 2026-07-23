// KPITile tests — design-plan §2.1 (general KPI tile primitive, never says "revenue").
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { KPITile } from './kpi-tile'

describe('KPITile — ready state', () => {
  it('renders label, value, and sub', () => {
    render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" sub="4 branches" />)
    expect(screen.getByText('Trailing 7-day revenue')).toBeInTheDocument()
    expect(screen.getByText('Rp 128,4jt')).toBeInTheDocument()
    expect(screen.getByText('4 branches')).toBeInTheDocument()
  })

  it('applies .tabular to the value', () => {
    const { container } = render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" />)
    const value = screen.getByText('Rp 128,4jt')
    expect(value).toHaveClass('tabular')
    expect(container).toBeTruthy()
  })

  it('the value carries the no-mid-value-wrap class (fits one line, incl. long IDR/channel-mix strings)', () => {
    render(<KPITile label="Channel mix" value="POS 92% · B2B 8%" />)
    const value = screen.getByText('POS 92% · B2B 8%')
    expect(value).toHaveClass('kpi-tile-value')
    expect(value.className).toMatch(/nowrap/)
  })

  it('renders a success delta chip via the shared Pill', () => {
    render(
      <KPITile
        label="Trailing 7-day revenue"
        value="Rp 128,4jt"
        delta={{ text: '+12.4% vs prev 7d', tone: 'success' }}
      />,
    )
    expect(screen.getByText('+12.4% vs prev 7d')).toBeInTheDocument()
  })

  it('renders a destructive delta chip', () => {
    render(
      <KPITile
        label="Trailing 7-day revenue"
        value="Rp 88,0jt"
        delta={{ text: '−4.1% vs prev 7d', tone: 'destructive' }}
      />,
    )
    expect(screen.getByText('−4.1% vs prev 7d')).toBeInTheDocument()
  })

  it('renders a neutral "no comparison" delta', () => {
    render(
      <KPITile
        label="Trailing 7-day revenue"
        value="Rp 88,0jt"
        delta={{ text: 'no comparison', tone: 'neutral' }}
      />,
    )
    expect(screen.getByText('no comparison')).toBeInTheDocument()
  })

  it('omits the delta row entirely when delta is not provided', () => {
    const { container } = render(<KPITile label="Latest reporting-day revenue" value="Rp 18,2jt" />)
    expect(container.querySelector('.pill')).toBeNull()
  })

  it('renders a help tooltip text when provided', () => {
    render(<KPITile label="Channel mix" value="POS 82% · B2B 18%" help="Share of trailing-7d revenue by channel" />)
    expect(screen.getByLabelText(/share of trailing-7d revenue by channel/i)).toBeInTheDocument()
  })

  it('the label is the accessible name of the tile (a11y)', () => {
    render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" />)
    expect(screen.getByRole('group', { name: 'Trailing 7-day revenue' })).toBeInTheDocument()
  })
})

describe('KPITile — loading state', () => {
  it('renders the shared LoadingShell (status + skeleton), not the real value text', () => {
    // Cohesion-debt 2026-07-19, item #3: the tile now loads via the one loading
    // grammar — role=status + shared SkeletonRows — instead of a role=group
    // Pill-skeleton. Deliberate grammar change.
    const { container } = render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" state="loading" />)
    expect(screen.queryByText('Rp 128,4jt')).toBeNull()
    expect(container.querySelector('.pill--skeleton')).toBeNull()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.skeleton-row')).toBeInTheDocument()
  })
})

describe('KPITile — never shows misleading 0/NaN', () => {
  it('does not render "0" or "NaN" as the value in the loading state', () => {
    render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" state="loading" />)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('NaN')).toBeNull()
  })
})

// ── EXTENSIONS (Track C1 — onClick/selected/basis/dq) ─────────────────────────────
describe('KPITile — filter-in-place (onClick + selected, AC-016)', () => {
  it('AC-016: renders a <button> when onClick is provided (filter-in-place)', () => {
    render(<KPITile label="Trailing 7-day revenue" value="Rp 98,3 jt" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Trailing 7-day revenue' })).toBeInTheDocument()
  })

  it('AC-016: fires the onClick callback when the button is clicked', () => {
    const onClick = vi.fn()
    render(<KPITile label="Trailing 7-day revenue" value="Rp 98,3 jt" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Trailing 7-day revenue' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('AC-016: the selected tile carries aria-current="true"', () => {
    render(
      <KPITile label="Trailing 7-day revenue" value="Rp 98,3 jt" onClick={vi.fn()} selected />,
    )
    expect(screen.getByRole('button', { name: 'Trailing 7-day revenue' })).toHaveAttribute(
      'aria-current', 'true',
    )
  })

  it('AC-016: a selected tile carries the selected class for the primary ring', () => {
    const { container } = render(
      <KPITile label="Trailing 7-day revenue" value="Rp 98,3 jt" onClick={vi.fn()} selected />,
    )
    expect(container.querySelector('.kpi-tile.kpi-tile--selected')).not.toBeNull()
  })

  it('back-compat: renders a <div> (NOT a button) when onClick is omitted', () => {
    render(<KPITile label="Trailing 7-day revenue" value="Rp 98,3 jt" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('group', { name: 'Trailing 7-day revenue' })).toBeInTheDocument()
  })
})

describe('KPITile — basis label + DQ badge slots (AC-008)', () => {
  it('AC-008: renders the basis label text when provided', () => {
    render(
      <KPITile
        label="Gross margin %"
        value="62,4%"
        basis={{ label: 'interim — stock-movement' }}
      />,
    )
    expect(screen.getByText('interim — stock-movement')).toBeInTheDocument()
  })

  it('AC-008: renders a DQ badge when dq is provided', () => {
    render(
      <KPITile
        label="Gross margin %"
        value="62,4%"
        dq="partial"
      />,
    )
    expect(screen.getByText(/partial/i)).toBeInTheDocument()
  })

  it('AC-008: renders both basis + dq together (every GM/COGS tile)', () => {
    render(
      <KPITile
        label="Interim COGS"
        value="Rp 155,1 jt"
        basis={{ label: 'interim — stock-movement' }}
        dq="good"
      />,
    )
    expect(screen.getByText('interim — stock-movement')).toBeInTheDocument()
    expect(screen.getByText(/good/i)).toBeInTheDocument()
  })

  it('back-compat: renders neither basis nor dq when omitted (revenue tiles unchanged)', () => {
    const { container } = render(<KPITile label="Trailing 7-day revenue" value="Rp 98,3 jt" />)
    expect(container.querySelector('.kpi-tile-basis')).toBeNull()
    expect(container.querySelector('.dq-badge')).toBeNull()
  })

  it('r5 F-3 (structural pin): the delta pill hugs content — align-self: flex-start on .kpi-tile > .pill', () => {
    // jsdom computes no flex layout — the stylesheet is the oracle (same pattern as the
    // census-r3 span pin). The stretch-aligned tile column must never stretch the pill
    // into a full-width bar (1600) nor clip its copy (390).
    const css = readFileSync(resolve(__dirname, 'kpi-tile.css'), 'utf8')
    const block = css.split('.kpi-tile > .pill')[1]?.split('}')[0] ?? ''
    expect(block).toContain('align-self: flex-start')
  })
})

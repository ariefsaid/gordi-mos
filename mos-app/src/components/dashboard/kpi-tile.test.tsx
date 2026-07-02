// KPITile tests — design-plan §2.1 (general KPI tile primitive, never says "revenue").
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('renders skeleton blocks, not the real value text', () => {
    const { container } = render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" state="loading" />)
    expect(screen.queryByText('Rp 128,4jt')).toBeNull()
    expect(container.querySelector('.pill--skeleton')).toBeInTheDocument()
  })
})

describe('KPITile — never shows misleading 0/NaN', () => {
  it('does not render "0" or "NaN" as the value in the loading state', () => {
    render(<KPITile label="Trailing 7-day revenue" value="Rp 128,4jt" state="loading" />)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('NaN')).toBeNull()
  })
})

// GlobalToolbar tests — the one toolbar above both tabs (design-plan §2.8, FR-011/AC-011).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalToolbar } from './global-toolbar'
import type { WindowSpec } from '@/lib/dashboard'

const BOUNDS = { earliest: '2026-05-03', latest: '2026-07-01' }
const WINDOW: WindowSpec = { kind: 'preset', days: 30 }

describe('GlobalToolbar (AC-011)', () => {
  it('AC-011: renders the cut toggle, window selector, and freshness label together', () => {
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
        snapshotAsOf="2026-07-01T03:14:00Z"
      />,
    )
    // CutToggle (3 options)
    expect(screen.getByRole('tablist', { name: /cut dimension/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /branch/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /channel/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument()
    // WindowSelector
    expect(screen.getByRole('tablist', { name: /time window/i })).toBeInTheDocument()
    // FreshnessLabel
    expect(screen.getByText(/as of/i)).toBeInTheDocument()
  })

  it('AC-011: passes the cut change through onCutChange', () => {
    const onCutChange = vi.fn()
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={onCutChange}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
        snapshotAsOf="2026-07-01T03:14:00Z"
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /channel/i }))
    expect(onCutChange).toHaveBeenCalledWith('Channel')
  })

  it('AC-011: passes the window change through onWindowChange', () => {
    const onWindowChange = vi.fn()
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={onWindowChange}
        bounds={BOUNDS}
        snapshotAsOf="2026-07-01T03:14:00Z"
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /^7d$/i }))
    expect(onWindowChange).toHaveBeenCalledWith({ kind: 'preset', days: 7 })
  })

  it('renders the freshness timestamp when snapshotAsOf is provided', () => {
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
        snapshotAsOf="2026-07-01T03:14:00Z"
      />,
    )
    expect(screen.getByText(/2026/i)).toBeInTheDocument()
  })

  it('omits the freshness label when snapshotAsOf is null', () => {
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
        snapshotAsOf={null}
      />,
    )
    expect(screen.queryByText(/as of/i)).toBeNull()
  })

  it('AC-012: cut toggle carries all three options (Branch/Channel/Activity)', () => {
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
        snapshotAsOf="2026-07-01T03:14:00Z"
      />,
    )
    expect(screen.getByRole('tab', { name: /branch/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /channel/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument()
  })
})

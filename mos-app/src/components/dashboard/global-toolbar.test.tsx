// GlobalToolbar tests — the one toolbar above both tabs (design-plan §2.8, FR-011/AC-011).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalToolbar } from './global-toolbar'
import type { WindowSpec } from '@/lib/dashboard'

const BOUNDS = { earliest: '2026-05-03', latest: '2026-07-01' }
const WINDOW: WindowSpec = { kind: 'preset', days: 30 }
const CUSTOM: WindowSpec = { kind: 'custom', from: '2026-06-01', to: '2026-06-30' }

/** useIsDesktop keys off (min-width: 768px) — stub the viewport per test. */
function stubViewport(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true, configurable: true,
    value: (query: string) => ({
      matches: desktop && query.includes('768'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  stubViewport(false) // phone by default (mirrors the setup.ts matches:false stub)
})

describe('GlobalToolbar (AC-011)', () => {
  it('AC-011: renders the cut toggle and window selector together', () => {
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    // CutToggle (3 options)
    expect(screen.getByRole('tablist', { name: /cut dimension/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /branch/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /channel/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument()
    // WindowSelector
    expect(screen.getByRole('tablist', { name: /time window/i })).toBeInTheDocument()
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
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /^7d$/i }))
    expect(onWindowChange).toHaveBeenCalledWith({ kind: 'preset', days: 7 })
  })

  it('r5 F-6 (redundancy law): the toolbar NEVER renders a freshness stamp — head meta + chart own "as of"', () => {
    const { container } = render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(screen.queryByText(/as of/i)).toBeNull()
    expect(container.querySelector('.global-toolbar-freshness')).toBeNull()
    expect(container.querySelector('.freshness-label')).toBeNull()
  })

  it('DO-21: on phone, the Custom From/To pair renders on its own row BELOW the rail — never inline in the horizontal scroller — and all 3 cut options stay reachable', () => {
    const { container } = render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={CUSTOM}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    // The pair exists once, in the dedicated range row outside the scrolling rail.
    const rangeRow = container.querySelector('.global-toolbar-range-row')
    expect(rangeRow).not.toBeNull()
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    expect(rangeRow!.contains(from)).toBe(true)
    expect(rangeRow!.contains(to)).toBe(true)
    expect(container.querySelector('.global-toolbar-rail')!.contains(from)).toBe(false)
    // The seg's inline pair is suppressed — one DOM for the pair, not two.
    expect(container.querySelectorAll('.window-selector-range')).toHaveLength(1)
    // The cut axis survives Custom mode (the whole point of the row split).
    expect(screen.getByRole('tab', { name: /branch/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /channel/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument()
  })

  it('DO-21: the phone range row is wired — editing From emits onWindowChange with the custom spec', () => {
    const onWindowChange = vi.fn()
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={CUSTOM}
        onWindowChange={onWindowChange}
        bounds={BOUNDS}
      />,
    )
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-06-10' } })
    expect(onWindowChange).toHaveBeenCalledWith({
      kind: 'custom', from: '2026-06-10', to: '2026-06-30',
    })
  })

  it('DO-21: on desktop the Custom pair stays inline beside the seg — no separate range row', () => {
    stubViewport(true)
    const { container } = render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={CUSTOM}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(container.querySelector('.global-toolbar-range-row')).toBeNull()
    const from = screen.getByLabelText('From')
    expect(container.querySelector('.window-selector')!.contains(from)).toBe(true)
    expect(container.querySelectorAll('.window-selector-range')).toHaveLength(1)
  })

  it('AC-012: cut toggle carries all three options (Branch/Channel/Activity)', () => {
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(screen.getByRole('tab', { name: /branch/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /channel/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument()
  })
})

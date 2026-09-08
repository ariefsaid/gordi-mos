// GlobalToolbar tests — the one toolbar above both tabs (design-plan §2.8, FR-011/AC-011).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('AC-050 (#804): at phone width the toolbar is TWO full-width rows — window above cut — and every label is in the DOM with text', () => {
    const { container } = render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    const rail = container.querySelector('.global-toolbar-rail')!
    const groups = rail.querySelectorAll(':scope > .global-toolbar-group')
    expect(groups).toHaveLength(2)
    // Row 1 is the window axis; row 2 is the cut axis, in that order.
    expect(groups[0]).toHaveClass('global-toolbar-group--window')
    expect(groups[1]).toHaveClass('global-toolbar-group--cut')
    expect(within(groups[0] as HTMLElement).getByRole('tablist', { name: /time window/i })).toBeInTheDocument()
    expect(within(groups[1] as HTMLElement).getByRole('tablist', { name: /cut dimension/i })).toBeInTheDocument()
    // The CUT overline returns on phone — with its own row there is space to say what the row is.
    expect(groups[1].querySelector('.global-toolbar-overline')?.textContent?.trim()).toBe('Cut')
    // Every label is present AND non-empty (a clipped/ellipsised label would still be text here,
    // which is why the geometry that keeps it visible is pinned from the stylesheet below).
    for (const name of ['7d', '30d', '60d', 'Range', 'Branch', 'Channel', 'Activity']) {
      expect(screen.getByRole('tab', { name }).textContent?.trim()).not.toBe('')
    }
  })

  it('AC-050 (#804): the phone rows WRAP — the horizontal scroller and its fade are gone, so nothing is parked off-canvas', () => {
    // jsdom lays out nothing, so the stylesheet is the oracle for the geometry that makes the
    // two rows two rows. The old design put every pill on ONE nowrap row behind `overflow-x:
    // auto` + a mask fade; that IS the clipping this AC forbids, so its absence is asserted too.
    const css = readFileSync(resolve(process.cwd(), 'src/components/dashboard/global-toolbar.css'), 'utf8')
    const phone = css.split('@media (max-width: 767px)')[1] ?? ''
    expect(phone).not.toBe('')
    expect(phone).toMatch(/\.global-toolbar-rail\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(phone).toMatch(/\.global-toolbar-group\s*\{[^}]*flex:\s*1 0 100%/)
    expect(css).not.toMatch(/overflow-x:\s*auto/)
    expect(css).not.toMatch(/mask-image/)
    expect(css).not.toMatch(/flex-wrap:\s*nowrap/)
  })

  it('AC-050 (#804): on phone, Range opens a From · To · Apply sheet — and Apply is what commits the window', () => {
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
    // No sheet until asked for.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Range' }))

    const sheet = screen.getByRole('dialog', { name: /custom range/i })
    const from = within(sheet).getByLabelText('From')
    const to = within(sheet).getByLabelText('To')
    const apply = within(sheet).getByRole('button', { name: 'Apply' })
    // Seeded from the snapshot window and bounded to it (AC-014 grammar survives the move).
    expect(from).toHaveAttribute('min', BOUNDS.earliest)
    expect(to).toHaveAttribute('max', BOUNDS.latest)
    expect(to).toHaveValue(BOUNDS.latest)

    // Editing is a DRAFT — the page is not re-queried on every keystroke.
    fireEvent.change(from, { target: { value: '2026-06-10' } })
    expect(onWindowChange).not.toHaveBeenCalled()

    fireEvent.click(apply)
    expect(onWindowChange).toHaveBeenCalledWith({ kind: 'custom', from: '2026-06-10', to: BOUNDS.latest })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-050 (#804): the phone cut axis stays on screen while the Range sheet is open — one pair of date fields, never two', () => {
    const { container } = render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={CUSTOM}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Range' }))
    expect(container.querySelectorAll('.window-selector-range')).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'Branch' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Channel' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument()
  })

  it('AC-050 (#804): on phone the seg NEVER renders the inline pair — the sheet is the only place the dates live', () => {
    const { container } = render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={CUSTOM}
        onWindowChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(container.querySelector('.window-selector-range')).toBeNull()
    expect(screen.queryByLabelText('From')).toBeNull()
  })

  it('AC-050 (#804): phone Range sheet seeds from clamped to earliest when the data window is shorter than 30 days', () => {
    // Data window is only 5 days (2026-06-26 to 2026-07-01). The seeded "from" must equal
    // the earliest available day, not 29 days before "to" (which would be before the data).
    const shortBounds = { earliest: '2026-06-26', latest: '2026-07-01' }
    render(
      <GlobalToolbar
        cut="Branch"
        onCutChange={vi.fn()}
        window={WINDOW}
        onWindowChange={vi.fn()}
        bounds={shortBounds}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Range' }))
    const sheet = screen.getByRole('dialog', { name: /custom range/i })
    const from = within(sheet).getByLabelText('From')
    expect(from).toHaveValue(shortBounds.earliest)
  })

  it('on desktop the range pair stays inline beside the seg — no sheet, no separate row', () => {
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
    expect(screen.queryByRole('dialog')).toBeNull()
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

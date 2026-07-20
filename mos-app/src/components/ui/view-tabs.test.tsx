// ViewTabs tests — the ONE shared view-tab strip (DESIGN.md OD-P3-6, Wave-5
// archetype de-duplication). Replaces the deleted tab-strip.test.tsx coverage +
// adds the `soon`/`disabled` + enabled-only keyboard-nav contracts that the
// tasks Table/Board/Calendar grammar needs.
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ViewTabs } from './view-tabs'
import type { ViewTab } from './view-tabs'

// summary + detail(enabled, with count) + board(soon placeholder) — exercises every
// tab kind the two consumers surface (dashboard counts; tasks "soon" stubs).
const TABS: ViewTab[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'detail', label: 'Detail', count: 86 },
  { id: 'board', label: 'Board', soon: true },
]

describe('ViewTabs', () => {
  it('renders a tablist (named via ariaLabel) with a tab per entry', () => {
    render(<ViewTabs ariaLabel="View" tabs={TABS} active="summary" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: /view/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /summary/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /detail/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /board/i })).toBeInTheDocument()
  })

  it('marks the active tab aria-selected=true, others false', () => {
    render(<ViewTabs tabs={TABS} active="detail" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /detail/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /summary/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('the active tab carries the orange-underline class; inactive tabs do not', () => {
    render(<ViewTabs tabs={TABS} active="summary" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /summary/i })).toHaveClass('view-tabs__tab--active')
    expect(screen.getByRole('tab', { name: /detail/i })).not.toHaveClass('view-tabs__tab--active')
  })

  it('click switches the active tab via onChange', () => {
    const onChange = vi.fn()
    render(<ViewTabs tabs={TABS} active="summary" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /detail/i }))
    expect(onChange).toHaveBeenCalledWith('detail')
  })

  it('renders the optional count pill on a tab', () => {
    render(<ViewTabs tabs={TABS} active="summary" onChange={vi.fn()} />)
    expect(screen.getByText('86')).toBeInTheDocument()
  })

  it('does not call onChange when the active tab is clicked again', () => {
    const onChange = vi.fn()
    render(<ViewTabs tabs={TABS} active="summary" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /summary/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('soon / disabled placeholders', () => {
    it('a soon tab is aria-disabled + disabled + out of the tab order', () => {
      render(<ViewTabs tabs={TABS} active="summary" onChange={vi.fn()} />)
      const board = screen.getByRole('tab', { name: /board/i })
      expect(board).toBeDisabled()
      expect(board).toHaveAttribute('aria-disabled', 'true')
      expect(board).toHaveAttribute('tabindex', '-1')
    })

    it('a disabled tab is aria-disabled + out of the tab order', () => {
      const tabs: ViewTab[] = [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', disabled: true },
      ]
      render(<ViewTabs tabs={tabs} active="a" onChange={vi.fn()} />)
      const b = screen.getByRole('tab', { name: /^b$/i })
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute('aria-disabled', 'true')
      expect(b).toHaveAttribute('tabindex', '-1')
    })

    it('clicking a soon tab does NOT fire onChange', () => {
      const onChange = vi.fn()
      render(<ViewTabs tabs={TABS} active="summary" onChange={onChange} />)
      fireEvent.click(screen.getByRole('tab', { name: /board/i }))
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('roving tabindex + arrow-key navigation (enabled tabs only)', () => {
    it('only the active tab is tabindex=0; others are -1', () => {
      render(<ViewTabs tabs={TABS} active="summary" onChange={vi.fn()} />)
      expect(screen.getByRole('tab', { name: /summary/i })).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('tab', { name: /detail/i })).toHaveAttribute('tabindex', '-1')
      expect(screen.getByRole('tab', { name: /board/i })).toHaveAttribute('tabindex', '-1')
    })

    it('ArrowRight moves selection to the next ENABLED tab (skips the soon tab)', () => {
      const onChange = vi.fn()
      render(<ViewTabs tabs={TABS} active="summary" onChange={onChange} />)
      const summary = screen.getByRole('tab', { name: /summary/i })
      summary.focus()
      fireEvent.keyDown(summary, { key: 'ArrowRight' })
      expect(onChange).toHaveBeenCalledWith('detail')
    })

    it('ArrowRight wraps from the last enabled tab to the first (skips the soon tab)', () => {
      const onChange = vi.fn()
      render(<ViewTabs tabs={TABS} active="detail" onChange={onChange} />)
      const detail = screen.getByRole('tab', { name: /detail/i })
      detail.focus()
      fireEvent.keyDown(detail, { key: 'ArrowRight' })
      // detail → board is soon (skipped) → wraps to summary
      expect(onChange).toHaveBeenCalledWith('summary')
    })

    it('ArrowLeft wraps from the first tab to the last ENABLED tab (skips the soon tab)', () => {
      const onChange = vi.fn()
      render(<ViewTabs tabs={TABS} active="summary" onChange={onChange} />)
      const summary = screen.getByRole('tab', { name: /summary/i })
      summary.focus()
      fireEvent.keyDown(summary, { key: 'ArrowLeft' })
      // summary ← wraps to detail (board is soon, skipped)
      expect(onChange).toHaveBeenCalledWith('detail')
    })

    it('Home moves selection to the first enabled tab', () => {
      const onChange = vi.fn()
      render(<ViewTabs tabs={TABS} active="detail" onChange={onChange} />)
      const detail = screen.getByRole('tab', { name: /detail/i })
      detail.focus()
      fireEvent.keyDown(detail, { key: 'Home' })
      expect(onChange).toHaveBeenCalledWith('summary')
    })

    it('End moves selection to the last enabled tab (skips the soon tab)', () => {
      const onChange = vi.fn()
      render(<ViewTabs tabs={TABS} active="summary" onChange={onChange} />)
      const summary = screen.getByRole('tab', { name: /summary/i })
      summary.focus()
      fireEvent.keyDown(summary, { key: 'End' })
      // End → last enabled = detail (board is soon, skipped)
      expect(onChange).toHaveBeenCalledWith('detail')
    })
  })

  it('renders the trailing hint node when provided', () => {
    render(
      <ViewTabs
        tabs={TABS}
        active="summary"
        onChange={vi.fn()}
        trailing={<span>Applies to both tabs</span>}
      />,
    )
    expect(screen.getByText('Applies to both tabs')).toBeInTheDocument()
  })

  it('Issue 2: moves focus with the selected tab under the roving-tabindex contract', () => {
    function ControlledTabs() {
      const [active, setActive] = useState('table')
      return (
        <ViewTabs
          ariaLabel="Collection view"
          tabs={[{ id: 'table', label: 'Table' }, { id: 'queue', label: 'Queue' }, { id: 'board', label: 'Board', soon: true }]}
          active={active}
          onChange={setActive}
        />
      )
    }

    render(<ControlledTabs />)
    const table = screen.getByRole('tab', { name: 'Table' })
    table.focus()
    fireEvent.keyDown(table, { key: 'ArrowRight' })

    const queue = screen.getByRole('tab', { name: 'Queue' })
    expect(queue).toHaveFocus()
    expect(queue).toHaveAttribute('tabindex', '0')
  })

  // RI-1 (Q1, ratified Option B) — a `mode="radiogroup"` variant for a mutually-exclusive
  // SETTING (Home's region-order control), distinct from the default tablist (a content-view
  // switch). Same visual grammar (view-tabs__tab classes untouched); different ARIA semantics.
  describe('mode="radiogroup" variant (RI-1)', () => {
    const ORDER_TABS: ViewTab[] = [
      { id: 'attention-first', label: 'Attention first' },
      { id: 'personal-first', label: 'My items first' },
    ]

    it('exposes role=radiogroup on the container and role=radio on each option (not tablist/tab)', () => {
      render(<ViewTabs mode="radiogroup" ariaLabel="Home order" tabs={ORDER_TABS} active="attention-first" onChange={vi.fn()} />)
      expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /attention first/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /my items first/i })).toBeInTheDocument()
      expect(screen.queryByRole('tablist')).toBeNull()
      expect(screen.queryByRole('tab')).toBeNull()
    })

    it('marks the active option aria-checked=true, the other aria-checked=false (no aria-selected)', () => {
      render(<ViewTabs mode="radiogroup" tabs={ORDER_TABS} active="personal-first" onChange={vi.fn()} />)
      const active = screen.getByRole('radio', { name: /my items first/i })
      const inactive = screen.getByRole('radio', { name: /attention first/i })
      expect(active).toHaveAttribute('aria-checked', 'true')
      expect(inactive).toHaveAttribute('aria-checked', 'false')
      expect(active).not.toHaveAttribute('aria-selected')
      expect(inactive).not.toHaveAttribute('aria-selected')
    })

    it('carries the same active-underline class as the tablist grammar (visually identical)', () => {
      render(<ViewTabs mode="radiogroup" tabs={ORDER_TABS} active="attention-first" onChange={vi.fn()} />)
      expect(screen.getByRole('radio', { name: /attention first/i })).toHaveClass('view-tabs__tab--active')
    })

    it('roving tabindex: only the active radio is tabindex=0', () => {
      render(<ViewTabs mode="radiogroup" tabs={ORDER_TABS} active="attention-first" onChange={vi.fn()} />)
      expect(screen.getByRole('radio', { name: /attention first/i })).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('radio', { name: /my items first/i })).toHaveAttribute('tabindex', '-1')
    })

    it('ArrowRight moves selection to the next option', () => {
      const onChange = vi.fn()
      render(<ViewTabs mode="radiogroup" tabs={ORDER_TABS} active="attention-first" onChange={onChange} />)
      const first = screen.getByRole('radio', { name: /attention first/i })
      first.focus()
      fireEvent.keyDown(first, { key: 'ArrowRight' })
      expect(onChange).toHaveBeenCalledWith('personal-first')
    })

    it('Space selects the currently-focused option', () => {
      const onChange = vi.fn()
      render(<ViewTabs mode="radiogroup" tabs={ORDER_TABS} active="attention-first" onChange={onChange} />)
      const second = screen.getByRole('radio', { name: /my items first/i })
      second.focus()
      fireEvent.keyDown(second, { key: ' ' })
      expect(onChange).toHaveBeenCalledWith('personal-first')
    })
  })
})

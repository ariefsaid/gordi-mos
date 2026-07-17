import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupHeaderRow } from './group-header-row'

function renderRow(props: Partial<React.ComponentProps<typeof GroupHeaderRow>> = {}) {
  const base: React.ComponentProps<typeof GroupHeaderRow> = {
    label: 'Open', count: 4, overdue: 0, collapsed: false, colSpan: 5,
    onToggle: () => {}, onAddTask: () => {}, onOverdueFilter: () => {},
    ...props,
  }
  return render(<table><tbody><GroupHeaderRow {...base} /></tbody></table>)
}

describe('GroupHeaderRow', () => {
  it('AC-123: shows label, count, and an overdue subtotal when >0', () => {
    renderRow({ label: 'Blocked', count: 3, overdue: 2 })
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/2 overdue/i)).toBeInTheDocument()
  })

  it('AC-128: the overdue subtotal is a button that triggers the overdue-only filter', () => {
    const onOverdueFilter = vi.fn()
    renderRow({ label: 'Open', count: 4, overdue: 1, onOverdueFilter })
    fireEvent.click(screen.getByRole('button', { name: /filter to 1 overdue/i }))
    expect(onOverdueFilter).toHaveBeenCalled()
  })

  it('AC-124: a zero-count group still renders its header with no overdue subtotal', () => {
    renderRow({ label: 'Ada Lovelace', count: 0, overdue: 0 })
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText(/overdue/i)).toBeNull()
  })

  it('AC-132: the caret toggle carries aria-expanded and fires onToggle (keyboard-reachable)', () => {
    const onToggle = vi.fn()
    renderRow({ collapsed: false, onToggle })
    const caret = screen.getByRole('button', { name: /collapse|expand|open group/i })
    expect(caret).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(caret)
    expect(onToggle).toHaveBeenCalled()
  })

  it('collapsed=true reflects aria-expanded=false', () => {
    renderRow({ collapsed: true })
    const caret = screen.getByRole('button', { name: /collapse|expand|open group/i })
    expect(caret).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders a "+ Add task" affordance that fires onAddTask', () => {
    const onAddTask = vi.fn()
    renderRow({ onAddTask })
    const add = screen.getByRole('button', { name: /add task/i })
    fireEvent.click(add)
    expect(onAddTask).toHaveBeenCalled()
  })

  it('AC-300: readOnly hides the add button and renders overdue as plain text', () => {
    renderRow({ readOnly: true, overdue: 2 })
    expect(screen.queryByRole('button', { name: /add task/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /filter to 2 overdue tasks/i })).toBeNull()
    expect(screen.getByText(/2 overdue/i).tagName).toBe('SPAN')
  })

  // Step 6 (B8, AC-622 render / FR-611): when grouped by occurrence, the run's CAPTION is the
  // label (never the internal-only string "Process Run") and the roll-up summary (done/total ·
  // overdue [· N to assign/unassigned]) reuses this SAME header grammar — no new/divergent header
  // component.
  describe('occurrence group rendering (B8)', () => {
    // Design fix wave item 6 (MINOR — "1 to assign" stutter): when NO onAssignPending handler is
    // given (the viewer cannot act), the summary uses neutral "N unassigned" wording — never an
    // actionable-sounding phrase with nothing to click.
    it('renders the run caption as the label plus the process_run_rollup summary, "N unassigned" when the viewer has no assign handler', () => {
      renderRow({
        label: 'Café Opening · 17 Jul 2026', count: 1, overdue: 0,
        occurrenceRollup: { total: 1, done: 1, overdue: 0, pendingUnresolved: 2 },
      })
      expect(screen.getByText('Café Opening · 17 Jul 2026')).toBeInTheDocument()
      expect(screen.getByText('1/1 done · 0 overdue · 2 unassigned')).toBeInTheDocument()
      expect(screen.queryByText('Process Run')).not.toBeInTheDocument()
    })

    it('item 6: drops the pending clause from the summary when the "N to assign" button ALSO renders (no stutter)', () => {
      renderRow({
        label: 'Café Opening · 17 Jul 2026', count: 1, overdue: 0,
        occurrenceRollup: { total: 1, done: 1, overdue: 0, pendingUnresolved: 2 },
        onAssignPending: vi.fn(),
      })
      expect(screen.getByText('1/1 done · 0 overdue')).toBeInTheDocument()
      expect(screen.queryByText(/2 unassigned/)).not.toBeInTheDocument()
      expect(screen.queryByText('2 to assign', { selector: '.gcount' })).not.toBeInTheDocument()
      // ...the button still carries the count on its own.
      expect(screen.getByRole('button', { name: '2 to assign' })).toBeInTheDocument()
    })

    it('does not render the generic plain count when an occurrence roll-up is present', () => {
      renderRow({
        label: 'Café Opening · 17 Jul 2026', count: 1, overdue: 0,
        occurrenceRollup: { total: 1, done: 1, overdue: 0, pendingUnresolved: 2 },
      })
      // the bare count ("1") is superseded by the rollup summary — asserts no divergent/duplicate
      // count display was introduced alongside it.
      expect(screen.queryByText('1', { selector: '.gcount' })).not.toBeInTheDocument()
    })

    it('without occurrenceRollup, the plain count/overdue grammar is unchanged (no regression)', () => {
      renderRow({ label: 'Blocked', count: 3, overdue: 2 })
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText(/2 overdue/i)).toBeInTheDocument()
    })
  })

  // Step 6 (C2, spec §5 "Pending-PIC resolution surface"): a distinct, SEPARATE affordance from
  // the plain roll-up summary text — clicking it is how a host mounts PendingResolution (B7) for
  // this occurrence. Never rendered when there's nothing to assign (readOnly-like omission, mirrors
  // the overdue-subtotal pattern which also hides at zero).
  describe('"N to assign" affordance (C2)', () => {
    it('renders a clickable "N to assign" affordance when pendingUnresolved > 0 and fires onAssignPending', () => {
      const onAssignPending = vi.fn()
      renderRow({
        label: 'Café Opening · 17 Jul 2026', count: 1, overdue: 0,
        occurrenceRollup: { total: 1, done: 1, overdue: 0, pendingUnresolved: 2 },
        onAssignPending,
      })
      const assignBtn = screen.getByRole('button', { name: '2 to assign' })
      fireEvent.click(assignBtn)
      expect(onAssignPending).toHaveBeenCalled()
    })

    it('does not render the affordance when pendingUnresolved is 0', () => {
      renderRow({
        label: 'Café Opening · 17 Jul 2026', count: 1, overdue: 0,
        occurrenceRollup: { total: 1, done: 1, overdue: 0, pendingUnresolved: 0 },
        onAssignPending: vi.fn(),
      })
      expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    })

    it('does not render the affordance when no onAssignPending handler is given (nothing to open)', () => {
      renderRow({
        label: 'Café Opening · 17 Jul 2026', count: 1, overdue: 0,
        occurrenceRollup: { total: 1, done: 1, overdue: 0, pendingUnresolved: 2 },
      })
      expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    })

    it('never renders the affordance outside occurrence rendering (no occurrenceRollup)', () => {
      renderRow({ label: 'Blocked', count: 3, overdue: 2, onAssignPending: vi.fn() })
      expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    })
  })
})

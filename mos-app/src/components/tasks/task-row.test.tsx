// TaskRow — PR-2 AC-T03/T04/T05/T06. Extracted from TasksWorkspace.renderRow;
// renders the trailing ⋯ menu (RowMenu). The name cell is a real
// <a href="/work/tasks/:id"> Chip-link; status is a soft StatusPill that
// never wraps; body rows consume the shared collection measure.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TaskRow } from './task-row'
import type { TaskRowProps } from './task-row'
import type { TaskListRow } from '@/lib/db/tasks.types'

const NOW = new Date('2026-06-19T00:00:00Z')

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-7', org_id: 'org', title: 'Finalise Q3 roastery output forecast',
    business_unit_id: 'bu-1', status: 'Blocked',
    responsible_person_id: 'p-1', accountable_person_id: 'p-1',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: '2026-06-12', objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-14T10:00:00Z',
    archived_at: null, created_by: 'p-1',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-14T00:00:00Z',
    ...overrides,
  }
}

const baseProps = (overrides: Partial<TaskRowProps> = {}): TaskRowProps => ({
  task: makeTask(),
  now: NOW,
  condensed: false,
  isSelected: false,
  isCursor: false,
  leafIndex: 0,
  ownerName: 'Rina Lestari',
  onOpen: () => {},
  recordSearch: '',
  ...overrides,
})

function renderRow(props: Partial<TaskRowProps> = {}) {
  return render(
    <MemoryRouter>
      <table><tbody><TaskRow {...baseProps(props)} /></tbody></table>
    </MemoryRouter>,
  )
}

describe('TaskRow — shared title + metadata cell grammar', () => {
  it('renders the E7 title and typed Business Unit metadata in one identity cell', () => {
    renderRow({ businessUnitName: 'Café Operations' })
    const identity = document.querySelector('.collection-grammar-title-cell')!
    expect(identity.querySelector('.collection-grammar-title')).toHaveTextContent('Finalise Q3 roastery output forecast')
    expect(identity.querySelector('.collection-grammar-meta')).toHaveTextContent('Café Operations')
  })
})

describe('TaskRow — AC-T03 name cell is a Chip-link to /tasks/:id', () => {
  it('AC-T03: name link preserves ?view= on open-in-new-tab-safe hrefs', () => {
    renderRow({ recordSearch: '?view=overdue' })
    const link = screen.getByRole('link', { name: /Finalise Q3 roastery output forecast/i })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/work/tasks/task-7?view=overdue')
    // truncate + title (no-bleed: identity string ellipsizes + carries title)
    expect(link.getAttribute('title')).toBe('Finalise Q3 roastery output forecast')
  })

  it('AC-T03: the truncated name element carries the task-name class (ellipsis CSS hook)', () => {
    const { container } = renderRow()
    expect(container.querySelector('.task-name')).toBeTruthy()
  })

  it('AC-T03: name link is a real href anchor (middle-click / open-in-new-tab)', () => {
    const onOpen = vi.fn()
    renderRow({ onOpen, recordSearch: '?view=overdue' })
    const link = screen.getByRole('link', { name: /Finalise Q3/i })
    expect(link.getAttribute('href')).toBe('/work/tasks/task-7?view=overdue')
    expect(document.querySelector('tr.task-row')).toBeTruthy()
  })

  it('AC-T03: an archived task shows the Archived tag + archived name styling', () => {
    renderRow({ task: makeTask({ archived_at: '2026-06-10T00:00:00Z' }) })
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(document.querySelector('.task-name-archived')).toBeTruthy()
  })
})

describe('TaskRow — AC-T05 status is a soft pill (dot+text never color-alone) that never wraps', () => {
  it('AC-T05: status renders the StatusPill text (the non-color cue) inside a .mk-tag', () => {
    renderRow()
    const tag = document.querySelector('.mk-tag')!
    expect(tag).toBeTruthy()
    expect(tag.textContent).toContain('Blocked')
  })

  it('AC-T05: the status pill carries a leading dot (the redundant non-color marker)', () => {
    renderRow()
    const tag = document.querySelector('.mk-tag')!
    // The dot is aria-hidden (redundant cue only) and lives INSIDE the Tag,
    // before the label — never the sole signal (the status word is the name).
    const dot = tag.querySelector('.status-dot')
    expect(dot, 'expected a leading status dot inside the pill').toBeTruthy()
    expect(dot!.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-T05: the status cell + the Tag never wrap (td-nowrap cell + Tag.css nowrap)', () => {
    const { container } = renderRow()
    // The status <td> carries the no-wrap hook so the pill never breaks across lines.
    expect(container.querySelector('td.td-status.td-nowrap, td.td-nowrap.td-status')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Tag.css'), 'utf8')
    expect(css).toMatch(/\.mk-tag\b[^}]*white-space:\s*nowrap/)
  })
})

describe('TaskRow — AC-T06 body row uses the shared RecordCollection measure', () => {
  it('AC-T06: the row renders td-cell cells whose CSS rule consumes --row-min-h', () => {
    renderRow()
    expect(document.querySelector('tr.task-row td.td-cell, tr.task-row td.td-main')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    expect(css).toMatch(/\.td-main,\s*\.td-cell\s*\{[^}]*height:\s*var\(--row-min-h\)/)
  })
})

// I7 "exactly one aria-current" (cohesion-debt 2026-07-19 + interaction-contract I7):
// the rail/breadcrumb OWN aria-current="page". A task row's open/cursor state is a
// SELECTION, so it must expose aria-selected — never a second aria-current on the page.
describe('TaskRow — I7: open/cursor state is aria-selected, never aria-current', () => {
  it('an open (selected) row exposes aria-selected="true" and NO aria-current', () => {
    renderRow({ isSelected: true })
    const row = document.querySelector('tr.task-row')!
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(row.getAttribute('aria-current')).toBeNull()
  })

  it('a keyboard-cursor row exposes aria-selected="true" and NO aria-current', () => {
    renderRow({ isCursor: true })
    const row = document.querySelector('tr.task-row')!
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(row.getAttribute('aria-current')).toBeNull()
  })

  it('a plain row exposes neither aria-selected nor aria-current', () => {
    renderRow()
    const row = document.querySelector('tr.task-row')!
    expect(row.getAttribute('aria-selected')).toBeNull()
    expect(row.getAttribute('aria-current')).toBeNull()
  })
})

describe('TaskRow — stopPropagation regression (⋯ must NOT fire row onOpen)', () => {
  it('clicking the ⋯ trigger button does NOT call onOpen (stopPropagation)', () => {
    const onOpen = vi.fn()
    renderRow({ onOpen })
    const menuTrigger = document.querySelector('button.row-menu') as HTMLElement
    expect(menuTrigger).toBeTruthy()
    fireEvent.click(menuTrigger)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('clicking the row body (td-status cell) DOES call onOpen', () => {
    const onOpen = vi.fn()
    renderRow({ onOpen })
    const statusCell = document.querySelector('td.td-status') as HTMLElement
    expect(statusCell).toBeTruthy()
    fireEvent.click(statusCell)
    expect(onOpen).toHaveBeenCalledWith('task-7')
  })
})

// Design fix wave item 4 (OD-65 mockup regression) — the generated-ownership "via <role name>"
// line, threaded through to OwnerCell (Rule 11 reuse — no second PIC-cell rendering).
describe('TaskRow — provenance ("via <role name>", item 4)', () => {
  it('threads provenanceRoleName through to the owner cell as "via <role>"', () => {
    renderRow({ ownerName: 'Cahya Cafe', provenanceRoleName: 'Cafe Ops Lead' })
    expect(screen.getByText('via Cafe Ops Lead')).toBeInTheDocument()
  })

  it('renders no provenance text when provenanceRoleName is omitted (no regression)', () => {
    renderRow({ ownerName: 'Cahya Cafe' })
    expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
  })
})

// Inline title edit (E7 collection promise: "Select a Task title to edit it. Enter saves · Esc
// discards"). Activation is F2 on the focused title (NOT double-click — our title-click is the
// record opener; NOT Enter — that opens the row). Optimistic commit via useInlineCommit, rollback
// on failure. The row's displayed title is the hook's draft, so the optimistic edit survives the
// async round-trip and reverts on rejection.
describe('TaskRow — inline title edit (F2 activation, optimistic + rollback)', () => {
  function openEditor() {
    const link = screen.getByRole('link', { name: /Finalise Q3/i })
    fireEvent.keyDown(link, { key: 'F2' })
    return screen.getByLabelText('Edit task title') as HTMLInputElement
  }

  it('shows the Enter/Escape helper only beside the active title input', () => {
    renderRow({ onEditTitle: vi.fn().mockResolvedValue(undefined) })
    expect(screen.queryByText('Enter saves · Esc discards')).toBeNull()
    const input = openEditor()
    expect(input.parentElement).toHaveTextContent('Enter saves · Esc discards')
    expect(screen.getAllByText(/Enter saves · Esc discards/)).toHaveLength(1)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Enter saves · Esc discards')).toBeNull()
  })

  it('commits an edited title (F2 → type → Enter) and shows it in the row', async () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditTitle })
    const input = openEditor()
    fireEvent.change(input, { target: { value: 'Renamed forecast' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onEditTitle).toHaveBeenCalledWith('task-7', 'Renamed forecast')
    await waitFor(() => expect(screen.queryByLabelText('Edit task title')).toBeNull())
    expect(document.querySelector('.task-name')).toHaveTextContent('Renamed forecast')
  })

  it('Escape discards the draft — no commit, saved title restored', () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditTitle })
    const input = openEditor()
    fireEvent.change(input, { target: { value: 'Should not stick' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onEditTitle).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Edit task title')).toBeNull()
    expect(document.querySelector('.task-name')).toHaveTextContent('Finalise Q3 roastery output forecast')
  })

  it('rolls the row back to the saved title (and announces) when the commit rejects', async () => {
    const onEditTitle = vi.fn().mockRejectedValue(new Error('write failed'))
    renderRow({ onEditTitle })
    const input = openEditor()
    fireEvent.change(input, { target: { value: 'Doomed rename' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onEditTitle).toHaveBeenCalledWith('task-7', 'Doomed rename')
    await waitFor(() =>
      expect(document.querySelector('.task-name')).toHaveTextContent('Finalise Q3 roastery output forecast'),
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't save — reverted"))
  })

  it('OD-REDESIGN-22 (D-C1): a rejected rename shows a VISIBLE Retry that re-sends the same title', async () => {
    const onEditTitle = vi.fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined)
    renderRow({ onEditTitle })
    const input = openEditor()
    fireEvent.change(input, { target: { value: 'Doomed rename' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // A visible (not sr-only) retry affordance appears once the write rejects.
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    // Retry re-sends the PRESERVED attempt, not the rolled-back saved title.
    await waitFor(() => expect(onEditTitle).toHaveBeenNthCalledWith(2, 'task-7', 'Doomed rename'))
    // A successful retry clears the error affordance and lands the new title.
    await waitFor(() => expect(screen.queryByRole('button', { name: /retry/i })).toBeNull())
    expect(document.querySelector('.task-name')).toHaveTextContent('Doomed rename')
  })

  it('an empty draft is a no-op restore — never commits a blank title', () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditTitle })
    const input = openEditor()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onEditTitle).not.toHaveBeenCalled()
    expect(document.querySelector('.task-name')).toHaveTextContent('Finalise Q3 roastery output forecast')
  })

  it('leaves the row opener intact — F2 begins edit and never opens; row-body click still opens', () => {
    const onOpen = vi.fn()
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onOpen, onEditTitle })
    const link = screen.getByRole('link', { name: /Finalise Q3/i })
    fireEvent.keyDown(link, { key: 'F2' })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('td.td-status') as HTMLElement)
    expect(onOpen).toHaveBeenCalledWith('task-7')
  })

  it('does not wire the edit affordance when onEditTitle is absent (F2 is inert)', () => {
    renderRow()
    const link = screen.getByRole('link', { name: /Finalise Q3/i })
    fireEvent.keyDown(link, { key: 'F2' })
    expect(screen.queryByLabelText('Edit task title')).toBeNull()
  })

  it('a double-click on the title opens the inline editor (mouse activation)', () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditTitle })
    fireEvent.doubleClick(screen.getByRole('link', { name: /Finalise Q3/i }))
    expect(screen.getByLabelText('Edit task title')).toBeInTheDocument()
  })

  it('a single click on an editable title DEFERS the open by one double-click window', () => {
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      const onEditTitle = vi.fn().mockResolvedValue(undefined)
      renderRow({ onOpen, onEditTitle })
      fireEvent.click(screen.getByRole('link', { name: /Finalise Q3/i }))
      expect(onOpen).not.toHaveBeenCalled() // deferred so a double-click can pre-empt it
      act(() => { vi.advanceTimersByTime(200) })
      expect(onOpen).toHaveBeenCalledWith('task-7')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a double-click pre-empts the deferred open — edits in place, never opens', () => {
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      const onEditTitle = vi.fn().mockResolvedValue(undefined)
      renderRow({ onOpen, onEditTitle })
      const link = screen.getByRole('link', { name: /Finalise Q3/i })
      fireEvent.click(link) // arms the deferred open
      fireEvent.doubleClick(link) // cancels it, edits instead
      act(() => { vi.advanceTimersByTime(300) })
      expect(onOpen).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Edit task title')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a non-editable title still opens INSTANTLY on a single click (no deferral)', () => {
    const onOpen = vi.fn()
    renderRow({ onOpen }) // no onEditTitle → not editable
    fireEvent.click(screen.getByRole('link', { name: /Finalise Q3/i }))
    expect(onOpen).toHaveBeenCalledWith('task-7')
  })

  // Field-Escape/Enter isolation: the commit/discard keys must NOT bubble to the workspace keyboard
  // layer's window listener (Enter → open cursor row, Esc → close drawer). Without this the commit
  // Enter leaks into a spurious row-open once the editor unmounts and activeElement is no longer a
  // typing target.
  it('isolates the commit Enter and the discard Escape from the window keyboard layer', () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    const windowSpy = vi.fn()
    window.addEventListener('keydown', windowSpy)
    try {
      renderRow({ onEditTitle })
      fireEvent.doubleClick(screen.getByRole('link', { name: /Finalise Q3/i }))
      const input = screen.getByLabelText('Edit task title')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(windowSpy).not.toHaveBeenCalled()
      fireEvent.doubleClick(screen.getByRole('link', { name: /Finalise Q3/i }))
      fireEvent.keyDown(screen.getByLabelText('Edit task title'), { key: 'Escape' })
      expect(windowSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', windowSpy)
    }
  })
})

describe('TaskRow — AC-T04 row hover/selected styling (CSS lock)', () => {
  it('AC-T04: hover uses the secondary-background token; selected uses a neutral (non-blue) fill', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    // hover fill references the secondary background token family
    expect(css).toMatch(/\.task-row:hover\s+td\s*\{[^}]*var\(--(?:surface-secondary|secondary)\)/)
    // selected fill exists + is the neutral secondary (NOT --accent=blue, per the
    // ratified de-bluing / One-Blue Rule; AC-T04 "(existing row-selected)").
    const selIdx = css.indexOf('.task-row.row-selected td')
    expect(selIdx).toBeGreaterThanOrEqual(0)
    const selBody = css.slice(css.indexOf('{', selIdx) + 1, css.indexOf('}', css.indexOf('{', selIdx)))
    expect(selBody).toMatch(/background:\s*var\(--secondary\)/)
    expect(selBody).not.toMatch(/var\(--accent\)/)
    expect(selBody).not.toMatch(/var\(--primary\)/)
  })
})

describe('TaskRow — owner-eyes item 3: condensed Due never carries the clip-prone "Overdue ·" prefix', () => {
  it('full table shows the "Overdue · <date>" label (text + color)', () => {
    renderRow({ condensed: false })
    // due 2026-06-12 vs NOW 2026-06-19 → overdue
    const due = document.querySelector('.due-overdue')!
    expect(due).toBeTruthy()
    expect(due.textContent).toMatch(/Overdue ·\s*Fri 12 Jun/)
  })

  it('condensed (drawer-open split) shows the bare formatted date — the red color carries the overdue meaning', () => {
    renderRow({ condensed: true })
    const due = document.querySelector('.due-overdue')!
    expect(due).toBeTruthy()
    // no "Overdue ·" prefix in the narrow split track (no mid-word clipping)
    expect(due.textContent).not.toMatch(/Overdue/)
    expect(due.textContent).toMatch(/Fri 12 Jun/)
  })
})

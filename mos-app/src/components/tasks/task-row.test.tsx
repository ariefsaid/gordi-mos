// TaskRow — PR-2 AC-T03/T04/T05/T06. Extracted from TasksWorkspace.renderRow;
// renders the trailing ⋯ menu (RowMenu). The name cell is a real
// <a href="/work/tasks/:id"> Chip-link; status is a soft StatusPill that
// never wraps; body rows consume the shared collection measure.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// AC-020 (ticket #750): the row ⋯ menu renders only when it holds two or more actions.
// Today's action list is empty — Open full page lives in the record — so no ⋯ renders at all.
describe('TaskRow — AC-020 row overflow menu', () => {
  it('AC-020: a row with fewer than two actions renders no ⋯ menu button', () => {
    renderRow({ onOpen: vi.fn(), onEditTitle: vi.fn().mockResolvedValue(undefined) })
    expect(screen.queryByRole('button', { name: /row actions/i })).toBeNull()
    expect(document.querySelector('button.row-menu')).toBeNull()
    expect(document.querySelector('td.td-menu')).toBeNull()
  })
})

// AC-021 (ticket #750): one person-cell grammar — PIC and Supervisor both render the initials
// avatar + first name; the full name belongs to the record and to pickers, never to the cell.
describe('TaskRow — AC-021 person-cell grammar (PIC + Supervisor)', () => {
  it('AC-021: the Supervisor cell renders avatar initials + first name, not the full-name text', () => {
    renderRow({ supervisorName: 'Dewi Director' })
    const cell = document.querySelector('td.td-supervisor') as HTMLElement
    expect(cell.querySelector('.ownav')?.textContent).toBe('DD')
    expect(cell.querySelector('.own-name')?.textContent).toBe('Dewi')
    expect(cell.textContent).not.toContain('Dewi Director')
  })

  it('AC-021: the PIC cell keeps the same avatar + first-name grammar', () => {
    renderRow({ ownerName: 'Rina Lestari' })
    const cell = document.querySelector('td.td-owner') as HTMLElement
    expect(cell.querySelector('.ownav')?.textContent).toBe('RL')
    expect(cell.querySelector('.own-name')?.textContent).toBe('Rina')
  })

  it('AC-021: an empty Supervisor still reads as the em-dash empty state', () => {
    renderRow({ supervisorName: '' })
    const cell = document.querySelector('td.td-supervisor') as HTMLElement
    expect(cell.querySelector('.ownav')).toBeNull()
    expect(cell.textContent).toBe('—')
  })
})

describe('TaskRow — stopPropagation regression (⋯ must NOT fire row onOpen)', () => {
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
    expect(screen.queryByText('Enter saves · Tab moves · Esc discards')).toBeNull()
    const input = openEditor()
    const hint = screen.getByText('Enter saves · Tab moves · Esc discards')
    expect(input.parentElement).toHaveTextContent('Enter saves · Tab moves · Esc discards')
    expect(screen.getAllByText(/Enter saves · Tab moves · Esc discards/)).toHaveLength(1)
    expect(hint).toHaveClass('task-title-edit-keyhint')
    expect(hint).toHaveAttribute('id')
    expect(input).toHaveAttribute('aria-describedby', hint.getAttribute('id'))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Enter saves · Tab moves · Esc discards')).toBeNull()
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

  // AC-017 row-side: a single click on the title opens the record — never the editor.
  // (The URL-consequence half of AC-017 — drawer vs page regime — is owned by tasks-layout.)
  it('a single click on an editable title opens the record and mounts no editor', () => {
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      renderRow({ onOpen, onEditTitle: vi.fn().mockResolvedValue(undefined) })
      const link = screen.getByRole('link', { name: /Finalise Q3/i })
      fireEvent.mouseDown(link)
      fireEvent.mouseUp(link)
      fireEvent.click(link)
      vi.advanceTimersByTime(250)
      expect(onOpen).toHaveBeenCalledWith('task-7')
      expect(screen.queryByLabelText('Edit task title')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a click-click-dblclick title sequence edits without opening the record', () => {
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      const onEditTitle = vi.fn().mockResolvedValue(undefined)
      renderRow({ onOpen, onEditTitle })
      const link = screen.getByRole('link', { name: /Finalise Q3/i })
      fireEvent.click(link)
      fireEvent.click(link)
      fireEvent.doubleClick(link)
      vi.runAllTimers()
      expect(screen.getByLabelText('Edit task title')).toBeInTheDocument()
      expect(onOpen).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows modifier and middle-click title activation to remain native anchor navigation', () => {
    const onOpen = vi.fn()
    renderRow({ onOpen, onEditTitle: vi.fn().mockResolvedValue(undefined) })
    const link = screen.getByRole('link', { name: /Finalise Q3/i })
    fireEvent.click(link, { metaKey: true })
    fireEvent.click(link, { ctrlKey: true })
    fireEvent.click(link, { shiftKey: true })
    fireEvent.click(link, { button: 1 })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('renders the title pencil in the title cell, never the Due cell', () => {
    renderRow({ onEditTitle: vi.fn().mockResolvedValue(undefined) })
    expect(document.querySelector('td.td-main .task-row-pencil')).toBeTruthy()
    expect(document.querySelector('td.td-due .task-row-pencil')).toBeNull()
  })

  it('a non-editable title still opens after the single-click pair window', () => {
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      renderRow({ onOpen }) // no onEditTitle → not editable
      fireEvent.click(screen.getByRole('link', { name: /Finalise Q3/i }))
      vi.advanceTimersByTime(250)
      expect(onOpen).toHaveBeenCalledWith('task-7')
    } finally {
      vi.useRealTimers()
    }
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

describe('TaskRow — e7 click-to-edit and cell commit contract', () => {
  it('routes status and PIC picks through the shared commit contract', async () => {
    const onEditStatus = vi.fn().mockResolvedValue(undefined)
    const onEditPic = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditStatus, onEditPic, personOptions: [{ id: 'p-1', full_name: 'Rina Lestari' }, { id: 'p-2', full_name: 'Dewi Santoso' }] })
    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Edit task status' }), { target: { value: 'Done' } })
    await waitFor(() => expect(onEditStatus).toHaveBeenCalledWith('task-7', 'Done'))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task status' })).toBeNull())
    fireEvent.click(document.querySelector('.td-owner .inline-cell-trigger') as HTMLElement)
    fireEvent.change(screen.getByRole('combobox', { name: 'Edit task PIC' }), { target: { value: 'p-2' } })
    await waitFor(() => expect(onEditPic).toHaveBeenCalledWith('task-7', 'p-2'))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task PIC' })).toBeNull())
    expect(screen.getByRole('button', { name: /Done/ })).toBeInTheDocument()
  })

  it('re-picking the current status closes the editor', () => {
    renderRow({ onEditStatus: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Edit task status' }), { target: { value: 'Blocked' } })
    expect(screen.queryByRole('combobox', { name: 'Edit task status' })).toBeNull()
  })

  it('Escape on the date field restores the saved date without committing', () => {
    const onEditDue = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditDue })
    const trigger = screen.getByRole('button', { name: 'Edit task due date' })
    fireEvent.click(trigger)
    const input = screen.getByLabelText('Due date')
    fireEvent.change(input, { target: { value: '2026-06-30' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onEditDue).not.toHaveBeenCalled()
    expect(screen.getByText('Overdue · Fri 12 Jun')).toBeInTheDocument()
  })

  it('a rejected PIC write rolls back and announces the revert', async () => {
    const onEditPic = vi.fn().mockRejectedValue(new Error('write failed'))
    renderRow({ onEditPic, personOptions: [{ id: 'p-1', full_name: 'Rina Lestari' }, { id: 'p-2', full_name: 'Dewi Santoso' }] })
    fireEvent.click(document.querySelector('.td-owner .inline-cell-trigger') as HTMLElement)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-2' } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/reverted/i))
    expect(screen.getByRole('alert')).toHaveTextContent(/retry/i)
    expect(screen.getByRole('combobox')).toHaveValue('p-1')
  })

  it('double-click starts editing and Escape restores the saved title', () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditTitle })
    fireEvent.doubleClick(screen.getByRole('link', { name: /Finalise Q3/i }))
    const input = screen.getByLabelText('Edit task title')
    fireEvent.change(input, { target: { value: 'Updated title' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onEditTitle).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Edit task title')).toBeNull()
    expect(screen.getByText('Finalise Q3 roastery output forecast')).toBeInTheDocument()
  })
})

// AC-018 (ticket #750): the pencil is the hover/focus edit affordance — revealed on row
// hover/focus for editable rows, absent for read-only ones. F2/double-click/pencil all begin
// the same inline edit; Enter saves and Escape restores (owned by the useInlineCommit tests above).
describe('TaskRow — AC-018 pencil affordance', () => {
  it('AC-018: an editable row carries the hover/focus pencil and activating it starts editing', () => {
    const onEditTitle = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditTitle })
    const pencil = document.querySelector('button.task-row-pencil') as HTMLButtonElement
    expect(pencil, 'expected a pencil affordance on an editable row').toBeTruthy()
    expect(pencil.getAttribute('aria-label')).toBe('Edit title')
    fireEvent.click(pencil)
    expect(screen.getByLabelText('Edit task title')).toBeInTheDocument()
  })

  it('AC-018: a non-editable row renders no pencil', () => {
    renderRow({}) // no onEditTitle → read-only row
    expect(document.querySelector('button.task-row-pencil')).toBeNull()
  })

  it('AC-018: the pencil reveal is CSS-owned (hidden at rest, shown on hover/focus-within)', () => {
    renderRow({ onEditTitle: vi.fn().mockResolvedValue(undefined) })
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    expect(css).toMatch(/\.task-row-pencil\s*\{[^}]*visibility:\s*hidden/)
    expect(css).toMatch(/\.task-title-cell:hover \.task-row-pencil/)
    expect(css).toMatch(/\.task-title-cell:focus-within \.task-row-pencil/)
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

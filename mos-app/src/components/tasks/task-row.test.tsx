// TaskRow — PR-2 AC-T03/T04/T05/T06. Extracted from TasksWorkspace.renderRow;
// renders the trailing ⋯ menu (RowMenu). The name cell is a real
// <a href="/work/tasks/:id"> Chip-link; status is a soft StatusPill that
// never wraps; body rows consume the shared collection measure.
//
// Issue 997: the row's column set is the ONE TanStack column-definition array
// (task-columns.tsx) shared with the <thead>. The column-model assertions below assert the
// rendered <td> chain against the defs / visible-leaf derivation (spec AC-001/002/003) —
// the observable behaviour the old show*-prop tests pinned, at the new seam.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { TaskRow } from './task-row'
import { TASK_TITLE_MAX_LENGTH } from './task-formatters'
import type { TaskRowProps } from './task-row'
import { visibleTaskColumnDefs, TASK_COLUMN_DEFS, taskColumnVisibilityState } from './task-columns'
import { TASK_DECISION_FIELDS } from './task-collection-query'
import type { TaskColumnId } from './task-collection-query'
import type { TaskCollectionVisibleField } from '@/lib/record-collection/collection-view-spec'
import type { TaskListRow } from '@/lib/db/tasks.types'

const NOW = new Date('2026-06-19T00:00:00Z')

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-7', org_id: 'org', title: 'Finalise Q3 roastery output forecast',
    business_unit_id: 'bu-1', status: 'Blocked',
    responsible_person_id: 'p-1', accountable_person_id: 'p-1',
    consulted_person_ids: [], informed_person_ids: [],
    due_date: '2026-06-12', objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-14T10:00:00Z',
    archived_at: null, created_by: 'p-1',
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
  visibleFields: TASK_DECISION_FIELDS,
  ...overrides,
})

function renderRow(props: Partial<TaskRowProps> = {}) {
  return render(
    <MemoryRouter>
      <table><tbody><TaskRow {...baseProps(props)} /></tbody></table>
    </MemoryRouter>,
  )
}

const picTrigger = () => screen.getByRole('button', { name: /Rina/ })

// #1192: the Supervisor cell is a grid stop — a focusable element with data-row-stop.
const supervisorStop = () => screen.getByText('Budi').closest('[data-row-stop]') as HTMLElement

function installTaskStyles() {
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
  document.head.append(style)
  return () => style.remove()
}

const supervisorFocusRule = () => readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
  .split('.supervisor-cell-stop:focus-visible')[1]?.split('}')[0] ?? ''

// ── Issue 997: the ONE column list (spec AC-001/002/003) ─────────────────────────────
// The rendered <td> chain and TanStack visible-leaf derivation must agree for EVERY Fields
// combination — this is the regression guard for the old two-hand-kept-lists drift.

const TD_HOOK: Record<TaskColumnId, string> = {
  task: 'td-main',
  status: 'td-status',
  owner: 'td-owner',
  supervisor: 'td-supervisor',
  businessUnit: 'td-business-unit',
  workline: 'td-workline',
  objective: 'td-objective',
  activity: 'td-activity',
  due: 'td-due',
}

const OPTIONAL_FIELDS: readonly TaskCollectionVisibleField[] = ['businessUnit', 'workline', 'objective', 'activity']

/** Every combination of the four Fields-chooser-optional fields (16 total). */
function fieldsCombinations(): TaskCollectionVisibleField[][] {
  const combos: TaskCollectionVisibleField[][] = []
  for (let mask = 0; mask < 1 << OPTIONAL_FIELDS.length; mask += 1) {
    combos.push([
      ...TASK_DECISION_FIELDS,
      ...OPTIONAL_FIELDS.filter((_, bit) => (mask & (1 << bit)) !== 0),
    ])
  }
  return combos
}

/** A stand-in for the presentation's useReactTable call (same defs, same visibility state)
 * exposing the visible-leaf column ids the thead and pad/group colSpan derive from. */
function LeafColumnProbe({ visibleFields }: { visibleFields: readonly TaskCollectionVisibleField[] }) {
  const table = useReactTable({
    data: [] as TaskListRow[],
    columns: TASK_COLUMN_DEFS,
    state: { columnVisibility: taskColumnVisibilityState(visibleFields) },
    getCoreRowModel: getCoreRowModel(),
  })
  return <tr>{table.getVisibleLeafColumns().map((column) => column.id).join(',')}</tr>
}

function renderProbe(visibleFields: readonly TaskCollectionVisibleField[]) {
  return render(
    <table><tbody><LeafColumnProbe visibleFields={visibleFields} /></tbody></table>,
  )
}

describe('TaskRow — the column list is the one TanStack column-definition array (issue 997)', () => {
  const renderedColumnIds = () => {
    const cells = Array.from(document.querySelectorAll('tr.task-row > td'))
    return cells.map((cell) => {
      const entry = Object.entries(TD_HOOK).find(([, hook]) => cell.classList.contains(hook))
      expect(entry, `a rendered td matches no column hook: className="${cell.className}"`).toBeDefined()
      return entry![0]
    })
  }

  it('AC-001: with no optional Fields checked, exactly the 5 decision columns render in order', () => {
    renderRow()
    const cells = document.querySelectorAll('tr.task-row > td')
    expect(cells).toHaveLength(5)
    expect(renderedColumnIds()).toEqual(['task', 'status', 'owner', 'supervisor', 'due'])
  })

  it('AC-002: Business unit + Objective checked render 7 columns — optional ones inserted before Due', () => {
    renderRow({ visibleFields: [...TASK_DECISION_FIELDS, 'businessUnit', 'objective'] })
    const cells = document.querySelectorAll('tr.task-row > td')
    expect(cells).toHaveLength(7)
    expect(renderedColumnIds()).toEqual(['task', 'status', 'owner', 'supervisor', 'businessUnit', 'objective', 'due'])
  })

  it('the row renders exactly the defs-derived visible columns for every Fields combination', () => {
    for (const visibleFields of fieldsCombinations()) {
      const { unmount } = renderRow({ visibleFields, workLineName: 'Cold Brew line', objectiveName: 'Q3 quality', businessUnitName: 'Café Ops' })
      const expected = visibleTaskColumnDefs(visibleFields).map((column) => column.id)
      expect(renderedColumnIds(), `fields=[${visibleFields.join(',')}]`).toEqual(expected)
      unmount()
    }
  })

  it('AC-003: for every combination, the table-visible leaf ids match the configured fields', () => {
    expect(TASK_COLUMN_DEFS.map((column) => column.id)).toEqual([
      'task', 'status', 'owner', 'supervisor', 'businessUnit', 'workline', 'objective', 'activity', 'due',
    ])
    for (const visibleFields of fieldsCombinations()) {
      const expectedIds = visibleTaskColumnDefs(visibleFields).map((column) => column.id)
      const { unmount } = renderProbe(visibleFields)
      const probe = screen.getByRole('row')
      expect(probe.textContent, `fields=[${visibleFields.join(',')}]`).toBe(expectedIds.join(','))
      unmount()
    }
  })
})

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

describe('TaskRow — Supervisor cell focus ring', () => {
  it('uses the shared ring token', () => expect(supervisorFocusRule()).toMatch(/outline:\s*2px solid var\(--ring\)/))
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
    expect(document.querySelector('.task-pic-cell')).toBeTruthy()
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

  it('caps the inline title edit at the shared limit (#1034)', async () => {
    const user = userEvent.setup()
    renderRow({ onEditTitle: vi.fn().mockResolvedValue(undefined) })
    const input = openEditor()
    await user.clear(input)
    await user.paste('x'.repeat(TASK_TITLE_MAX_LENGTH + 50))
    expect(input.value).toHaveLength(TASK_TITLE_MAX_LENGTH)
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
    vi.useFakeTimers()
    try {
      const onOpen = vi.fn()
      renderRow({ onOpen, onEditTitle: vi.fn().mockResolvedValue(undefined) })
      const link = screen.getByRole('link', { name: /Finalise Q3/i })
      const clicks = [
        new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }),
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
        new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }),
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }),
      ]
      clicks.forEach((event) => {
        link.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      })
      vi.advanceTimersByTime(250)
      expect(onOpen).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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

describe('TaskRow — inline Status/PIC editors open on the first activation and return focus (#1027, #979)', () => {
  const people = [{ id: 'p-1', full_name: 'Rina Lestari' }, { id: 'p-2', full_name: 'Dewi Santoso' }]
  const statusTrigger = () => screen.getByRole('button', { name: /Blocked/ })

  it('a single click on Status opens the options list', async () => {
    renderRow({ onEditStatus: vi.fn() })
    await userEvent.click(statusTrigger())
    expect(await screen.findByRole('option', { name: 'Done' })).toBeInTheDocument()
  })

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('%s on the Status trigger opens the options list first time', async (_name, key) => {
    renderRow({ onEditStatus: vi.fn() })
    statusTrigger().focus()
    await userEvent.keyboard(key)
    expect(await screen.findByRole('option', { name: 'Done' })).toBeInTheDocument()
  })

  it('a single click on PIC opens the options list', async () => {
    renderRow({ onEditPic: vi.fn(), personOptions: people })
    await userEvent.click(picTrigger())
    expect(await screen.findByRole('option', { name: 'Dewi Santoso' })).toBeInTheDocument()
  })

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('%s on the PIC trigger opens the options list first time', async (_name, key) => {
    renderRow({ onEditPic: vi.fn(), personOptions: people })
    picTrigger().focus()
    await userEvent.keyboard(key)
    expect(await screen.findByRole('option', { name: 'Dewi Santoso' })).toBeInTheDocument()
  })

  it('Escape on the Status editor returns focus to the Status trigger', async () => {
    renderRow({ onEditStatus: vi.fn() })
    await userEvent.click(statusTrigger())
    await screen.findByRole('option', { name: 'Done' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task status' })).toBeNull())
    expect(document.activeElement).toBe(statusTrigger())
  })

  it('Escape on the PIC editor returns focus to the PIC trigger', async () => {
    renderRow({ onEditPic: vi.fn(), personOptions: people })
    await userEvent.click(picTrigger())
    await screen.findByRole('option', { name: 'Dewi Santoso' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task PIC' })).toBeNull())
    expect(document.activeElement).toBe(picTrigger())
  })
})

// #1033: the inline editors' accessible names are catalog strings, not English literals.
describe('TaskRow — inline editor names follow the locale', () => {
  const people = [{ id: 'p-1', full_name: 'Rina Lestari' }]

  it.each([
    ['en', ['Edit task status', 'Edit task PIC', 'Edit task due date', 'Due date']],
    ['id', ['Ubah status tugas', 'Ubah PIC tugas', 'Ubah tanggal jatuh tempo tugas', 'Tanggal jatuh tempo']],
  ] as const)('%s', async (locale, [status, pic, dueTrigger, dueInput]) => {
    render(
      <I18nProvider initialLocale={locale}>
        <MemoryRouter>
          <table><tbody><TaskRow {...baseProps({ onEditStatus: vi.fn(), onEditPic: vi.fn(), onEditDue: vi.fn(), personOptions: people })} /></tbody></table>
        </MemoryRouter>
      </I18nProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Blocked|Terblokir|Diblokir/ }))
    expect(await screen.findByRole('combobox', { name: status })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: /Rina/ }))
    expect(await screen.findByRole('combobox', { name: pic })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    fireEvent.click(screen.getByRole('button', { name: dueTrigger }))
    expect(screen.getByLabelText(dueInput)).toBeInTheDocument()
  })
})

describe('TaskRow — one tab stop per row, cells reached by arrow keys (#1027)', () => {
  const people = [{ id: 'p-1', full_name: 'Rina Lestari' }, { id: 'p-2', full_name: 'Dewi Santoso' }]
  const editableRow = () => render(
    <MemoryRouter>
      <button type="button">before</button>
      <table><tbody><TaskRow {...baseProps({
        onEditTitle: vi.fn(), onEditStatus: vi.fn(), onEditPic: vi.fn(), onEditDue: vi.fn(), personOptions: people,
        supervisorName: 'Budi Santoso',
      })} /></tbody></table>
      <button type="button">after</button>
    </MemoryRouter>,
  )

  it('Tab crosses an editable row in exactly one stop', async () => {
    const user = userEvent.setup()
    editableRow()
    screen.getByRole('button', { name: 'before' }).focus()
    let stops = 0
    for (let step = 0; step < 10; step += 1) {
      await user.tab()
      if (document.activeElement === screen.getByRole('button', { name: 'after' })) break
      stops += 1
    }
    expect(stops).toBe(1)
  })

  it('the row stop is the title link; Arrow keys walk Status, PIC, Supervisor and Due and back (#1192: Supervisor is a cell, never skipped)', async () => {
    const user = userEvent.setup()
    editableRow()
    screen.getByRole('button', { name: 'before' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /Finalise Q3/ }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Blocked/ }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(picTrigger())
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(supervisorStop())
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit task due date' }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit task due date' }))
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /Finalise Q3/ }))
  })

  it('a cell the narrowed list hides is skipped: Right from the title lands on PIC, never on hidden Status', async () => {
    // The container rules hide cells by display; jsdom has no container queries, so the
    // stylesheet states the outcome for a list narrow enough to drop Status.
    const style = document.createElement('style')
    style.textContent = '.td-status { display: none; }'
    document.head.appendChild(style)
    try {
      const user = userEvent.setup()
      editableRow()
      screen.getByRole('link', { name: /Finalise Q3/ }).focus()
      await user.keyboard('{ArrowRight}')
      expect(document.activeElement).toBe(picTrigger())
      await user.keyboard('{ArrowLeft}')
      expect(document.activeElement).toBe(screen.getByRole('link', { name: /Finalise Q3/ }))
    } finally {
      style.remove()
    }
  })

  it('Enter on the arrow-reached Status cell opens its options', async () => {
    const user = userEvent.setup()
    editableRow()
    screen.getByRole('link', { name: /Finalise Q3/ }).focus()
    await user.keyboard('{ArrowRight}{Enter}')
    expect(await screen.findByRole('option', { name: 'Done' })).toBeInTheDocument()
  })
})

// #1192: the decision cells form ONE roving-focus grid — the current one-tab-stop-per-row model
// extended, not a second keyboard layer. Tab enters at the row's active cell and leaves the grid;
// ↑/↓ move the same column across leaf rows; Supervisor is never skipped; Enter/F2 open the
// focused cell's editor; Escape hands focus back to the cell; cells expose aria-colindex.
describe('TaskRow — decision cells form one roving-focus grid (#1192)', () => {
  const people = [{ id: 'p-1', full_name: 'Rina Lestari' }, { id: 'p-2', full_name: 'Dewi Santoso' }]
  const editable = { onEditTitle: vi.fn(), onEditStatus: vi.fn(), onEditPic: vi.fn(), onEditDue: vi.fn() }

  function gridRows() {
    return render(
      <MemoryRouter>
        <button type="button">before</button>
        <table><tbody>
          <TaskRow {...baseProps({ ...editable, personOptions: people, supervisorName: 'Budi Santoso' })} />
          <TaskRow {...baseProps({
            ...editable,
            task: makeTask({ id: 'task-8', title: 'Recalibrate grind profile', status: 'Open', due_date: '2026-06-20' }),
            leafIndex: 1, ownerName: 'Dewi Santoso', supervisorName: 'Budi Santoso',
          })} />
        </tbody></table>
        <button type="button">after</button>
      </MemoryRouter>,
    )
  }

  const row = (index: number) => document.querySelectorAll('tr.task-row')[index] as HTMLElement
  const supervisorStopIn = (rowEl: HTMLElement) => rowEl.querySelector('.td-supervisor [data-row-stop]') as HTMLElement

  it('arrows cross rows and reach Supervisor; Enter/F2 open the editor; Escape returns; Tab leaves and re-enters at the active cell', async () => {
    const user = userEvent.setup()
    gridRows()

    // AT exposure: existing table semantics + a colindex on every rendered cell.
    const cols = Array.from(row(0).querySelectorAll('td')).map((td) => td.getAttribute('aria-colindex'))
    expect(cols).toEqual(['1', '2', '3', '4', '5'])

    screen.getByRole('button', { name: 'before' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(within(row(0)).getByRole('link', { name: /Finalise Q3/ }))

    // → → → walks into Supervisor (never skipped); ↓ crosses to the same column next row.
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(supervisorStopIn(row(0)))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(supervisorStopIn(row(1)))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(supervisorStopIn(row(0)))

    // F2 opens the focused cell's editor; Escape hands focus back to the cell.
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(within(row(0)).getByRole('button', { name: 'Edit task due date' }))
    await user.keyboard('{F2}')
    expect(await screen.findByLabelText('Due date')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Due date')).toBeNull()
    expect(document.activeElement).toBe(within(row(0)).getByRole('button', { name: 'Edit task due date' }))

    // Enter opens the cell editor; Escape returns focus to the cell again.
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(document.activeElement).toBe(within(row(0)).getByRole('button', { name: /Blocked/ }))
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('option', { name: 'Done' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task status' })).toBeNull())
    expect(document.activeElement).toBe(within(row(0)).getByRole('button', { name: /Blocked/ }))

    // ↓ moves to the next row's same column; Tab leaves the grid from there; Shift-Tab
    // re-enters at the cell that was active when the grid was left.
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(within(row(1)).getByRole('button', { name: /Open/ }))
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(within(row(1)).getByRole('button', { name: 'Edit task due date' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'after' }))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(within(row(1)).getByRole('button', { name: 'Edit task due date' }))
  })

  // #1192 review: the Supervisor stop renders even when no supervisor is assigned — otherwise
  // unassigned rows drop the column from the roving grid and the columns stop lining up.
  it('an unassigned Supervisor cell stays a grid stop: horizontal and vertical arrows cross it, named "Supervisor: none"', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <button type="button">before</button>
        <table><tbody>
          <TaskRow {...baseProps({ ...editable, personOptions: people, supervisorName: '' })} />
          <TaskRow {...baseProps({
            ...editable,
            task: makeTask({ id: 'task-8', title: 'Recalibrate grind profile', status: 'Open', due_date: '2026-06-20' }),
            leafIndex: 1, ownerName: 'Dewi Santoso', supervisorName: '',
          })} />
        </tbody></table>
        <button type="button">after</button>
      </MemoryRouter>,
    )

    const emptyStop = supervisorStopIn(row(0))
    expect(emptyStop).not.toBeNull()
    expect(emptyStop).toHaveAttribute('aria-label', 'Supervisor: none')

    // Horizontal: → from PIC lands on the EMPTY supervisor stop — never skips to Due.
    within(row(0)).getByRole('button', { name: /Rina/ }).focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(emptyStop)
    // Vertical: ↓ reaches the same empty stop in the next row, and ↑ returns.
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(supervisorStopIn(row(1)))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(emptyStop)
  })
})

describe('TaskRow — e7 click-to-edit and cell commit contract', () => {
  it('routes status and PIC picks through the shared commit contract', async () => {
    const onEditStatus = vi.fn().mockResolvedValue(undefined)
    const onEditPic = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditStatus, onEditPic, personOptions: [{ id: 'p-1', full_name: 'Rina Lestari' }, { id: 'p-2', full_name: 'Dewi Santoso' }] })
    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Done' }))
    await waitFor(() => expect(onEditStatus).toHaveBeenCalledWith('task-7', 'Done'))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task status' })).toBeNull())
    fireEvent.click(picTrigger())
    fireEvent.click(screen.getByRole('option', { name: 'Dewi Santoso' }))
    await waitFor(() => expect(onEditPic).toHaveBeenCalledWith('task-7', 'p-2'))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Edit task PIC' })).toBeNull())
    expect(screen.getByRole('button', { name: /Done/ })).toBeInTheDocument()
  })

  it('re-picking the current status closes the editor', () => {
    renderRow({ onEditStatus: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /Blocked/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Blocked' }))
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
    fireEvent.click(picTrigger())
    fireEvent.click(screen.getByRole('option', { name: 'Dewi Santoso' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/reverted/i))
    expect(screen.getByRole('alert')).toHaveTextContent(/retry/i)
    expect(screen.getByRole('combobox', { name: 'Edit task PIC' })).toHaveTextContent('Rina Lestari')
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

// The isNew draft delegates to the shared TaskCreateForm rather than bending TaskRow's own
// columns into a form (task-create-form.test.tsx owns the field-level validation/focus/retry
// behaviour). These tests cover only TaskRow's side of that delegation.
describe('TaskRow — isNew delegates to the shared TaskCreateForm', () => {
  it('renders ONE full-width colSpan row (never a bent per-column layout) and forwards columnSpan', () => {
    renderRow({
      task: makeTask({ id: 'new-task-1', title: '', team_id: null, business_unit_id: '', accountable_person_id: '' }),
      isNew: true,
      columnSpan: 5,
      onEditTitle: vi.fn().mockResolvedValue(undefined),
      onEditTeam: vi.fn().mockResolvedValue(undefined),
      onEditPic: vi.fn().mockResolvedValue(undefined),
      onEditSupervisor: vi.fn().mockResolvedValue(undefined),
    })
    const row = document.querySelector('tr.task-row--create') as HTMLTableRowElement
    expect(row).toBeTruthy()
    const cell = row.querySelector('td.td-create') as HTMLTableCellElement
    expect(cell.colSpan).toBe(5)
    // The form itself, not a table-column grammar, owns the fields.
    expect(screen.getByRole('form', { name: /create task/i })).toBeInTheDocument()
    // The SAME TaskCreateForm the phone card path renders (mobile-grouped-cards.test.tsx) —
    // never a second, drifting desktop-only draft implementation.
    expect(cell.querySelector('.tcf')).toBeTruthy()
  })

  it('Escape on the title discards the draft via onDiscardNewTask', () => {
    const onDiscardNewTask = vi.fn()
    renderRow({
      task: makeTask({ id: 'new-task-2', title: '' }),
      isNew: true,
      onDiscardNewTask,
      onEditTitle: vi.fn().mockResolvedValue(undefined),
      onEditTeam: vi.fn().mockResolvedValue(undefined),
      onEditPic: vi.fn().mockResolvedValue(undefined),
      onEditSupervisor: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
    expect(onDiscardNewTask).toHaveBeenCalledTimes(1)
  })

  it('a create-link failure (linkError) shows Retry and calls onRetryCreate', () => {
    const onRetryCreate = vi.fn()
    renderRow({
      task: makeTask({ id: 'new-task-3', title: 'Ship the café launch' }),
      isNew: true,
      createError: true,
      onRetryCreate,
      onEditTitle: vi.fn().mockResolvedValue(undefined),
      onEditTeam: vi.fn().mockResolvedValue(undefined),
      onEditPic: vi.fn().mockResolvedValue(undefined),
      onEditSupervisor: vi.fn().mockResolvedValue(undefined),
    })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetryCreate).toHaveBeenCalledTimes(1)
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

  it('AC-018: the pencil is hidden at rest and visible when its title cell has focus within', () => {
    const removeStyles = installTaskStyles()
    try {
      renderRow({ onEditTitle: vi.fn().mockResolvedValue(undefined) })
      const pencil = document.querySelector('button.task-row-pencil') as HTMLButtonElement
      const titleCell = document.querySelector('.task-title-cell') as HTMLElement
      expect(getComputedStyle(pencil).visibility).toBe('hidden')
      titleCell.focus()
      pencil.focus()
      // jsdom does not recalculate :focus-within. Apply the declaration from the real CSSOM rule
      // to the focused control, then verify the browser-computed result (not stylesheet text).
      const revealRule = Array.from((document.head.lastElementChild as HTMLStyleElement).sheet!.cssRules)
        .find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes(':focus-within') && rule.cssText.includes('visibility'))
      const revealVisibility = revealRule?.style.getPropertyValue('visibility')
      expect(revealVisibility).toBe('visible')
      pencil.style.visibility = revealVisibility!
      expect(getComputedStyle(pencil).visibility).toBe('visible')
    } finally {
      removeStyles()
    }
  })

  it('AC-018: the condensed title cell reserves room for the pencil', () => {
    const removeStyles = installTaskStyles()
    try {
      renderRow({ condensed: true, onEditTitle: vi.fn().mockResolvedValue(undefined) })
      const titleCell = document.querySelector('.task-title-cell') as HTMLElement
      expect(getComputedStyle(titleCell).paddingRight).toBe('30px')
    } finally {
      removeStyles()
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

describe('TaskRow — inline due date commit, cancel and failure (#982)', () => {
  const openEditor = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Edit task due date' }))
    return screen.getByLabelText('Due date') as HTMLInputElement
  }

  it('the editor is the shared day-first date field', () => {
    renderRow({ onEditDue: vi.fn() })
    const input = openEditor()
    expect(input.tagName).toBe('INPUT')
    // Day-first entry (#1191): a text field showing the format, never the browser's
    // locale-ordered native date input.
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('placeholder', 'dd/mm/yyyy')
    expect(input).toBeVisible()
  })

  it('Enter commits the typed date once, does not open the record, and returns focus to the due cell', async () => {
    const user = userEvent.setup({ delay: null })
    const onEditDue = vi.fn().mockResolvedValue(undefined)
    const onOpen = vi.fn()
    const windowKey = vi.fn()
    window.addEventListener('keydown', windowKey)
    renderRow({ onEditDue, onOpen })
    const input = openEditor()
    await user.clear(input)
    await user.type(input, '05/10/2026')
    windowKey.mockClear()
    await user.keyboard('{Enter}')
    window.removeEventListener('keydown', windowKey)
    expect(onEditDue).toHaveBeenCalledTimes(1)
    expect(onEditDue).toHaveBeenCalledWith('task-7', '2026-10-05')
    expect(onOpen).not.toHaveBeenCalled()
    expect(windowKey).not.toHaveBeenCalled()
    const trigger = await screen.findByRole('button', { name: 'Edit task due date' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Escape cancels without saving and returns focus to the due cell', async () => {
    const onEditDue = vi.fn().mockResolvedValue(undefined)
    renderRow({ onEditDue })
    const input = openEditor()
    fireEvent.change(input, { target: { value: '2026-10-05' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onEditDue).not.toHaveBeenCalled()
    const trigger = await screen.findByRole('button', { name: 'Edit task due date' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('a failed save keeps the editor open with a readable, unclipped error; Retry re-sends the date and closes on success', async () => {
    const removeStyles = installTaskStyles()
    try {
      const user = userEvent.setup({ delay: null })
      const onEditDue = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue(undefined)
      renderRow({ onEditDue })
      const input = openEditor()
      await user.clear(input)
      await user.type(input, '05/10/2026{Enter}')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/retry/i)
      expect(alert).toBeVisible()
      const editor = alert.parentElement as HTMLElement
      const editorStyle = getComputedStyle(editor)
      expect(editorStyle.whiteSpace).toBe('normal')
      expect(editorStyle.flexWrap).toBe('wrap')
      expect(editorStyle.height).toBe('auto')
      expect(editorStyle.overflow).not.toBe('hidden')
      expect(screen.getByLabelText('Due date')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /retry/i }))
      await waitFor(() => expect(screen.queryByLabelText('Due date')).toBeNull())
      expect(onEditDue).toHaveBeenCalledTimes(2)
      expect(onEditDue).toHaveBeenLastCalledWith('task-7', '2026-10-05')
    } finally {
      removeStyles()
    }
  })
  it('keeps focus in the editor while the save is pending (readOnly + aria-busy, never disabled)', async () => {
    let settle!: () => void
    const onEditDue = vi.fn().mockReturnValue(new Promise<void>((r) => { settle = r }))
    renderRow({ onEditDue })
    const input = openEditor()
    fireEvent.change(input, { target: { value: '2026-10-05' } })
    input.focus()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'))
    expect(input).not.toBeDisabled()
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveFocus()
    settle()
    const trigger = await screen.findByRole('button', { name: 'Edit task due date' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('a failed save links the error to the input and announces that the typed date is kept, not reverted (#1024)', async () => {
    const user = userEvent.setup({ delay: null })
    renderRow({ onEditDue: vi.fn().mockRejectedValue(new Error('nope')) })
    const input = openEditor()
    expect(input).not.toHaveAttribute('aria-describedby')
    await user.clear(input)
    await user.type(input, '05/10/2026{Enter}')
    const alert = await screen.findByRole('alert')
    expect(input).toHaveAccessibleDescription(/couldn't save/i)
    expect(input).toHaveAttribute('aria-describedby', alert.id)
    const status = await screen.findByRole('status')
    await waitFor(() => expect(status).toHaveTextContent(/kept/i))
    expect(status).not.toHaveTextContent(/revert/i)
    expect(input).toHaveValue('05/10/2026')
  })

  it('after a failed save the input still shows the typed date with focus in it, and Escape closes the editor', async () => {
    const user = userEvent.setup({ delay: null })
    const onEditDue = vi.fn().mockRejectedValue(new Error('nope'))
    renderRow({ onEditDue })
    const input = openEditor()
    await user.clear(input)
    await user.type(input, '05/10/2026{Enter}')
    await screen.findByRole('alert')
    expect(input).toHaveValue('05/10/2026')
    expect(input).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Due date')).toBeNull()
    const trigger = await screen.findByRole('button', { name: 'Edit task due date' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(onEditDue).toHaveBeenCalledTimes(1)
  })
})

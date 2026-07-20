import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { RecordDetailsPanel } from './record-details-panel'

const VIEWER_ID = 'viewer-person-id'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'In Progress',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'broken', due_date: '2026-06-20',
    objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const people: PersonOption[] = [{ id: VIEWER_ID, full_name: 'Cahya Cafe' }]
const noop = () => {}

function renderPanel(props: Partial<Parameters<typeof RecordDetailsPanel>[0]> = {}) {
  return render(
    <RecordDetailsPanel
      task={makeTask()}
      buName="Cafe Operations"
      people={people}
      editable
      viewerId={VIEWER_ID}
      checklistCount={[2, 5]}
      onStatusChange={noop}
      onPicChange={noop}
      {...props}
    />,
  )
}

describe('RecordDetailsPanel (AC-R02/R04)', () => {
  it('AC-R02: renders an identity row — task name + BU sub-line', () => {
    renderPanel()
    expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument()
    // sub-line: "BU · code"
    expect(screen.getByText(/cafe operations ·/i)).toBeInTheDocument()
  })

  it('AC-R02: identity heading truncates and carries a title attribute (no-bleed)', () => {
    renderPanel()
    const heading = screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })
    expect(heading).toHaveAttribute('title', 'Fix the coffee machine')
  })

  it('V3 focused-record: identityHeadingLevel=2 nests the identity as an h2 (shell owns the h1)', () => {
    renderPanel({ identityHeadingLevel: 2 })
    expect(screen.getByRole('heading', { level: 2, name: 'Fix the coffee machine' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('AC-R02: shows Status, typed ownership, Dates, Checklist count, and completion', () => {
    renderPanel()
    // Status (above the fold) — editor sees the change-status trigger
    expect(screen.getByRole('button', { name: /change status/i })).toBeInTheDocument()
    // Typed ownership
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    expect(screen.getByText('PIC')).toBeInTheDocument()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    // Dates
    expect(screen.getByText(/due/i)).toBeInTheDocument()
    // Checklist count
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
  })

  it('AC-R02: wraps as a labelled region', () => {
    renderPanel()
    expect(screen.getByRole('region', { name: /task details/i })).toBeInTheDocument()
  })

  it('AC-R04: a non-editor viewer sees a read-only StatusPill (no change affordance)', () => {
    renderPanel({ editable: false })
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('compact variant keeps typed ownership + Details but defers identity/status to the drawer header', () => {
    renderPanel({ compact: true })
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
    // identity heading + status trigger are owned by the drawer header — not duplicated
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(document.querySelector('.record-details-compact')).toBeTruthy()
  })
})

// OD-REDESIGN-22 / docs/interaction-contract.md I5: the panel's only inline-editable
// fields are native <select>s (work-line, objective) — there are NO free-typed text/
// number fields here. Per the use-inline-commit primitive's documented reading, a
// select's change IS the commit intent, so these correctly commit EAGERLY (they are not
// routed through the draft/restore hook). This is the I5-conformant behavior for a
// select, not a violation — proving the "Record details fields" contract row.
describe('RecordDetailsPanel — I5 inline edits are eager selects (OD-REDESIGN-22)', () => {
  const workLines = [
    { id: 'wl-1', name: 'Daily prep', type: 'daily' as const },
    { id: 'wl-2', name: 'Launch', type: 'project' as const },
  ]
  const objectives = [
    { id: 'ob-1', name: 'Grow margin' },
    { id: 'ob-2', name: 'Cut waste' },
  ]

  it('the work-line select commits eagerly on change (no Enter/blur needed)', () => {
    const onWorkLineChange = vi.fn()
    renderPanel({
      workLines: workLines as never,
      onWorkLineChange,
    })
    const select = screen.getByRole('combobox', { name: /project.*process|project \/ process/i })
    fireEvent.change(select, { target: { value: 'wl-2' } })
    expect(onWorkLineChange).toHaveBeenCalledWith('wl-2')
  })

  it('the objective select commits eagerly on change', () => {
    const onObjectiveChange = vi.fn()
    renderPanel({
      objectives: objectives as never,
      onObjectiveChange,
    })
    const select = screen.getByRole('combobox', { name: /objective/i })
    fireEvent.change(select, { target: { value: 'ob-2' } })
    expect(onObjectiveChange).toHaveBeenCalledWith('ob-2')
  })
})

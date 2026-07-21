import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
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
const businessUnits: BusinessUnitOption[] = [{ id: 'bu-1', name: 'Cafe Operations' }]
const noop = () => {}
const asyncNoop = async () => {}

function renderPanel(props: Partial<Parameters<typeof RecordDetailsPanel>[0]> = {}) {
  return render(
    <I18nProvider>
      <RecordDetailsPanel
        task={makeTask()}
        buName="Cafe Operations"
        people={people}
        businessUnits={businessUnits}
        editable
        viewerId={VIEWER_ID}
        checklistCount={[2, 5]}
        onStatusChange={noop}
        onUpdateField={asyncNoop}
        {...props}
      />
    </I18nProvider>,
  )
}

// The details panel now renders its ownership + due fields through the shared RecordViewer/
// RecordField grammar (V3 Issue 5 tenant half). The drawer header owns identity + status trigger,
// the RecordFeed owns activity/checklist/notes; the panel keeps the status section (full mode),
// work-line/objective catalog selects, checklist summary, and Mark complete as its own chrome.
// RATIFY-BEFORE-MERGE (field grammar): ownership moved off the bespoke TaskOwnershipCard onto
// RecordViewer ownership fields; PIC label is now "PIC". Business Unit and Team
// are now DISTINCT (the old "Team = BU name" row is removed — plan Task 4 vocabulary contract).
describe('RecordDetailsPanel (AC-R02/R04) — RecordViewer field grammar', () => {
  it('AC-R02: renders an identity row — task name + BU sub-line', () => {
    renderPanel()
    expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument()
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

  it('AC-R02: shows Status, PIC/Supervisor ownership fields, Business Unit distinct from Team, due, checklist, completion', () => {
    renderPanel()
    // Status (above the fold) — editor sees the change-status trigger.
    expect(screen.getByRole('button', { name: /change status/i })).toBeInTheDocument()
    // Ownership fields render through RecordViewer/RecordField.
    expect(screen.getByLabelText('PIC')).toBeInTheDocument()
    expect(screen.getByLabelText('Supervisor')).toBeInTheDocument()
    // Business Unit and Team are DISTINCT: Team shows the honest missing-Team state, not the BU value.
    expect(screen.getByLabelText('Business Unit')).toBeInTheDocument()
    expect(screen.getByText(/not assigned yet/i)).toBeInTheDocument()
    // Mark complete + due + checklist summary.
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    expect(screen.getByLabelText('Due')).toBeInTheDocument()
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
  })

  it('AC-R02: wraps as a labelled region', () => {
    renderPanel()
    expect(screen.getByRole('region', { name: /task details/i })).toBeInTheDocument()
  })

  it('the viewer identity header is suppressed (no duplicate record name heading)', () => {
    renderPanel()
    // Exactly one heading for the task name — the panel identity row, not a second viewer heading.
    expect(screen.getAllByRole('heading', { name: 'Fix the coffee machine' })).toHaveLength(1)
  })

  it('AC-V3-008: editing the due date commits through onUpdateField with the domain-facing key', async () => {
    const onUpdateField = vi.fn(async () => {})
    renderPanel({ onUpdateField })
    const due = screen.getByLabelText('Due') as HTMLInputElement
    fireEvent.change(due, { target: { value: '2026-07-01' } })
    fireEvent.keyDown(due, { key: 'Enter' })
    await waitFor(() => expect(onUpdateField).toHaveBeenCalledWith('dueDate', '2026-07-01'))
  })

  it('AC-V3-008 / dirty: editing a field reports dirty; Escape restores and reports clean without committing', () => {
    const onDirtyChange = vi.fn()
    const onUpdateField = vi.fn(async () => {})
    renderPanel({ onDirtyChange, onUpdateField })
    const due = screen.getByLabelText('Due') as HTMLInputElement
    fireEvent.change(due, { target: { value: '2026-08-01' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    fireEvent.keyDown(due, { key: 'Escape' })
    expect(due.value).toBe('2026-06-20')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(onUpdateField).not.toHaveBeenCalled()
  })

  it('AC-R04: a non-editor viewer sees a read-only StatusPill and read-only ownership fields', () => {
    renderPanel({ editable: false })
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    // Ownership fields render read-only: the value is shown but there is no enabled editor.
    expect(screen.queryByRole('combobox', { name: 'PIC' })).toBeNull()
    expect(screen.getByLabelText('PIC')).toHaveTextContent('Cahya Cafe')
  })

  it('compact variant keeps ownership fields + checklist but defers identity/status to the drawer header', () => {
    renderPanel({ compact: true })
    expect(screen.getByLabelText('PIC')).toBeInTheDocument()
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(document.querySelector('.record-details-compact')).toBeTruthy()
  })
})

// OD-REDESIGN-22 / docs/interaction-contract.md I5: the catalog attribution fields (work-line,
// objective) remain native <select>s — a select's change IS the commit intent, so they commit
// EAGERLY. They stay panel-owned chrome (not RecordViewer fields) because the metadata-only panel
// adapter models ownership + due only; project/objective attribution is supplementary.
describe('RecordDetailsPanel — I5 catalog selects commit eagerly (OD-REDESIGN-22)', () => {
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
    renderPanel({ workLines: workLines as never, onWorkLineChange })
    const select = screen.getByRole('combobox', { name: /project.*process|project \/ process/i })
    fireEvent.change(select, { target: { value: 'wl-2' } })
    expect(onWorkLineChange).toHaveBeenCalledWith('wl-2')
  })

  it('the objective select commits eagerly on change', () => {
    const onObjectiveChange = vi.fn()
    renderPanel({ objectives: objectives as never, onObjectiveChange })
    const select = screen.getByRole('combobox', { name: /objective/i })
    fireEvent.change(select, { target: { value: 'ob-2' } })
    expect(onObjectiveChange).toHaveBeenCalledWith('ob-2')
  })
})

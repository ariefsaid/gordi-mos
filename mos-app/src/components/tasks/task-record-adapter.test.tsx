import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TaskDetail } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'
import {
  createTaskRecordAdapter,
  createTaskFieldCommit,
  teamOwnershipField,
  type TaskRecordAdapterInput,
} from './task-record-adapter'
import type { RecordFieldSpec, RecordViewerAdapter } from '@/components/records/record-viewer.types'

const PIC = 'p-pic'
const SUPERVISOR = 'p-sup'

const people: PersonOption[] = [
  { id: PIC, full_name: 'Riri' },
  { id: SUPERVISOR, full_name: 'Ibnu' },
]
const businessUnits: BusinessUnitOption[] = [
  { id: 'bu-retail', name: 'Retail Ops' },
  { id: 'bu-hq', name: 'HQ Ops' },
]

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Restock oat milk', business_unit_id: 'bu-retail', status: 'Open',
    responsible_person_id: PIC, accountable_person_id: SUPERVISOR,
    consulted_person_ids: [], informed_person_ids: [], description: 'Two cartons short.',
    due_date: '2026-07-25', objective_id: null, work_line_id: null,
    last_activity_at: '2026-07-20T00:00:00Z', archived_at: null,
    created_by: PIC, created_at: '2026-07-19T00:00:00Z', updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

function makeDetail(task: TaskListRow): TaskDetail {
  return {
    task,
    checklist: [
      { id: 'c1', org_id: 'org', task_id: task.id, label: 'Check fridge stock', is_done: false, position: 0, created_at: '', updated_at: '' },
    ],
    events: [
      { id: 'e1', org_id: 'org', task_id: task.id, actor_person_id: PIC, event_type: 'created', from_value: null, to_value: null, created_at: '2026-07-19T00:00:00Z' },
    ],
  }
}

function makeInput(overrides: Partial<TaskRecordAdapterInput> = {}): TaskRecordAdapterInput {
  const task = overrides.detail?.task ?? makeTask()
  return {
    detail: makeDetail(task),
    viewerId: PIC,
    isManager: false,
    people,
    businessUnits,
    onUpdateField: vi.fn(async () => {}),
    onUpdateStatus: vi.fn(async () => {}),
    onArchive: vi.fn(async () => {}),
    onUnarchive: vi.fn(async () => {}),
    ...overrides,
  }
}

function fieldsOf(adapter: RecordViewerAdapter): RecordFieldSpec[] {
  return adapter.metadata.flatMap((s) => s.fields)
}
function fieldByKey(adapter: RecordViewerAdapter, key: string): RecordFieldSpec {
  const f = fieldsOf(adapter).find((x) => x.key === key)
  if (!f) throw new Error(`no field ${key}`)
  return f
}

// NOTE: createTaskPanelAdapter + the RecordDetailsPanel it fed were deleted in the value-first
// record-document redesign — the live TaskSurface renders createTaskRecordAdapter directly through
// RecordViewer, so the metadata-only panel adapter became dead code. Its §Task-11 / AC-V3-009
// coverage is retained by the createTaskRecordAdapter suite below.

describe('createTaskRecordAdapter', () => {
  it('FR-V3-003 / TaskAdapterContract: renders Task identity, BU, PIC/Supervisor/status/due, checklist, events, actions', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    expect(adapter.kind).toBe('task')
    expect(adapter.title).toBe('Restock oat milk')
    expect(adapter.typeLabel).toBe('Task')

    expect(fieldByKey(adapter, 'businessUnit').displayValue).toBe('Retail Ops')
    expect(fieldByKey(adapter, 'pic').displayValue).toBe('Riri')
    expect(fieldByKey(adapter, 'supervisor').displayValue).toBe('Ibnu')
    expect(fieldByKey(adapter, 'status').displayValue).toBe('Open')
    expect(fieldByKey(adapter, 'dueDate').value).toBe('2026-07-25')

    // Checklist is Task content, rendered through a typed slot.
    const checklist = adapter.contentSlots.find((s) => s.id === 'checklist')!
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    render(<>{checklist.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.getByText('Check fridge stock')).toBeInTheDocument()

    expect(adapter.activity).toHaveLength(1)
    expect(adapter.actions.map((a) => a.id)).toContain('complete')
  })

  it('item 2 (owner-eyes): Due displayValue uses the injected formatter family; value stays raw ISO', () => {
    // Default (no formatter) keeps the raw ISO in displayValue — the adapter's own literals.
    const rawDue = fieldByKey(createTaskRecordAdapter(makeInput()), 'dueDate')
    expect(rawDue.value).toBe('2026-07-25')
    expect(rawDue.displayValue).toBe('2026-07-25')

    // When the live surface injects the table's date formatter, the record's Due reads the SAME
    // "Wed 8 Jul"-style string as the table row — never the raw ISO — while the edit control's
    // value is still the ISO the date input reads/writes.
    const formatted = fieldByKey(
      createTaskRecordAdapter(makeInput({ formatDate: (iso) => `fmt(${iso})` })),
      'dueDate',
    )
    expect(formatted.value).toBe('2026-07-25')
    expect(formatted.displayValue).toBe('fmt(2026-07-25)')
  })

  it('owner-eyes item 10: a Done task offers Reopen (secondary), not a dead-end Mark complete', async () => {
    const onUpdateStatus = vi.fn(async () => {})
    const adapter = createTaskRecordAdapter(
      makeInput({ detail: makeDetail(makeTask({ status: 'Done' })), onUpdateStatus }),
    )
    const ids = adapter.actions.map((a) => a.id)
    expect(ids).toContain('reopen')
    expect(ids).not.toContain('complete')
    const reopen = adapter.actions.find((a) => a.id === 'reopen')!
    expect(reopen.intent).toBe('secondary')
    expect(reopen.label).toBe('Reopen')
    await reopen.run()
    expect(onUpdateStatus).toHaveBeenCalledWith('In Progress')
  })

  it('owner-eyes item 10: Open/In Progress/Blocked keep the Mark complete primary', () => {
    for (const status of ['Open', 'In Progress', 'Blocked'] as const) {
      const adapter = createTaskRecordAdapter(makeInput({ detail: makeDetail(makeTask({ status })) }))
      const ids = adapter.actions.map((a) => a.id)
      expect(ids).toContain('complete')
      expect(ids).not.toContain('reopen')
      expect(adapter.actions.find((a) => a.id === 'complete')!.intent).toBe('primary')
    }
  })

  it('§Task-11: PIC/Supervisor labels, Business Unit present, NO Team field before Issue 8, no RACI, checklist inherits ownership', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    const bu = fieldByKey(adapter, 'businessUnit')
    expect(bu.label).toBe('Business Unit')
    // DELIBERATE goal change (§Task-11): no visible Team field until Issue 8's team_id contract.
    expect(fieldsOf(adapter).find((f) => f.key === 'team')).toBeUndefined()
    for (const f of fieldsOf(adapter)) expect(f.label).not.toMatch(/^team$/i)

    expect(fieldByKey(adapter, 'pic').label).toBe('Person in charge (PIC)')
    expect(fieldByKey(adapter, 'supervisor').label).toBe('Supervisor')

    // No RACI vocabulary leaks into any field key/label or content.
    const blob = JSON.stringify(adapter.metadata)
    expect(blob).not.toMatch(/responsible|accountable|consulted|informed|raci/i)

    // Checklist slot introduces no independent owner (no second PIC/Supervisor field).
    const checklist = adapter.contentSlots.find((s) => s.id === 'checklist')!
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    render(<>{checklist.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.queryByText('Person in charge (PIC)')).not.toBeInTheDocument()
    expect(screen.queryByText('Supervisor')).not.toBeInTheDocument()
  })

  it('§Task-11 (Issue-8 gate): a real Team lookup is accepted but renders no Team field yet', () => {
    // DELIBERATE goal change (§Task-11): the adapter still accepts a team input (internal model
    // preserved) but does not render a Team field until Issue 8's team_id contract lands.
    const adapter = createTaskRecordAdapter(makeInput({ team: { id: 't-1', label: 'Café Operations' } }))
    expect(fieldsOf(adapter).find((f) => f.key === 'team')).toBeUndefined()
    expect(fieldByKey(adapter, 'businessUnit').displayValue).toBe('Retail Ops')
  })

  it('AC-V3-009: an archived Task is read-only, keeps hierarchy, and only offers unarchive', () => {
    const task = makeTask({ archived_at: '2026-07-20T10:00:00Z' })
    // A manager may unarchive; the record is still read-only because it is archived.
    const adapter = createTaskRecordAdapter(makeInput({ detail: makeDetail(task), isManager: true }))
    expect(adapter.permission.readOnly).toBe(true)
    expect(adapter.permission.reason).toMatch(/archived/i)
    // Editable metadata is now read-only, but values/hierarchy are preserved.
    expect(fieldByKey(adapter, 'pic').editable).toBe(false)
    expect(fieldByKey(adapter, 'businessUnit').displayValue).toBe('Retail Ops')
    // Only unarchive is allowed; complete/archive are gone.
    expect(adapter.permission.allowedActionIds).toContain('unarchive')
    expect(adapter.permission.allowedActionIds).not.toContain('complete')
  })

  it('AC-V3-009: a viewer who is neither PIC/Supervisor nor manager gets read-only fields', () => {
    const adapter = createTaskRecordAdapter(makeInput({ viewerId: 'stranger', isManager: false }))
    expect(adapter.permission.readOnly).toBe(true)
    expect(fieldByKey(adapter, 'pic').editable).toBe(false)
    expect(adapter.permission.reason).toMatch(/permission/i)
  })
})

describe('createTaskRecordAdapter — R5: the Classification fossil is gone; provenance survives elsewhere', () => {
  // OWNER-RATIFIED DELETE (R5, review r2): the derived Classification row duplicated what the record
  // already carries — "Generated" ⇒ the Generated-by chip, "Project" ⇒ the Project/Process relation,
  // "Ad hoc" ⇒ the absence of both. It only existed because the E7 mockup drew it, so removing it
  // loses no information. These tests assert the row is gone AND that each provenance still surfaces.
  it('never renders a Classification field — ad hoc, generated, or project', () => {
    const adHoc = createTaskRecordAdapter(makeInput())
    const generated = createTaskRecordAdapter(makeInput({
      detail: makeDetail(makeTask({ generated_from_task_def_id: 'def-1' })),
      generatedFromLabel: 'Close the tills',
    }))
    const project = createTaskRecordAdapter(makeInput({
      detail: makeDetail(makeTask({ work_line_id: 'wl-1' })),
      workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
    }))
    for (const adapter of [adHoc, generated, project]) {
      expect(fieldsOf(adapter).find((f) => f.key === 'classification')).toBeUndefined()
    }
  })

  it('a generated task still surfaces its provenance via the Generated-by chip (its own condition)', () => {
    const task = makeTask({ generated_from_task_def_id: 'def-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      generatedFromLabel: 'Close the tills',
    }))
    // The Generated-by chip's condition is the real generated_from_task_def_id resolving a label —
    // independent of any (now-deleted) classification logic. It carries the real task-def title.
    expect(fieldByKey(adapter, 'generatedFrom').displayValue).toBe('Close the tills')
    expect(fieldByKey(adapter, 'generatedFrom').editable).toBe(false)
  })

  it('a project task still surfaces its Project attribution via the Project/Process relation', () => {
    const task = makeTask({ work_line_id: 'wl-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
    }))
    // The Project/Process relation row names the work line — the surviving carrier of "Project".
    expect(fieldByKey(adapter, 'projectProcess').displayValue).toBe('New menu launch')
  })
})

describe('createTaskRecordAdapter — Source names a real work-line/objective attribution only', () => {
  it('shows no Source row for a pure hand-created Ad-hoc task (no naked "Ad hoc" placeholder)', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    expect(fieldsOf(adapter).find((f) => f.key === 'source')).toBeUndefined()
  })

  it('shows Source when a work line names the real attribution (a Process-type work line)', () => {
    const task = makeTask({ work_line_id: 'wl-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      workLines: [{ id: 'wl-1', name: 'Today opening', type: 'process' }],
    }))
    expect(fieldByKey(adapter, 'source').displayValue).toBe('Today opening')
  })

  it('shows Source alongside the Project/Process relation for a Project work line', () => {
    const task = makeTask({ work_line_id: 'wl-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
    }))
    expect(fieldByKey(adapter, 'projectProcess').displayValue).toBe('New menu launch')
    expect(fieldByKey(adapter, 'source').displayValue).toBe('New menu launch')
  })
})

describe('teamOwnershipField — the preserved Issue-8 internal model (not rendered until Issue 8)', () => {
  it('§Task-11: the honest Team model is preserved (missing → migration state; real lookup → label)', () => {
    // The adapter's internal Team model stays honest for Issue 8 even though ownershipFields does
    // not render it yet. This proves the seam that Issue 8 re-enables at the render site.
    const missing = teamOwnershipField(null)
    expect(missing.key).toBe('team')
    expect(missing.editable).toBe(false)
    expect(String(missing.displayValue)).toMatch(/not assigned yet/i)

    const real = teamOwnershipField({ id: 't-1', label: 'HQ Kitchen' })
    expect(real.value).toBe('t-1')
    expect(real.displayValue).toBe('HQ Kitchen')
    expect(real.editable).toBe(false)
  })
})

describe('createTaskFieldCommit — AC-V3-008: domain-facing keys reach the right DAL callback', () => {
  it('routes status through onUpdateStatus and other keys through onUpdateField', async () => {
    const onUpdateField = vi.fn(async () => {})
    const onUpdateStatus = vi.fn(async () => {})
    const commit = createTaskFieldCommit(makeInput({ onUpdateField, onUpdateStatus }))

    await commit('pic', 'p-new')
    expect(onUpdateField).toHaveBeenCalledWith('pic', 'p-new')

    await commit('supervisor', 'p-new-2')
    expect(onUpdateField).toHaveBeenCalledWith('supervisor', 'p-new-2')

    await commit('businessUnit', 'bu-hq')
    expect(onUpdateField).toHaveBeenCalledWith('businessUnit', 'bu-hq')

    await commit('status', 'Done')
    expect(onUpdateStatus).toHaveBeenCalledWith('Done')
    // status never leaks into the field patch path.
    expect(onUpdateField).not.toHaveBeenCalledWith('status', expect.anything())
  })
})

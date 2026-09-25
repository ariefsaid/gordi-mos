import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TaskDetail } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordViewer } from '@/components/records/record-viewer'
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
  { id: SUPERVISOR, full_name: 'Wayan Kusuma' },
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

function makeChecklist(
  task: TaskListRow,
  completed: readonly boolean[],
  labels = completed.map((_, index) => `Checklist item ${index + 1}`),
): TaskDetail['checklist'] {
  return completed.map((is_done, index) => ({
    id: `c${index + 1}`,
    org_id: 'org',
    task_id: task.id,
    label: labels[index],
    is_done,
    position: index,
    created_at: '',
    updated_at: '',
  }))
}

function makeDetail(task: TaskListRow, checklist = makeChecklist(task, [false], ['Check fridge stock'])): TaskDetail {
  return {
    task,
    checklist,
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
    downlineIds: [],
    people,
    businessUnits,
    onUpdateField: vi.fn(async () => {}),
    onUpdateStatus: vi.fn(async () => {}),
    onArchive: vi.fn(async () => {}),
    onUnarchive: vi.fn(async () => {}),
    ...overrides,
  }
}

// Content-first (OD-REDESIGN-90): the Task packs its field sections into ordered CONTENT slots,
// each carrying its specs as `section` DATA — so the record stays inspectable without rendering.
// The metadata region is empty; read the field specs from the content slots' sections.
function fieldsOf(adapter: RecordViewerAdapter): RecordFieldSpec[] {
  return adapter.contentSlots.flatMap((s) => s.section?.fields ?? [])
}
function fieldByKey(adapter: RecordViewerAdapter, key: string): RecordFieldSpec {
  const f = fieldsOf(adapter).find((x) => x.key === key)
  if (!f) throw new Error(`no field ${key}`)
  return f
}

function openOverflowAction(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  return screen.getByRole('menuitem', { name: label })
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
    expect(fieldByKey(adapter, 'supervisor').displayValue).toBe('Wayan Kusuma')
    expect(adapter.headerFields?.find((field) => field.key === 'status')?.displayValue).toBe('Open')
    expect(fieldByKey(adapter, 'dueDate').value).toBe('2026-07-25')

    // Checklist is Task content, rendered through a typed slot.
    const checklist = adapter.contentSlots.find((s) => s.id === 'checklist')!
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    render(<>{checklist.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.getByText('Check fridge stock')).toBeInTheDocument()

    // Ownership and due context follow the checklist before discussion.
    expect(adapter.activity).toHaveLength(0)
    expect(adapter.contentSlots.map((slot) => slot.id)).toEqual(['content', 'checklist', 'ownership', 'activity', 'relations'])
    const activity = adapter.contentSlots.find((s) => s.id === 'activity')!
    render(<>{activity.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.getByText('Created')).toBeInTheDocument()
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

  it('keeps completion available with hierarchy based on Blocked status, checklist readiness, and permission', async () => {
    const blockedTask = makeTask({ status: 'Blocked' })
    const unfinishedTask = makeTask({ status: 'In Progress' })
    const readyTask = makeTask({ status: 'In Progress' })
    const noChecklistTask = makeTask({ status: 'Open' })
    const doneTask = makeTask({ status: 'Done' })
    const readOnlyTask = makeTask({ status: 'Open' })
    const blockedUpdate = vi.fn(async () => {})

    const cases = [
      {
        name: 'Blocked',
        input: makeInput({
          detail: makeDetail(blockedTask, makeChecklist(blockedTask, [true])),
          onUpdateStatus: blockedUpdate,
        }),
        expectedAction: 'complete',
        expectedIntent: 'secondary',
        expectedEditable: true,
      },
      {
        name: 'unfinished checklist',
        input: makeInput({
          detail: makeDetail(unfinishedTask, makeChecklist(unfinishedTask, [true, false])),
        }),
        expectedAction: 'complete',
        expectedIntent: 'secondary',
        expectedEditable: true,
      },
      {
        name: 'ready nonblocked task',
        input: makeInput({
          detail: makeDetail(readyTask, makeChecklist(readyTask, [true])),
        }),
        expectedAction: 'complete',
        expectedIntent: 'primary',
        expectedEditable: true,
      },
      {
        name: 'ready task with no checklist items',
        input: makeInput({ detail: makeDetail(noChecklistTask, []) }),
        expectedAction: 'complete',
        expectedIntent: 'primary',
        expectedEditable: true,
      },
      {
        name: 'Done task',
        input: makeInput({
          detail: makeDetail(doneTask, makeChecklist(doneTask, [true])),
        }),
        expectedAction: 'reopen',
        expectedIntent: 'secondary',
        expectedEditable: true,
      },
      {
        name: 'read-only task',
        input: makeInput({
          detail: makeDetail(readOnlyTask, makeChecklist(readOnlyTask, [false])),
          viewerId: 'stranger',
        }),
        expectedAction: null,
        expectedIntent: null,
        expectedEditable: false,
      },
    ] as const

    for (const testCase of cases) {
      const adapter = createTaskRecordAdapter(testCase.input)
      const status = adapter.headerFields?.find((field) => field.key === 'status')
      expect(status, testCase.name).toBeDefined()
      expect(status!.editable, testCase.name).toBe(testCase.expectedEditable)

      if (!testCase.expectedAction) {
        expect(adapter.actions.map((action) => action.id), testCase.name).not.toContain('complete')
        expect(adapter.headerActionIds, testCase.name).toEqual([])
        expect(adapter.permission.readOnly, testCase.name).toBe(true)
        continue
      }

      const action = adapter.actions.find((candidate) => candidate.id === testCase.expectedAction)
      expect(action, testCase.name).toBeDefined()
      expect(action!.intent, testCase.name).toBe(testCase.expectedIntent)
      expect(adapter.headerActionIds, testCase.name).toContain(testCase.expectedAction)
      expect(adapter.permission.readOnly, testCase.name).toBe(false)

      if (testCase.name === 'Blocked') {
        expect(status!.options?.some((option) => option.value === 'Done')).toBe(true)
        await action!.run()
        expect(blockedUpdate).toHaveBeenCalledWith('Done')
      }
    }
  })

  it('Task ownership keeps Team distinct from Business Unit, with honest migration state and no RACI grammar', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    const bu = fieldByKey(adapter, 'businessUnit')
    expect(bu.label).toBe('Business Unit')
    const team = fieldByKey(adapter, 'team')
    expect(team.label).toBe('Team')
    expect(team.displayValue).toMatch(/not assigned yet/i)
    expect(team.readOnlyReason).toMatch(/migration/i)

    expect(fieldByKey(adapter, 'pic').label).toBe('Person in charge (PIC)')
    expect(fieldByKey(adapter, 'supervisor').label).toBe('Supervisor')

    // No RACI vocabulary leaks into any field key/label or content.
    const blob = JSON.stringify(adapter.contentSlots.map((s) => s.section))
    expect(blob).not.toMatch(/responsible|accountable|consulted|informed|raci/i)

    // Checklist slot introduces no independent owner (no second PIC/Supervisor field).
    const checklist = adapter.contentSlots.find((s) => s.id === 'checklist')!
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    render(<>{checklist.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.queryByText('Person in charge (PIC)')).not.toBeInTheDocument()
    expect(screen.queryByText('Supervisor')).not.toBeInTheDocument()
  })

  it('a real Team lookup renders as Team and never relabels the BU', () => {
    const adapter = createTaskRecordAdapter(makeInput({ team: { id: 't-1', label: 'Café Operations' } }))
    expect(fieldByKey(adapter, 'team').displayValue).toBe('Café Operations')
    expect(fieldByKey(adapter, 'businessUnit').displayValue).toBe('Retail Ops')
  })

  it('AC-V3-009: an archived Task is read-only, keeps hierarchy, and only offers unarchive', () => {
    const task = makeTask({ archived_at: '2026-07-20T10:00:00Z' })
    // A manager above the PIC may unarchive; the record is still read-only because it is archived.
    const adapter = createTaskRecordAdapter(makeInput({ detail: makeDetail(task), viewerId: 'chain-mgr', downlineIds: [PIC] }))
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
    const adapter = createTaskRecordAdapter(makeInput({ viewerId: 'stranger', downlineIds: [] }))
    expect(adapter.permission.readOnly).toBe(true)
    expect(fieldByKey(adapter, 'pic').editable).toBe(false)
    expect(adapter.permission.reason).toMatch(/permission/i)
    // DO-23(b) (census R2 task-record P3-2): the note carries a RECOVERY clause, not a dead end.
    expect(adapter.permission.reason).toMatch(/ask a manager or admin/i)
  })
})

describe('createTaskRecordAdapter — AC-061 on the record: edit/archive follow the PIC-chain fact', () => {
  // The record mirrors the DB gates per persona: PIC edits without Archive; Supervisor and a
  // manager ABOVE the PIC edit and archive; a manager NOT above the PIC (and a peer) read only,
  // with the stated reason and no Archive action — never a viewer-global manager flag.
  function renderAs(viewerId: string, downlineIds: string[]) {
    const adapter = createTaskRecordAdapter(makeInput({ viewerId, downlineIds }))
    return render(
      <I18nProvider>
        <RecordViewer adapter={adapter} mode="page" headingLevel={1} />
      </I18nProvider>,
    )
  }
  const editableOf = (container: HTMLElement, key: string) =>
    container.querySelector(`[data-field-key="${key}"]`)?.getAttribute('data-editable')

  it('the PIC edits every field, keeps the lifecycle action, and gets NO Archive action', () => {
    const { container } = renderAs(PIC, [])
    expect(editableOf(container, 'pic')).toBe('true')
    expect(editableOf(container, 'supervisor')).toBe('true')
    expect(editableOf(container, 'dueDate')).toBe('true')
    expect(screen.getByRole('button', { name: 'Mark complete' })).toHaveClass('btn-outline')
    expect(screen.queryByRole('button', { name: 'Archive task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('the Supervisor edits and gets the Archive action', () => {
    const { container } = renderAs(SUPERVISOR, [])
    expect(editableOf(container, 'pic')).toBe('true')
    expect(editableOf(container, 'dueDate')).toBe('true')
    expect(openOverflowAction('Archive task')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('a manager above the PIC (the PIC is in their downline) edits and gets the Archive action', () => {
    const { container } = renderAs('chain-mgr', [PIC])
    expect(editableOf(container, 'pic')).toBe('true')
    expect(editableOf(container, 'dueDate')).toBe('true')
    expect(openOverflowAction('Archive task')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('a manager NOT above the PIC sees PIC/Supervisor/Due read-only with the reason and NO Archive action', () => {
    const { container } = renderAs('other-mgr', ['someone-else'])
    expect(editableOf(container, 'pic')).toBe('false')
    expect(editableOf(container, 'supervisor')).toBe('false')
    expect(editableOf(container, 'dueDate')).toBe('false')
    expect(screen.getByRole('note')).toHaveTextContent(/permission to edit/i)
    expect(screen.queryByRole('button', { name: 'Archive task' })).not.toBeInTheDocument()
  })

  it('a peer reads the record read-only with the reason and no Archive action', () => {
    const { container } = renderAs('peer', [])
    expect(editableOf(container, 'pic')).toBe('false')
    expect(screen.getByRole('note')).toHaveTextContent(/permission to edit/i)
    expect(screen.queryByRole('button', { name: 'Archive task' })).not.toBeInTheDocument()
  })

  it('AC-061 delta: the record PIC picker offers self + downline (like the inline picker); Supervisor keeps the full list', () => {
    const everyone: PersonOption[] = [
      { id: PIC, full_name: 'Riri' },
      { id: SUPERVISOR, full_name: 'Wayan Kusuma' },
      { id: 'mgr', full_name: 'Made Manager' },
      { id: 'p-out', full_name: 'Far Away' },
    ]
    const { container, unmount } = render(
      <I18nProvider>
        <RecordViewer
          adapter={createTaskRecordAdapter(makeInput({ viewerId: 'mgr', downlineIds: [PIC], people: everyone }))}
          mode="page"
          headingLevel={1}
        />
      </I18nProvider>,
    )
    expect(container).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Person in charge (PIC)' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Person in charge (PIC)' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(['Riri', 'Made Manager'])
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Supervisor' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Supervisor' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim()))
      .toEqual(['Riri', 'Wayan Kusuma', 'Made Manager', 'Far Away'])
    unmount()
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
    const onOpenRelated = vi.fn()
    const task = makeTask({ work_line_id: 'wl-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      onOpenRelated,
      workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
    }))
    // The Project/Process relation row names the work line — the surviving carrier of "Project".
    expect(fieldByKey(adapter, 'projectProcess').displayValue).toBe('New menu launch')
    expect(fieldByKey(adapter, 'projectProcess').href).toBe('/work/projects/wl-1')
    fieldByKey(adapter, 'projectProcess').onOpen?.()
    expect(fieldsOf(adapter).some((field) => field.key === 'source')).toBe(false)
    expect(onOpenRelated).toHaveBeenCalledTimes(1)
    expect(onOpenRelated).toHaveBeenLastCalledWith({ kind: 'work-line', id: 'wl-1' })
  })

  it('keeps Objective as a direct related-record link without adding a duplicate Source field', () => {
    const onOpenRelated = vi.fn()
    const task = makeTask({ objective_id: 'obj-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      objectives: [{ id: 'obj-1', name: 'Grow direct orders' }],
      onOpenRelated,
    }))
    const objective = fieldByKey(adapter, 'objective')
    expect(objective.displayValue).toBe('Grow direct orders')
    expect(objective.href).toBe('/work/objectives/obj-1')
    objective.onOpen?.()
    expect(onOpenRelated).toHaveBeenCalledWith({ kind: 'objective', id: 'obj-1' })
    expect(fieldsOf(adapter).filter((field) => field.key === 'source')).toHaveLength(0)
  })
})

describe('createTaskRecordAdapter — context and overdue cue', () => {
  it('shows the due date once in context and flags only genuinely overdue active tasks', () => {
    const overdueDate = new Date('2026-07-26T02:00:00.000Z')
    const overdue = createTaskRecordAdapter(makeInput({
      detail: makeDetail(makeTask({ due_date: '2026-07-25' })),
      now: overdueDate,
    }))
    const dueField = fieldByKey(overdue, 'dueDate')
    expect(dueField.value).toBe('2026-07-25')
    expect(overdue.headerContext).toEqual([{ key: 'overdue', label: 'Due date', displayValue: 'Overdue' }])
    expect(fieldsOf(overdue).filter((field) => field.key === 'dueDate')).toHaveLength(1)
    expect(fieldsOf(overdue).some((field) => field.key === 'source')).toBe(false)

    const done = createTaskRecordAdapter(makeInput({
      detail: makeDetail(makeTask({ status: 'Done', due_date: '2026-07-25' })),
      now: overdueDate,
    }))
    expect(done.headerContext).toEqual([])
  })
})

describe('teamOwnershipField — honest Team model and viewer-scoped options', () => {
  it('missing → migration state; real lookup → label', () => {
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

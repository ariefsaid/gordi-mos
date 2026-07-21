import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TaskDetail } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'
import {
  createTaskRecordAdapter,
  createTaskPanelAdapter,
  createTaskFieldCommit,
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

describe('createTaskPanelAdapter (metadata-only, for the live RecordDetailsPanel)', () => {
  it('TaskPanelAdapterContract: renders ONLY ownership + due metadata — no activity, content, or actions', () => {
    const adapter = createTaskPanelAdapter({
      task: makeTask(), editable: true, people, businessUnits,
    })
    expect(adapter.kind).toBe('task')
    // Ownership + due fields render through the shared field grammar.
    expect(fieldByKey(adapter, 'businessUnit').displayValue).toBe('Retail Ops')
    expect(fieldByKey(adapter, 'pic').displayValue).toBe('Riri')
    expect(fieldByKey(adapter, 'supervisor').displayValue).toBe('Ibnu')
    expect(fieldByKey(adapter, 'dueDate').value).toBe('2026-07-25')
    // Metadata-only: no activity/content/actions (the drawer header + RecordFeed own those).
    expect(adapter.activity).toEqual([])
    expect(adapter.contentSlots).toEqual([])
    expect(adapter.actions).toEqual([])
    // Status is NOT a panel field (owned by the header / status trigger).
    expect(fieldsOf(adapter).find((f) => f.key === 'status')).toBeUndefined()
  })

  it('TaskVocabularyContract: Business Unit and Team are distinct; missing Team is an honest read-only state, never the BU value', () => {
    const adapter = createTaskPanelAdapter({ task: makeTask(), editable: true, people, businessUnits })
    const bu = fieldByKey(adapter, 'businessUnit')
    const team = fieldByKey(adapter, 'team')
    expect(bu.label).toBe('Business Unit')
    expect(bu.displayValue).toBe('Retail Ops')
    expect(team.label).toBe('Team')
    expect(team.editable).toBe(false)
    expect(team.displayValue).not.toBe('Retail Ops')
    expect(team.displayValue).toMatch(/not assigned/i)
    // No RACI vocabulary anywhere.
    for (const f of fieldsOf(adapter)) {
      expect(f.label).not.toMatch(/responsible|accountable|consulted|informed|raci/i)
    }
  })

  it('a real Team-backed lookup shows the Team label (never the honest-missing state)', () => {
    const adapter = createTaskPanelAdapter({
      task: makeTask(), editable: true, people, businessUnits,
      team: { id: 'team-hq', label: 'HQ Kitchen' },
    })
    const team = fieldByKey(adapter, 'team')
    expect(team.displayValue).toBe('HQ Kitchen')
  })

  it('AC-V3-009: a non-editor sees read-only fields with the permission reason', () => {
    const adapter = createTaskPanelAdapter({
      task: makeTask(), editable: false, people, businessUnits,
      readOnlyReason: 'This task is archived',
    })
    expect(adapter.permission.readOnly).toBe(true)
    expect(fieldByKey(adapter, 'pic').editable).toBe(false)
    expect(fieldByKey(adapter, 'pic').readOnlyReason).toBe('This task is archived')
  })
})

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

  it('TaskVocabularyContract: PIC/Supervisor labels, BU separate from Team-not-assigned, no RACI, checklist inherits ownership', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    const bu = fieldByKey(adapter, 'businessUnit')
    const team = fieldByKey(adapter, 'team')
    expect(bu.label).toBe('Business Unit')
    expect(team.label).toBe('Team')
    // The missing-Team honesty: Team is NOT relabeled from Business Unit.
    expect(team.displayValue).not.toBe(bu.displayValue)
    expect(team.displayValue).toMatch(/not assigned yet/i)
    expect(team.editable).toBe(false)

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

  it('a real task.team_id lookup populates a read-only Team field distinct from Business Unit', () => {
    const adapter = createTaskRecordAdapter(makeInput({ team: { id: 't-1', label: 'Café Operations' } }))
    const team = fieldByKey(adapter, 'team')
    expect(team.displayValue).toBe('Café Operations')
    expect(team.displayValue).not.toBe(fieldByKey(adapter, 'businessUnit').displayValue)
    // Issue 5 has no team write path — the field stays read-only.
    expect(team.editable).toBe(false)
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

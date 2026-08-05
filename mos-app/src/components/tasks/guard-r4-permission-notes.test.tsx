/**
 * MECH-GUARD R4 — a read-only record explains itself ONCE, never per field (structural layer).
 *
 * Owner catch (review r4): a task the viewer couldn't edit stamped the same "you can't edit
 * this task" line onto every field — a wall of identical reasons with zero per-field intent.
 * The fix: the ONE whole-record reason renders once in RecordViewer's footer
 * (.record-viewer__permission-note); fields render read-only silently.
 * Skill rule mechanized: impeccable critique heuristic 8, Aesthetic & Minimalist Design —
 * "Interfaces should not contain irrelevant or rarely needed information. Every element
 * should serve a purpose." (.claude/skills/impeccable/reference/critique.md)
 *
 * Structure asserted through the REAL production path — createTaskRecordAdapter rendered by
 * RecordViewer — not a synthetic fixture, so a regression in either layer trips it:
 *   read-only record → exactly 1 footer note, 0 per-field .record-field__reason lines.
 *   editable record  → 0 notes, 0 reason lines.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskDetail } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { RecordViewer } from '@/components/records/record-viewer'
import { createTaskRecordAdapter, type TaskRecordAdapterInput } from './task-record-adapter'

const PIC = 'p-pic'
const SUPERVISOR = 'p-sup'
const STRANGER = 'p-stranger'

const people: PersonOption[] = [
  { id: PIC, full_name: 'Riri' },
  { id: SUPERVISOR, full_name: 'Wayan Kusuma' },
  { id: STRANGER, full_name: 'Made Santika' },
]
const businessUnits: BusinessUnitOption[] = [{ id: 'bu-retail', name: 'Retail Ops' }]

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Restock oat milk', business_unit_id: 'bu-retail',
    status: 'Open', responsible_person_id: PIC, accountable_person_id: SUPERVISOR,
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

function renderRecord(overrides: Partial<TaskRecordAdapterInput> = {}) {
  const task = overrides.detail?.task ?? makeTask()
  const adapter = createTaskRecordAdapter({
    detail: makeDetail(task),
    viewerId: STRANGER, // not R, not A, not creator → read-only
    isManager: false,
    people,
    businessUnits,
    onUpdateField: vi.fn(async () => {}),
    onUpdateStatus: vi.fn(async () => {}),
    onArchive: vi.fn(async () => {}),
    onUnarchive: vi.fn(async () => {}),
    ...overrides,
  })
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
  render(
    <RecordViewer adapter={adapter} mode="panel" onCommitField={vi.fn(async () => {})} />,
    { wrapper },
  )
  return adapter
}

const notes = () => document.querySelectorAll('.record-viewer__permission-note')
const fieldReasons = () => document.querySelectorAll('.record-field__reason')

describe('GUARD-R4: a record renders at most ONE not-permitted reason line', () => {
  it('GUARD-R4: read-only viewer → exactly 1 footer note, 0 per-field reason lines', () => {
    const adapter = renderRecord({ viewerId: STRANGER })
    expect(adapter.permission.readOnly).toBe(true) // precondition: this IS the read-only path
    expect(notes()).toHaveLength(1)
    expect(fieldReasons()).toHaveLength(0)
  })

  it('GUARD-R4: archived record (read-only for everyone) → still exactly 1 note, 0 per-field reasons', () => {
    renderRecord({
      viewerId: PIC, // even the PIC reads an archived record read-only
      detail: makeDetail(makeTask({ archived_at: '2026-07-21T00:00:00Z' })),
    })
    expect(notes()).toHaveLength(1)
    expect(fieldReasons()).toHaveLength(0)
  })

  it('GUARD-R4: editable viewer → zero permission noise anywhere', () => {
    const adapter = renderRecord({ viewerId: PIC })
    expect(adapter.permission.readOnly).toBe(false)
    expect(notes()).toHaveLength(0)
    expect(fieldReasons()).toHaveLength(0)
  })
})

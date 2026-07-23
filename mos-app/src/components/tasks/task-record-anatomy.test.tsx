import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskDetail } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { RecordViewer } from '@/components/records/record-viewer'
import { createTaskRecordAdapter, type TaskRecordAdapterInput } from './task-record-adapter'

// ── Census Step 2.5 — Task record anatomy conformance (docs/specs/record-page-anatomy.spec.md
// §2.2 / §3, FR-ANAT-009, AC-ANAT-005/006/009). This is the EXECUTABLE body of Step 2.5 for the
// Task record: it composes the record the way the live host does (createTaskRecordAdapter → the
// shared RecordViewer), extracts the observed section-order vector from the rendered DOM, asserts
// observed === declared, and evaluates the FAIL gates F1–F5. A green mechanical guard does NOT
// substitute for this recorded pass.

const DECLARED = ['content', 'ownership', 'relations', 'checklist', 'activity'] as const

const PIC = 'p-pic'
const SUPERVISOR = 'p-sup'
const people: PersonOption[] = [
  { id: PIC, full_name: 'Riri' },
  { id: SUPERVISOR, full_name: 'Ibnu' },
]
const businessUnits: BusinessUnitOption[] = [{ id: 'bu-retail', name: 'Retail Ops' }]

const LONG_TITLE =
  'Restock the oat milk before the Monday morning rush and reconcile the fridge count against the delivery note'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: LONG_TITLE, business_unit_id: 'bu-retail', status: 'Open',
    responsible_person_id: PIC, accountable_person_id: SUPERVISOR,
    consulted_person_ids: [], informed_person_ids: [], description: 'Two cartons short since Friday.',
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

function renderRecord(overrides: Partial<TaskRecordAdapterInput> = {}) {
  const adapter = createTaskRecordAdapter(makeInput(overrides))
  return render(
    <I18nProvider>
      <RecordViewer adapter={adapter} mode="page" headingLevel={1} />
    </I18nProvider>,
  )
}

function observedVector(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-content-slot]')].map(
    (n) => (n as HTMLElement).dataset.contentSlot!,
  )
}

describe('Census Step 2.5 — Task record anatomy conformance (AC-ANAT-009)', () => {
  it('observed section-order vector === declared [content, ownership, relations, checklist, activity]', () => {
    const { container } = renderRecord()
    expect(observedVector(container)).toEqual([...DECLARED])
  })

  it('F1 — content leads: the first body region after identity is content, with no metadata region before it (AC-ANAT-006)', () => {
    const { container } = renderRecord()
    expect(observedVector(container)[0]).toBe('content')
    const regions = [...container.querySelectorAll('[data-viewer-region]')].map((n) => (n as HTMLElement).dataset.viewerRegion)
    expect(regions.filter((r) => r === 'metadata')).toHaveLength(0)
    // The description prose renders in the content region, directly beneath the identity title and
    // above the Ownership section.
    const content = container.querySelector('[data-content-slot="content"]')!
    expect(content.textContent).toContain('Two cartons short since Friday.')
    const slots = observedVector(container)
    expect(slots.indexOf('content')).toBeLessThan(slots.indexOf('ownership'))
  })

  it('F2 — the identity heading is the full Task title (unclipped), and the title is not re-listed as a field', () => {
    const { container } = renderRecord()
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe(LONG_TITLE)
    expect(h1.textContent!.endsWith('…')).toBe(false)
    // No content region re-renders the title as a field row (no duplicate name).
    expect(container.querySelector('[data-field-key="title"]')).toBeNull()
  })

  it('F3 — a read-only Task carries at most ONE whole-record note and no per-field provenance captions', () => {
    // A viewer who is neither PIC/Supervisor nor manager gets a read-only record.
    const { container } = renderRecord({ viewerId: 'stranger', isManager: false })
    expect(container.querySelectorAll('.record-field__reason')).toHaveLength(0)
    expect(container.querySelectorAll('.record-viewer__permission-note')).toHaveLength(1)
  })

  it('F4 — no raw diff dump; the event log lives in exactly ONE region (activity)', () => {
    const { container } = renderRecord()
    const activityRegions = [...container.querySelectorAll('[data-content-slot]')].filter((n) =>
      n.querySelector('.record-viewer__activity'),
    )
    expect(activityRegions).toHaveLength(1)
    expect((activityRegions[0] as HTMLElement).dataset.contentSlot).toBe('activity')
    expect(container.textContent).not.toMatch(/→/) // no old→new diff arrows in the default view
  })

  it('F5 — every record-mutating action resolves to ONE actions register (AC-ANAT-005)', () => {
    const { container } = renderRecord()
    // Editable task offers Mark complete + Archive — both in the single footer actions cluster.
    expect(container.querySelectorAll('.record-viewer__actions')).toHaveLength(1)
  })

  it('Status + Due ride with the content region (LAW-2), not a downstream metadata block', () => {
    const { container } = renderRecord()
    const content = container.querySelector('[data-content-slot="content"]')!
    expect(content.querySelector('[data-field-key="status"]')).toBeTruthy()
    expect(content.querySelector('[data-field-key="dueDate"]')).toBeTruthy()
  })
})

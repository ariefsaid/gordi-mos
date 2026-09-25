import { describe, it, expect, vi } from 'vitest'
import { render, within, fireEvent } from '@testing-library/react'
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

const DECLARED = ['content', 'checklist', 'ownership', 'activity', 'relations'] as const

const PIC = 'p-pic'
const SUPERVISOR = 'p-sup'
const people: PersonOption[] = [
  { id: PIC, full_name: 'Riri' },
  { id: SUPERVISOR, full_name: 'Wayan Kusuma' },
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
  it('shows the declared work-first order without requiring section-tab navigation', () => {
    const { container } = renderRecord()
    expect(observedVector(container)).toEqual([...DECLARED])
    expect(within(container).queryByRole('tablist')).toBeNull()
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
    // The pinned action header owns the editable title field.
    expect(container.querySelector('[data-field-key="title"]')).toBeTruthy()
  })

  it('F3 — a read-only Task carries at most ONE whole-record note and no per-field provenance captions', () => {
    // A viewer who is neither PIC/Supervisor nor manager gets a read-only record.
    const { container } = renderRecord({ viewerId: 'stranger', downlineIds: [] })
    // The unassigned Team migration state is a real field-specific explanation; it coexists with
    // the single whole-record permission note and is not a duplicated permission caption.
    expect(container.querySelectorAll('.record-field__reason')).toHaveLength(1)
    expect(container.querySelector('.record-field__reason')).toHaveTextContent(/migration/i)
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
    // The promoted lifecycle action has one dedicated header register; secondary actions remain
    // in the footer when the viewer is allowed to use them.
    expect(container.querySelectorAll('[data-record-header-actions="true"]')).toHaveLength(1)
  })

  it('Status stays in the pinned header and Due appears once in task context', () => {
    const { container } = renderRecord()
    const content = container.querySelector('[data-content-slot="content"]')!
    const ownership = container.querySelector('[data-content-slot="ownership"]')!
    expect(container.querySelector('[data-record-header="pinned"] [data-field-key="status"]')).toBeTruthy()
    expect(content.querySelector('[data-field-key="status"]')).toBeNull()
    expect(ownership.querySelectorAll('[data-field-key="dueDate"]')).toHaveLength(1)
  })

  it('keeps the pinned action header, title, checklist, and discussion visible together', () => {
    const { container } = renderRecord()
    expect(container.querySelector('[data-record-header="pinned"]')).toBeTruthy()
    expect(within(container).queryByRole('tablist')).toBeNull()
    expect(container.querySelector('[data-content-slot="checklist"]')).toBeTruthy()
    expect(container.querySelector('[data-content-slot="activity"]')).toBeTruthy()
    expect(container.querySelector('[data-field-key="title"]')).toBeTruthy()
    expect(container.querySelector('[data-field-key="status"] .record-field__pill')).toBeTruthy()
  })

  it('tasks-redesign-B: renders provenance when a task is generated from a process', () => {
    const { container } = renderRecord({
      detail: makeDetail(makeTask({ work_line_id: 'process-1' })),
      workLines: [{ id: 'process-1', name: 'Café Opening', type: 'process' }],
      generatedFromLabel: 'Café Opening',
    })
    expect(container.querySelector('[data-field-key="source"]')).toBeNull()
    expect(container.querySelector('[data-field-key="projectProcess"]')).toHaveTextContent('Café Opening')
    expect(container.querySelector('[data-field-key="generatedFrom"]')).toHaveTextContent('Café Opening')
  })

  it('tasks-redesign-C: keeps the lifecycle action in the pinned header and uses one Activity entry point', () => {
    const { container } = renderRecord({ viewerId: 'chain-mgr', downlineIds: [PIC] })
    const header = container.querySelector('[data-record-header="pinned"]') as HTMLElement
    const actions = container.querySelector('[data-viewer-region="actions"]') as HTMLElement

    expect(within(header).getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    expect(within(actions).queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument()
    fireEvent.click(within(header).getByRole('button', { name: 'More actions' }))
    expect(within(container).getByRole('menuitem', { name: 'Archive task' })).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: 'Activity' })).not.toBeInTheDocument()
    expect(within(container).queryByRole('tablist')).toBeNull()
    expect(container.querySelector('[data-content-slot="activity"]')).toBeTruthy()
  })

  it('surfaces compact ownership and due context once before discussion', () => {
    const { container } = renderRecord()
    const ownership = container.querySelector('[data-content-slot="ownership"]') as HTMLElement
    expect(container.querySelector('[data-record-header-context="true"]')).toBeNull()
    expect(observedVector(container).indexOf('ownership')).toBeLessThan(observedVector(container).indexOf('activity'))
    expect(ownership).toHaveTextContent('Riri')
    expect(ownership).toHaveTextContent('Wayan Kusuma')
    expect(ownership).toHaveTextContent('Due date')
    expect(ownership).toHaveTextContent('2026-07-25')
    expect(ownership.querySelectorAll('[data-field-key="dueDate"]')).toHaveLength(1)
  })

  it('a record on its own page reads h1 then h2, with no level skipped into its sections', () => {
    // The sections are content SLOTS, and the slot context carried no heading rung — so they
    // took the default and a page record read h1 → h3 whatever level the identity was given.
    const { container } = renderRecord()
    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .map((heading) => Number(heading.tagName.slice(1)))

    expect(levels[0], 'the identity owns the page h1').toBe(1)
    for (const [index, level] of levels.entries()) {
      expect(level - (levels[index - 1] ?? level)).toBeLessThanOrEqual(1)
    }
  })

  it('keeps a single editable empty due value in context when no deadline is set', () => {
    const { container } = renderRecord({ detail: makeDetail(makeTask({ due_date: null })) })

    expect(container.querySelector('[data-header-context-key="dueDate"]')).toBeNull()
    expect(container.querySelector('[data-content-slot="ownership"]')).toHaveTextContent('No due date')
  })
})

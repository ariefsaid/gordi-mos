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

const DECLARED = ['content', 'ownership', 'relations', 'checklist', 'activity'] as const

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

/** AC-032's fixture: 4 checklist items, 1 done, and 3 events. */
function makeCountedDetail(task: TaskListRow): TaskDetail {
  return {
    task,
    checklist: [
      { id: 'c1', org_id: 'org', task_id: task.id, label: 'One', is_done: true, position: 0, created_at: '', updated_at: '' },
      { id: 'c2', org_id: 'org', task_id: task.id, label: 'Two', is_done: false, position: 1, created_at: '', updated_at: '' },
      { id: 'c3', org_id: 'org', task_id: task.id, label: 'Three', is_done: false, position: 2, created_at: '', updated_at: '' },
      { id: 'c4', org_id: 'org', task_id: task.id, label: 'Four', is_done: false, position: 3, created_at: '', updated_at: '' },
    ],
    events: [1, 2, 3].map((n) => (
      { id: `e${n}`, org_id: 'org', task_id: task.id, actor_person_id: PIC, event_type: 'created', from_value: null, to_value: null, created_at: '2026-07-19T00:00:00Z' }
    )),
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

function renderRecord(
  overrides: Partial<TaskRecordAdapterInput> = {},
  viewerProps: { mode?: 'panel' | 'page'; canonicalHref?: string; onOpenPage?: () => void } = {},
) {
  const adapter = createTaskRecordAdapter(makeInput(overrides))
  return render(
    <I18nProvider>
      <RecordViewer
        adapter={adapter}
        mode={viewerProps.mode ?? 'page'}
        headingLevel={1}
        // The live host (TaskSurface) always supplies both — mirror it so the ⋯ composition
        // under test is the real one (Archive · Open full page · Copy link).
        canonicalHref={viewerProps.canonicalHref ?? 'http://localhost:3000/mos/work/tasks/task-1'}
        onOpenPage={viewerProps.onOpenPage ?? (() => {})}
      />
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
    const slots = new Set<string>()
    for (const tab of within(container).getAllByRole('tab')) {
      fireEvent.click(tab)
      container.querySelectorAll('[data-content-slot]').forEach((node) => slots.add((node as HTMLElement).dataset.contentSlot!))
    }
    expect([...slots]).toEqual([...DECLARED])
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
    expect(container.querySelectorAll('.record-field__reason')).toHaveLength(0)
    expect(container.querySelectorAll('.record-viewer__permission-note')).toHaveLength(1)
  })

  it('F4 — no raw diff dump; the event log lives in exactly ONE region (activity)', () => {
    const { container } = renderRecord()
    fireEvent.click(within(container).getByRole('tab', { name: 'Activity 1' }))
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
    expect(container.querySelector('[data-record-header="pinned"] [data-field-key="status"]')).toBeTruthy()
    expect(content.querySelector('[data-field-key="dueDate"]')).toBeTruthy()
  })

  it('tasks-redesign-B: pins the action header, tabs the record, and edits the title inline', () => {
    const { container } = renderRecord()
    expect(container.querySelector('[data-record-header="pinned"]')).toBeTruthy()
    expect(within(container).getByRole('tablist')).toBeInTheDocument()
    // #751 AC-032: tabs carry counts — the fixture holds 1 checklist item (0 done) and 1 event.
    for (const label of ['Details', 'Checklist 0/1', 'Activity 1']) {
      expect(within(container).getByRole('tab', { name: label })).toBeInTheDocument()
    }
    expect(container.querySelector('[data-field-key="title"]')).toBeTruthy()
    expect(container.querySelector('[data-field-key="status"] .record-field__pill')).toBeTruthy()
  })

  it('tasks-redesign-B: renders provenance when a task is generated from a process', () => {
    const { container } = renderRecord({
      detail: makeDetail(makeTask({ work_line_id: 'process-1' })),
      workLines: [{ id: 'process-1', name: 'Café Opening', type: 'process' }],
      generatedFromLabel: 'Café Opening',
    })
    expect(container.querySelector('[data-field-key="source"]')).toHaveTextContent('Café Opening')
    expect(container.querySelector('[data-field-key="generatedFrom"]')).toHaveTextContent('Café Opening')
  })
})

// ── Ticket #751 — the pinned header carries identity, meta and the ONE primary ──────────
// Target composition (OD-REDESIGN-62, tasks-redesign-B minus the R/A chips): title row (2-line
// clamp, overflow-wrap: normal) · meta line · one control row [status pill-dropdown · primary ·
// ⋯ overflow]. No bottom action bar; no "Activity" header affordance; one blue per screen.
const HEADER = '[data-record-header="pinned"]'

function openOverflow(container: HTMLElement): HTMLElement {
  const trigger = within(container).getByRole('button', { name: /more actions/i })
  fireEvent.click(trigger)
  const menu = container.querySelector('[role="menu"]') as HTMLElement
  expect(menu).toBeTruthy()
  return menu
}

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
  return { writeText }
}

describe('Ticket #751 AC-031 — the pinned header: meta line, status pill-dropdown, one primary, ⋯ overflow', () => {
  it('header shows the meta line Team · PIC · Supervisor · due · activity age', () => {
    const { container } = renderRecord({
      detail: makeDetail(makeTask({ due_date: '2026-08-28', last_activity_at: '2026-08-28T10:00:00Z' })),
      formatDate: () => 'Fri 28 Aug',
      formatAge: () => '5h',
    })
    const meta = container.querySelector(`${HEADER} [data-record-meta]`)
    expect(meta, 'the pinned header carries a meta line').toBeTruthy()
    expect(meta!.textContent).toContain('Retail Ops')
    expect(meta!.textContent).toContain('PIC Riri')
    expect(meta!.textContent).toContain('Supervisor Wayan')
    expect(meta!.textContent).toContain('due Fri 28 Aug')
    expect(meta!.textContent).toContain('5h')
  })

  it('an unassigned PIC passes through whole — "Belum ditugaskan", never "Belum" (firstName shortens only a person)', () => {
    const { container } = renderRecord({
      detail: makeDetail(makeTask({ responsible_person_id: undefined, accountable_person_id: undefined })),
      recordLabels: { unassigned: 'Belum ditugaskan' },
    })
    const meta = container.querySelector(`${HEADER} [data-record-meta]`)
    expect(meta!.textContent).toContain('PIC Belum ditugaskan')
    expect(meta!.textContent).toContain('Supervisor Belum ditugaskan')
    // The truncated first word is exactly the defect: firstName splits on the first space,
    // so the broken render reads "PIC Belum · …" — the marker cut mid-phrase.
    expect(meta!.textContent).not.toMatch(/PIC Belum(?! d)/)
  })

  it('one .btn-primary "Mark complete", a status pill-dropdown, and a ⋯ menu holding Archive · Open full page · Copy link', () => {
    // The Supervisor both edits (→ Mark complete primary) and may archive (#742) — the persona
    // that sees the menu's full inventory.
    const { container } = renderRecord({ viewerId: SUPERVISOR, downlineIds: [] })
    // The ONE primary lifecycle action lives in the header control row.
    const headerPrimary = container.querySelector(`${HEADER} .btn-primary`)
    expect(headerPrimary).toBeTruthy()
    expect(headerPrimary!.textContent).toBe('Mark complete')
    // Status renders as a pill that opens a picker (pill-dropdown).
    const statusEdit = container.querySelector(`${HEADER} [data-field-key="status"] [aria-haspopup]`)
    expect(statusEdit, 'status pill opens a dropdown').toBeTruthy()
    // The ⋯ overflow holds exactly Archive · Open full page · Copy link, in that order.
    const menu = openOverflow(container)
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent)
    expect(items).toEqual(['Archive task', 'Open full page', 'Copy link'])
  })

  it('Mark complete becomes Reopen on a Done task — still the one primary', () => {
    const { container } = renderRecord({ detail: makeDetail(makeTask({ status: 'Done' })) })
    const headerPrimary = container.querySelector(`${HEADER} .btn-primary`)
    expect(headerPrimary).toBeTruthy()
    expect(headerPrimary!.textContent).toBe('Reopen')
  })

  it('no action bar below the fields; no "Activity" text button in the header', () => {
    const { container } = renderRecord()
    // The bottom action bar renders nothing: the single actions register is the header's.
    const registers = container.querySelectorAll('.record-viewer__actions')
    expect(registers).toHaveLength(1)
    expect(registers[0].closest(HEADER)).toBeTruthy()
    expect(container.querySelector('.record-viewer__activity-affordance')).toBeNull()
  })

  it('the ⋯ menu owns focus entry, Escape and focus return; Copy link copies the canonical record URL', () => {
    const clipboard = stubClipboard()
    const { container } = renderRecord({}, { canonicalHref: 'http://localhost:3000/mos/work/tasks/task-1' })
    const trigger = within(container).getByRole('button', { name: /more actions/i })
    fireEvent.click(trigger)
    // Focus enters the menu on open.
    const menu = container.querySelector('[role="menu"]') as HTMLElement
    expect(menu.contains(document.activeElement)).toBe(true)
    // Copy link writes the canonical record URL.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Copy link' }))
    expect(clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/mos/work/tasks/task-1')
    // Escape closes and returns focus to the trigger.
    fireEvent.click(trigger)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('a viewer with no permitted action gets no primary and a ⋯ without Archive', () => {
    const { container } = renderRecord({ viewerId: 'stranger', downlineIds: [] })
    expect(container.querySelector(`${HEADER} .btn-primary`)).toBeNull()
    // #742 gating lives on the Archive/Unarchive menuitem; the host-supplied doors (Open full
    // page · Copy link) stay — the menu is never an empty dead affordance.
    fireEvent.click(within(container).getByRole('button', { name: /more actions/i }))
    const menu = container.querySelector('[role="menu"]') as HTMLElement
    expect(menu).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: /archive/i })).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: 'Open full page' })).toBeInTheDocument()
  })
})

describe('Ticket #751 AC-032 — tabs carry counts', () => {
  it('1 of 4 checklist items done and 3 events → tabs "Checklist 1/4" · "Activity 3"', () => {
    const { container } = renderRecord({ detail: makeCountedDetail(makeTask()) })
    expect(within(container).getByRole('tab', { name: 'Checklist 1/4' })).toBeInTheDocument()
    expect(within(container).getByRole('tab', { name: 'Activity 3' })).toBeInTheDocument()
  })
})

describe('Ticket #751 AC-030 — the pinned title clamps at two lines without a mid-word break', () => {
  it('the title heading renders inside the pinned-title scope the clamp CSS targets', () => {
    const { container } = renderRecord()
    const heading = container.querySelector(`${HEADER} .record-viewer__pinned-title .record-field__heading`)
    expect(heading).toBeTruthy()
    expect(heading!.textContent).toBe(LONG_TITLE)
  })
})

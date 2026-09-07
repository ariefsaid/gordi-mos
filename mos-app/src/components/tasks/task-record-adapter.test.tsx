import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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
  type ViewerTeamOption,
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
// #756: the writer's viewer-teams the Team picker offers by default. Filtered to the task's
// BU (Retail Ops) already — the surface is the pre-filter site (mos._guard_tasks stays the
// authority).
const VIEWER_TEAMS: ViewerTeamOption[] = [
  { id: 't-cafe', label: 'Café Operations', businessUnitId: 'bu-retail' },
  { id: 't-bar', label: 'Bar Team', businessUnitId: 'bu-retail' },
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
    downlineIds: [],
    people,
    businessUnits,
    // #756: default viewer teams so the Team picker's editable path is exercised by default;
    // an individual test that wants the honest "no eligible team" state passes `viewerTeams: []`.
    viewerTeams: VIEWER_TEAMS,
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

// NOTE: createTaskPanelAdapter + the RecordDetailsPanel it fed were deleted in the value-first
// record-document redesign — the live TaskSurface renders createTaskRecordAdapter directly through
// RecordViewer, so the metadata-only panel adapter became dead code. Its §Task-11 / AC-V3-009
// coverage is retained by the createTaskRecordAdapter suite below.

describe('createTaskRecordAdapter', () => {
  it('FR-V3-003 / TaskAdapterContract: renders Task identity, PIC/Supervisor/status/due, checklist, events, actions', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    expect(adapter.kind).toBe('task')
    expect(adapter.title).toBe('Restock oat milk')
    expect(adapter.typeLabel).toBe('Task')

    // #756 AC-036: the editable Business Unit field is gone; BU rides beneath the owning
    // Team as its "BU: <name>" subline (see the AC-036 suite below for the direct assertion).
    expect(fieldsOf(adapter).find((f) => f.key === 'businessUnit')).toBeUndefined()
    expect(fieldByKey(adapter, 'pic').displayValue).toBe('Riri')
    expect(fieldByKey(adapter, 'supervisor').displayValue).toBe('Wayan Kusuma')
    expect(fieldByKey(adapter, 'status').displayValue).toBe('Open')
    expect(fieldByKey(adapter, 'dueDate').value).toBe('2026-07-25')

    // Checklist is Task content, rendered through a typed slot.
    const checklist = adapter.contentSlots.find((s) => s.id === 'checklist')!
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    render(<>{checklist.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.getByText('Check fridge stock')).toBeInTheDocument()

    // Activity is the LAST content slot (content-first): the event log lives there, quiet, not in
    // a metadata/activity region ahead of the content.
    expect(adapter.activity).toHaveLength(0)
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

  it('owner-eyes item 10, #751 AC-031: a Done task offers Reopen AS THE PRIMARY — never a dead-end Mark complete', async () => {
    const onUpdateStatus = vi.fn(async () => {})
    const adapter = createTaskRecordAdapter(
      makeInput({ detail: makeDetail(makeTask({ status: 'Done' })), onUpdateStatus }),
    )
    const ids = adapter.actions.map((a) => a.id)
    expect(ids).toContain('reopen')
    expect(ids).not.toContain('complete')
    const reopen = adapter.actions.find((a) => a.id === 'reopen')!
    // The header has ONE primary slot; on a Done task Reopen IS it (no quiet secondary anymore).
    expect(reopen.intent).toBe('primary')
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

  it('§Task-11 (#756 deliberate goal): Team is the owning field — Business Unit rides as its subline, PIC/Supervisor keep their labels, no RACI leaks, checklist inherits ownership', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    // #756 deliberate goal change: Team IS a first-class ownership field; no editable BU row.
    expect(fieldsOf(adapter).find((f) => f.key === 'team')).toBeDefined()
    expect(fieldsOf(adapter).find((f) => f.key === 'businessUnit')).toBeUndefined()

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

  it('AC-V3-009: an archived Task is read-only, keeps hierarchy, and only offers unarchive', () => {
    const task = makeTask({ archived_at: '2026-07-20T10:00:00Z' })
    // A manager above the PIC may unarchive; the record is still read-only because it is archived.
    const adapter = createTaskRecordAdapter(makeInput({ detail: makeDetail(task), viewerId: 'chain-mgr', downlineIds: [PIC] }))
    expect(adapter.permission.readOnly).toBe(true)
    expect(adapter.permission.reason).toMatch(/archived/i)
    // Editable metadata is now read-only, but values/hierarchy are preserved.
    expect(fieldByKey(adapter, 'pic').editable).toBe(false)
    // BU rides beneath the Team as its subline (AC-036); on an archived record the Team is
    // still read-only, and the BU subline is still the derived truth.
    expect(fieldByKey(adapter, 'team').helperText).toBe('BU: Retail Ops')
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
        <RecordViewer
          adapter={adapter}
          mode="page"
          headingLevel={1}
          // Host-supplied doors the live TaskSurface always passes — the ⋯ never renders empty.
          canonicalHref="http://localhost:3000/mos/work/tasks/task-1"
          onOpenPage={() => {}}
        />
      </I18nProvider>,
    )
  }
  // #751 R7: lifecycle actions live in the pinned header's ⋯ overflow — open it before asserting.
  function openOverflow() {
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    return document.querySelector('[role="menu"]') as HTMLElement
  }
  const editableOf = (container: HTMLElement, key: string) =>
    container.querySelector(`[data-field-key="${key}"]`)?.getAttribute('data-editable')

  it('the PIC edits every field, keeps the lifecycle action, and gets NO Archive action', () => {
    const { container } = renderAs(PIC, [])
    expect(editableOf(container, 'pic')).toBe('true')
    expect(editableOf(container, 'supervisor')).toBe('true')
    expect(editableOf(container, 'dueDate')).toBe('true')
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    expect(within(openOverflow()).queryByRole('menuitem', { name: 'Archive task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('the Supervisor edits and gets the Archive action', () => {
    const { container } = renderAs(SUPERVISOR, [])
    expect(editableOf(container, 'pic')).toBe('true')
    expect(editableOf(container, 'dueDate')).toBe('true')
    expect(within(openOverflow()).getByRole('menuitem', { name: 'Archive task' })).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('a manager above the PIC (the PIC is in their downline) edits and gets the Archive action', () => {
    const { container } = renderAs('chain-mgr', [PIC])
    expect(editableOf(container, 'pic')).toBe('true')
    expect(editableOf(container, 'dueDate')).toBe('true')
    expect(within(openOverflow()).getByRole('menuitem', { name: 'Archive task' })).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('a manager NOT above the PIC sees PIC/Supervisor/Due read-only with the reason and NO Archive action', () => {
    const { container } = renderAs('other-mgr', ['someone-else'])
    expect(editableOf(container, 'pic')).toBe('false')
    expect(editableOf(container, 'supervisor')).toBe('false')
    expect(editableOf(container, 'dueDate')).toBe('false')
    expect(screen.getByRole('note')).toHaveTextContent(/permission to edit/i)
    expect(within(openOverflow()).queryByRole('menuitem', { name: 'Archive task' })).not.toBeInTheDocument()
  })

  it('a peer reads the record read-only with the reason and no Archive action', () => {
    const { container } = renderAs('peer', [])
    expect(editableOf(container, 'pic')).toBe('false')
    expect(screen.getByRole('note')).toHaveTextContent(/permission to edit/i)
    expect(within(openOverflow()).queryByRole('menuitem', { name: 'Archive task' })).not.toBeInTheDocument()
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
    const picSelect = screen.getByRole('combobox')
    expect(within(picSelect).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual([PIC, 'mgr'])
    fireEvent.blur(picSelect)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Supervisor' }))
    const supSelect = screen.getByRole('combobox')
    expect(within(supSelect).getAllByRole('option').map((o) => o.getAttribute('value')))
      .toEqual([PIC, SUPERVISOR, 'mgr', 'p-out'])
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

    // #756 AC-036: the Team commit key routes through the same field-patch path so the write
    // pipeline (updateTaskFields → team_id) exists on this seam.
    await commit('team', 't-cafe')
    expect(onUpdateField).toHaveBeenCalledWith('team', 't-cafe')

    await commit('status', 'Done')
    expect(onUpdateStatus).toHaveBeenCalledWith('Done')
    // status never leaks into the field patch path.
    expect(onUpdateField).not.toHaveBeenCalledWith('status', expect.anything())
  })
})

// #756 — Task record fields ticket. The AC coverage tests below assert the record's Details tab
// speaks the domain: Team is the owning field, BU rides beneath it, Created by is shown, "Ad hoc"
// replaces "—" on an unattributed relation, Supervisor names its inheritance, Source is a link
// chip, and the honest read-only mirror survives the redesign.

function fieldKeysInOrder(adapter: RecordViewerAdapter, sectionId: string): string[] {
  const section = adapter.contentSlots.find((s) => s.id === sectionId)?.section
  return section ? section.fields.map((f) => f.key) : []
}

describe('createTaskRecordAdapter — #756 AC-036: Team is the owning field, BU rides beneath it', () => {
  it('the Ownership section leads with Team (an editable picker), no editable Business Unit row, PIC, Supervisor, Created by — in that order', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    // Field order in the Ownership content slot section.
    expect(fieldKeysInOrder(adapter, 'ownership')).toEqual([
      'team', 'pic', 'supervisor', 'createdBy',
    ])
    // No editable Business Unit field anywhere on the record.
    expect(fieldsOf(adapter).find((f) => f.key === 'businessUnit')).toBeUndefined()
  })

  it('the Team picker is EDITABLE, offers ONLY the viewer\'s teams, and carries a "BU: <unit>" subline', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    const team = fieldByKey(adapter, 'team')
    expect(team.editable).toBe(true)
    expect(team.control).toBe('select')
    expect(team.options?.map((o) => o.value)).toEqual(['t-cafe', 't-bar'])
    // The subline is the derived BU fact — "BU: Retail Ops" — rendered as helperText,
    // not as a permission reason (the value is legitimately editable).
    expect(team.helperText).toBe('BU: Retail Ops')
    expect(team.readOnlyReason).toBeUndefined()
  })

  it('a real team_id resolves the picker\'s selected label from the viewer-teams set', () => {
    const task = makeTask({ team_id: 't-bar' })
    const adapter = createTaskRecordAdapter(makeInput({ detail: makeDetail(task) }))
    const team = fieldByKey(adapter, 'team')
    expect(team.value).toBe('t-bar')
    expect(team.displayValue).toBe('Bar Team')
  })

  it('when the writer has NO eligible team, the Team field stays visible but read-only with the honest migration copy — never a fabricated value', () => {
    const adapter = createTaskRecordAdapter(makeInput({ viewerTeams: [] }))
    const team = fieldByKey(adapter, 'team')
    expect(team.editable).toBe(false)
    expect(team.readOnlyReason).toMatch(/no team is assigned/i)
    // BU subline still resolves from the task's own BU column — the derived fact never lies.
    expect(team.helperText).toBe('BU: Retail Ops')
  })
})

describe('createTaskRecordAdapter — #756 AC-037: "Created by <first name> · <date>" reads in Ownership, read-only', () => {
  it('renders "Created by <first name> · <date>" using the caller\'s date formatter, at the foot of the Ownership section', () => {
    const adapter = createTaskRecordAdapter(makeInput({
      formatDate: (iso) => `fmt(${iso})`,
    }))
    const created = fieldByKey(adapter, 'createdBy')
    expect(created.editable).toBe(false)
    expect(created.displayValue).toBe('Created by Riri · fmt(2026-07-19T00:00:00Z)')
    // At the foot of Ownership — after Supervisor.
    expect(fieldKeysInOrder(adapter, 'ownership')).toEqual([
      'team', 'pic', 'supervisor', 'createdBy',
    ])
  })
})

describe('createTaskRecordAdapter — #756 AC-038 / DESIGN.md A7: missing optional relation reads "Ad hoc", never "—"', () => {
  it('renders Project/Process as "Ad hoc" when the task has no work_line_id', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    expect(fieldByKey(adapter, 'projectProcess').displayValue).toBe('Ad hoc')
    expect(fieldByKey(adapter, 'projectProcess').displayValue).not.toBe('—')
  })

  it('renders Objective as "Ad hoc" when the task has no objective_id', () => {
    const adapter = createTaskRecordAdapter(makeInput())
    expect(fieldByKey(adapter, 'objective').displayValue).toBe('Ad hoc')
    expect(fieldByKey(adapter, 'objective').displayValue).not.toBe('—')
  })

  it('keeps the real name when a relation IS attributed — the "Ad hoc" state word appears only in absence', () => {
    const task = makeTask({ work_line_id: 'wl-1', objective_id: 'ob-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
      objectives: [{ id: 'ob-1', name: '2026 growth' }],
    }))
    expect(fieldByKey(adapter, 'projectProcess').displayValue).toBe('New menu launch')
    expect(fieldByKey(adapter, 'objective').displayValue).toBe('2026 growth')
  })
})

describe('createTaskRecordAdapter — #756 AC-039: Supervisor names inheritance only when it mirrors the parent Accountable', () => {
  const PARENT_A = 'p-parent-a'
  const peopleWithParent: PersonOption[] = [
    ...people,
    { id: PARENT_A, full_name: 'Dewi Wulan' },
  ]

  it('renders "inherited from <first name>" beneath Supervisor when its value equals the parent Project/Process Accountable', () => {
    const task = makeTask({ accountable_person_id: PARENT_A })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      people: peopleWithParent,
      parentAccountablePersonId: PARENT_A,
    }))
    expect(fieldByKey(adapter, 'supervisor').helperText).toBe('inherited from Dewi')
  })

  it('renders NO hint when Supervisor is a deliberate override (differs from the parent Accountable)', () => {
    const task = makeTask({ accountable_person_id: SUPERVISOR })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      people: peopleWithParent,
      parentAccountablePersonId: PARENT_A,
    }))
    expect(fieldByKey(adapter, 'supervisor').helperText).toBeUndefined()
  })

  it('renders NO hint when the task has no parent (parentAccountablePersonId is null)', () => {
    const adapter = createTaskRecordAdapter(makeInput({ parentAccountablePersonId: null }))
    expect(fieldByKey(adapter, 'supervisor').helperText).toBeUndefined()
  })
})

describe('createTaskRecordAdapter — #756 AC-040: field commit renders Saving → Saved (or error + Retry) beside the field', () => {
  // AC-040 is a UI contract on the shared RecordField primitive — a successful commit renders
  // Saving → Saved; a rejected commit stays in edit mode, PRESERVES the draft, shows an error,
  // and exposes Retry. The adapter's job is to route commits through the shared seam so this
  // feedback appears on EVERY editable field, including the new Team picker. The behavior test
  // below drives the real RecordViewer with a rejecting commit and asserts the error/retry pair.
  it('a rejected Team commit stays in edit mode, PRESERVES the value, and exposes an error + Retry pair on the Team field', async () => {
    const onUpdateField = vi.fn<(field: string, value: string | null) => Promise<void>>()
      .mockRejectedValue(new Error('team write refused'))
    render(
      <I18nProvider>
        <RecordViewer
          adapter={createTaskRecordAdapter(makeInput({ onUpdateField }))}
          mode="page"
          headingLevel={1}
          onCommitField={async (key, value) => {
            if (key === 'team') await onUpdateField('team', value === null ? null : String(value))
          }}
        />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Team' }))
    const teamSelect = screen.getByRole('combobox')
    fireEvent.change(teamSelect, { target: { value: 't-bar' } })
    await screen.findByRole('alert')
    // The error + Retry pair carries the failed commit — feedback beside the SAME field.
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t save/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(onUpdateField).toHaveBeenCalledWith('team', 't-bar')
  })
})

describe('createTaskRecordAdapter — #756 AC-041: a peer sees PIC/Supervisor/Due/Team as values with no edit control and one reason line', () => {
  it("Bulan (a peer) reads every ownership value read-only — the Team field is present but not editable — with the ONE record-level reason", () => {
    // "Bulan" = a viewer who is neither PIC nor Supervisor and has no downline over the PIC. The
    // whole record is read-only; the shared editable policy strips every affordance without
    // stamping a per-field reason — one line at the whole-record level explains why.
    const adapter = createTaskRecordAdapter(makeInput({ viewerId: 'bulan', downlineIds: [] }))
    expect(adapter.permission.readOnly).toBe(true)
    expect(adapter.permission.reason).toMatch(/permission/i)
    for (const key of ['team', 'pic', 'supervisor', 'dueDate'] as const) {
      expect(fieldByKey(adapter, key).editable).toBe(false)
    }
    // Team still carries the derived BU subline — a fact, not a reason line — so the read-only
    // rendering reads the same story as the writer's.
    expect(fieldByKey(adapter, 'team').helperText).toBe('BU: Retail Ops')
  })
})

describe('createTaskRecordAdapter — #756 AC-042: Source is a link chip that opens the parent', () => {
  it('renders Source as a read-only chip carrying a linkHref when a work line names the parent', () => {
    const task = makeTask({ work_line_id: 'wl-1' })
    const adapter = createTaskRecordAdapter(makeInput({
      detail: makeDetail(task),
      workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
      buildSourceHref: ({ workLineId }) => workLineId ? `/parent/${workLineId}` : null,
    }))
    const source = fieldByKey(adapter, 'source')
    expect(source.editable).toBe(false)
    expect(source.displayValue).toBe('New menu launch')
    expect(source.linkHref).toBe('/parent/wl-1')
  })

  it('renders as a real anchor in the DOM (a link the viewer can activate)', () => {
    const task = makeTask({ work_line_id: 'wl-1' })
    render(
      <I18nProvider>
        <RecordViewer
          adapter={createTaskRecordAdapter(makeInput({
            detail: makeDetail(task),
            workLines: [{ id: 'wl-1', name: 'New menu launch', type: 'project' }],
            buildSourceHref: ({ workLineId }) => workLineId ? `/work/projects?q=New%20menu%20launch` : null,
          }))}
          mode="page"
          headingLevel={1}
        />
      </I18nProvider>,
    )
    // The field cell renders as a real <a> so ⌘/Ctrl-click, right-click, tab focus and screen
    // reader "link" semantics all come for free.
    const chip = document.querySelector('[data-field-link="source"]') as HTMLAnchorElement
    expect(chip).not.toBeNull()
    expect(chip.tagName).toBe('A')
    expect(chip.getAttribute('href')).toBe('/work/projects?q=New%20menu%20launch')
  })
})

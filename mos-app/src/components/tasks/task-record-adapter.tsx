// createTaskRecordAdapter — projects the REAL Task model (mos.tasks / TaskDetail) into
// the shared RecordViewer grammar (V3 Issue 5, plan Task 4). A Task stays a Task: this
// adapter does not convert the row into a universal record, and it keeps every Task
// distinction the domain owns.
//
// Vocabulary is BINDING (CONTEXT.md): the legacy storage columns responsible_person_id /
// accountable_person_id are displayed as Person in charge (PIC) and Supervisor. The
// viewer NEVER exposes Responsible / Accountable / RACI / Consulted / Informed. Business
// Unit and Team are DISTINCT fields; while mos.tasks has no team_id the Team field is an
// honest "Team not assigned yet (data migration)" read-only state — never a BU relabel.
// The real Team-backed field/write path is the Issue 8 BU→Team re-home dependency.
//
// The one place the legacy person-storage mismatch is translated is the TaskSurface DAL
// switch (deferred host wiring); this adapter is entirely domain-facing.
import type { ReactNode } from 'react'
import type { TaskDetail } from '@/lib/db/tasks'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { canEdit, canArchive } from './task-permissions'
import type {
  RecordAction,
  RecordFieldOption,
  RecordFieldSpec,
  RecordMetadataSection,
  RecordActivityItem,
  RecordRelation,
  RecordValue,
  RecordViewerAdapter,
} from '@/components/records/record-viewer.types'

export type TaskViewerFieldKey =
  | 'title'
  | 'description'
  | 'dueDate'
  | 'businessUnit'
  | 'pic'
  | 'supervisor'
  | 'projectProcess'
  | 'objective'

export interface TaskTeamView {
  id: string
  label: string
}

export interface TaskRecordAdapterInput {
  detail: TaskDetail
  viewerId: string
  isManager: boolean
  people: readonly PersonOption[]
  businessUnits: readonly BusinessUnitOption[]
  /**
   * Only a real task.team_id lookup may populate this value. Omit or pass null while
   * the current mos.tasks row has no team_id (Issue 8 BU→Team re-home dependency).
   */
  team?: TaskTeamView | null
  onUpdateField: (field: TaskViewerFieldKey, value: string | null) => Promise<void>
  onUpdateStatus: (next: TaskStatus) => Promise<void>
  onArchive: () => Promise<void>
  onUnarchive: () => Promise<void>
  onOpenRelated?: (relation: RecordRelation) => void
}

const TASK_STATUSES: readonly TaskStatus[] = ['Open', 'In Progress', 'Blocked', 'Done']
const TEAM_UNASSIGNED = 'Team not assigned yet (data migration)'

const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  status_changed: 'Status changed',
  field_edited: 'Field edited',
  raci_edited: 'Ownership edited',
  archived: 'Archived',
  unarchived: 'Unarchived',
}

function personOptions(people: readonly PersonOption[]): RecordFieldOption[] {
  return people.map((p) => ({ value: p.id, label: p.full_name }))
}
function personName(people: readonly PersonOption[], id: string | null): string {
  return people.find((p) => p.id === id)?.full_name ?? 'Unassigned'
}
function buOptions(bus: readonly BusinessUnitOption[]): RecordFieldOption[] {
  return bus.map((b) => ({ value: b.id, label: b.name }))
}
function buName(bus: readonly BusinessUnitOption[], id: string): string {
  return bus.find((b) => b.id === id)?.name ?? id
}

/** Wrap a field spec with the shared editable/read-only-reason policy. */
function editableSpec(
  editable: boolean,
  readOnlyReason: string,
  spec: Omit<RecordFieldSpec, 'editable'>,
): RecordFieldSpec {
  return { ...spec, editable, readOnlyReason: editable ? undefined : readOnlyReason }
}

/** i18n-able labels for the shared Task field builders. Defaults are English so the full
 *  createTaskRecordAdapter and the adapter's own unit tests keep their literals; the LIVE
 *  RecordDetailsPanel passes locale-resolved strings (LocaleParityContract). */
export interface TaskFieldLabels {
  businessUnit: string
  pic: string
  supervisor: string
  team: string
  teamUnassigned: string
  teamFromRecord: string
  teamMigration: string
  dueDate: string
}

const DEFAULT_TASK_FIELD_LABELS: TaskFieldLabels = {
  businessUnit: 'Business Unit',
  pic: 'Person in charge (PIC)',
  supervisor: 'Supervisor',
  team: 'Team',
  teamUnassigned: TEAM_UNASSIGNED,
  teamFromRecord: 'Team is set from the task record',
  teamMigration: 'No team is assigned to this task yet (data migration).',
  dueDate: 'Due date',
}

/** The Task ownership fields — Business Unit, PIC, Supervisor, and the DISTINCT honest Team
 *  state — shared by the full record adapter and the metadata-only panel adapter. Business Unit
 *  is NEVER relabelled Team; a real task.team_id lookup fills Team, otherwise it shows the honest
 *  migration state (Issue 5 vocabulary contract). */
function ownershipFields(
  task: Pick<TaskListRow, 'business_unit_id' | 'responsible_person_id' | 'accountable_person_id'>,
  editable: boolean,
  readOnlyReason: string,
  people: readonly PersonOption[],
  businessUnits: readonly BusinessUnitOption[],
  team: TaskTeamView | null | undefined,
  labels: TaskFieldLabels = DEFAULT_TASK_FIELD_LABELS,
): RecordFieldSpec[] {
  return [
    editableSpec(editable, readOnlyReason, {
      key: 'businessUnit',
      label: labels.businessUnit,
      control: 'select',
      value: task.business_unit_id,
      displayValue: buName(businessUnits, task.business_unit_id),
      options: buOptions(businessUnits),
    }),
    editableSpec(editable, readOnlyReason, {
      key: 'pic',
      label: labels.pic,
      control: 'person',
      value: task.responsible_person_id,
      displayValue: personName(people, task.responsible_person_id),
      options: personOptions(people),
    }),
    editableSpec(editable, readOnlyReason, {
      key: 'supervisor',
      label: labels.supervisor,
      control: 'person',
      value: task.accountable_person_id,
      displayValue: personName(people, task.accountable_person_id),
      options: personOptions(people),
    }),
    {
      key: 'team',
      label: labels.team,
      control: 'team',
      value: team?.id ?? null,
      displayValue: team?.label ?? labels.teamUnassigned,
      editable: false,
      readOnlyReason: team ? labels.teamFromRecord : labels.teamMigration,
    },
  ]
}

/** The Task due-date field (a text-like date control that holds a draft), shared by both adapters. */
function dueField(
  task: Pick<TaskListRow, 'due_date'>,
  editable: boolean,
  readOnlyReason: string,
  label: string = DEFAULT_TASK_FIELD_LABELS.dueDate,
): RecordFieldSpec {
  return editableSpec(editable, readOnlyReason, {
    key: 'dueDate',
    label,
    control: 'date',
    value: task.due_date,
    displayValue: task.due_date ?? 'No due date',
  })
}

export interface TaskPanelAdapterInput {
  task: TaskListRow
  editable: boolean
  /** Shown on every field when not editable (archived / no permission). */
  readOnlyReason?: string
  people: readonly PersonOption[]
  businessUnits: readonly BusinessUnitOption[]
  /** Only a real task.team_id lookup may populate this (Issue 8 dependency). */
  team?: TaskTeamView | null
  /** Locale-resolved field labels (LocaleParityContract). Defaults to English. */
  labels?: TaskFieldLabels
  /** Locale-resolved section label. Defaults to "Ownership". */
  sectionLabel?: string
}

/**
 * The metadata-only Task adapter for the LIVE RecordDetailsPanel (V3 Issue 5 tenant half).
 *
 * The panel renders the Task's ownership + due fields through the shared RecordViewer/RecordField
 * grammar, while the drawer header (identity + status) and the RecordFeed (activity / checklist /
 * notes) keep their own chrome. So this adapter is deliberately metadata-ONLY: no activity, no
 * content slots, no actions — those would duplicate the header/feed. Commits route through
 * createTaskFieldCommit at the TaskSurface DAL seam. Business Unit and Team stay DISTINCT.
 */
export function createTaskPanelAdapter(input: TaskPanelAdapterInput): RecordViewerAdapter {
  const { task, editable, people, businessUnits, team } = input
  const labels = input.labels ?? DEFAULT_TASK_FIELD_LABELS
  const readOnlyReason = input.readOnlyReason ?? "You don't have permission to edit this task."

  // One labelled group so the panel shows a single ownership landmark (Business Unit · PIC ·
  // Supervisor · Team · Due) — the identity/status/catalog/checklist stay panel chrome.
  const ownership: RecordMetadataSection = {
    id: 'ownership',
    label: input.sectionLabel ?? 'Ownership',
    fields: [
      ...ownershipFields(task, editable, readOnlyReason, people, businessUnits, team, labels),
      dueField(task, editable, readOnlyReason, labels.dueDate),
    ],
  }

  return {
    kind: 'task',
    id: task.id,
    title: task.title,
    typeLabel: 'Task',
    metadata: [ownership],
    relations: [],
    contentSlots: [],
    activity: [],
    actions: [],
    permission: {
      readOnly: !editable,
      reason: editable ? undefined : readOnlyReason,
      allowedActionIds: [],
    },
    state: 'ready',
  }
}

/** Dispatch a domain-facing field commit to the correct DAL callback. Status is the
 *  one non-`updateTaskFields` field; every other key flows through onUpdateField. */
export function createTaskFieldCommit(
  input: Pick<TaskRecordAdapterInput, 'onUpdateField' | 'onUpdateStatus'>,
): (key: string, value: RecordValue) => Promise<void> {
  return async (key, value) => {
    if (key === 'status') {
      await input.onUpdateStatus(value as TaskStatus)
      return
    }
    await input.onUpdateField(key as TaskViewerFieldKey, value === null ? null : String(value))
  }
}

export function createTaskRecordAdapter(input: TaskRecordAdapterInput): RecordViewerAdapter {
  const { detail, viewerId, isManager, people, businessUnits, team } = input
  const task = detail.task
  const archived = task.archived_at !== null
  const editable = canEdit(task, viewerId, isManager) && !archived
  const canArchiveTask = canArchive(task, viewerId, isManager)

  const readOnlyReason = archived
    ? 'This task is archived'
    : "You don't have permission to edit this task."

  const editSpec = (spec: Omit<RecordFieldSpec, 'editable'>): RecordFieldSpec => ({
    ...spec,
    editable,
    readOnlyReason: editable ? undefined : readOnlyReason,
  })

  const ownership: RecordMetadataSection = {
    id: 'ownership',
    label: 'Ownership',
    // Team is DISTINCT from Business Unit and read-only in Issue 5 (no task.team_id write path
    // yet — Issue 8): a real lookup shows its label, absence shows the honest migration state.
    fields: ownershipFields(task, editable, readOnlyReason, people, businessUnits, team),
  }

  const lifecycle: RecordMetadataSection = {
    id: 'lifecycle',
    label: 'Lifecycle',
    fields: [
      editSpec({
        key: 'status',
        label: 'Status',
        control: 'status',
        value: task.status,
        displayValue: task.status,
        options: TASK_STATUSES.map((s) => ({ value: s, label: s })),
      }),
      dueField(task, editable, readOnlyReason),
    ],
  }

  const details: RecordMetadataSection = {
    id: 'details',
    label: 'Details',
    fields: [
      editSpec({
        key: 'title',
        label: 'Title',
        control: 'text',
        value: task.title,
        displayValue: task.title,
        required: true,
      }),
      editSpec({
        key: 'description',
        label: 'Description',
        control: 'textarea',
        value: task.description,
        displayValue: task.description ?? 'No description',
      }),
    ],
  }

  const activity: RecordActivityItem[] = detail.events.map((e) => ({
    id: e.id,
    label: EVENT_LABELS[e.event_type] ?? e.event_type,
    occurredAt: e.created_at,
  }))

  const actions: RecordAction[] = []
  const allowedActionIds: string[] = []
  if (archived) {
    if (canArchiveTask) {
      actions.push({ id: 'unarchive', label: 'Unarchive', intent: 'secondary', run: input.onUnarchive })
      allowedActionIds.push('unarchive')
    }
  } else {
    if (editable) {
      actions.push({
        id: 'complete',
        label: 'Mark complete',
        intent: 'primary',
        run: () => input.onUpdateStatus('Done'),
      })
      allowedActionIds.push('complete')
    }
    if (canArchiveTask) {
      actions.push({ id: 'archive', label: 'Archive', intent: 'secondary', run: input.onArchive })
      allowedActionIds.push('archive')
    }
  }

  return {
    kind: 'task',
    id: task.id,
    title: task.title,
    typeLabel: 'Task',
    metadata: [ownership, lifecycle, details],
    relations: [],
    contentSlots: [
      {
        id: 'checklist',
        label: 'Checklist',
        render: () => renderChecklist(detail),
      },
    ],
    activity,
    actions,
    permission: {
      readOnly: !editable,
      reason: editable ? undefined : readOnlyReason,
      allowedActionIds,
    },
    state: 'ready',
  }
}

// Checklist is Task content that inherits the parent Task's PIC/Supervisor — it has NO
// independent ownership, status, Team, or due-date controls (plan Task 4).
function renderChecklist(detail: TaskDetail): ReactNode {
  if (detail.checklist.length === 0) {
    return <p className="record-checklist__empty">No checklist items.</p>
  }
  return (
    <ul className="record-checklist" aria-label="Checklist">
      {detail.checklist.map((item) => (
        <li key={item.id} className="record-checklist__item">
          <input type="checkbox" checked={item.is_done} disabled readOnly aria-label={item.label} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

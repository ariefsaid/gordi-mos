// createSignalRecordAdapter — projects the REAL Signal model (mos.signals / SignalDetail)
// into the shared RecordViewer grammar (V3 Issue 5, plan Task 5). A Signal stays a
// Signal: it is NOT given a PIC, Supervisor, due date, Task status, or checklist
// ownership, and it is never turned into a universal record. A retracted Signal is a
// real SignalRow state — its identity and tombstone/retract reason are retained while
// unauthorized correction / acknowledge / comment / link actions are removed.
import type { ReactNode } from 'react'
import type { SignalDetail, SignalRevisionRow } from '@/lib/db/signals'
import type { SignalCorrection, MentionRosters } from '@/lib/db/signals'
import type { TeamOption } from '@/lib/db/signals.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import type { CommentRow } from '@/lib/comments/postComment'
import type {
  RecordAction,
  RecordActivityItem,
  RecordMetadataSection,
  RecordRelation,
  RecordViewerAdapter,
} from '@/components/records/record-viewer.types'

export interface SignalRecordAdapterInput {
  detail: SignalDetail
  revisions: readonly SignalRevisionRow[]
  teams: readonly TeamOption[]
  businessUnits: readonly BusinessUnitOption[]
  people: readonly PersonOption[]
  tasks: readonly TaskListRow[]
  comments: readonly CommentRow[]
  rosters: MentionRosters
  siteName: string | null
  canAcknowledge: boolean
  canCorrect: boolean
  canComment: boolean
  onAcknowledge: () => Promise<void>
  onCorrect: (correction: SignalCorrection) => Promise<void>
  onComment: (body: string) => Promise<void>
  onLinkTask: (taskId: string) => Promise<void>
  onCreateFollowUp: (title: string) => Promise<void>
  onOpenTask: (taskId: string) => void
}

const ATTENTION_OPTIONS = ['FYI', 'Needs attention', 'Urgent'] as const
const SIGNAL_CATEGORIES = [
  'Supply/vendor', 'Equipment/facility', 'Inventory/availability', 'Quality',
  'Customer', 'People', 'Process', 'Other',
] as const

function deriveTitle(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= 80) return trimmed
  return `${trimmed.slice(0, 79)}…`
}

export function createSignalRecordAdapter(input: SignalRecordAdapterInput): RecordViewerAdapter {
  // Only the acknowledge single-shot action and the linked-Task opener are wired by the
  // adapter. Correction, comment, and link affordances need host-owned dialogs (the
  // composer / correction form); the adapter surfaces them as permitted action ids and
  // the Issue 4/6 host renders their controls with input.onCorrect/onComment/onLinkTask.
  const {
    detail, revisions, teams, people, tasks,
    canAcknowledge, canCorrect, canComment,
    onAcknowledge, onOpenTask,
  } = input
  const signal = detail.signal
  const retracted = signal.retracted_at !== null

  const teamName = teams.find((tm) => tm.id === signal.owning_team_id)?.name ?? 'Unknown team'
  const authorName = people.find((p) => p.id === signal.author_id)?.full_name ?? 'Unknown author'

  const correctable = canCorrect && !retracted

  const context: RecordMetadataSection = {
    id: 'context',
    label: 'Context',
    fields: [
      {
        key: 'owningTeam',
        label: 'Owning Team',
        control: 'team',
        value: signal.owning_team_id,
        displayValue: teamName,
        editable: false,
        readOnlyReason: 'Owning Team is fixed after posting',
      },
      {
        key: 'author',
        label: 'Reported by',
        control: 'person',
        value: signal.author_id,
        displayValue: authorName,
        editable: false,
        readOnlyReason: 'The author is fixed after posting',
      },
      {
        key: 'attention',
        label: 'Attention',
        control: 'select',
        value: signal.attention,
        displayValue: signal.attention,
        options: ATTENTION_OPTIONS.map((a) => ({ value: a, label: a })),
        editable: correctable,
        readOnlyReason: correctable ? undefined : retracted ? 'This signal was retracted' : "You can't correct this signal.",
      },
      {
        key: 'category',
        label: 'Category',
        control: 'select',
        value: signal.category,
        displayValue: signal.category ?? 'Uncategorized',
        options: SIGNAL_CATEGORIES.map((c) => ({ value: c, label: c })),
        editable: correctable,
        readOnlyReason: correctable ? undefined : retracted ? 'This signal was retracted' : "You can't correct this signal.",
      },
      {
        key: 'occurredAt',
        label: 'Occurred',
        control: 'date',
        value: signal.occurred_at,
        displayValue: signal.occurred_at,
        editable: false,
        readOnlyReason: 'Set when the signal was captured',
      },
    ],
  }

  const relations: RecordRelation[] = tasks.map((task) => ({
    id: `task-link-${task.id}`,
    kind: 'task',
    label: task.title,
    onOpen: () => onOpenTask(task.id),
  }))

  const activity: RecordActivityItem[] = [
    ...revisions.map((r) => ({
      id: `rev-${r.id}`,
      label: `Edited ${r.field}`,
      detail: r.old_value !== null || r.new_value !== null ? `${r.old_value ?? '—'} → ${r.new_value ?? '—'}` : undefined,
      occurredAt: r.created_at,
    })),
    ...detail.acknowledgements.map((a) => ({
      id: `ack-${a.id}`,
      label: 'Acknowledged',
      detail: people.find((p) => p.id === a.person_id)?.full_name,
      occurredAt: a.created_at,
    })),
  ]

  const actions: RecordAction[] = []
  const allowedActionIds: string[] = []
  if (!retracted) {
    if (canAcknowledge) {
      actions.push({ id: 'acknowledge', label: 'Acknowledge', intent: 'primary', run: onAcknowledge })
      allowedActionIds.push('acknowledge')
    }
    if (canComment) {
      allowedActionIds.push('comment', 'link')
    }
    if (correctable) {
      allowedActionIds.push('correct')
    }
  }

  return {
    kind: 'signal',
    id: signal.id,
    title: deriveTitle(signal.body),
    typeLabel: 'Signal',
    eyebrow: signal.attention,
    metadata: [context],
    relations,
    contentSlots: [
      {
        id: 'body',
        label: 'What happened',
        render: () => renderBody(signal.body),
      },
    ],
    activity,
    actions,
    permission: {
      readOnly: retracted,
      reason: retracted
        ? signal.retract_reason ?? 'This signal was retracted'
        : undefined,
      allowedActionIds,
    },
    state: 'ready',
  }
}

function renderBody(body: string): ReactNode {
  return <p className="record-signal-body">{body}</p>
}

/**
 * The LIVE Signal host wrapper (V3 Issue 5 tenant half). Unlike createSignalRecordAdapter — which
 * projects Signal metadata/actions into the shared grammar for a future full RecordViewer Signal
 * presentation — the live SignalRecordHost keeps its object-specific SignalRecord subtree (author,
 * team, mentions, category picker, comments, follow-up, link, linked-work, retraction tombstone).
 * This wrapper renders that subtree THROUGH RecordViewer as a single typed Signal content slot: the
 * viewer supplies the record-viewer landmark/kind grammar while SignalRecord keeps ownership of the
 * Signal's own display, so none of its 24 goal behaviors are duplicated or lost. Identity is
 * suppressed by the host (SignalRecord already shows the body/heading) and the retraction reason
 * stays SignalRecord's tombstone (not re-rendered here) to avoid a duplicate.
 */
export function wrapSignalRecord(detail: SignalDetail, hostContent: ReactNode): RecordViewerAdapter {
  const signal = detail.signal
  const retracted = signal.retracted_at !== null
  return {
    kind: 'signal',
    id: signal.id,
    title: deriveTitle(signal.body),
    typeLabel: 'Signal',
    eyebrow: signal.attention,
    metadata: [],
    relations: [],
    contentSlots: [{ id: 'signal', label: 'Signal', render: () => hostContent }],
    activity: [],
    actions: [],
    permission: { readOnly: retracted, allowedActionIds: [] },
    state: 'ready',
  }
}

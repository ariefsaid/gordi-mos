// createSignalRecordAdapter — projects the REAL Signal model (mos.signals / SignalDetail)
// into the shared RecordViewer grammar (V3 Issue 5, plan Task 5). A Signal stays a
// Signal: it is NOT given a PIC, Supervisor, due date, Task status, or checklist
// ownership, and it is never turned into a universal record. A retracted Signal is a
// real SignalRow state — its identity and tombstone/retract reason are retained while
// unauthorized correction / acknowledge / comment / link actions are removed.
import type { ReactNode } from 'react'
import type { SignalDetail, SignalRevisionRow } from '@/lib/db/signals'
import type { SignalCorrection, MentionRosters } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import type { TeamOption } from '@/lib/db/signals.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import type { CommentRow } from '@/lib/comments/postComment'
import type { SignalRevisionView } from './signal-record'
import { formatWibDateTime } from '@/lib/wib-time'
import type {
  RecordAction,
  RecordActivityItem,
  RecordFieldSpec,
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

/** P1-3: the live host's identity title is the body's FIRST LINE (not the whole multi-line
 *  prose, which belongs in the body content slot below the identity, never repeated in the
 *  heading — mirrors Task, whose title field is never re-listed in its Details section). */
function firstLine(body: string): string {
  const line = body.trim().split(/\r?\n/)[0] ?? ''
  return line.length <= 80 ? line : `${line.slice(0, 79)}…`
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

  // Facts — the Signal reads as a factual document (E7 "Signal = factual"): who reported it, how
  // it's classified, which Team owns visibility, when it occurred, and how much attention it needs.
  // Author / Team / Occurred are fixed after posting (read-only value + provenance note); Attention
  // and Category are correctable (value-first: the value shows first, activating swaps in the
  // select). Document reading order: author · category · team · occurred · attention.
  const correctionReason = retracted ? 'This signal was retracted' : "You can't correct this signal."
  const context: RecordMetadataSection = {
    id: 'context',
    label: 'Facts',
    fields: [
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
        key: 'category',
        label: 'Category',
        control: 'select',
        value: signal.category,
        displayValue: signal.category ?? 'Uncategorized',
        options: SIGNAL_CATEGORIES.map((c) => ({ value: c, label: c })),
        editable: correctable,
        readOnlyReason: correctable ? undefined : correctionReason,
      },
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
        key: 'occurredAt',
        label: 'Occurred',
        control: 'date',
        value: signal.occurred_at,
        displayValue: signal.occurred_at,
        editable: false,
        readOnlyReason: 'Set when the signal was captured',
      },
      {
        key: 'attention',
        label: 'Attention',
        control: 'select',
        value: signal.attention,
        displayValue: signal.attention,
        options: ATTENTION_OPTIONS.map((a) => ({ value: a, label: a })),
        editable: correctable,
        readOnlyReason: correctable ? undefined : correctionReason,
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
    // The shared identity header is the Signal's primary title in the live viewer. Keep the
    // factual body intact here; table cells still use the truncated presentation title.
    title: signal.body,
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

/** The Signal Facts section (P1-3 anatomy parity) — the SAME label/value row grammar Task's
 *  "Task ownership" / "Status & Timing" sections use (RecordField), converging the two record
 *  kinds' chrome/section rhythm. Every field stays read-only here: Author/Team/Occurred are fixed
 *  after posting (same as createSignalRecordAdapter's `context` builder). Attention has no live
 *  correction affordance anywhere yet (SignalCorrection supports it; no UI wires it), so it stays
 *  a plain read-only row too, matching its actual current capability. Category is deliberately
 *  NOT a Facts row: the dedicated 8-family SignalCategoryPicker (Rule 11 — the SAME widget feed
 *  rows and cards use) already IS the value-display-plus-correct affordance, rendered in the
 *  Signal content slot below — a second Category row here would show the identical value twice
 *  on the page (a real duplicate, unlike Task's Classification/Source pair, which only collapses
 *  when their VALUES happen to match). */
function signalFactsSection(
  signal: SignalRow,
  authorName: string,
  teamName: string,
  businessUnitName: string | null,
  siteName: string | null,
): RecordMetadataSection {
  const fields: RecordFieldSpec[] = [
    {
      key: 'author', label: 'Reported by', control: 'person',
      value: signal.author_id, displayValue: authorName,
      editable: false, readOnlyReason: 'The author is fixed after posting',
    },
    {
      key: 'owningTeam', label: 'Owning Team', control: 'team',
      value: signal.owning_team_id, displayValue: teamName,
      editable: false, readOnlyReason: 'Owning Team is fixed after posting',
    },
    // Business Unit / Site are derived from the owning Team — conditional, same as the prior
    // head block (`{businessUnitName && …}` / `{siteName && …}`), so a Team with no resolved
    // Site (or a still-loading site lookup) shows no empty row.
    ...(businessUnitName
      ? [{
          key: 'businessUnit', label: 'Business Unit', control: 'text' as const,
          value: businessUnitName, displayValue: businessUnitName,
          editable: false,
        }]
      : []),
    ...(siteName
      ? [{
          key: 'site', label: 'Site', control: 'text' as const,
          value: siteName, displayValue: siteName,
          editable: false,
        }]
      : []),
    {
      key: 'occurredAt', label: 'Occurred', control: 'date',
      value: signal.occurred_at, displayValue: formatWibDateTime(signal.occurred_at),
      editable: false, readOnlyReason: 'Set when the signal was captured',
    },
    {
      key: 'attention', label: 'Attention', control: 'text',
      value: signal.attention, displayValue: signal.attention,
      editable: false,
    },
  ]
  return { id: 'facts', label: 'Facts', fields }
}

export interface WrapSignalRecordInput {
  detail: SignalDetail
  authorName: string
  teamName: string
  businessUnitName?: string | null
  siteName?: string | null
  /** Field-edit history — same shape SignalRecord's own revision-history disclosure consumes. */
  revisions: readonly SignalRevisionView[]
  /** Resolved acknowledger name + timestamp, for the shared Activity timeline (distinct from the
   *  "who's acknowledged" roster SignalRecord itself still renders — a timeline vs a roster,
   *  the same duplication Task's own event log already accepts alongside its Status field). */
  acknowledgements: readonly { personName: string; occurredAt: string }[]
  hasAcknowledged: boolean
  /** Whether the current viewer is allowed to acknowledge at all (an unauthenticated/no-viewer
   *  session cannot). Mirrors the live host's existing gate — this adapter adds no new policy. */
  canAcknowledge: boolean
  onAcknowledge: () => void | Promise<void>
  /** The Signal's typed workflow subtree — mentions, shield line, category picker, revision
   *  disclosure, acknowledger roster, linked-work actions, comment thread. Body/identity/Facts
   *  move OUT to the shared grammar below; this is what's left (SignalRecord with its own
   *  header+body suppressed — see signal-record-host.tsx). */
  hostContent: ReactNode
}

/**
 * The LIVE Signal host wrapper (V3 Issue 5 tenant half; P1-3 anatomy parity). Converges the
 * Signal record onto the SAME chrome/section rhythm as Task: the shared RecordViewer identity
 * (SIGNAL overline + title = body's first line) + a Facts metadata section (label/value rows) +
 * a body content slot (prose) + the shared Activity timeline (revisions + acknowledgements) +
 * the shared actions footer (Acknowledge lives there now, matching Task's Mark-complete/Archive
 * placement — SignalRecord no longer renders its own Acknowledge BUTTON, only the "who's
 * acknowledged" roster). SignalRecord's own typed workflow subtree (mentions, shield line,
 * category picker, revision disclosure, linked-work actions, comment thread) still renders
 * through it, as a second content slot — none of its 24 goal behaviors are duplicated or lost,
 * only relocated to the grammar the rest of the record already uses. A retracted Signal drops the
 * body slot entirely (SignalRecord's own tombstone in the workflow slot is the sole message —
 * unchanged from before, still not re-rendered here to avoid a duplicate) but keeps Facts —
 * provenance stays legible even once retracted, the same way an archived Task still shows its
 * ownership fields.
 */
export function wrapSignalRecord(input: WrapSignalRecordInput): RecordViewerAdapter {
  const {
    detail, authorName, teamName, businessUnitName = null, siteName = null,
    revisions, acknowledgements,
    hasAcknowledged, canAcknowledge, onAcknowledge, hostContent,
  } = input
  const signal = detail.signal
  const retracted = signal.retracted_at !== null
  const title = firstLine(signal.body)
  // Title is NOT re-listed in a body slot when the two are identical (a short, single-line
  // Signal — the common case): mirrors createTaskRecordAdapter's own rule ("Title is NOT
  // re-listed... a Title field would render the same name twice"). A multi-line or truncated
  // (>80 char) body still gets its own prose slot with the FULL untruncated text.
  const bodyHasMoreThanTitle = signal.body.trim() !== title

  const activity: RecordActivityItem[] = [
    ...revisions.map((r) => ({
      id: `rev-${r.id}`,
      label: `Edited ${r.field}`,
      detail: r.old_value !== null || r.new_value !== null ? `${r.old_value ?? '—'} → ${r.new_value ?? '—'}` : undefined,
      occurredAt: r.created_at,
    })),
    ...acknowledgements.map((a, i) => ({
      id: `ack-${i}`,
      label: 'Acknowledged',
      detail: a.personName,
      occurredAt: a.occurredAt,
    })),
  ]

  const actions: RecordAction[] = []
  const allowedActionIds: string[] = []
  // Stays visible (as a disabled "Acknowledged" state) rather than disappearing once acted on —
  // matches the prior SignalRecord button's own behavior (disabled, relabelled, never removed).
  if (!retracted && canAcknowledge) {
    actions.push({
      id: 'acknowledge',
      label: hasAcknowledged ? 'Acknowledged' : 'Acknowledge',
      intent: 'primary',
      disabled: hasAcknowledged,
      run: onAcknowledge,
    })
    allowedActionIds.push('acknowledge')
  }

  return {
    kind: 'signal',
    id: signal.id,
    title,
    typeLabel: 'Signal',
    metadata: [signalFactsSection(signal, authorName, teamName, businessUnitName, siteName)],
    relations: [],
    contentSlots: !retracted && bodyHasMoreThanTitle
      ? [
          { id: 'body', label: 'What happened', render: () => renderBody(signal.body) },
          { id: 'workflow', label: 'Signal', render: () => hostContent },
        ]
      : [{ id: 'workflow', label: 'Signal', render: () => hostContent }],
    activity,
    actions,
    // The retraction reason stays SignalRecord's own tombstone message (workflow slot) — never
    // re-surfaced here, so it never appears twice on the page (unchanged from the prior anatomy).
    permission: { readOnly: retracted, allowedActionIds },
    state: 'ready',
  }
}

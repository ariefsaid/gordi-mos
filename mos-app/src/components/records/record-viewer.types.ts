// RecordViewer contract (V3 Issue 5) — a typed PRESENTATION boundary over the
// existing domain models. It is NOT a database abstraction: a Task stays a Task and
// a Signal stays a Signal. Each domain owns an adapter (createTaskRecordAdapter /
// createSignalRecordAdapter) that projects its real row into this shared grammar so
// one RecordViewer can render both while keeping their distinct fields.
//
// Boundaries (docs/plans/2026-07-20-v3-record-viewer.md):
//   • No universal record table, cross-model DB view, or Supabase import here.
//   • RecordKind carries only LIVE, distinct domain models — task | signal | follow-up.
//     There is NO Standard/SOP member: no live Standard/SOP model exists in this checkout,
//     and inventing a fixture would be a fake proxy. `follow-up` is a real model
//     (mos.follow_ups / FollowUpRow, with its own money-shaped lifecycle) — it is added
//     from a real row, exactly the sanctioned "extend from a real model" path.
//   • Task ownership vocabulary is PIC/Supervisor — never Responsible/Accountable/
//     RACI/Consulted/Informed (CONTEXT.md). That translation lives in the Task
//     adapter's persistence edge, never in this contract.
import type { ReactNode } from 'react'

export type RecordKind = 'task' | 'signal' | 'follow-up'

export type RecordViewerMode = 'panel' | 'page'

export type RecordFieldControl =
  | 'text'
  | 'textarea'
  | 'select'
  | 'date'
  | 'person'
  | 'team'
  | 'status'
  | 'relation'

export type RecordValue = string | number | boolean | null

export interface RecordFieldOption {
  value: string
  label: string
}

export interface RecordFieldSpec {
  key: string
  label: string
  control: RecordFieldControl
  value: RecordValue
  /** Human-facing rendering of `value` (resolved lookups, formatted dates, the
   *  honest "Team not assigned yet" copy). The viewer never re-derives this. */
  displayValue: string
  options?: readonly RecordFieldOption[]
  editable: boolean
  /** Why a non-editable field is read-only — surfaced honestly, never hidden. */
  readOnlyReason?: string
  required?: boolean
}

export interface RecordMetadataSection {
  id: string
  label: string
  fields: readonly RecordFieldSpec[]
}

export interface RecordRelation {
  id: string
  kind: RecordKind
  label: string
  href?: string
  onOpen?: () => void
}

/** A domain-owned content region rendered through a typed renderer. Issue 5 only
 *  CONSUMES this seam — no block authoring, JSONB serialization, or fabricated
 *  blocks (those are Issue 10). */
export interface RecordContentSlot {
  id: string
  label: string
  render: (context: { mode: RecordViewerMode; readOnly: boolean }) => ReactNode
}

export interface RecordActivityItem {
  id: string
  label: string
  detail?: string
  occurredAt: string
}

export interface RecordPermission {
  readOnly: boolean
  reason?: string
  allowedActionIds: readonly string[]
}

export interface RecordAction {
  id: string
  label: string
  intent: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  disabledReason?: string
  run: () => Promise<void> | void
}

export interface RecordViewerAdapter {
  kind: RecordKind
  id: string
  title: string
  typeLabel: string
  eyebrow?: string
  metadata: readonly RecordMetadataSection[]
  relations: readonly RecordRelation[]
  contentSlots: readonly RecordContentSlot[]
  activity: readonly RecordActivityItem[]
  actions: readonly RecordAction[]
  permission: RecordPermission
  state: 'ready' | 'empty' | 'error'
  errorMessage?: string
}

// createFollowUpRecordAdapter — projects the REAL Follow-up model (mos.follow_ups /
// FollowUpRow + FollowUpEvent history) into the shared RecordViewer grammar (V3 Issue 5
// pattern, mirroring createTaskRecordAdapter / createSignalRecordAdapter). A Follow-up
// stays a Follow-up: it is money-shaped (counterparty, invoice grain, running balance,
// chase/promise/settle lifecycle) and is NEVER turned into a Task — no Task status, no
// checklist, no Business Unit owner.
//
// Vocabulary is BINDING (CONTEXT.md): the person who owns the chase is the Person in
// charge (PIC). The adapter never exposes the raw `assigned_to` column name or any RACI
// noun (Responsible / Accountable / Consulted / Informed).
//
// The record door is READ-FIRST: it resolves a follow-up to ONE canonical record
// identity + history for the drawer and the direct-URL page. Lifecycle mutations
// (chase/promise/partial/settle/confirm — each needs its own money form) remain owned by
// the Follow-up queue (useFollowUpQueue), so this adapter surfaces no bare actions.
import type { PersonOption } from '@/lib/db/directory'
import { formatIDR } from '@/lib/format/money'
import type {
  RecordActivityItem,
  RecordMetadataSection,
  RecordViewerAdapter,
} from '@/components/records/record-viewer.types'
import type { FollowUpRow, FollowUpEvent, FollowUpState, FollowUpTransition } from '@/lib/db/follow-ups'

export interface FollowUpRecordAdapterInput {
  row: FollowUpRow
  events: readonly FollowUpEvent[]
  people: readonly PersonOption[]
}

const KIND_LABEL: Record<FollowUpRow['kind'], string> = {
  b2b_ar: 'B2B receivable',
  retail_pending: 'Retail pending',
}

const TRANSITION_LABEL: Record<FollowUpTransition, string> = {
  chase: 'Chased',
  promise: 'Promise recorded',
  partial: 'Partial payment',
  settle: 'Settled',
  confirm: 'Confirmed',
}

// A commitment is closed once it is settled or confirmed — the record door is then a
// read-only history rather than an actionable chase.
const CLOSED_STATES: readonly FollowUpState[] = ['settled', 'confirmed']

function personName(people: readonly PersonOption[], id: string | null): string {
  if (!id) return 'Unassigned'
  return people.find((p) => p.id === id)?.full_name ?? 'Unknown person'
}

export function createFollowUpRecordAdapter(input: FollowUpRecordAdapterInput): RecordViewerAdapter {
  const { row, events, people } = input
  const closed = CLOSED_STATES.includes(row.state)

  const commitment: RecordMetadataSection = {
    id: 'commitment',
    label: 'Commitment',
    fields: [
      {
        key: 'counterparty', label: 'Counterparty', control: 'text',
        value: row.counterparty, displayValue: row.counterparty,
        editable: false, readOnlyReason: 'Counterparty is set from the source record',
      },
      {
        key: 'source', label: 'Source', control: 'text',
        value: row.source_invoice_ref, displayValue: row.source_invoice_ref ?? KIND_LABEL[row.kind],
        editable: false, readOnlyReason: 'The source invoice is fixed',
      },
      {
        key: 'kind', label: 'Type', control: 'text',
        value: row.kind, displayValue: KIND_LABEL[row.kind],
        editable: false, readOnlyReason: 'Type is derived from the source',
      },
      {
        key: 'state', label: 'Stage', control: 'text',
        value: row.state, displayValue: row.state,
        editable: false, readOnlyReason: closed ? 'This commitment is closed' : 'Advance the stage from the follow-up queue',
      },
    ],
  }

  const money: RecordMetadataSection = {
    id: 'money',
    label: 'Money',
    fields: [
      {
        key: 'originalAmount', label: 'Original amount', control: 'text',
        value: row.original_amount, displayValue: formatIDR(row.original_amount),
        editable: false, readOnlyReason: 'The original amount is fixed by the invoice',
      },
      {
        key: 'runningBalance', label: 'Running balance', control: 'text',
        value: row.running_balance, displayValue: formatIDR(row.running_balance),
        editable: false, readOnlyReason: 'The balance updates as payments are recorded',
      },
    ],
  }

  const owner: RecordMetadataSection = {
    id: 'owner',
    label: 'Owner & dates',
    fields: [
      {
        key: 'pic', label: 'Person in charge (PIC)', control: 'person',
        value: row.assigned_to, displayValue: personName(people, row.assigned_to),
        editable: false, readOnlyReason: 'Reassign the chase owner from the follow-up queue',
      },
      {
        key: 'dueDate', label: 'Due date', control: 'date',
        value: row.due_date, displayValue: row.due_date ?? 'No due date',
        editable: false, readOnlyReason: 'Due date is set from the source',
      },
      {
        key: 'promiseDate', label: 'Promised date', control: 'date',
        value: row.promise_date, displayValue: row.promise_date ?? 'No promise on record',
        editable: false, readOnlyReason: 'Record a promise from the follow-up queue',
      },
    ],
  }

  const activity: RecordActivityItem[] = events.map((event) => ({
    id: event.id,
    label: TRANSITION_LABEL[event.transition] ?? event.transition,
    detail: describeEvent(event),
    occurredAt: event.created_at,
  }))

  return {
    kind: 'follow-up',
    id: row.id,
    title: row.counterparty,
    typeLabel: 'Follow-up',
    eyebrow: row.source_invoice_ref ?? KIND_LABEL[row.kind],
    metadata: [commitment, money, owner],
    relations: [],
    contentSlots: row.notes
      ? [{ id: 'notes', label: 'Notes', render: () => <p className="record-follow-up-notes">{row.notes}</p> }]
      : [],
    activity,
    actions: [],
    permission: {
      readOnly: true,
      reason: closed ? 'This commitment is closed.' : 'Advance the chase from the follow-up queue.',
      allowedActionIds: [],
    },
    state: 'ready',
  }
}

function describeEvent(event: FollowUpEvent): string | undefined {
  const parts: string[] = []
  if (event.amount != null) parts.push(formatIDR(event.amount))
  if (event.cash_in_date) parts.push(`cash-in ${event.cash_in_date}`)
  if (event.promise_date) parts.push(`promised ${event.promise_date}`)
  if (event.evidence) parts.push(event.evidence)
  if (event.note) parts.push(event.note)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

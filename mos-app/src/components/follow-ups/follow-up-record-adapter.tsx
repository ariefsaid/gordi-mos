// createFollowUpRecordAdapter — projects the REAL Follow-up model (mos.follow_ups /
// FollowUpRow + FollowUpEvent history) into the shared RecordViewer grammar, in the
// JTBD-ordered, content-first anatomy of docs/specs/record-page-anatomy.spec.md §2.3
// (FR-ANAT-010; OD-REDESIGN-90). A Follow-up stays a Follow-up: it is money-shaped
// (counterparty, invoice grain, running balance, chase/promise/settle lifecycle) and is
// NEVER turned into a Task — no Task status, no checklist, no Business Unit owner.
//
// Content-first composition (record-viewer.tsx keeps its shared region order untouched — a
// global flip would endanger every other consumer): the Follow-up packs its job regions into
// ordered CONTENT slots, so the debt LEADS and provenance stays quiet at the end.
//   identity(counterparty) → [outstanding, settlement, roles, promises, audit]
//   1. outstanding — what's owed and how late: counterparty · type · invoice · amount ·
//      balance · due date (the overdue-age signal rides with it, LAW-2). LEADS.
//   2. settlement  — the lifecycle stage; advancing it (record promise / partial / settle +
//      the evidence gate) is owned by the follow-up QUEUE, so the record door shows no bare verb.
//   3. roles       — who chases (PIC).
//   4. promises    — the standing promise on record (rendered only when one exists).
//   5. audit       — the timestamped lifecycle history, last and quiet.
//
// Vocabulary is BINDING (CONTEXT.md): the person who owns the chase is the Person in
// charge (PIC). The adapter never exposes the raw `assigned_to` column name or any RACI
// noun (Responsible / Accountable / Consulted / Informed).
//
// The record door is READ-FIRST: it resolves a follow-up to ONE canonical record identity +
// history for the drawer and the direct-URL page. Every field is read-only; the ONE
// whole-record note (why nothing is editable here — mutations live in the queue) is carried
// ONCE by RecordViewer's footer via permission.reason, never stamped per field (LAW-6 / F3).
import { formatIDR } from '@/lib/format/money'
import { RecordFieldList } from '@/components/records/record-viewer'
import type {
  RecordContentSlot,
  RecordFieldSpec,
  RecordMetadataSection,
  RecordViewerAdapter,
} from '@/components/records/record-viewer.types'
import type { PersonOption } from '@/lib/db/directory'
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

/** The overdue-age signal that rides with the debt (LAW-2, record-page-anatomy §2.3: Outstanding
 *  carries Counterparty · Amount · Balance · Age). Whole-day count relative to the due date, in
 *  UTC-day granularity so it is stable regardless of the caller's wall-clock time. */
function ageLabel(dueDate: string | null, today = new Date()): string {
  if (!dueDate) return 'No due date'
  const dayMs = 86_400_000
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)
  const days = Math.round((now - due) / dayMs)
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  const ahead = -days
  return `Due in ${ahead} ${ahead === 1 ? 'day' : 'days'}`
}

/** A read-only field spec with NO per-field provenance caption. The whole-record read-only
 *  reason is carried once by the viewer footer (LAW-6 / F3) — never repeated per row. */
function readField(spec: Omit<RecordFieldSpec, 'editable' | 'readOnlyReason'>): RecordFieldSpec {
  return { ...spec, editable: false }
}

/** Wrap a read-only field section as an ordered content slot (content-first: the section
 *  renders through the shared RecordFieldList inside the slot's `data-content-slot` landmark,
 *  not the metadata region which paints BEFORE content). */
function fieldSlot(id: string, label: string, fields: RecordFieldSpec[]): RecordContentSlot {
  const section: RecordMetadataSection = { id, label, fields }
  return { id, label, section, render: () => <RecordFieldList section={section} /> }
}

export function createFollowUpRecordAdapter(input: FollowUpRecordAdapterInput): RecordViewerAdapter {
  const { row, events, people } = input
  const closed = CLOSED_STATES.includes(row.state)

  // 1. Outstanding (content, LEADS) — what's owed and how late. Due date is the overdue-age
  //    signal riding with the debt (LAW-2). Notes describe the debt, so they ride here too.
  const outstanding = fieldSlot('outstanding', 'Outstanding', [
    readField({ key: 'counterparty', label: 'Counterparty', control: 'text', value: row.counterparty, displayValue: row.counterparty }),
    readField({ key: 'kind', label: 'Type', control: 'text', value: row.kind, displayValue: KIND_LABEL[row.kind] }),
    readField({ key: 'source', label: 'Invoice', control: 'text', value: row.source_invoice_ref, displayValue: row.source_invoice_ref ?? KIND_LABEL[row.kind] }),
    readField({ key: 'originalAmount', label: 'Original amount', control: 'text', value: row.original_amount, displayValue: formatIDR(row.original_amount) }),
    readField({ key: 'runningBalance', label: 'Running balance', control: 'text', value: row.running_balance, displayValue: formatIDR(row.running_balance) }),
    readField({ key: 'dueDate', label: 'Due date', control: 'date', value: row.due_date, displayValue: row.due_date ?? 'No due date' }),
    readField({ key: 'age', label: 'Age', control: 'text', value: row.due_date, displayValue: ageLabel(row.due_date) }),
  ])
  const outstandingSlot: RecordContentSlot = {
    ...outstanding,
    render: (ctx) => (
      <>
        {outstanding.render(ctx)}
        {row.notes && <p className="record-follow-up-notes">{row.notes}</p>}
      </>
    ),
  }

  // 2. Settlement — the lifecycle stage. The next action + evidence gate live in the queue.
  const settlement = fieldSlot('settlement', 'Settlement', [
    readField({ key: 'state', label: 'Stage', control: 'text', value: row.state, displayValue: row.state }),
  ])

  // 3. Roles — who chases.
  const roles = fieldSlot('roles', 'Roles', [
    readField({ key: 'pic', label: 'Person in charge (PIC)', control: 'person', value: row.assigned_to, displayValue: personName(people, row.assigned_to) }),
  ])

  // 4. Promises & payments — the standing promise on record. Rendered ONLY when one exists
  //    (no naked placeholder); the payment history itself lives in the audit region below.
  const promisesSlot: RecordContentSlot | null = row.promise_date
    ? fieldSlot('promises', 'Promises & payments', [
        readField({ key: 'promiseDate', label: 'Promised date', control: 'date', value: row.promise_date, displayValue: row.promise_date }),
      ])
    : null

  // 5. Audit history — the timestamped lifecycle trail, last and quiet. A custom content slot
  //    (not the metadata region) so the whole record reads content-first through content slots.
  const auditSlot: RecordContentSlot = {
    id: 'audit',
    label: 'Audit history',
    render: () =>
      events.length === 0 ? (
        <p className="record-follow-up-audit-empty">No history recorded yet.</p>
      ) : (
        <ul className="record-viewer__activity">
          {events.map((event) => {
            const detail = describeEvent(event)
            return (
              <li key={event.id} className="record-viewer__activity-item">
                <span>{TRANSITION_LABEL[event.transition] ?? event.transition}</span>
                {detail && <span className="record-viewer__activity-detail"> — {detail}</span>}
                <time dateTime={event.created_at} className="record-viewer__activity-time">
                  {event.created_at}
                </time>
              </li>
            )
          })}
        </ul>
      ),
  }

  const contentSlots: RecordContentSlot[] = [
    outstandingSlot,
    settlement,
    roles,
    ...(promisesSlot ? [promisesSlot] : []),
    auditSlot,
  ]

  return {
    kind: 'follow-up',
    id: row.id,
    title: row.counterparty,
    typeLabel: 'AR Follow-up',
    eyebrow: row.source_invoice_ref ?? KIND_LABEL[row.kind],
    metadata: [],
    relations: [],
    contentSlots,
    activity: [],
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

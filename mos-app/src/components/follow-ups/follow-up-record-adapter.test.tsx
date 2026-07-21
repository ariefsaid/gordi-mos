import { describe, it, expect } from 'vitest'
import type { PersonOption } from '@/lib/db/directory'
import type { FollowUpRow, FollowUpEvent } from '@/lib/db/follow-ups'
import { createFollowUpRecordAdapter } from './follow-up-record-adapter'

// A Follow-up is a REAL, DISTINCT domain model — money-shaped (counterparty, invoice
// grain, running balance, promise/settle lifecycle). It is NOT a Task: the adapter must
// never give it a Task status, a checklist, or a Business Unit owner. The person who owns
// the chase is the Person in charge (PIC) — CONTEXT.md vocabulary — never "assigned_to"
// raw or a RACI noun.

const people: PersonOption[] = [
  { id: 'p-1', full_name: 'Sari (Collections)' } as PersonOption,
]

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1_000_000, running_balance: 400_000, state: 'promised',
  promise_date: '2026-07-30', issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: 'p-1',
  notes: 'Buyer confirmed partial by month-end.', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-10T00:00:00Z',
}

const events: FollowUpEvent[] = [
  {
    id: 'ev-1', org_id: 'org-1', follow_up_id: 'fu-1', transition: 'chase', from_state: 'open', to_state: 'chased',
    amount: null, cash_in_date: null, evidence: null, promise_date: null, note: 'Called AP desk', actor_person_id: 'p-1',
    created_at: '2026-07-05T00:00:00Z',
  },
  {
    id: 'ev-2', org_id: 'org-1', follow_up_id: 'fu-1', transition: 'partial', from_state: 'chased', to_state: 'partial',
    amount: 600_000, cash_in_date: '2026-07-08', evidence: 'TRF-77', promise_date: null, note: null, actor_person_id: 'p-1',
    created_at: '2026-07-08T00:00:00Z',
  },
]

describe('createFollowUpRecordAdapter', () => {
  it('projects a Follow-up into the shared RecordViewer grammar as its own kind, not a Task', () => {
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    expect(adapter.kind).toBe('follow-up')
    expect(adapter.typeLabel).toBe('Follow-up')
    expect(adapter.title).toBe('PT Big Buyer')
    // Never a Task: no status control, no checklist content slot, no Business Unit owner.
    const keys = adapter.metadata.flatMap((s) => s.fields.map((f) => f.key))
    expect(keys).not.toContain('status')
    expect(keys).not.toContain('businessUnit')
    expect(adapter.contentSlots.map((s) => s.id)).not.toContain('checklist')
  })

  it('surfaces the money grain — invoice ref, original amount, running balance in IDR', () => {
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    const labels = adapter.metadata.flatMap((s) => s.fields.map((f) => `${f.label}=${f.displayValue}`))
    expect(labels.join(' | ')).toContain('INV-1001')
    expect(labels.join(' | ')).toMatch(/Rp\s?1.000.000/)
    expect(labels.join(' | ')).toMatch(/Rp\s?400.000/)
  })

  it('names the chase owner Person in charge (PIC) and never leaks a RACI noun', () => {
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    const flat = adapter.metadata.flatMap((s) => s.fields.map((f) => `${f.key} ${f.label} ${f.displayValue}`)).join(' ')
    expect(flat).toContain('Person in charge (PIC)')
    expect(flat).toContain('Sari (Collections)')
    expect(flat).not.toMatch(/responsible|accountable|consulted|informed|raci|assigned_to/i)
  })

  it('renders the lifecycle history from real follow-up events (newest transitions), not fabricated activity', () => {
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    expect(adapter.activity).toHaveLength(2)
    const joined = adapter.activity.map((a) => `${a.label} ${a.detail ?? ''}`).join(' | ')
    expect(joined.toLowerCase()).toContain('chase')
    expect(joined.toLowerCase()).toContain('partial')
  })

  it('is a read-first record door: a settled/confirmed commitment is honestly read-only', () => {
    const settled = createFollowUpRecordAdapter({ row: { ...row, state: 'confirmed', running_balance: 0 }, events, people })
    expect(settled.permission.readOnly).toBe(true)
    expect(settled.state).toBe('ready')
  })
})

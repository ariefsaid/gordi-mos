import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PersonOption } from '@/lib/db/directory'
import type { FollowUpRow, FollowUpEvent } from '@/lib/db/follow-ups'
import type { RecordFieldSpec, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { createFollowUpRecordAdapter } from './follow-up-record-adapter'

// Content-first (OD-REDESIGN-90): the Follow-up packs its fields into ordered CONTENT slots,
// each carrying its section specs as `section` DATA — so the record stays inspectable without
// rendering. The metadata region is empty; these helpers read the field specs from the slots.
function slotFields(adapter: RecordViewerAdapter): RecordFieldSpec[] {
  return adapter.contentSlots.flatMap((s) => s.section?.fields ?? [])
}
function fieldBlob(adapter: RecordViewerAdapter): string {
  return slotFields(adapter).map((f) => `${f.key} ${f.label} ${f.displayValue}`).join(' | ')
}

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
    expect(adapter.typeLabel).toBe('AR Follow-up')
    expect(adapter.title).toBe('PT Big Buyer')
    // Never a Task: no status control, no checklist content slot, no Business Unit owner.
    const keys = slotFields(adapter).map((f) => f.key)
    expect(keys).not.toContain('status')
    expect(keys).not.toContain('businessUnit')
    expect(adapter.contentSlots.map((s) => s.id)).not.toContain('checklist')
  })

  it('surfaces the money grain — invoice ref, original amount, running balance in IDR', () => {
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    const labels = fieldBlob(adapter)
    expect(labels).toContain('INV-1001')
    expect(labels).toMatch(/Rp\s?1.000.000/)
    expect(labels).toMatch(/Rp\s?400.000/)
  })

  it('names the chase owner Person in charge (PIC) and never leaks a RACI noun', () => {
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    const flat = fieldBlob(adapter)
    expect(flat).toContain('Person in charge (PIC)')
    expect(flat).toContain('Sari (Collections)')
    expect(flat).not.toMatch(/responsible|accountable|consulted|informed|raci|assigned_to/i)
  })

  it('renders the lifecycle history from real follow-up events (newest transitions), not fabricated activity', () => {
    // Audit history is the LAST content slot (content-first): the timestamped trail lives there,
    // quiet, not in the metadata/activity region ahead of the debt.
    const adapter = createFollowUpRecordAdapter({ row, events, people })
    const audit = adapter.contentSlots.find((s) => s.id === 'audit')!
    render(<I18nProvider>{audit.render({ mode: 'page', readOnly: true })}</I18nProvider>)
    const joined = (screen.getByRole('list').textContent ?? '').toLowerCase()
    expect(joined).toContain('chase')
    expect(joined).toContain('partial')
  })

  it('is a read-first record door: a settled/confirmed commitment is honestly read-only', () => {
    const settled = createFollowUpRecordAdapter({ row: { ...row, state: 'confirmed', running_balance: 0 }, events, people })
    expect(settled.permission.readOnly).toBe(true)
    expect(settled.state).toBe('ready')
  })
})

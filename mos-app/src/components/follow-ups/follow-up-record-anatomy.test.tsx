import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PersonOption } from '@/lib/db/directory'
import type { FollowUpRow, FollowUpEvent } from '@/lib/db/follow-ups'
import { RecordViewer } from '@/components/records/record-viewer'
import { createFollowUpRecordAdapter } from './follow-up-record-adapter'

// ── Census Step 2.5 — Follow-up record anatomy conformance (docs/specs/record-page-anatomy.spec.md
// §2.3 / §3, FR-ANAT-010, AC-ANAT-007/009). This is the EXECUTABLE body of Step 2.5 for the
// Follow-up record: it composes the record the way the live host does (createFollowUpRecordAdapter →
// the shared RecordViewer), extracts the observed section-order vector from the rendered DOM, asserts
// observed === declared, and evaluates the FAIL gates F1–F5. A green mechanical guard does NOT
// substitute for this recorded pass.

const DECLARED = ['outstanding', 'settlement', 'roles', 'promises', 'audit'] as const

const people: PersonOption[] = [{ id: 'p-1', full_name: 'Sari (Collections)' }]

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

function renderRecord(overrides: Partial<FollowUpRow> = {}) {
  const adapter = createFollowUpRecordAdapter({ row: { ...row, ...overrides }, events, people })
  return render(
    <I18nProvider>
      <RecordViewer adapter={adapter} mode="page" headingLevel={1} />
    </I18nProvider>,
  )
}

function observedVector(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-content-slot]')].map(
    (n) => (n as HTMLElement).dataset.contentSlot!,
  )
}

describe('Census Step 2.5 — Follow-up record anatomy conformance (AC-ANAT-009)', () => {
  it('observed section-order vector === declared [outstanding, settlement, roles, promises, audit]', () => {
    const { container } = renderRecord()
    expect(observedVector(container)).toEqual([...DECLARED])
  })

  it('F1 — content leads: the first body region after identity is Outstanding, with no metadata region before it (AC-ANAT-007)', () => {
    const { container } = renderRecord()
    expect(observedVector(container)[0]).toBe('outstanding')
    const regions = [...container.querySelectorAll('[data-viewer-region]')].map((n) => (n as HTMLElement).dataset.viewerRegion)
    expect(regions.filter((r) => r === 'metadata')).toHaveLength(0)
    // The debt (counterparty · amount · balance · due · age) leads the record.
    const outstanding = container.querySelector('[data-content-slot="outstanding"]')!
    expect(outstanding.textContent).toContain('PT Big Buyer')
    expect(outstanding.textContent).toMatch(/Rp\s?400.000/)
  })

  it('N1 — Outstanding carries the overdue-age signal (record-page-anatomy §2.3: Counterparty · Amount · Balance · Age)', () => {
    const { container } = renderRecord()
    const outstanding = container.querySelector('[data-content-slot="outstanding"]')!
    // The Age field label + a computed overdue-age value ride WITH the debt (LAW-2), not a
    // separate metadata region. The fixture due date (2026-06-30) is always in the past.
    expect(outstanding.textContent).toContain('Age')
    expect(outstanding.textContent).toMatch(/overdue/)
  })

  it('F2 — the identity heading is the counterparty, not a truncated slice of any content region', () => {
    const { container } = renderRecord()
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe('PT Big Buyer')
    expect(h1.textContent!.endsWith('…')).toBe(false)
  })

  it('F3 — no per-field provenance captions: the read-only record carries at most ONE whole-record note', () => {
    const { container } = renderRecord()
    // No field-level readOnly reason caption is rendered anywhere in the field sections.
    expect(container.querySelectorAll('.record-field__reason')).toHaveLength(0)
    // The single whole-record note lives in the actions/footer register.
    expect(container.querySelectorAll('.record-viewer__permission-note')).toHaveLength(1)
  })

  it('F4 — no raw diff dump; the lifecycle trail lives in exactly ONE region (audit)', () => {
    const { container } = renderRecord()
    const auditRegions = [...container.querySelectorAll('[data-content-slot]')].filter((n) =>
      n.querySelector('.record-viewer__activity'),
    )
    expect(auditRegions).toHaveLength(1)
    expect((auditRegions[0] as HTMLElement).dataset.contentSlot).toBe('audit')
    expect(container.textContent).not.toMatch(/→/) // no old→new diff arrows in the default view
  })

  it('F5 — the record door surfaces no bare mutating action register (mutations live in the queue)', () => {
    const { container } = renderRecord()
    expect(container.querySelectorAll('.record-viewer__actions')).toHaveLength(0)
  })

  it('promises region renders ONLY where a promise exists (no naked placeholder)', () => {
    const { container } = renderRecord({ promise_date: null })
    expect(observedVector(container)).toEqual(['outstanding', 'settlement', 'roles', 'audit'])
  })
})

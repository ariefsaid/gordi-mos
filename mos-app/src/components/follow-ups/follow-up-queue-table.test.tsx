import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { FollowUpRow } from '@/lib/db/follow-ups'
import type { FollowUpQueueState } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'

vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => true }))

const row: FollowUpRow = {
  id: 'follow-up-1', org_id: 'org-1', counterparty: 'Buyer One', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1', original_amount: 1000, running_balance: null, state: 'open',
  promise_date: null, issued_date: null, due_date: '2026-10-01', assigned_to: null, notes: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}

const queue: FollowUpQueueState = {
  rows: [row], state: 'ready', hasMore: false, loadingMore: false, moreError: false,
  loadMore: async () => {}, overdueCount: 0, canConfirm: false, canChase: false, active: null,
  form: { amount: '', cash_in_date: '', evidence: '', promise_date: '', note: '' }, detailRow: null,
  setForm: () => {}, load: () => {}, run: async () => {}, submit: async () => {}, cancelAction: () => {},
}

describe('FollowUpQueueTable', () => {
  it.each([
    ['en', 'Running balance'],
    ['id', 'Sisa berjalan'],
  ] as const)('shows a missing running balance as absent in %s', (locale, balanceLabel) => {
    render(<I18nProvider initialLocale={locale}><FollowUpQueueTable queue={queue} /></I18nProvider>)
    const buyerRow = screen.getByRole('row', { name: /Buyer One/ })
    expect(within(buyerRow).getAllByRole('cell')[2]).toHaveTextContent('—')
    expect(screen.getByRole('columnheader', { name: balanceLabel })).toBeInTheDocument()
  })
})

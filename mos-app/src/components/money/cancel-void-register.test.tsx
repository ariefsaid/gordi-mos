import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { listCancelVoidRegister, recordCancelVoidReview, type CancelVoidRow } from '@/lib/db/cancel-void'
import { getPeople } from '@/lib/db/directory'
import { CancelVoidRegister } from './cancel-void-register'

vi.mock('@/lib/db/cancel-void', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/db/cancel-void')>(), listCancelVoidRegister: vi.fn(), recordCancelVoidReview: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))

const source: CancelVoidRow = {
  esb_code: 'TEST', row_id: 'sale', case_id: 'sale', is_case: true, branch_code: 'TEST-BRANCH', sales_date: '2026-10-19',
  sales_num: 'SYNTHETIC-1', action_kind: 'sale_void', node_kind: 'sale', menu_name: null,
  review_value_idr: 10000, review_value_basis: 'sale_grand_total', line_total: null,
  creator_account: 'shared-till', last_editor_account: 'shared-editor', minutes_to_last_edit: 42,
  reason_text: null, reason_scope: 'sale_reason_not_exposed', source_evidence_hash: 'one', snapshot_as_of: '2026-10-20T00:00:00Z',
}
const line: CancelVoidRow = { ...source, row_id: 'menu', case_id: 'menu', node_kind: 'menu', sales_num: 'SYNTHETIC-2', action_kind: 'menu_cancelled', menu_name: 'Long synthetic menu with extra preparation instructions', reason_scope: 'source_line_reason', review_value_idr: 5000, review_value_basis: 'raw_menu_total' }

function Location() { return <output aria-label="URL">{useLocation().search}</output> }
function mount(locale: 'en' | 'id' = 'en', search = '') {
  return render(<I18nProvider initialLocale={locale}><MemoryRouter initialEntries={[`/money/branch/TEST-BRANCH${search}`]}>
    <CancelVoidRegister branch="TEST-BRANCH" start="2026-10-01" end="2026-10-19" /><Location />
  </MemoryRouter></I18nProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCancelVoidRegister).mockResolvedValue({ rows: [source, line, { ...line, row_id: 'detail', case_id: 'sale', is_case: false, review_value_idr: null, line_total: 10000 }], reviews: [] })
  vi.mocked(getPeople).mockResolvedValue([{ id: 'person', full_name: 'Synthetic Reviewer' }])
  vi.mocked(recordCancelVoidReview).mockResolvedValue({ id: 'review', esb_code: 'TEST', case_id: 'sale', person_id: 'person', reason: 'order_error', note: 'Confirmed with shift', reviewed_by: 'reviewer', created_at: '2026-10-20T01:00:00Z', source_evidence_hash: 'one' })
})

it.each(['en', 'id'] as const)('review journey in %s preserves source truth, filters unreviewed and totals cases once', async locale => {
  const user = userEvent.setup()
  mount(locale, '?cv_unreviewed=1')
  const section = await screen.findByRole('region', { name: locale === 'en' ? 'Cancelled and voided sales' : 'Penjualan dibatalkan dan void' })
  expect(await within(section).findByText(locale === 'en' ? 'Reason not exposed for this sale' : 'Alasan tidak tersedia untuk penjualan ini')).toBeVisible()
  expect(within(section).getAllByText(locale === 'en' ? 'No reason given' : 'Tidak ada alasan').length).toBeGreaterThan(0)
  expect(section).toHaveTextContent('shared-till')
  expect(section).toHaveTextContent('42')
  const list = within(section).getByRole('list', { name: locale === 'en' ? 'Cases' : 'Kasus' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  await user.click(within(list).getAllByRole('button', { name: locale === 'en' ? 'Review' : 'Tinjau' })[0])
  const form = screen.getByRole('form', { name: locale === 'en' ? 'Record review' : 'Catat tinjauan' })
  await user.click(within(form).getByRole('combobox', { name: locale === 'en' ? 'Person' : 'Orang' }))
  await user.click(screen.getByRole('option', { name: 'Synthetic Reviewer' }))
  await user.click(within(form).getByRole('combobox', { name: locale === 'en' ? 'Reason' : 'Alasan' }))
  await user.click(screen.getByRole('option', { name: locale === 'en' ? 'Order entry error' : 'Kesalahan input pesanan' }))
  fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Confirmed with shift' } })
  await user.click(within(form).getByRole('button', { name: locale === 'en' ? 'Save review' : 'Simpan tinjauan' }))
  await waitFor(() => expect(recordCancelVoidReview).toHaveBeenCalledWith({ esbCode: 'TEST', caseId: 'sale', personId: 'person', reason: 'order_error', note: 'Confirmed with shift' }))
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  await user.click(within(section).getByRole('checkbox'))
  expect(screen.getByLabelText('URL')).not.toHaveTextContent('cv_unreviewed')
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  expect(within(section).getByRole('region', { name: locale === 'en' ? 'Totals by person' : 'Total menurut orang' })).toHaveTextContent('Synthetic Reviewer')
  expect(within(section).getByRole('region', { name: locale === 'en' ? 'Totals by reason' : 'Total menurut alasan' })).toHaveTextContent('Rp 10.000')
  expect(within(section).getByText(/Confirmed with shift/)).toBeVisible()
})

it('retains draft and prevents duplicate submit while saving; failed save can be retried', async () => {
  const user = userEvent.setup()
  let reject!: (error: Error) => void
  vi.mocked(recordCancelVoidReview).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  mount()
  await user.click((await screen.findAllByRole('button', { name: 'Review' }))[0])
  const form = screen.getByRole('form', { name: 'Record review' })
  await user.click(within(form).getByRole('combobox', { name: 'Person' }))
  await user.click(screen.getByRole('option', { name: 'Synthetic Reviewer' }))
  await user.click(within(form).getByRole('combobox', { name: 'Reason' }))
  await user.click(screen.getByRole('option', { name: 'Other' }))
  await user.type(within(form).getByRole('textbox'), 'Keep my explanation')
  await user.click(within(form).getByRole('button', { name: 'Save review' }))
  expect(within(form).getByRole('textbox')).toBeDisabled()
  expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled()
  reject(new Error('offline'))
  expect(await within(form).findByRole('alert')).toBeVisible()
  expect(within(form).getByRole('textbox')).toHaveValue('Keep my explanation')
  await user.click(within(form).getByRole('button', { name: 'Save review' }))
  await waitFor(() => expect(recordCancelVoidReview).toHaveBeenCalledTimes(2))
})

it('keeps a dirty explanation on Escape and only discards after confirmation', async () => {
  const user = userEvent.setup()
  mount()
  await user.click((await screen.findAllByRole('button', { name: 'Review' }))[0])
  await user.type(screen.getByRole('textbox'), 'Unsaved explanation')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('textbox')).toHaveValue('Unsaved explanation')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
  expect(screen.queryByRole('form')).toBeNull()
  expect(recordCancelVoidReview).not.toHaveBeenCalled()
})

it('summaries use only the latest review and do not invent missing amounts or identities', async () => {
  const review = { id: 'old', esb_code: 'TEST', case_id: 'sale', person_id: 'gone', reason: 'other' as const, note: 'Earlier review', reviewed_by: 'gone', created_at: '2026-10-19T00:00:00Z', source_evidence_hash: 'old' }
  vi.mocked(listCancelVoidRegister).mockResolvedValue({ rows: [{ ...source, creator_account: null, last_editor_account: null, minutes_to_last_edit: null, review_value_idr: null }], reviews: [review, { ...review, id: 'new', reason: 'quality', note: 'Latest review', created_at: '2026-10-20T00:00:00Z' }] })
  mount()
  const totals = await screen.findByRole('region', { name: 'Totals by reason' })
  expect(totals).toHaveTextContent('Quality issue')
  expect(totals).not.toHaveTextContent('Other')
  expect(totals).toHaveTextContent('Amount not supplied')
  expect(totals).not.toHaveTextContent('Rp 0')
  expect(screen.getByText(/Earlier review/)).toBeVisible()
  expect(screen.getByText(/Latest review/)).toBeVisible()
  expect(screen.getByText('Time from order to last edit not supplied')).toBeVisible()
  expect(screen.getByText(/Created by account Not supplied/)).toBeVisible()
})

it('shows load failure and recovers to an honest empty snapshot', async () => {
  vi.mocked(listCancelVoidRegister).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ rows: [], reviews: [] })
  const user = userEvent.setup()
  mount()
  expect(await screen.findByRole('alert')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No cancelled or voided sales recorded in this slice.')).toBeVisible()
})

it('hides old results and editor on branch or period change, handles failure and retry, and ignores late old responses', async () => {
  const branch1Row: CancelVoidRow = { ...source, sales_num: 'BRANCH-1-SALE' }
  const branch2Row: CancelVoidRow = { ...source, sales_num: 'BRANCH-2-SALE', branch_code: 'BRANCH-2' }

  vi.mocked(listCancelVoidRegister)
    .mockResolvedValueOnce({ rows: [branch1Row], reviews: [] })

  const { rerender } = render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/money/branch/BRANCH-1']}>
        <CancelVoidRegister branch="BRANCH-1" start="2026-10-01" end="2026-10-19" />
      </MemoryRouter>
    </I18nProvider>
  )

  const user = userEvent.setup()
  expect(await screen.findByText(/BRANCH-1-SALE/)).toBeVisible()

  // Open review editor
  await user.click(screen.getByRole('button', { name: 'Review' }))
  expect(screen.getByRole('form', { name: 'Record review' })).toBeVisible()

  // Change branch to BRANCH-2 with a held pending fetch
  let rejectBranch2!: (err: Error) => void
  const branch2Promise = new Promise<{ rows: CancelVoidRow[]; reviews: [] }>((_res, rej) => {
    rejectBranch2 = rej
  })

  vi.mocked(listCancelVoidRegister).mockReturnValueOnce(branch2Promise)

  rerender(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/money/branch/BRANCH-2']}>
        <CancelVoidRegister branch="BRANCH-2" start="2026-10-01" end="2026-10-19" />
      </MemoryRouter>
    </I18nProvider>
  )

  // Old results and old review form must immediately be absent during loading
  expect(screen.queryByText(/BRANCH-1-SALE/)).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Record review' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Loading…')

  // Reject the BRANCH-2 fetch
  rejectBranch2(new Error('network error'))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByText(/BRANCH-1-SALE/)).not.toBeInTheDocument()

  // Retry BRANCH-2 fetch and succeed
  vi.mocked(listCancelVoidRegister).mockResolvedValueOnce({ rows: [branch2Row], reviews: [] })
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText(/BRANCH-2-SALE/)).toBeVisible()
  expect(screen.queryByText(/BRANCH-1-SALE/)).not.toBeInTheDocument()

  // Period change (start / end) test with late response
  let resolveSlowPeriod!: (val: { rows: CancelVoidRow[]; reviews: [] }) => void
  const slowPeriodPromise = new Promise<{ rows: CancelVoidRow[]; reviews: [] }>((res) => { resolveSlowPeriod = res })
  vi.mocked(listCancelVoidRegister).mockReturnValueOnce(slowPeriodPromise)

  rerender(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/money/branch/BRANCH-2']}>
        <CancelVoidRegister branch="BRANCH-2" start="2026-10-01" end="2026-10-25" />
      </MemoryRouter>
    </I18nProvider>
  )

  expect(screen.queryByText(/BRANCH-2-SALE/)).not.toBeInTheDocument()

  // Switch period again before slow one finishes
  const fastPeriodRow: CancelVoidRow = { ...source, sales_num: 'FAST-PERIOD-SALE' }
  vi.mocked(listCancelVoidRegister).mockResolvedValueOnce({ rows: [fastPeriodRow], reviews: [] })

  rerender(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/money/branch/BRANCH-2']}>
        <CancelVoidRegister branch="BRANCH-2" start="2026-10-01" end="2026-10-31" />
      </MemoryRouter>
    </I18nProvider>
  )

  expect(await screen.findByText(/FAST-PERIOD-SALE/)).toBeVisible()

  // Now slow response finishes late
  resolveSlowPeriod({ rows: [{ ...source, sales_num: 'SLOW-PERIOD-SALE' }], reviews: [] })
  await new Promise((r) => setTimeout(r, 10))

  expect(screen.getByText(/FAST-PERIOD-SALE/)).toBeVisible()
  expect(screen.queryByText(/SLOW-PERIOD-SALE/)).not.toBeInTheDocument()
})

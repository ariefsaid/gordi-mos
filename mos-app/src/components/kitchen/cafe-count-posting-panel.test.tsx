import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { listCafeCountPostingQueue, listCafeCountPostingSwitches, releaseCafeCountPosting, setCafeCountPostingEnabled, type CafeCountPostingQueueRow } from '@/lib/db/cafe-count'
import { CafeCountPostingPanel } from './cafe-count-posting-panel'

vi.mock('@/lib/db/cafe-count', () => ({
  listCafeCountPostingQueue: vi.fn(), listCafeCountPostingSwitches: vi.fn(),
  releaseCafeCountPosting: vi.fn(), setCafeCountPostingEnabled: vi.fn(),
}))

const held: CafeCountPostingQueueRow = {
  line_id: 'held', branch_id: 'branch-1', branch_name: 'Cafe Branch', activity: 'kitchen',
  count_date: '2026-10-19', item_name: 'Raw flour', unit_name: 'kg', posting_status: 'held',
  esb_doc_num: null, posting_error: null, expected_out_of_date: false, posting_enabled: true,
}
const stream = { branch: { id: 'branch-1', code: 'branch', name: 'Cafe Branch' }, activity: 'kitchen' as const }

function panel(overrides = {}) {
  return <I18nProvider><CafeCountPostingPanel streamFilter="all" streamCatalog={[stream]}
    canManagePosting={false} canReleasePosting={false} refreshKey={0} {...overrides} /></I18nProvider>
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  vi.mocked(listCafeCountPostingQueue).mockResolvedValue([])
  vi.mocked(listCafeCountPostingSwitches).mockResolvedValue([])
})

it('reviewers see text states, returned references and ERP messages without admin or release actions', async () => {
  vi.mocked(listCafeCountPostingQueue).mockResolvedValue(['held', 'queued', 'awaiting_authorization', 'posted', 'failed'].map((status, index) => ({
    ...held, line_id: String(index), posting_status: status as CafeCountPostingQueueRow['posting_status'],
    esb_doc_num: status === 'posted' ? 'IJ-TEST' : null,
    posting_error: status === 'failed' ? 'Period is closed' : null,
  })))
  render(panel())
  for (const label of ['Confirmed · not posted', 'Queued', 'Created · awaiting authorization', 'Posted', 'Failed', 'ESB document IJ-TEST', 'Period is closed']) {
    expect(await screen.findByText(label)).toBeInTheDocument()
  }
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Release/ })).not.toBeInTheDocument()
  expect(listCafeCountPostingSwitches).not.toHaveBeenCalled()
})

it('a queue read failure offers retry and does not expose a stale release action', async () => {
  vi.mocked(listCafeCountPostingQueue).mockResolvedValueOnce([held]).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
  const view = render(panel({ canReleasePosting: true }))
  expect(await screen.findByRole('button', { name: 'Release 1 held counts for Cafe Branch' })).toBeEnabled()
  view.rerender(panel({ canReleasePosting: true, refreshKey: 1 }))
  expect(await screen.findByText('Count posting status could not be loaded.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Release/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No confirmed counts are waiting for or recently completed posting.')).toBeInTheDocument()
})

it('admin can recover a switch read error and a failed write leaves the switch off', async () => {
  vi.mocked(listCafeCountPostingSwitches).mockRejectedValueOnce(new Error('read failed')).mockResolvedValue([
    { branch_id: 'branch-1', branch_name: 'Cafe Branch', posting_enabled: false },
  ])
  vi.mocked(setCafeCountPostingEnabled).mockRejectedValue(new Error('write failed'))
  render(panel({ canManagePosting: true }))
  expect(await screen.findByText('Branch posting switches could not be loaded.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  const toggle = await screen.findByRole('checkbox', { name: 'Enable Count journal posting for Cafe Branch' })
  fireEvent.click(toggle)
  expect(await screen.findByText('This posting action could not be completed. Refresh and try again.')).toBeInTheDocument()
  expect(toggle).not.toBeChecked()
})

it('release errors remain actionable and offline disables both writes', async () => {
  vi.mocked(listCafeCountPostingQueue).mockResolvedValue([held])
  vi.mocked(listCafeCountPostingSwitches).mockResolvedValue([{ branch_id: 'branch-1', branch_name: 'Cafe Branch', posting_enabled: true }])
  vi.mocked(releaseCafeCountPosting).mockRejectedValue(new Error('release failed'))
  render(panel({ canManagePosting: true, canReleasePosting: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Release 1 held counts for Cafe Branch' }))
  expect(await screen.findByText('This posting action could not be completed. Refresh and try again.')).toBeInTheDocument()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  fireEvent(window, new Event('offline'))
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled())
  expect(screen.getByRole('button', { name: /Release/ })).toBeDisabled()
})

it('Indonesian reviewers can read held state and the empty branch configuration', async () => {
  vi.mocked(listCafeCountPostingQueue).mockResolvedValue([held])
  render(<I18nProvider initialLocale="id"><CafeCountPostingPanel streamFilter="all" streamCatalog={[stream]}
    canManagePosting canReleasePosting={false} refreshKey={0} /></I18nProvider>)
  expect(await screen.findByText('Dikonfirmasi · belum diposting')).toBeInTheDocument()
  expect(await screen.findByText('Tidak ada cabang aktif.')).toBeInTheDocument()
})

it('labels a superseded original and its correction, and explains unresolved posting without offering correction or release', async () => {
  vi.mocked(listCafeCountPostingQueue).mockResolvedValue([
    { ...held, superseded: true, can_correct: false },
    { ...held, line_id: 'correction', correction_of: 'held', posting_status: 'queued', can_correct: false },
  ])
  render(panel({ canReleasePosting: true }))
  expect(await screen.findByText('Superseded · never posted')).toBeInTheDocument()
  expect(screen.getByText('Correction of confirmed count held')).toBeInTheDocument()
  expect(screen.getByText('Resolve the original posting before starting a correction.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Start correction' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Release/ })).not.toBeInTheDocument()
})

it('filters posting rows to the selected stream', async () => {
  vi.mocked(listCafeCountPostingQueue).mockResolvedValue([held, { ...held, line_id: 'other', activity: 'bar', item_name: 'Bar flour' }])
  render(panel({ streamFilter: 'branch-1|kitchen' }))
  expect(await screen.findByText('Raw flour')).toBeInTheDocument()
  expect(screen.queryByText('Bar flour')).not.toBeInTheDocument()
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/cafe-receipts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-receipts')>()
  return { ...actual, listCafeHeldReceipts: vi.fn(), releaseCafeReceipts: vi.fn() }
})

import { listCafeHeldReceipts, releaseCafeReceipts, type CafeReceiptRelease as Release } from '@/lib/db/cafe-receipts'
import { CafeReceiptRelease } from './cafe-receipt-release'

const HQ = { branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 3, postingEnabled: true }
const RESULT: Release = { releasedReceipts: 2, queuedPortions: 4, heldPortions: 1, heldReceipts: 1, heldLocationMissing: 0, waitingForPoData: false }

function renderRelease(online = true) {
  return render(<I18nProvider><CafeReceiptRelease online={online} /></I18nProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('CafeReceiptRelease', () => {
  it('FR-1030 offers a release only for branches whose posting is on and that hold receipts, named per branch', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([HQ, { ...HQ, branchId: 'b-2', branchName: 'Second branch', postingEnabled: false }])
    renderRelease()
    expect(await screen.findByText('Gordi HQ · approved receipts held: 3')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Held for ESB' })).toBeInTheDocument()
    expect(screen.queryByText(/Second branch/)).toBeNull()
    expect(screen.getAllByRole('button', { name: /to ESB$/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Release Gordi HQ to ESB' })).toHaveTextContent('Release to ESB')
  })

  it('FR-1030 releasing reports receipts queued and still held, takes focus and re-reads the list', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValueOnce([HQ]).mockResolvedValueOnce([{ ...HQ, heldReceipts: 1 }])
    vi.mocked(releaseCafeReceipts).mockResolvedValue({ ...RESULT, heldLocationMissing: 2 })
    renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release Gordi HQ to ESB' }))
    await waitFor(() => expect(releaseCafeReceipts).toHaveBeenCalledWith('b-1'))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Gordi HQ: 2 receipts queued for ESB; 1 still held. Some wait for the branch receiving location.')
    expect(status).toHaveFocus()
    expect(await screen.findByText('Gordi HQ · approved receipts held: 1')).toBeInTheDocument()
  })

  it('FR-1030 when the last held receipt is released the outcome stays where the row was', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValueOnce([HQ]).mockResolvedValueOnce([])
    vi.mocked(releaseCafeReceipts).mockResolvedValue({ ...RESULT, releasedReceipts: 3, heldReceipts: 0, heldPortions: 0 })
    renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release Gordi HQ to ESB' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Gordi HQ: 3 receipts queued for ESB; 0 still held.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('NFR-1006 without current PO data nothing is queued and it says why', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([HQ])
    vi.mocked(releaseCafeReceipts).mockResolvedValue({ ...RESULT, releasedReceipts: 0, waitingForPoData: true })
    renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release Gordi HQ to ESB' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Gordi HQ: open-PO data is not current, so nothing was queued. A refresh was requested; try again shortly.')
  })

  it('FR-1030 a failure names the branch; posting switched off says so; offline disables release', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([HQ])
    vi.mocked(releaseCafeReceipts)
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('releaseCafeReceipts failed: CAFE_RECEIPT_POSTING_OFF'))
    const { unmount } = renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release Gordi HQ to ESB' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gordi HQ: release failed. Nothing was queued; try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Release Gordi HQ to ESB' }))
    expect(await screen.findByText('Gordi HQ: posting to ESB is off for this branch, so nothing was queued.')).toBeInTheDocument()
    unmount()
    renderRelease(false)
    expect(await screen.findByRole('button', { name: 'Release Gordi HQ to ESB' })).toBeDisabled()
  })

  it('FR-1030 renders nothing with nothing to release, and says so when the list cannot be read', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([])
    const { container, unmount } = renderRelease()
    await waitFor(() => expect(listCafeHeldReceipts).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    unmount()
    vi.mocked(listCafeHeldReceipts).mockRejectedValue(new Error('network'))
    renderRelease()
    expect(await screen.findByText('Held receipts could not be loaded.')).toBeInTheDocument()
  })
})

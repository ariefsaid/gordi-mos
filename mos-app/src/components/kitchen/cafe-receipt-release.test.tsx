import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/cafe-receipts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-receipts')>()
  return { ...actual, listCafeHeldReceipts: vi.fn(), releaseCafeReceipts: vi.fn() }
})

import { listCafeHeldReceipts, releaseCafeReceipts } from '@/lib/db/cafe-receipts'
import { CafeReceiptRelease } from './cafe-receipt-release'

function renderRelease(online = true) {
  return render(<I18nProvider><CafeReceiptRelease online={online} /></I18nProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('CafeReceiptRelease', () => {
  it('FR-1030 offers a release only for branches whose posting is on and that hold receipts', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([
      { branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 3, postingEnabled: true },
      { branchId: 'b-2', branchName: 'Second branch', heldReceipts: 5, postingEnabled: false },
    ])
    renderRelease()
    expect(await screen.findByText('Gordi HQ · approved receipts held: 3')).toBeInTheDocument()
    expect(screen.queryByText(/Second branch/)).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Release to ESB' })).toHaveLength(1)
  })

  it('FR-1030 releasing reports what was queued and what stays held, then re-reads the held list', async () => {
    vi.mocked(listCafeHeldReceipts)
      .mockResolvedValueOnce([{ branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 3, postingEnabled: true }])
      .mockResolvedValueOnce([{ branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 1, postingEnabled: true }])
    vi.mocked(releaseCafeReceipts).mockResolvedValue({ releasedReceipts: 2, queuedPortions: 4, heldPortions: 1, waitingForPoData: false })
    renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release to ESB' }))
    await waitFor(() => expect(releaseCafeReceipts).toHaveBeenCalledWith('b-1'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Gordi HQ: 4 line parts queued for ESB; 1 still held because they no longer fit an open PO.')
    expect(await screen.findByText('Gordi HQ · approved receipts held: 1')).toBeInTheDocument()
  })

  it('NFR-1006 without current PO data nothing is queued and it says why', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([{ branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 3, postingEnabled: true }])
    vi.mocked(releaseCafeReceipts).mockResolvedValue({ releasedReceipts: 0, queuedPortions: 0, heldPortions: 4, waitingForPoData: true })
    renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release to ESB' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Gordi HQ: open-PO data is not current, so nothing was queued. A refresh was requested; try again shortly.')
  })

  it('FR-1030 a failed release says nothing was queued; offline the release is disabled', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([{ branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 3, postingEnabled: true }])
    vi.mocked(releaseCafeReceipts).mockRejectedValue(new Error('network'))
    const { unmount } = renderRelease()
    fireEvent.click(await screen.findByRole('button', { name: 'Release to ESB' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Release failed. Nothing was queued; try again.')
    unmount()
    renderRelease(false)
    expect(await screen.findByRole('button', { name: 'Release to ESB' })).toBeDisabled()
  })

  it('FR-1030 renders nothing for a person with nothing to release, or when the list cannot be read', async () => {
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([])
    const { container, unmount } = renderRelease()
    await waitFor(() => expect(listCafeHeldReceipts).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    unmount()
    vi.mocked(listCafeHeldReceipts).mockRejectedValue(new Error('forbidden'))
    const second = renderRelease()
    await waitFor(() => expect(listCafeHeldReceipts).toHaveBeenCalledTimes(2))
    expect(second.container).toBeEmptyDOMElement()
  })
})

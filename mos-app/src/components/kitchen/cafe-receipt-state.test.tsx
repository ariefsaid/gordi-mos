import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafeReceipt } from '@/lib/db/cafe-receipts'
import { CafeReceiptState } from './cafe-receipt-state'

function renderState(receipt: Pick<CafeReceipt, 'status' | 'posting_status' | 'posting'>) {
  return render(<I18nProvider><CafeReceiptState receipt={receipt} /></I18nProvider>)
}

describe('CafeReceiptState', () => {
  it.each([
    ['not_posted', 'Approved · not posted to ESB'],
    ['held', 'Approved · posting held: no receiving location'],
    ['queued', 'Approved · queued for ESB'],
    ['posted', 'Approved · posted to ESB'],
    ['failed', 'Approved · posting to ESB failed; an ops lead follows up'],
  ] as const)('FR-1042 an Approved receipt whose posting is %s says so in text', (state, text) => {
    renderState({ status: 'Approved', posting_status: 'not_posted', posting: { state, matched: true, unmatched: 0, openIssues: 0 } })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('FR-1042 names unmatched portions with their issue status, and an unmatched wait for PO data', () => {
    const { rerender } = renderState({
      status: 'Approved', posting_status: 'not_posted', posting: { state: 'not_posted', matched: true, unmatched: 3, openIssues: 2 },
    })
    expect(screen.getByText('Approved · not posted to ESB · not on an open PO: 3 · open Receipt issues: 2')).toBeInTheDocument()
    rerender(<I18nProvider><CafeReceiptState receipt={{
      status: 'Approved', posting_status: 'not_posted', posting: { state: 'not_posted', matched: false, unmatched: 0, openIssues: 0 },
    }} /></I18nProvider>)
    expect(screen.getByText('Approved · not posted to ESB · waiting for open-PO data')).toBeInTheDocument()
  })

  it('FR-1042 a posted receipt with unmatched portions says only the matched part is in ESB', () => {
    renderState({ status: 'Approved', posting_status: 'not_posted', posting: { state: 'posted', matched: true, unmatched: 1, openIssues: 0 } })
    expect(screen.getByText('Approved · matched part posted to ESB · not on an open PO: 1')).toBeInTheDocument()
  })

  it('FR-1038 the posting trail says when a PO it posts against was created after delivery', () => {
    renderState({ status: 'Approved', posting_status: 'not_posted', posting: { state: 'queued', matched: true, unmatched: 0, openIssues: 0, poCreatedAfterDelivery: true } })
    expect(screen.getByText('Approved · queued for ESB · PO created after delivery')).toBeInTheDocument()
  })

  it('FR-1042 an unread posting claims nothing', () => {
    render(<I18nProvider><CafeReceiptState postingUnknown receipt={{ status: 'Approved', posting_status: 'not_posted', posting: null }} /></I18nProvider>)
    expect(screen.getByText('Approved · posting state not loaded; refresh to see it')).toBeInTheDocument()
  })

  it('FR-1042 without a posting read it falls back to the receipt’s own posting status', () => {
    renderState({ status: 'Approved', posting_status: 'held' })
    expect(screen.getByText('Approved · posting held: no receiving location')).toBeInTheDocument()
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafePurchaseRequestPosting } from '@/lib/db/cafe-purchase-requests'
import { CafeRequestState } from './cafe-request-state'

const STATES: Array<[CafePurchaseRequestPosting | null, string, string]> = [
  [{ state: 'not_posted' }, 'Approved · not posted to ESB', 'Disetujui · belum diposting ke ESB'],
  [{ state: 'queued' }, 'Approved · queued for ESB', 'Disetujui · dalam antrean ke ESB'],
  [{ state: 'posted', esb_number: 'PR-SYNTH-014' }, 'Approved · posted to ESB (PR-SYNTH-014)', 'Disetujui · sudah diposting ke ESB (PR-SYNTH-014)'],
  [{ state: 'failed' }, 'Approved · posting to ESB failed; tell procurement', 'Disetujui · posting ke ESB gagal; beri tahu pengadaan'],
  [null, 'Approved · posting state not loaded; refresh to see it', 'Disetujui · status posting belum termuat; muat ulang untuk melihatnya'],
]

describe.each(['en', 'id'] as const)('request posting in %s', locale => {
  it.each(STATES)('names the real posting state, number or recovery: %j', (posting, en, id) => {
    render(<I18nProvider initialLocale={locale}><CafeRequestState request={{ status: 'Approved', posting }} /></I18nProvider>)
    expect(screen.getByText(locale === 'en' ? en : id)).toBeInTheDocument()
  })

  it.each(['Submitted', 'Rejected'] as const)('does not show posting for %s requests', status => {
    render(<I18nProvider initialLocale={locale}><CafeRequestState request={{ status, posting: { state: 'posted', esb_number: 'PR-SYNTH-014' } }} /></I18nProvider>)
    expect(screen.queryByText(/ESB|PR-SYNTH/)).not.toBeInTheDocument()
    expect(screen.getByText(status === 'Submitted'
      ? locale === 'en' ? 'Waiting for approval' : 'Menunggu persetujuan'
      : locale === 'en' ? 'Rejected · raise a new request' : 'Ditolak · buat permintaan baru')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { FollowUpRow } from '@/lib/db/follow-ups'

vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, getFollowUp: vi.fn(), listFollowUpEvents: vi.fn() }
})
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))

import { getFollowUp, listFollowUpEvents } from '@/lib/db/follow-ups'
import { getPeople } from '@/lib/db/directory'
import { FollowUpRecordPage } from './follow-up-record-page'

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1_000_000, running_balance: 400_000, state: 'promised',
  promise_date: '2026-07-30', issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: 'p-1',
  notes: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-10T00:00:00Z',
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          {/* Both the id and no-id shapes route to the same page so the guard is reachable. */}
          <Route path="/work/follow-ups/:id" element={<FollowUpRecordPage />} />
          <Route path="/work/follow-ups" element={<FollowUpRecordPage />} />
          <Route path="/money/follow-ups" element={<div>Queue</div>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFollowUp).mockResolvedValue(row)
  vi.mocked(listFollowUpEvents).mockResolvedValue([])
  vi.mocked(getPeople).mockResolvedValue([{ id: 'p-1', full_name: 'Sari' }] as never)
})

describe('FollowUpRecordPage', () => {
  it('mounts the record inside the focused-record family frame', async () => {
    const { container } = renderAt('/work/follow-ups/fu-1')
    expect(await screen.findByRole('heading', { name: 'PT Big Buyer' })).toBeInTheDocument()
    expect(container.querySelector('[data-page-family="focused-record"]')).toBeTruthy()
    expect(container.querySelector('[data-record-kind="follow-up"]')).toBeTruthy()
  })

  it('redirects to the queue when there is no id', () => {
    renderAt('/work/follow-ups')
    expect(screen.getByText('Queue')).toBeInTheDocument()
  })
})

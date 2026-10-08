import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ReactNode } from 'react'
import type { FollowUpRow, FollowUpEvent } from '@/lib/db/follow-ups'

vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, getFollowUp: vi.fn(), listFollowUpEventsPage: vi.fn() }
})
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))

import { getFollowUp, listFollowUpEventsPage } from '@/lib/db/follow-ups'
import { getPeople } from '@/lib/db/directory'
import { FollowUpRecordHost } from './follow-up-record-host'

const mockGet = vi.mocked(getFollowUp)
const mockEvents = vi.mocked(listFollowUpEventsPage)
const mockPeople = vi.mocked(getPeople)

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1_000_000, running_balance: 400_000, state: 'promised',
  promise_date: '2026-07-30', issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: 'p-1',
  notes: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-10T00:00:00Z',
}
const events: FollowUpEvent[] = []
function eventPage(rows: FollowUpEvent[], hasMore = false) {
  return { rows, hasMore, nextCursor: hasMore ? rows.at(-1)! : null }
}
function historyEvent(index: number, note: string): FollowUpEvent {
  return {
    id: `event-${index}`, org_id: 'org-1', follow_up_id: 'fu-1', transition: 'chase',
    from_state: 'open', to_state: 'chased', amount: null, cash_in_date: null, evidence: null,
    promise_date: null, note, actor_person_id: null, created_at: '2026-07-10T00:00:00Z',
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockResolvedValue(row)
  mockEvents.mockResolvedValue(eventPage(events))
  mockPeople.mockResolvedValue([{ id: 'p-1', full_name: 'Sari' }] as never)
})

describe('FollowUpRecordHost', () => {
  it('shows a loading state before the record resolves', () => {
    mockGet.mockReturnValueOnce(new Promise(() => {}))
    const { container } = render(<FollowUpRecordHost followUpId="fu-1" mode="page" />, { wrapper })
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('resolves the record identity and renders it through the shared RecordViewer', async () => {
    render(<FollowUpRecordHost followUpId="fu-1" mode="page" />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'PT Big Buyer' })).toBeInTheDocument()
    expect(screen.getAllByText('INV-1001').length).toBeGreaterThan(0)
    expect(screen.getByText('Person in charge (PIC)')).toBeInTheDocument()
    expect(screen.getByText('Sari')).toBeInTheDocument()
  })

  it('loads older lifecycle history without replacing the newest events', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => historyEvent(index + 1, `note-${index + 1}`))
    mockEvents.mockResolvedValueOnce(eventPage(firstPage, true)).mockResolvedValueOnce(eventPage([historyEvent(51, 'older-entry')]))
    render(<FollowUpRecordHost followUpId="fu-1" mode="page" />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'PT Big Buyer' })).toBeInTheDocument()
    expect(await screen.findByText(/note-1$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more items' }))
    expect(await screen.findByText(/older-entry$/)).toBeInTheDocument()
    expect(screen.getByText(/note-1$/)).toBeInTheDocument()
    expect(mockEvents.mock.calls[1][1]).toEqual(firstPage.at(-1))
  })

  it('renders an honest not-found state (never a blank surface) when the id resolves to nothing', async () => {
    mockGet.mockResolvedValue(null)
    render(<FollowUpRecordHost followUpId="ghost" mode="page" />, { wrapper })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('renders a retryable error state when the fetch fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'))
    const { container } = render(<FollowUpRecordHost followUpId="fu-1" mode="page" />, { wrapper })
    await waitFor(() => expect(container.querySelector('.error-state')).toBeTruthy())
  })
})

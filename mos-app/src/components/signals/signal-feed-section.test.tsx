import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'

// C3b (AC-426/FR-414): the Home ambient feed — this section is the fetch+mutate wrapper around
// the presentational SignalFeed (B13), so Home stays a slot of "one DAL query + one kit primitive"
// (home-page.tsx's own convention).

vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return { ...actual, listReadableSignals: vi.fn(), correctSignal: vi.fn(), listAllTeams: vi.fn() }
})
import { listReadableSignals, correctSignal, listAllTeams } from '@/lib/db/signals'

vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn(), getBusinessUnits: vi.fn() }))
import { getPeople } from '@/lib/db/directory'

const mockListReadableSignals = vi.mocked(listReadableSignals)
const mockCorrectSignal = vi.mocked(correctSignal)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetPeople = vi.mocked(getPeople)

const openSignalComposer = vi.fn()
vi.mock('@/shell/signal-composer-host', () => ({ useSignalComposer: () => ({ open: openSignalComposer }) }))

import { SignalFeedSection } from './signal-feed-section'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'Needs attention', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderSection() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<SignalFeedSection />} />
          <Route path="/work/signals" element={<SignalFeedSection />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListReadableSignals.mockResolvedValue([row()])
  mockGetPeople.mockResolvedValue([{ id: 'person-cahya', full_name: 'Cahya Cafe' }])
  mockListAllTeams.mockResolvedValue([{ id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false }])
})

describe('SignalFeedSection — Home ambient feed wiring (AC-426/FR-414)', () => {
  it('fetches and renders readable Signals with resolved author/Team names', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('the "Share a Signal" row opens the shared composer host (C1/C2)', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /share a signal/i }))
    expect(openSignalComposer).toHaveBeenCalledTimes(1)
  })

  it('Add category calls correctSignal and refreshes the feed', async () => {
    mockCorrectSignal.mockResolvedValue(undefined)
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    mockListReadableSignals.mockResolvedValueOnce([row({ category: 'Quality' })])
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Quality' }))

    expect(mockCorrectSignal).toHaveBeenCalledWith('signal-1', { category: 'Quality' })
    await waitFor(() => expect(screen.getByText('Quality')).toBeInTheDocument())
  })

  it('opening a card navigates to the canonical record URL', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'The freezer alarm went off' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals?record=signal-1'))
  })

  it('Create Task on the card navigates to the canonical record, where the real follow-up flow lives (Rule 11 — no duplicate flow)', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Create Task' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals?record=signal-1'))
  })

  it('shows the empty-state when there are no readable Signals', async () => {
    mockListReadableSignals.mockResolvedValue([])
    renderSection()
    await waitFor(() => expect(screen.getByText(/No Signals yet/i)).toBeInTheDocument())
  })

  it('degrades quietly (no crash) when the fetch fails', async () => {
    mockListReadableSignals.mockRejectedValue(new Error('boom'))
    renderSection()
    await waitFor(() => expect(screen.getByRole('button', { name: /share a signal/i })).toBeInTheDocument())
  })
})

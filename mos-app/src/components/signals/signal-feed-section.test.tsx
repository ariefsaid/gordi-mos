import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { SignalRow } from '@/lib/db/signals.types'

// C3b (AC-426/FR-414): the Home ambient (FYI) feed. SignalFeedSection is now PRESENTATIONAL —
// HomePage owns the ONE shared signal read (FR-V3-013) and passes the FYI split + resolved names +
// a reload callback down (OD-84.1 / Luna P0-1: attention-worthy Signals lead the stream as band 0).

vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return { ...actual, correctSignal: vi.fn() }
})
import { correctSignal } from '@/lib/db/signals'
const mockCorrectSignal = vi.mocked(correctSignal)

const openSignalComposer = vi.fn()
vi.mock('@/shell/signal-composer-host', () => ({ useSignalComposer: () => ({ open: openSignalComposer, postCount: 0 }) }))
vi.mock('@/components/signals/signal-record-host', () => ({
  SignalRecordHost: ({ signalId }: { signalId: string }) => <div data-testid="home-signal-record" data-signal-id={signalId} />,
}))

import { SignalFeedSection } from './signal-feed-section'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'FYI', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const AUTHORS = new Map([['person-cahya', 'Cahya Cafe']])
const TEAMS = new Map([['team-hq', 'HQ Operations']])

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderSection(props: Partial<React.ComponentProps<typeof SignalFeedSection>> = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={
            <SignalFeedSection signals={[row()]} authorNamesById={AUTHORS} teamNamesById={TEAMS} {...props} />
          } />
          <Route path="/work/signals" element={
            <SignalFeedSection signals={[row()]} authorNamesById={AUTHORS} teamNamesById={TEAMS} {...props} />
          } />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function renderSectionWithHost(props: Partial<React.ComponentProps<typeof SignalFeedSection>> = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <OverlayHostProvider>
          <Routes>
            <Route path="/" element={
              <SignalFeedSection signals={[row()]} authorNamesById={AUTHORS} teamNamesById={TEAMS} {...props} />
            } />
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignalFeedSection — Home ambient (FYI) feed (AC-426/FR-414)', () => {
  it('renders the passed FYI Signals with the resolved author/Team names', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('the "Share a Signal" row opens the shared composer host (C1/C2)', async () => {
    renderSection()
    await userEvent.click(screen.getByRole('button', { name: /share a signal/i }))
    expect(openSignalComposer).toHaveBeenCalledTimes(1)
  })

  it('Add category calls correctSignal and asks the owner (HomePage) to reload the shared read', async () => {
    mockCorrectSignal.mockResolvedValue(undefined)
    const onReload = vi.fn()
    renderSection({ onReload })
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Quality' }))

    expect(mockCorrectSignal).toHaveBeenCalledWith('signal-1', { category: 'Quality' })
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
  })

  it('opening a card navigates to the canonical record URL', async () => {
    renderSection()
    await userEvent.click(screen.getByRole('button', { name: /open signal: the freezer alarm went off/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals?record=signal-1'))
  })

  it('opens a Home Signal in the shared record host and keeps Home as the underlying page', async () => {
    renderSectionWithHost()
    await userEvent.click(screen.getByRole('button', { name: /open signal: the freezer alarm went off/i }))
    await waitFor(() => expect(screen.getByTestId('home-signal-record')).toHaveAttribute('data-signal-id', 'signal-1'))
    expect(document.querySelector('[data-overlay-host]')).toBeInTheDocument()
    expect(document.body.textContent).toContain('The freezer alarm went off')
  })

  it('does not advertise Create Task until the card can create a Task directly', async () => {
    renderSection()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Create Task' })).not.toBeInTheDocument()
  })

  it('shows the empty-state (composer still present) when there are no FYI Signals', async () => {
    renderSection({ signals: [] })
    await waitFor(() => expect(screen.getByText(/No Signals yet/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /share a signal/i })).toBeInTheDocument()
  })

  it('renders nothing during the shared read\'s initial load (Home skeletons cover it, NFR-405)', () => {
    const { container } = renderSection({ loading: true })
    expect(container.querySelector('.signal-feed-section')).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { PersonOption } from '@/lib/db/directory'

vi.mock('@/lib/db/signals', () => ({
  listReadableSignals: vi.fn(),
  listAllTeams: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({
  getPeople: vi.fn(),
}))

// The ?record=<id> drawer is SignalRecordHost's own job (signal-record-host.test.tsx covers its
// fetch/mutate wiring in full) — mock it here so this page's test only asserts the URL-state
// wiring: which id it's given, and that closing it clears ?record=.
vi.mock('@/components/signals/signal-record-host', () => ({
  SignalRecordHost: vi.fn(({ signalId, onClose }: { signalId: string; onClose: () => void }) => (
    <div data-testid="signal-record-host-stub" data-signal-id={signalId}>
      <button type="button" onClick={onClose}>stub-close</button>
    </div>
  )),
}))

import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import { SignalsArchivePage } from './signals-archive-page'

const mockListReadableSignals = vi.mocked(listReadableSignals)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetPeople = vi.mocked(getPeople)

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

const PEOPLE: PersonOption[] = [{ id: 'person-cahya', full_name: 'Cahya Cafe' }]

function renderPage(initialPath = '/work/signals') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/work/signals" element={<SignalsArchivePage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListReadableSignals.mockResolvedValue([
    row({ id: 'signal-1', body: 'The freezer alarm went off' }),
    row({ id: 'signal-2', body: 'Espresso machine repaired', owning_team_id: 'team-radiant' }),
  ])
  mockListAllTeams.mockResolvedValue([
    { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
    { id: 'team-radiant', name: 'Radiant Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
  ])
  mockGetPeople.mockResolvedValue(PEOPLE)
})

describe('SignalsArchivePage — URL-query search + canonical links (AC-427)', () => {
  it('lists readable Signals with author · Team · attention', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
    expect(screen.getAllByText(/Cahya Cafe/)[0]).toBeInTheDocument()
    expect(screen.getByText(/HQ Operations/)).toBeInTheDocument()
  })

  it('entering a search term updates the URL query (?q=) and filters rows by text', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    const search = screen.getByRole('searchbox', { name: /search signals/i })
    await userEvent.type(search, 'espresso')

    await waitFor(() => expect(screen.queryByText('The freezer alarm went off')).not.toBeInTheDocument())
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
  })

  it('filters by author and Team text too', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const search = screen.getByRole('searchbox', { name: /search signals/i })
    await userEvent.type(search, 'radiant')
    await waitFor(() => expect(screen.queryByText('The freezer alarm went off')).not.toBeInTheDocument())
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
  })

  it('each row links to the canonical record URL, surviving via query params', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const link = screen.getByText('The freezer alarm went off').closest('a')
    expect(link).toHaveAttribute('href', '/work/signals?record=signal-1')
    expect(link).toHaveAttribute('data-canonical', '/work/signals?record=signal-1')
  })

  it('restores the search term from the URL on load (Back/refresh/new-tab, Rule 4)', async () => {
    renderPage('/work/signals?q=espresso')
    await waitFor(() => expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument())
    expect(screen.queryByText('The freezer alarm went off')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toHaveValue('espresso')
  })

  it('hides retracted rows by default, and reveals them as tombstones via "Show retracted" (IMPORTANT-6)', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument())
    expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: /show retracted/i }))
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('restores "Show retracted" from the URL (?retracted=1) on load — round-trips through Back/refresh/new-tab', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage('/work/signals?retracted=1')
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    expect(screen.getByRole('switch', { name: /show retracted/i })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('switch', { name: /show retracted/i }))
    await waitFor(() => expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument())
  })
})

// C3: ?record=<id> opens the record drawer (Rule 4 — canonical URL, Back/refresh/new-tab all
// land on the same list+drawer view since it's one URL, not a separate route).
describe('SignalsArchivePage — ?record=<id> opens the record drawer (C3)', () => {
  it('renders the record drawer for the id in the URL on direct load', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())
    expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-signal-id', 'signal-1')
  })

  it('does not render the drawer when no ?record= is present', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument()
  })

  it('clicking a row opens the drawer without a full navigation away from the list', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByText('The freezer alarm went off'))

    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-signal-id', 'signal-1'))
    // The list is still present — this is a drawer alongside the list, not a route swap (Rule 6).
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
  })

  it('closing the drawer clears ?record= from the URL', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'stub-close' }))
    await waitFor(() => expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument())
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { SignalRow } from '@/lib/db/signals.types'
import type { PersonOption } from '@/lib/db/directory'

vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return { ...actual, listReadableSignals: vi.fn(), listAllTeams: vi.fn(), correctSignal: vi.fn() }
})
vi.mock('@/lib/db/directory', () => ({
  getPeople: vi.fn(),
}))
// The V3 collection Table renders in desktop mode here (deterministic), and the archive Feed's
// "Share a Signal" row opens the shared composer host — stub it so this page test needs no shell.
const desktopState = vi.hoisted(() => ({ value: true }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => desktopState.value }))
const composerOpen = vi.hoisted(() => vi.fn())
vi.mock('@/shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: composerOpen, postCount: 0 }),
}))

// The ?record=<id> record is SignalRecordHost's own job (signal-record-host.test.tsx covers its
// fetch/mutate wiring in full) — mock it here so this page's test only asserts the URL-state
// wiring: which id it's given, and that closing it clears ?record=. Chrome (✕ Close / Open full
// page) now belongs to the shared RecordPanelHost that wraps it (spec FR-3), NOT to this stub.
vi.mock('@/components/signals/signal-record-host', () => ({
  SignalRecordHost: vi.fn(({ signalId, mode }: { signalId: string; mode?: string }) => (
    <div data-testid="signal-record-host-stub" data-signal-id={signalId} data-mode={mode}>
      Signal record content
    </div>
  )),
}))

import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import { SignalsArchivePage, SignalRecordPage } from './signals-archive-page'

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
        <OverlayHostProvider>
          <LocationProbe />
          <Routes>
            <Route path="/work/signals" element={<SignalsArchivePage />} />
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// OD-REDESIGN-84.1: the filters/group/sort/toggles (incl. Show retracted) live behind the one
// desktop "View & filters" disclosure. Open it when collapsed to reach those controls.
function openViewOptions() {
  const trigger = screen.queryByRole('button', { name: /view & filters|view options/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
}

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  desktopState.value = true
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
  it('FR-V3-007: defaults to the calm Feed and exposes Signal query capabilities; Table is one choice away', async () => {
    // RATIFY-BEFORE-MERGE default flip (Table→Feed): an uninitialized /work/signals now opens Feed —
    // Signals are ambient team facts to skim, not a grid to manage. The dense Table is one tab away.
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    expect(screen.getByTestId('record-collection-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'false')
    // Feed's lean row leads with search + the saved-view axis (both always visible).
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needs attention' })).toBeInTheDocument()
    // The meaningful ambient filters (category / team) live behind the one door. F6 (OD-91 #21):
    // "Needs attention" lives on the view chip ONLY — the duplicate Attention filter dropdown is gone.
    openViewOptions()
    expect(screen.queryByRole('combobox', { name: 'Attention' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    // Feed is chronological + flat: no Group/Sort selects, and never a board/calendar tab.
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Sort' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /board|calendar/i })).not.toBeInTheDocument()

    // Choosing Table (a click) reveals the full grid capabilities — Group · Sort · Save view.
    await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true'))
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save view/i })).toBeInTheDocument()
    // The chosen Table persists as shareable URL state (?layout=table).
    expect(screen.getByTestId('location')).toHaveTextContent('layout=table')
  })

  it('D-D2 / Rule 7: the toolbar hosts ONE layout-independent Share Signal door (present in Feed AND Table; no in-feed row)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    // Feed (default): the toolbar Share door is present — and there is NO second in-feed "Share a
    // Signal" row (that row is Home-ambient-only now).
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true')
    const shareInFeed = screen.getByRole('button', { name: 'Share Signal' })
    expect(shareInFeed).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /share a signal/i })).not.toBeInTheDocument()

    // Switching to Table must NOT make the compose door blink out — it rides row 1, layout-independent.
    await userEvent.click(screen.getByRole('tab', { name: 'Table' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true'))
    const shareInTable = screen.getByRole('button', { name: 'Share Signal' })
    expect(shareInTable).toBeInTheDocument()

    // It opens the ONE shared composer.
    await userEvent.click(shareInTable)
    expect(composerOpen).toHaveBeenCalledTimes(1)
  })

  it('FR-V3-007: an explicit ?layout=table URL overrides the Feed default and restores the Table', async () => {
    // URL state and an explicit Table choice still win — only the UNINITIALIZED default flipped.
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'false')
    // The Table's grid capabilities are present, and the row cells render (real table, not feed).
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getAllByText(/HQ Operations/).some((node) => node.closest('td'))).toBe(true)
  })

  it('AC-V3-014: column-header sorting updates the same shareable query and visible row order', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-old', body: 'Older signal', occurred_at: '2026-07-16T02:00:00Z' }),
      row({ id: 'signal-new', body: 'Newer signal', occurred_at: '2026-07-16T04:00:00Z' }),
    ])
    // Column-header sorting is a Table journey — open the Table explicitly (Feed is now the default).
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('Newer signal')).toBeInTheDocument())

    const visibleMessages = () => Array.from(document.querySelectorAll('.signal-table-message'))
      .map((element) => element.textContent)
    expect(visibleMessages()).toEqual(['Newer signal', 'Older signal'])

    await userEvent.click(screen.getByRole('button', { name: /^occurred$/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('dir=ascending'))
    expect(visibleMessages()).toEqual(['Older signal', 'Newer signal'])
  })

  it('lists readable Signals with author · Team · attention', async () => {
    // The dense per-cell listing is the Table journey — open it explicitly (Feed is the default now).
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
    expect(screen.getAllByText(/Cahya Cafe/)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/HQ Operations/).some((node) => node.closest('td'))).toBe(true)
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

  it('renders the selected Team grouping in the real table with accessible collapse state', async () => {
    // Grouping is a Table-only capability — the journey opens the Table explicitly (?layout=table).
    renderPage('/work/signals?layout=table&group=team&saved=team-view')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    const hqToggle = screen.getByRole('button', { name: /collapse hq operations/i })
    expect(document.querySelector('main[data-page-family="workspace"]')).toBeInTheDocument()
    expect(hqToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /collapse radiant operations/i })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('group=team')
    expect(screen.getByTestId('location')).toHaveTextContent('saved=team-view')

    await userEvent.click(hqToggle)
    expect(screen.getByRole('button', { name: /expand hq operations/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('The freezer alarm went off')).not.toBeInTheDocument()
  })

  it('Feed and Table use the injected opener and preserve collection query state through Back', async () => {
    renderPage('/work/signals?q=espresso&attention=Needs%20attention&group=team&saved=view-1')
    await waitFor(() => expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Espresso machine repaired'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('record=signal-2'))
    expect(screen.getByTestId('location')).toHaveTextContent('q=espresso')
    expect(screen.getByTestId('location')).toHaveTextContent('attention=Needs+attention')
    expect(screen.getByTestId('location')).toHaveTextContent('group=team')
    expect(screen.getByTestId('location')).toHaveTextContent('saved=view-1')

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('record='))
    expect(screen.getByTestId('location')).toHaveTextContent('q=espresso')
    expect(screen.getByTestId('location')).toHaveTextContent('group=team')
    expect(screen.getByTestId('location')).toHaveTextContent('saved=view-1')
  })

  it('AC-V3-013: phone Signals uses the same capture-first View & filters disclosure as Tasks', async () => {
    desktopState.value = false
    // Group is a Table capability — open the Table so the disclosure shows the full filter set.
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    const options = screen.getByRole('button', { name: /view & filters/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('searchbox', { name: /search signals/i })).not.toBeInTheDocument()

    await userEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument()
  })

  it('Feed uses the same injected opener and does not advertise unavailable Task creation', async () => {
    renderPage('/work/signals?layout=feed&q=espresso&saved=view-1')
    await waitFor(() => expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
    // Feed cards' record-open affordance is now accessibly named ("Open signal: <body>") — Luna (c).
    await userEvent.click(screen.getByRole('button', { name: /open signal: espresso machine repaired/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('record=signal-2'))
    expect(screen.getByTestId('location')).toHaveTextContent('layout=feed')
    expect(screen.getByTestId('location')).toHaveTextContent('q=espresso')
    expect(screen.getByTestId('location')).toHaveTextContent('saved=view-1')
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

    // OD-84.1: the "Show retracted" toggle lives behind the one "View & filters" door.
    openViewOptions()
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
    openViewOptions()
    expect(screen.getByRole('switch', { name: /show retracted/i })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('switch', { name: /show retracted/i }))
    await waitFor(() => expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument())
  })
})

// AC-RPH-2/3 (spec record-panel-host.spec.md, FR-3 — closes OD-63): ?record=<id> mounts the
// Signal record inside the SHARED RecordPanelHost (same side/width/chrome as a Task), NOT a
// bespoke route-local aside. In jsdom there is no PerformanceNavigationTiming, so a ?record=
// "direct load" stays in the drawer (mirrors task-page-mode); the real-browser hard-load
// redirect to /work/signals/:id is proven by the e2e. Deliberate grammar change from the old C3
// bespoke-overlay grammar — the close control is now the host's ✕ chrome, not a stub button.
describe('SignalsArchivePage — ?record=<id> mounts the Signal in the shared host (AC-RPH-2/3)', () => {
  it('AC-RPH-3: mounts the Signal record (mode="panel") in the host for the id in the URL', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())
    expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-signal-id', 'signal-1')
    expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-mode', 'panel')
  })

  it('AC-RPH-2: the Signal panel carries the SAME .drawer shell class as a Task drawer', async () => {
    renderPage('/work/signals?record=signal-1')
    // The RecordPanelHost renders the record inside a `.drawer` surface (width/border/shadow
    // parity with the Task drawer) — the cohesion the owner asked for, not a bespoke sheet.
    await waitFor(() => expect(document.querySelector('.drawer')).toBeTruthy())
    const panel = document.querySelector('.drawer')!
    expect(panel).toContainElement(screen.getByTestId('signal-record-host-stub'))
    // Host chrome (title zone · Open full page · ✕ Close) — the one shared header grammar.
    expect(document.querySelector('.record-panel-chrome')).toBeTruthy()
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()
  })

  it('does not mount the record when no ?record= is present', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument()
    expect(document.querySelector('.record-panel-chrome')).toBeNull()
  })

  it('clicking a row opens the record without navigating away from the list', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByText('The freezer alarm went off'))

    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-signal-id', 'signal-1'))
    // The list is still present — the record opens alongside the list, not a route swap (Rule 6).
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
  })

  it('opens the record through the shared signals overlay host', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByText('The freezer alarm went off'))

    await waitFor(() => expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="signals"]')).toBeTruthy())
    expect(document.querySelector('[data-overlay-host-slot="signals"]')).toBeTruthy()
  })

  it('the host ✕ Close clears ?record= from the URL', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^close$/i }))
    await waitFor(() => expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument())
  })

  it('the host "Open full page" escalates to the canonical /work/signals/:id page', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /open full page/i }))
    // The canonical page route is not registered in this page-only harness, so the archive
    // unmounts. The location probe remains outside Routes and proves the promotion target.
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/signal-1'))
    expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument()
  })
})

// AC-RPH-3: the canonical /work/signals/:id route renders the SAME SignalRecordHost renderer at
// mode="page" — no list shell, no drawer chrome (spec FR-3, mirror of the Task's TaskRecordPage).
describe('SignalRecordPage — canonical full page (AC-RPH-3)', () => {
  it('renders the Signal record as a full page (mode="page"), with no drawer chrome', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/signals/signal-1']}>
          <Routes>
            <Route path="/work/signals/:signalId" element={<SignalRecordPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())
    expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-mode', 'page')
    // Same renderer, page mode — no split-drawer shell/chrome around it.
    expect(document.querySelector('.record-panel-chrome')).toBeNull()
    expect(document.querySelector('.drawer')).toBeNull()
  })

  // H3 (Luna floor): the Signal full page carries a visible Back at the SHARED record-page seam —
  // the SAME .record-page-chrome the Task page uses (whatever chrome carries Task's Back carries
  // Signal's). This pins the shared seam for the Signal kind so it can never regress to a dead-end.
  it('H3: carries a shared record-page "Back to Signals" affordance (the same seam Task uses)', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/signals/signal-1']}>
          <Routes>
            <Route path="/work/signals/:signalId" element={<SignalRecordPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())
    const chrome = document.querySelector('.record-page-chrome') as HTMLElement
    expect(chrome).toBeTruthy()
    const back = within(chrome).getByRole('link', { name: /back to signals/i })
    expect(back).toHaveAttribute('href', '/work/signals')
  })

  it('SR-3/SR-8: hides the generic page head so the archive job sentence does not leak and no duplicate "Signal" heading sits above the record', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/signals/signal-1']}>
          <Routes>
            <Route path="/work/signals/:signalId" element={<SignalRecordPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())
    // hideHead suppresses the shared PageHead entirely: the archive LIST job sentence must NOT
    // appear on a single record (SR-3), and there is no frame-level "Signal" heading duplicating
    // the record's own identity header (SR-8 — the record host owns the sole "Signal" chrome).
    expect(screen.queryByText('Search and revisit the Signals your Teams have shared.')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Signal' })).toBeNull()
  })
})

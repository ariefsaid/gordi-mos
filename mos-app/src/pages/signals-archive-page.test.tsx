import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { AgentRuntimeProvider, useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'
import type { SignalRow } from '@/lib/db/signals.types'
import type { PersonOption } from '@/lib/db/directory'

vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return {
    ...actual,
    listReadableSignals: vi.fn(), listAllTeams: vi.fn(), correctSignal: vi.fn(),
    listReadableAuthorTeams: vi.fn(),
  }
})
vi.mock('@/lib/db/directory', () => ({
  getPeople: vi.fn(),
}))
vi.mock('@/lib/db/user-views-collection', () => ({
  listCollectionViews: vi.fn(),
  getCollectionView: vi.fn(),
  createCollectionView: vi.fn(),
  renameCollectionView: vi.fn(),
  archiveCollectionView: vi.fn(),
}))
// The V3 collection Table renders in desktop mode here (deterministic), and the archive Feed's
// "Share a Signal" row opens the shared composer host — stub it so this page test needs no shell.
const desktopState = vi.hoisted(() => ({ value: true }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => desktopState.value }))
const { composerOpen, composerPostCount } = vi.hoisted(() => ({
  composerOpen: vi.fn(),
  composerPostCount: { value: 0 },
}))
vi.mock('@/shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: composerOpen, postCount: composerPostCount.value }),
}))

// The ?record=<id> record is SignalRecordHost's own job (signal-record-host.test.tsx covers its
// fetch/mutate wiring in full) — mock it here so this page's test only asserts the URL-state
// wiring: which id it's given, and that closing it clears ?record=. Chrome (✕ Close / Open full
// page) now belongs to the shared RecordPanelHost that wraps it (spec FR-3), NOT to this stub.
vi.mock('@/components/signals/signal-record-host', async () => {
  const { useEffect } = await import('react')
  return {
    SignalRecordHost: vi.fn(
      ({ signalId, mode, onTitleResolved }: { signalId: string; mode?: string; onTitleResolved?: (title: string) => void }) => {
        // The real host resolves the record's title (its body's first line) one render after
        // mount — mirrored here so the canonical page's deputyDraft seam is exercised (#426).
        useEffect(() => { onTitleResolved?.('The freezer alarm went off') }, [onTitleResolved])
        return (
          <div data-testid="signal-record-host-stub" data-signal-id={signalId} data-mode={mode}>
            Signal record content
          </div>
        )
      },
    ),
  }
})

import { listReadableSignals, listAllTeams, listReadableAuthorTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import { listCollectionViews } from '@/lib/db/user-views-collection'
import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import { SignalsArchivePage, SignalRecordPage } from './signals-archive-page'
import { signalCollectionDescriptor } from '@/components/signals/signal-collection-adapter'

const mockListReadableSignals = vi.mocked(listReadableSignals)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockListReadableAuthorTeams = vi.mocked(listReadableAuthorTeams)
const mockGetPeople = vi.mocked(getPeople)
const mockListCollectionViews = vi.mocked(listCollectionViews)

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-author-a', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'Needs attention', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const PEOPLE: PersonOption[] = [{ id: 'person-author-a', full_name: 'Author One' }]

// #426: a fake Deputy runtime so the record-scoped Ask Deputy affordance actually renders
// (AskDeputyAction renders nothing with the default null-runtime context — see
// ask-deputy-action.tsx). Mirrors tasks-layout.test.tsx's makeFakeRuntime.
function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* (): AsyncGenerator<AgentEvent> {}),
  }
}

// Surfaces the composer seed set by an Ask Deputy click (pendingDraft) without mounting the full
// AssistantPanel — the seed's open/adopt/single-shot round trip is ask-deputy-action.test.tsx's job.
function DraftProbe() {
  const { pendingDraft } = useAgentRuntime()
  return <output data-testid="pending-draft">{pendingDraft ?? ''}</output>
}

const archiveAuth: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'viewer-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Viewer', email: 'viewer@example.test',
      must_change_password: false, archived_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: [], affiliated: [],
  },
  signOut: async () => {},
}

function pageTree(initialPath = '/work/signals', runtime: AgentRuntime | null = null, auth?: AuthState) {
  return (
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthContext.Provider value={auth ?? { status: 'unauthenticated' }}>
          <AgentRuntimeProvider runtime={runtime}>
          <OverlayHostProvider>
            <LocationProbe />
            <DraftProbe />
            <Routes>
              <Route path="/work/signals" element={<SignalsArchivePage />} />
            </Routes>
          </OverlayHostProvider>
          </AgentRuntimeProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    </I18nProvider>
  )
}

function renderPage(initialPath = '/work/signals', runtime: AgentRuntime | null = null, auth?: AuthState) {
  return render(pageTree(initialPath, runtime, auth))
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
  composerPostCount.value = 0
  desktopState.value = true
  mockListReadableSignals.mockResolvedValue([
    row({ id: 'signal-1', body: 'The freezer alarm went off' }),
    row({ id: 'signal-2', body: 'Espresso machine repaired', owning_team_id: 'team-radiant' }),
  ])
  mockListAllTeams.mockResolvedValue([
    { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
    { id: 'team-radiant', name: 'Radiant Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
  ])
  // AC-030's predicate: the viewer's eligible authoring Teams. Every persona in this file can
  // post into HQ Operations unless a test says otherwise.
  mockListReadableAuthorTeams.mockResolvedValue([
    { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: true },
  ])
  mockGetPeople.mockResolvedValue(PEOPLE)
  mockListCollectionViews.mockResolvedValue([])
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

  it('AC-574: the host cue tracks a real non-default filter and stays absent at defaults', async () => {
    desktopState.value = false
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(document.querySelector('.view-options-disclosure__active-dot')).toBeNull()

    const trigger = screen.getByRole('button', { name: /view & filters/i })
    await userEvent.click(trigger)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Quality')
    await waitFor(() => expect(document.querySelector('.view-options-disclosure__active-dot')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /view & filters, all · category/i })).toBeInTheDocument()
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
    expect(screen.getAllByText(/Author One/)[0]).toBeInTheDocument()
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

  it('AC-V3-013: phone Signals uses the phone default even for a shared Table link', async () => {
    desktopState.value = false
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    expect(screen.getByTestId('signal-feed')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('layout=feed')
    const options = screen.getByRole('button', { name: /view & filters/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    // #581: search lives outside the door now — reachable before it is ever opened.
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()

    await userEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('searchbox', { name: /search signals/i })).toHaveLength(1)
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument()
  })

  it('Issue #607: narrowing an already-open desktop Table renders the phone default, and widening restores Table', async () => {
    const { rerender } = renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true')

    // Narrow WITHOUT remounting — a bare CSS media query would hide the Feed/Table tabs here while
    // the collection stayed on Table underneath, the dead end #607 reports.
    desktopState.value = false
    rerender(pageTree('/work/signals?layout=table'))
    await waitFor(() => expect(screen.getByTestId('signal-feed')).toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: 'Table' })).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('layout=feed')

    // Widen back — the Table the session started on comes back, not a permanent phone-default demotion.
    desktopState.value = true
    rerender(pageTree('/work/signals?layout=table'))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('location')).toHaveTextContent('layout=table')
  })

  it('Issue #379 I3: phone Escape on the open View & filters door closes it with focus on the trigger', async () => {
    desktopState.value = false
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const options = screen.getByRole('button', { name: /view & filters/i })
    await userEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(options, { key: 'Escape' })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(options).toHaveFocus()
  })

  it('Issue #581: at phone width the search input renders above/outside the View & filters door; view options stay behind it', async () => {
    desktopState.value = false
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    const options = screen.getByRole('button', { name: /view & filters/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    // Search is reachable with the door still closed (its panel isn't even in the DOM yet) — it
    // is not one of the things behind it.
    expect(document.getElementById('mobile-signal-options-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    // #770 AC-029: no switch anywhere at 390 either — retracted is reached via the `Retracted`
    // chip inside the door. The domain filters (Team/Category) live behind the door as before.
    expect(screen.queryByRole('switch', { name: /show retracted/i })).not.toBeInTheDocument()
    openViewOptions()
    expect(screen.queryByRole('switch', { name: /show retracted/i })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    // Still exactly one search input — the toolbar instance inside the now-open door did not
    // render a duplicate copy alongside the one planted outside it.
    expect(screen.getAllByRole('searchbox', { name: /search signals/i })).toHaveLength(1)
  })

  it('Ticket 770 AC-025: archive Feed rows carry NO per-row buttons — Create task lives on the record', async () => {
    renderPage('/work/signals?layout=feed', null, archiveAuth)
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /create task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
    // Each rendered row exposes exactly one activation target — the row itself.
    const rows = document.querySelectorAll('.home-signal-row')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of Array.from(rows)) {
      if (row.classList.contains('home-signal-row--retracted')) continue
      expect(row.querySelectorAll('button')).toHaveLength(0)
      expect(row.querySelectorAll('a')).toHaveLength(0)
      expect(row).toHaveAttribute('role', 'button')
    }
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

  // Issue 360 (AC-430, archive half): a Share from the toolbar's ONE compose door bumps the composer
  // host's postCount — the collection must re-run its load so the fresh Signal appears on
  // /work/signals without a manual refresh. Mirrors the feed's unit pin; no e2e covers this
  // surface, so this test is the owner.
  it('Issue 360: a postCount bump (a Share) re-runs the collection load', async () => {
    const view = renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const callsAfterMount = mockListReadableSignals.mock.calls.length
    expect(callsAfterMount).toBeGreaterThan(0)

    composerPostCount.value = 1
    view.rerender(pageTree())
    await waitFor(() => expect(mockListReadableSignals.mock.calls.length).toBe(callsAfterMount + 1))
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
  })

  it('Ticket 770 AC-023: retracted rows are hidden by default and reached via the `Retracted` view (no `Show retracted` control anywhere)', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument())
    expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument()

    // AC-023: the `Show retracted` switch is retired — a viewer opens the tombstone view by
    // clicking the `Retracted` chip on the toolbar's first row.
    expect(screen.queryByRole('switch', { name: /show retracted/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retracted' }))
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('Ticket 770 AC-023: `?view=retracted` restores the tombstone view on load (Back/refresh/new-tab) with no switch anywhere', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage('/work/signals?view=retracted')
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    // The `Retracted` chip is the active one — never a switch beside it.
    expect(screen.getByRole('button', { name: 'Retracted' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('switch', { name: /show retracted/i })).not.toBeInTheDocument()
  })
})

// #610: a custom Signals saved view named itself only in tasks-workspace.tsx (via
// getActiveTaskView) — this page's caption fell back to signalViewLabel(query.view), the
// underlying view's generic label, ignoring savedViewId entirely. getActiveSignalView closes
// that gap the same way Tasks already does: the result-header caption reads the FETCHED saved
// view's name, while the URL keeps carrying only its id (?saved=<id>), never the name.
describe('Issue 610 — a custom Signals saved view names itself in the caption', () => {
  it('shows the fetched saved-view name in the result header; the URL carries only the id', async () => {
    const customView: PersistedCollectionView = {
      id: 'custom-signal-view', name: 'Radiant watch', scope: 'private', kind: 'collection', context: 'work',
      lifecycle: 'active', archivedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      spec: signalCollectionDescriptor.savedViews.buildSpec({
        query: signalCollectionDescriptor.query.neutral,
        presentation: 'feed',
      }),
    }
    mockListCollectionViews.mockResolvedValue([customView])

    renderPage('/work/signals?saved=custom-signal-view')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    // The caption reads the fetched name, not the generic "All" view label the query alone maps to.
    expect(screen.getByTestId('collection-result-header')).toHaveTextContent('Radiant watch')
    expect(screen.getByTestId('collection-result-header')).not.toHaveTextContent('All')
    // The URL is the id only — the name never round-trips through it.
    expect(screen.getByTestId('location')).toHaveTextContent('saved=custom-signal-view')
    expect(screen.getByTestId('location')).not.toHaveTextContent('Radiant')
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

// #426: Signals carries the record-scoped Ask Deputy on BOTH its doors — the panel entry (the
// `actions` chrome slot) and the canonical page (RecordPageChrome's deputyDraft) — like every
// other record kind. The full open/seed/single-shot round trip is ask-deputy-action.test.tsx's
// job; these cases prove the Signal wiring and the seed's content.
describe('issue 426 — record-scoped Ask Deputy on both Signal doors', () => {
  it('the panel entry carries Ask Deputy in the shared chrome, seeded from the signal body', async () => {
    renderPage('/work/signals', makeFakeRuntime())
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    // An in-list open — the loaded row carries the body, so the seed is the record reference.
    await userEvent.click(screen.getByText('The freezer alarm went off'))
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    const chrome = document.querySelector('.record-panel-chrome') as HTMLElement
    const ask = within(chrome).getByRole('button', { name: 'Ask Deputy' })
    await userEvent.click(ask)

    // The composer seed is the record reference built from the signal's own body — set as the
    // runtime's pendingDraft; nothing sent.
    expect(screen.getByTestId('pending-draft')).toHaveTextContent('About Signal: The freezer alarm went off')
  })

  it('truncates a long signal body to ~72 chars so the seed reads as a reference, not a paste', async () => {
    const longBody = 'The espresso machine at Cafe 2 has been running eight degrees too hot since the morning open and nobody can find the manual'
    mockListReadableSignals.mockResolvedValue([row({ id: 'signal-long', body: longBody })])
    renderPage('/work/signals', makeFakeRuntime())
    await waitFor(() => expect(screen.getByText(longBody)).toBeInTheDocument())
    await userEvent.click(screen.getByText(longBody))
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Ask Deputy' }))
    const draft = screen.getByTestId('pending-draft').textContent ?? ''
    expect(draft.startsWith('About Signal: The espresso machine at Cafe 2')).toBe(true)
    expect(draft.endsWith('…')).toBe(true)
    // "About Signal: " + ≤72 seed chars + ellipsis.
    expect(draft.length).toBeLessThanOrEqual('About Signal: '.length + 73)
    expect(draft).not.toContain('manual')
  })

  it('falls back to the generic record noun when the record is not in the loaded collection (deep link)', async () => {
    renderPage('/work/signals?record=signal-not-in-list', makeFakeRuntime())
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Ask Deputy' }))
    expect(screen.getByTestId('pending-draft')).toHaveTextContent('About Signal: Signal')
  })

  it('the canonical page passes the resolved deputyDraft to the shared RecordPageChrome', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/signals/signal-1']}>
          <AgentRuntimeProvider runtime={makeFakeRuntime()}>
            <DraftProbe />
            <Routes>
              <Route path="/work/signals/:signalId" element={<SignalRecordPage />} />
            </Routes>
          </AgentRuntimeProvider>
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    // The seed resolves from the record (onTitleResolved), one render after mount — await it.
    const ask = await screen.findByRole('button', { name: 'Ask Deputy' })
    expect(ask.closest('.record-page-chrome')).toBeTruthy()
    await userEvent.click(ask)
    expect(screen.getByTestId('pending-draft')).toHaveTextContent('About Signal: The freezer alarm went off')
  })
})

describe('issue 711 — the plain (unfiltered) empty state speaks its own voice, not the filtered one', () => {
  // Before the fix, `signals.archive.empty` always interpolated the live query — with no query
  // typed, that rendered the filtered-empty voice ('No Signals match "".') for a collection that
  // is genuinely, unfilteredly empty. This must read as "nothing here yet", not "your search found
  // nothing".
  it('reads as unfiltered-empty (never `match ""`) when there is no active query and no Signals exist', async () => {
    mockListReadableSignals.mockResolvedValue([])
    renderPage()
    const empty = await screen.findByTestId('empty-state')
    expect(within(empty).queryByText(/match/i)).toBeNull()
    expect(within(empty).getByText(/no signals yet/i)).toBeInTheDocument()
  })
})

// #770 — the two-row Signals archive toolbar (OD-WAY-96). The Tasks build (#743) introduced the
// grammar; ticket 770 owns the Signals adoption. Every AC below drives the persona (Dewi,
// authenticated, 1440, default Feed) through one deliberate step of the new toolbar and asserts
// its user-visible outcome — the toolbar's SHAPE (row count, chip set, control set), the ROW
// grammar (zero buttons, plain-text meta), the ONE-COMPONENT rule (Home + archive), and the
// empty/phone contracts around them.
const dewiAuth: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'person-dewi', org_id: 'org-1', user_id: 'user-dewi', full_name: 'Dewi Director',
      email: 'dewi@example.test', must_change_password: false, archived_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: true, accessRoles: ['admin'], affiliated: [],
  },
  signOut: async () => {},
}

function seedSevenSignals() {
  const bodies = [
    'Card reader dropped the connection during the afternoon rush again. @Dewi',
    'Pastry case ran empty an hour before close and we couldn\'t restock in time.',
    'Espresso machine repaired',
    'Grinder 2 throwing inconsistent doses since Wednesday',
    'New vendor for oat milk arrived',
    'Late shift kept losing the tap machine',
    'Ice bin cracked overnight',
  ]
  const attentions: Array<SignalRow['attention']> = ['Urgent', 'Needs attention', 'FYI', 'FYI', 'FYI', 'Needs attention', 'FYI']
  return bodies.map((body, i) => row({
    id: `signal-${i + 1}`,
    body,
    attention: attentions[i],
    author_id: i === 0 ? 'person-dewi' : 'person-author-a',
    owning_team_id: i % 2 === 0 ? 'team-hq' : 'team-radiant',
    category: i === 1 ? 'Supply/vendor' : null,
  }))
}

describe('Ticket 770 — the two-row Signals archive toolbar (AC-021 … AC-033)', () => {
  beforeEach(() => {
    mockListReadableSignals.mockResolvedValue(seedSevenSignals())
  })

  it('AC-021 — Dewi, 1440, Feed: two toolbar rows; chips All · Needs attention · Retracted · I posted; segment on row 1 right; ≤16 controls in <main>; no switch; head holds the only `.btn-primary`', async () => {
    renderPage('/work/signals', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())

    // TWO toolbar rows — never a third. AC-021 is the shape guarantee for the whole ticket.
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)

    // The FOUR built-in view chips read exactly in the ticket order — no `Show retracted` control
    // slipped in beside them, and no `Attention` filter dropdown behind them.
    const viewsGroup = screen.getByRole('group', { name: 'Signal views' })
    expect(viewsGroup).toHaveTextContent(/All\s*Needs attention\s*Retracted\s*I posted/)
    expect(within(viewsGroup).getByRole('button', { name: 'I posted' })).toHaveAttribute('aria-pressed', 'false')

    // The presentation segment lives on row 1's RIGHT (the same slot #743 introduced for Tasks).
    const rows = screen.getAllByTestId('collection-toolbar-row')
    const segment = screen.getByRole('tablist', { name: /view as/i })
    expect(rows[0]).toContainElement(segment)

    // Row 2 carries search · Team · Category · Save view — no Group / Sort while Feed is live.
    expect(within(rows[1]).getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: /save view/i })).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('combobox', { name: /^group$/i })).not.toBeInTheDocument()
    expect(within(rows[1]).queryByRole('combobox', { name: /^sort$/i })).not.toBeInTheDocument()

    // Zero switches / checkboxes anywhere in <main>: the retract switch is retired.
    const main = document.querySelector('main[data-page-family="workspace"]') as HTMLElement
    expect(main).toBeTruthy()
    expect(within(main).queryAllByRole('switch')).toHaveLength(0)
    expect(main.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)

    // ≤16 controls in <main>: the ticket's control budget for the whole page's default Feed.
    // A row's whole-surface activation is NOT a "control" in that budget — the Before/After
    // sums are toolbar + per-row BUTTONS (Before: 16 toolbar + 14 row buttons = 30; After: 16
    // toolbar + 0 row buttons = 16). So the count excludes `.home-signal-row` activation targets,
    // which are the record links, not toolbar controls.
    const rowActivationTargets = new Set(
      Array.from(main.querySelectorAll('.home-signal-row[role="button"]')),
    )
    const controlNodes = [
      ...within(main).queryAllByRole('button'),
      ...within(main).queryAllByRole('tab'),
      ...within(main).queryAllByRole('combobox'),
      ...within(main).queryAllByRole('searchbox'),
      ...within(main).queryAllByRole('switch'),
      ...within(main).queryAllByRole('link'),
    ].filter((el) => !rowActivationTargets.has(el))
    expect(controlNodes.length).toBeLessThanOrEqual(16)

    // The ONE `.btn-primary` is the head's `Share Signal` door — nothing else on the page rides
    // the primary paint (row 1 chips are ghost, saved-view ghost, all filters plain selects).
    const primaries = main.querySelectorAll('.btn-primary')
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveTextContent(/share signal/i)
  })

  it('AC-022 — Table live: row 2 adds Group · Sort; Group = Team tints navy and reads "Group: Team", distinct from the Team filter', async () => {
    renderPage('/work/signals?layout=table&group=team', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())

    // Still exactly two rows — the Group + Sort dropdowns squeeze into row 2 rather than growing a third.
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)
    const rows = screen.getAllByTestId('collection-toolbar-row')
    const groupSelect = within(rows[1]).getByRole('combobox', { name: 'Group' }) as HTMLSelectElement
    const teamSelect = within(rows[1]).getByRole('combobox', { name: 'Team' }) as HTMLSelectElement
    expect(within(rows[1]).getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()

    // Distinct: the Group control's active option reads "Group: Team", the Team filter's default
    // reads "Any team" — the two never look like a repeated Team chip beside each other.
    expect(groupSelect.selectedOptions[0]?.textContent).toBe('Group: Team')
    expect(teamSelect.selectedOptions[0]?.textContent).toBe('Any team')
    // Tinted wrapper class rides the active group control (mirror of Tasks AC-005).
    const wrapper = groupSelect.closest('.collection-toolbar__option-field')
    expect(wrapper?.className).toContain('collection-toolbar__option-field--group')
  })

  it('AC-024 — `I posted` shows exactly Dewi\'s own Signals, retracted included', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 's-mine-live', author_id: 'person-dewi', body: 'The freezer alarm went off' }),
      row({ id: 's-mine-dead', author_id: 'person-dewi', body: 'Wrong branch typo', retracted_at: '2026-07-16T05:00:00Z' }),
      row({ id: 's-theirs', author_id: 'person-author-a', body: 'Someone else posted this' }),
    ])
    renderPage('/work/signals', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/freezer alarm/i)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'I posted' }))
    await waitFor(() => expect(screen.queryByText(/someone else/i)).not.toBeInTheDocument())
    expect(screen.getByText(/freezer alarm/i)).toBeInTheDocument()
    // AC-024: retracted included — the poster's own tombstone still reads through this chip.
    expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument()
  })

  // AC-026 (Home and archive are ONE component) is owned by signal-feed-rows-no-avatar.test.tsx's
  // "Home's ambient column and the archive Feed render byte-identical row markup" — it renders both
  // surfaces from one fixture and diffs the row subtree. This page test owns AC-025.
  it('AC-025 — seven Feed rows carry zero buttons; ONE activation target per row; meta plain text; the archive variant class is the only difference', async () => {
    renderPage('/work/signals', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())

    const rows = document.querySelectorAll('.home-signal-row:not(.home-signal-row--retracted)')
    expect(rows.length).toBe(7)
    for (const rowEl of Array.from(rows)) {
      expect(rowEl.querySelectorAll('button')).toHaveLength(0)
      expect(rowEl.querySelectorAll('a')).toHaveLength(0)
      expect(rowEl).toHaveAttribute('role', 'button')
      expect(rowEl.getAttribute('aria-label')).toMatch(/^Open signal:/)
      // Meta: no bordered chips for team/time.
      expect(rowEl.querySelector('.home-signal-location-chip')).toBeNull()
      expect(rowEl.querySelector('.home-signal-time-chip')).toBeNull()
      // No "Visible to <Team>" line.
      expect(rowEl.textContent).not.toMatch(/Visible to/)
    }
    // The shared component's own marker class is present, with the archive variant on top of it.
    const feed = screen.getByTestId('signal-feed')
    expect(feed.classList.contains('home-signal-feed')).toBe(true)
    expect(feed.classList.contains('home-signal-feed--archive')).toBe(true)
  })

  it('AC-027 — Table column order Message · Team · Attention · Occurred', async () => {
    renderPage('/work/signals?layout=table', null, dewiAuth)
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /message/i })).toBeInTheDocument())
    const headers = Array.from(document.querySelectorAll('th'))
      .map(th => (th.textContent ?? '').trim().toLowerCase())
      .filter(t => t.length > 0)
    // Only the four columns land — no PIC / Supervisor / Status ghost columns.
    expect(headers).toEqual(['message', 'team', 'attention', 'occurred'])
  })

  it('AC-028 — Save view opens an anchored popover; the toolbar keeps its two rows; Escape returns focus', async () => {
    renderPage('/work/signals', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())
    const before = document.querySelectorAll('.home-signal-row:not(.home-signal-row--retracted)').length
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)

    const trigger = screen.getByRole('button', { name: /save view/i })
    await userEvent.click(trigger)
    const popover = screen.getByRole('group', { name: /save current view/i })
    expect(popover.className).toContain('collection-toolbar__save')
    expect(popover.parentElement?.className).toContain('collection-toolbar__save-zone')
    // Two rows still — the popover overlays, never grows a row.
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)
    // Row count unchanged behind the popover.
    expect(document.querySelectorAll('.home-signal-row:not(.home-signal-row--retracted)').length).toBe(before)

    fireEvent.keyDown(screen.getByRole('textbox', { name: /view name/i }), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: /view name/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('AC-029 — 390 phone: search outside the door; door = chips · Team · Category · Save view; rows ≥44px without buttons; ≤9 controls in <main> with seven rows', async () => {
    desktopState.value = false
    renderPage('/work/signals', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())

    // Search is planted OUTSIDE the door — reachable without opening it.
    const options = screen.getByRole('button', { name: /view & filters/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()

    // Open the door and read what is actually inside it. The panel is where the primary landed,
    // so the negative is scoped to the panel — scoped to the TRIGGER's parent it passes whether or
    // not the primary is there, which is how a shipped `Share Signal` in the door read green.
    await userEvent.click(options)
    const panel = document.getElementById('mobile-signal-options-panel') as HTMLElement
    expect(panel, 'the "View & filters" panel renders when open').toBeTruthy()
    // Door = view chips · Team · Category · Save view. No `Share Signal` (the launcher owns the
    // primary on phone), no switch — DESIGN.md § DB-view toolbar controls.
    expect(within(panel).queryAllByRole('button').map((el) => (el.textContent ?? '').trim()))
      .toEqual(['All', 'Needs attention', 'Retracted', 'I posted', 'Save view'])
    expect(within(panel).queryByRole('button', { name: /share signal/i })).toBeNull()
    expect(within(panel).queryAllByRole('combobox').map((el) => el.getAttribute('aria-label')))
      .toEqual(['Team', 'Category'])
    expect(within(panel).queryAllByRole('switch')).toHaveLength(0)

    // Rows: zero buttons, whole surface activates.
    const feedRows = document.querySelectorAll('.home-signal-row:not(.home-signal-row--retracted)')
    expect(feedRows.length).toBe(7)
    for (const feedRow of Array.from(feedRows)) {
      expect(feedRow.querySelectorAll('button')).toHaveLength(0)
      expect(feedRow.querySelectorAll('a')).toHaveLength(0)
    }
    // ≤9 controls in <main> at 390 with seven rows, door OPEN — search · the door · four view
    // chips · Team · Category · Save view is exactly 9, and the budget only closes because the
    // primary is not among them. Row activation targets don't count against the toolbar budget
    // (see AC-021's control-count rationale).
    const main = document.querySelector('main[data-page-family="workspace"]') as HTMLElement
    const rowActivationTargets = new Set(
      Array.from(main.querySelectorAll('.home-signal-row[role="button"]')),
    )
    const controlNodes = [
      ...within(main).queryAllByRole('button'),
      ...within(main).queryAllByRole('tab'),
      ...within(main).queryAllByRole('combobox'),
      ...within(main).queryAllByRole('searchbox'),
      ...within(main).queryAllByRole('switch'),
      ...within(main).queryAllByRole('link'),
    ].filter((el) => !rowActivationTargets.has(el))
    expect(controlNodes.length).toBeLessThanOrEqual(9)
  })

  it('AC-030 — empty scope: "No Signals yet." with "Share the first one" ONLY when the viewer can post', async () => {
    mockListReadableSignals.mockResolvedValue([])
    // A plain member with ONE eligible Team can post, so she gets the way out. Posting rights are
    // Teams, not access roles: `signal.create_for_team` is the composer's wide-mention privilege,
    // and gating on it hid the empty state's only action from every member the page simultaneously
    // rendered a working `Share Signal` primary.
    const memberAuth: AuthState = {
      ...dewiAuth,
      viewer: { ...dewiAuth.viewer, accessRoles: ['member'], isManager: false },
    }
    const memberView = renderPage('/work/signals', null, memberAuth)
    const emptyForPoster = await within(memberView.container).findByTestId('empty-state')
    expect(within(emptyForPoster).getByText(/no signals yet/i)).toBeInTheDocument()
    await waitFor(() => expect(
      within(emptyForPoster).getByRole('button', { name: /share the first one/i }),
    ).toBeInTheDocument())

    // A viewer with no eligible authoring Team gets the empty title alone — no dead affordance.
    mockListReadableAuthorTeams.mockResolvedValue([])
    const readerView = renderPage('/work/signals', null, dewiAuth)
    const emptyForReader = await within(readerView.container).findByTestId('empty-state')
    expect(within(emptyForReader).getByText(/no signals yet/i)).toBeInTheDocument()
    expect(within(emptyForReader).queryByRole('button', { name: /share the first one/i })).toBeNull()
  })

  it('AC-031 — ID locale: eight category families translate; "Perlu perhatian" and "Mendesak" surface; Team placeholder Indonesian; FYI stays', async () => {
    // The catalog reads its persisted locale on mount (mos.locale — see I18nProvider); the seed
    // must be in place BEFORE the tree renders or the initial state falls back to 'en'.
    try { localStorage.setItem('mos.locale', 'id') } catch { /* jsdom storage disabled */ }
    mockListReadableSignals.mockResolvedValue([
      row({ id: 's-urgent', body: 'Urgent thing', attention: 'Urgent', category: 'Supply/vendor', author_id: 'person-dewi' }),
      row({ id: 's-fyi', body: 'FYI thing', attention: 'FYI', category: null }),
    ])
    try {
      renderPage('/work/signals', null, dewiAuth)
      await waitFor(() => expect(screen.getByText('Urgent thing')).toBeInTheDocument())

      // Row attention words render translated for Urgent + Needs attention; FYI stays as-is.
      expect(screen.getByText('Mendesak')).toBeInTheDocument()
      expect(screen.getByText('FYI')).toBeInTheDocument()

      // Category filter shows the eight family translations; Team filter placeholder in Indonesian.
      const categorySelect = screen.getByRole('combobox', { name: /^kategori$/i }) as HTMLSelectElement
      const familyLabels = Array.from(categorySelect.options).map(o => o.textContent)
      for (const expected of [
        'Pasokan/vendor', 'Peralatan/fasilitas', 'Persediaan/ketersediaan',
        'Kualitas', 'Pelanggan', 'Orang', 'Proses', 'Lainnya',
      ]) {
        expect(familyLabels).toContain(expected)
      }
      const teamSelect = screen.getByRole('combobox', { name: /^tim$/i }) as HTMLSelectElement
      expect(teamSelect.options[0]?.textContent).toBe('Semua tim')

      // The meta line carries the translated category too.
      expect(document.querySelector('.home-signal-category')).toHaveTextContent('Pasokan/vendor')
    } finally {
      try { localStorage.removeItem('mos.locale') } catch { /* noop */ }
    }
  })

  it('AC-032 — existing pins stay green: Feed default · filtered-empty + Clear filters · Urgent-only fill · tombstone row', async () => {
    renderPage('/work/signals', null, dewiAuth)
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())
    // Feed is the default surface — the segment names both live options.
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true')

    // Urgent-only fill: the Urgent row carries the urgent modifier class; the Needs-attention row does not.
    const urgentRow = document.querySelector('[data-signal-id="signal-1"]')
    expect(urgentRow?.className).toContain('home-signal-row--urgent')
    const needsAttentionRow = document.querySelector('[data-signal-id="signal-2"]')
    expect(needsAttentionRow?.className).not.toContain('home-signal-row--urgent')

    // Filtered-empty + Clear filters — the row's own state kit shows the way back out.
    await userEvent.type(screen.getByRole('searchbox', { name: /search signals/i }), 'zzzzzznomatch')
    const filteredEmpty = await screen.findByTestId('empty-state')
    expect(within(filteredEmpty).getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    await userEvent.click(within(filteredEmpty).getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(screen.getByText(/card reader/i)).toBeInTheDocument())

    // Tombstone row renders when a retracted signal enters the projection via the Retracted view.
    mockListReadableSignals.mockResolvedValueOnce([
      row({ id: 'signal-tomb', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'wrong branch' }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Retracted' }))
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    expect(document.querySelector('.home-signal-row--retracted')).toBeTruthy()
  })

  it('AC-033 — DESIGN.md carries the P1 (Signal row) and P2 (DB-view toolbar) amendments verbatim', () => {
    const design = readFileSync(resolve(__dirname, '..', '..', '..', 'DESIGN.md'), 'utf8')
    // P1 adds the pieces AC-064's pre-existing amendment ("Home rows carry no per-row actions…",
    // owner law from #746) doesn't yet cover: the `dd Mon HH:MM` occurred shape, the
    // no-bordered-chips rule, `Acknowledge` on the record, and the ONE-component invariant. The
    // no-controls rule itself stays owned by AC-064, so P1 doesn't restate it and the § Signal row
    // section no longer states the rule twice.
    expect(design).toMatch(/The meta line is plain text — author · Team · occurred \(`dd Mon HH:MM`\) · category when set — never bordered chips\. `Acknowledge` also lives on the record\. Home and the archive render the same component; a difference between them is a defect\./)
    // P2: the two-row Signals toolbar contract.
    expect(design).toMatch(/The Signals archive uses the two-row collection toolbar\./)
    expect(design).toMatch(/Row 1: `All · Needs attention · Retracted · I posted` then user views/)
    expect(design).toMatch(/Row 2: search · `Team ▾` · `Category ▾` \(· `Group ▾` · `Sort ▾` when Table is live\) · `Save view` as ghost text\./)
    expect(design).toMatch(/No switch: a retracted Signal is reached through the `Retracted` view\./)
    expect(design).toMatch(/Phone keeps the search field outside the single "View & filters" door; the door never carries the surface primary\./)
  })
})

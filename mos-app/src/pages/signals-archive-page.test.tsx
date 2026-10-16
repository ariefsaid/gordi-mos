import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import { OverlayHostProvider, useOverlayHost } from '@/shell/overlay-host'
import type { OverlayEntry } from '@/shell/overlay-host'
import { AgentRuntimeProvider, useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'
import type { SignalRow } from '@/lib/db/signals.types'
import type { PersonOption } from '@/lib/db/directory'

vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return { ...actual, listReadableSignals: vi.fn(), listAllTeams: vi.fn(), correctSignal: vi.fn() }
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
// The hard-load record id is a module-level browser capture; jsdom has none, so tests set it.
const bootSignal = vi.hoisted(() => ({ id: null as string | null }))
vi.mock('@/components/signals/signal-page-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/signals/signal-page-mode')>()),
  get BOOT_SIGNAL_RECORD_ID() { return bootSignal.id },
}))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => desktopState.value }))
const { composerOpen, composerPostCount, composerCanPost } = vi.hoisted(() => ({
  composerOpen: vi.fn(),
  composerPostCount: { value: 0 },
  // Undefined = the shell did not report a post denial (the common case: the viewer can post).
  composerCanPost: { value: undefined as boolean | undefined },
}))
const registerInline = vi.fn()
vi.mock('@/shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: composerOpen, postCount: composerPostCount.value, canPost: composerCanPost.value, registerInline }),
}))

// The ?record=<id> record is SignalRecordHost's own job (signal-record-host.test.tsx covers its
// fetch/mutate wiring in full) — mock it here so this page's test only asserts the URL-state
// wiring: which id it's given, and that closing it clears ?record=. Chrome (✕ Close / Open full
// page) now belongs to the shared RecordPanelHost that wraps it (spec FR-3), NOT to this stub.
vi.mock('@/components/signals/signal-record-host', async () => {
  const { useEffect } = await import('react')
  return {
    SignalRecordHost: vi.fn(
      ({ signalId, mode, onTitleResolved, onPromote }: { signalId: string; mode?: string; onTitleResolved?: (title: string) => void; onPromote?: (to: string) => void }) => {
        // The real host resolves the record's title (its body's first line) one render after
        // mount — mirrored here so the canonical page's deputyDraft seam is exercised (#426).
        useEffect(() => { onTitleResolved?.('The freezer alarm went off') }, [onTitleResolved])
        return (
          <div data-testid="signal-record-host-stub" data-signal-id={signalId} data-mode={mode}>
            Signal record content
            {onPromote ? <button type="button" onClick={() => onPromote(`/work/signals/${signalId}`)}>Record menu: Open full page</button> : null}
          </div>
        )
      },
    ),
  }
})

import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import { createCollectionView, listCollectionViews } from '@/lib/db/user-views-collection'
import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import { SignalsArchivePage, SignalRecordPage } from './signals-archive-page'
import { signalCollectionDescriptor } from '@/components/signals/signal-collection-adapter'

const mockListReadableSignals = vi.mocked(listReadableSignals)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetPeople = vi.mocked(getPeople)
const mockListCollectionViews = vi.mocked(listCollectionViews)
const mockCreateCollectionView = vi.mocked(createCollectionView)

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-author-a', owning_team_id: 'team-hq', audience: 'team',
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

function pageTree(initialPath = '/work/signals', runtime: AgentRuntime | null = null, auth?: AuthState, extra?: ReactNode, locale: 'en' | 'id' = 'en') {
  return (
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthContext.Provider value={auth ?? { status: 'unauthenticated' }}>
          <AgentRuntimeProvider runtime={runtime}>
          <OverlayHostProvider>
            <LocationProbe />
            <DraftProbe />
            {extra}
            <Routes>
              <Route path="/work/signals" element={<SignalsArchivePage />} />
              <Route path="/work/signals/:signalId" element={<SignalRecordPage />} />
            </Routes>
          </OverlayHostProvider>
          </AgentRuntimeProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    </I18nProvider>
  )
}

function renderPage(initialPath = '/work/signals', runtime: AgentRuntime | null = null, auth?: AuthState, extra?: ReactNode, locale: 'en' | 'id' = 'en') {
  return render(pageTree(initialPath, runtime, auth, extra, locale))
}

function SignalStackProbe() {
  const host = useOverlayHost()
  const entry: OverlayEntry = {
    key: 'signal-task-create:signal-1', owner: 'signals', tenant: 'record',
    label: 'Create task', title: 'Create task', content: <div data-testid="signal-task-frame">Task draft</div>,
  }
  return <button type="button" onClick={() => { void host.push(entry) }}>Push task frame</button>
}

// The long tail of filters (and Save view) sits behind the one "Filters & options" door.
function openViewOptions() {
  const trigger = screen.queryByRole('button', { name: /^filters & options|^filter & opsi/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
}

// The view axis (All / Needs attention / Retracted / I posted) and the Feed|Table choice are pickers.
async function chooseFrom(comboboxName: string, optionName: string) {
  await userEvent.click(screen.getByRole('combobox', { name: comboboxName }))
  await userEvent.click(await screen.findByRole('option', { name: optionName }))
}
const chooseView = (name: string) => chooseFrom('Signal views', name)
const choosePresentation = (name: string) => chooseFrom('View as', name)

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
  bootSignal.id = null
  composerPostCount.value = 0
  composerCanPost.value = undefined
  desktopState.value = true
  // A record opens beside the list only when the content track holds both (a wide viewport); with
  // no shell mounted the track is the viewport. Phone cases flip desktopState off.
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1600 })
  window.matchMedia = ((query: string) => ({
    matches: desktopState.value && (query.includes('1100') || query.includes('(min-width: 768px)')),
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  mockListReadableSignals.mockResolvedValue([
    row({ id: 'signal-1', body: 'The freezer alarm went off' }),
    row({ id: 'signal-2', body: 'Espresso machine repaired', owning_team_id: 'team-radiant' }),
  ])
  mockListAllTeams.mockResolvedValue([
    { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
    { id: 'team-radiant', name: 'Radiant Operations', business_unit_id: 'bu-1', site_id: null, is_primary: false },
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
    expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Feed')
    // Feed's lean row leads with search + the view axis (both always visible).
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Signal views' }))
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['All', 'Needs attention', 'Retracted', 'I posted'])
    await userEvent.keyboard('{Escape}')
    // F6 (OD-91 #21): "Needs attention" lives on the view axis ONLY — no duplicate Attention dropdown.
    expect(screen.queryByRole('combobox', { name: 'Attention' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    // The rest of the filters (Team) live behind the one door.
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    // Feed is chronological + flat: no Group select, and never a board/calendar choice.
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument()

    // Choosing Table reveals the full grid capabilities — Group · Sort · Save view.
    await choosePresentation('Table')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Table'))
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save view/i })).toBeInTheDocument()
    // The chosen Table persists as shareable URL state (?layout=table).
    expect(screen.getByTestId('location')).toHaveTextContent('layout=table')
  })

  it('D-D2 / Rule 7 + AC-021: the page head hosts the ONE Share signal door (present in Feed AND Table; no in-feed row)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    // Feed (default): the head carries the one Share door — and there is NO second in-feed "Share a
    // Signal" row (that row is Home-ambient-only now).
    expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Feed')
    expect(screen.getByRole('button', { name: 'Share signal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /share a signal/i })).not.toBeInTheDocument()

    // Switching to Table must NOT make the compose door blink out — it rides the head, layout-independent.
    await choosePresentation('Table')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Table'))
    const shareInTable = screen.getByRole('button', { name: 'Share signal' })
    expect(shareInTable).toBeInTheDocument()

    // It opens the ONE shared composer.
    await userEvent.click(shareInTable)
    expect(composerOpen).toHaveBeenCalledTimes(1)
    expect(composerOpen).toHaveBeenCalledWith()
  })

  it('FR-V3-007: an explicit ?layout=table URL overrides the Feed default and restores the Table', async () => {
    // URL state and an explicit Table choice still win — only the UNINITIALIZED default flipped.
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Table')
    // The Table's grid capabilities are present, and the row cells render (real table, not feed).
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getAllByText(/HQ Operations/).some((node) => node.closest('td'))).toBe(true)
  })

  it('AC-574: the Filters & options door counts a real non-default filter and shows it as a removable chip', async () => {
    desktopState.value = false
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const door = screen.getByRole('button', { name: /^filters & options/i })
    expect(door).toHaveTextContent(/^Filters & options$/)

    await userEvent.click(door)
    await userEvent.click(screen.getByRole('combobox', { name: 'Category' }))
    await userEvent.click(screen.getByRole('option', { name: 'Quality' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^filters & options/i })).toHaveTextContent('1'))
    expect(screen.getByRole('button', { name: /category: quality/i })).toBeInTheDocument()
  })

  it('AC-V3-014: column-header sorting updates the same shareable query and visible row order', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-old', body: 'Older signal', occurred_at: '2026-07-16T02:00:00Z' }),
      row({ id: 'signal-new', body: 'Newer signal', occurred_at: '2026-07-16T04:00:00Z' }),
    ])
    // Column-header sorting is a Table journey — open the Table explicitly (Feed is now the default).
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('Newer signal')).toBeInTheDocument())

    const visibleMessages = () => screen.getAllByRole('button', { name: /^(Older|Newer) signal$/ })
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

    const hqToggle = screen.getByRole('button', { name: 'HQ Operations (1)' })
    expect(hqToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Radiant Operations (1)' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('group=team')
    expect(screen.getByTestId('location')).toHaveTextContent('saved=team-view')

    await userEvent.click(hqToggle)
    expect(screen.getByRole('button', { name: 'HQ Operations (1)' })).toHaveAttribute('aria-expanded', 'false')
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
    const options = screen.getByRole('button', { name: /^filters & options/i })
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
    expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Table')

    // Narrow WITHOUT remounting — a bare CSS media query would hide the Feed/Table choice here while
    // the collection stayed on Table underneath, the dead end #607 reports.
    desktopState.value = false
    rerender(pageTree('/work/signals?layout=table'))
    await waitFor(() => expect(screen.getByTestId('signal-feed')).toBeInTheDocument())
    expect(screen.queryByRole('combobox', { name: 'View as' })).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('layout=feed')

    // Widen back — the Table the session started on comes back, not a permanent phone-default demotion.
    desktopState.value = true
    rerender(pageTree('/work/signals?layout=table'))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'View as' })).toHaveTextContent('Table'))
    expect(screen.getByTestId('location')).toHaveTextContent('layout=table')
  })

  it('Issue #379 I3: phone Escape on the open Filters & options door closes it with focus on the trigger', async () => {
    desktopState.value = false
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const options = screen.getByRole('button', { name: /^filters & options/i })
    await userEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(screen.getByRole('group', { name: /^filters & options/i }), { key: 'Escape' })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(options).toHaveFocus()
  })

  it('Issue #581: at phone width the search input renders outside the Filters & options door; the long tail of filters stays behind it', async () => {
    desktopState.value = false
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    const options = screen.getByRole('button', { name: /^filters & options/i })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    // Search is reachable with the door still closed — it is not one of the things behind it.
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /show retracted/i })).not.toBeInTheDocument()
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    // Still exactly one search input.
    expect(screen.getAllByRole('searchbox', { name: /search signals/i })).toHaveLength(1)
  })

  it('authenticated archive Feed rows remain one activation target with no row actions', async () => {
    renderPage('/work/signals?layout=feed', null, archiveAuth)
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    const signalRow = screen.getByRole('button', { name: /the freezer alarm went off/i })
    expect(signalRow).toHaveAttribute('data-signal-id', 'signal-1')
    expect(within(signalRow).queryAllByRole('button')).toHaveLength(0)
    expect(within(signalRow).queryAllByRole('link')).toHaveLength(0)
  })

  it('Feed uses the same injected opener and does not advertise unavailable Task creation', async () => {
    renderPage('/work/signals?layout=feed&q=espresso&saved=view-1')
    await waitFor(() => expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
    // The whole feed row is the record-open button, named by its content.
    await userEvent.click(screen.getByRole('button', { name: /espresso machine repaired/i }))
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

  it('hides retracted rows by default, and reveals them via the Retracted view (IMPORTANT-6)', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument())
    expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument()

    // Retracted is a choice on the view axis.
    await chooseView('Retracted')
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
  })

  it('restores legacy retracted URL state and can return to All (round-trips through Back/refresh/new-tab)', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage('/work/signals?retracted=1')
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i)).toBeInTheDocument())
    await chooseView('All')
    await waitFor(() => expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument())
  })

  it('clearing a filtered legacy URL also clears its retired retracted flag', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 'signal-3', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate' }),
    ])
    renderPage('/work/signals?retracted=1&q=does-not-match')
    await userEvent.click(await screen.findByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals'))
    expect(screen.queryByText(/this signal was retracted/i)).not.toBeInTheDocument()
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

    // The view axis reads the fetched name, not the generic "All" view label the query alone maps to.
    expect(screen.getByRole('combobox', { name: 'Signal views' })).toHaveTextContent('Radiant watch')
    // The URL is the id only — the name never round-trips through it.
    expect(screen.getByTestId('location')).toHaveTextContent('saved=custom-signal-view')
    expect(screen.getByTestId('location')).not.toHaveTextContent('Radiant')
  })
})

describe('Signals saved-view recovery', () => {
  it('keeps a failed name and retries the same save after the form is closed', async () => {
    mockCreateCollectionView.mockRejectedValue(new Error('save failed'))
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    openViewOptions()
    fireEvent.click(screen.getByRole('button', { name: /^save view$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /view name/i }), { target: { value: 'Signal watch' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockCreateCollectionView).toHaveBeenCalledTimes(1))
    expect(screen.getByDisplayValue('Signal watch')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry saved views/i }))
    await waitFor(() => expect(mockCreateCollectionView).toHaveBeenCalledTimes(2))
    expect(mockCreateCollectionView.mock.calls[1]?.[0]).toMatchObject({ name: 'Signal watch' })
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

  it('AC-RPH-2: the Signal panel carries the shared host chrome — Open full page and Close', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^open full page$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument()
  })

  it('does not mount the record when no ?record= is present', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open full page$/i })).not.toBeInTheDocument()
  })

  it('clicking a row opens the record without navigating away from the list', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByText('The freezer alarm went off'))

    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toHaveAttribute('data-signal-id', 'signal-1'))
    // The list is still present — the record opens alongside the list, not a route swap (Rule 6).
    expect(screen.getByText('Espresso machine repaired')).toBeInTheDocument()
  })

  it('phone row opens the canonical Signal page and Back restores the same collection view', async () => {
    desktopState.value = false
    renderPage('/work/signals?layout=feed')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())

    await userEvent.click(screen.getByText('The freezer alarm went off'))

    const record = await screen.findByTestId('signal-record-host-stub')
    expect(record).toHaveAttribute('data-signal-id', 'signal-1')
    expect(record).toHaveAttribute('data-mode', 'page')
    expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/signal-1?layout=feed')
    expect(document.querySelector('[data-overlay-host]')).toBeNull()
    expect(screen.queryByText('Espresso machine repaired')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Back to Signals' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals?layout=feed'))
    await screen.findByText('Espresso machine repaired')
    expect(document.querySelector('[data-overlay-host]')).toBeNull()
  })

  it('opens the record through the shared signals overlay host', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    await userEvent.click(screen.getByText('The freezer alarm went off'))

    await waitFor(() => expect(document.querySelector('[data-overlay-host="true"][data-overlay-owner="signals"]')).toBeTruthy())
    expect(document.querySelector('[data-overlay-host-slot="signals"]')).toBeTruthy()
  })

  it('keeps a pushed child frame above the Signal instead of replacing the root on rerender', async () => {
    renderPage('/work/signals?record=signal-1', null, archiveAuth, <SignalStackProbe />)
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Push task frame' }))
    expect(await screen.findByTestId('signal-task-frame')).toBeInTheDocument()
  })

  it('the host ✕ Close clears ?record= from the URL', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^close$/i }))
    await waitFor(() => expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument())
  })

  it('the record\'s own ••• "Open full page" lands on the canonical page and stays there', async () => {
    // The chrome button and the record's menu item both promote through the archive's own
    // flagged path, so the archive's ?record= cleanup never overwrites the navigation.
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Record menu: Open full page' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/signal-1'))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/signal-1')
  })

  it('the host "Open full page" escalates to the canonical /work/signals/:id page', async () => {
    renderPage('/work/signals?record=signal-1')
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^open full page$/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/signal-1'))
    expect(await screen.findByTestId('signal-record-host-stub')).toHaveAttribute('data-mode', 'page')
    expect(document.querySelector('[data-overlay-host]')).toBeNull()
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
    // Same renderer, page mode — no panel chrome (Open full page / Close) around it.
    expect(screen.queryByRole('button', { name: /^open full page$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^close$/i })).toBeNull()
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
    expect(screen.queryByText('Search and revisit the Signals shared across the org.')).toBeNull()
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

    const ask = screen.getByRole('button', { name: 'Ask Deputy' })
    await userEvent.click(ask)

    // The composer seed is the record reference built from the signal's own body — set as the
    // runtime's pendingDraft; nothing sent.
    expect(screen.getByTestId('pending-draft')).toHaveTextContent('About Signal: The freezer alarm went off')
  })

  it('truncates a very long first line so the seed reads as a reference, not a paste', async () => {
    const longBody = `The espresso machine at Cafe 2 has been running eight degrees too hot since the morning open ${'and the team keeps recalibrating it '.repeat(6)}and nobody can find the manual`
    mockListReadableSignals.mockResolvedValue([row({ id: 'signal-long', body: longBody })])
    renderPage('/work/signals', makeFakeRuntime())
    await waitFor(() => expect(screen.getByText(longBody)).toBeInTheDocument())
    await userEvent.click(screen.getByText(longBody))
    await waitFor(() => expect(screen.getByTestId('signal-record-host-stub')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Ask Deputy' }))
    const draft = screen.getByTestId('pending-draft').textContent ?? ''
    expect(draft.startsWith('About Signal: The espresso machine at Cafe 2')).toBe(true)
    expect(draft.endsWith('…')).toBe(true)
    // "About Signal: " + the record title's cap (160 chars) + ellipsis.
    expect(draft.length).toBeLessThanOrEqual('About Signal: '.length + 161)
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

// ── Issue #770 — the archive toolbar + rows acceptance contract (AC-021…AC-031) ────────────────
// Seven seeded rows are the AC-025/AC-029 fixture; the census-style control count below uses the
// same actionable grammar the quantitative audit's control census freezes (button / a[href] /
// role=button / role=link / role=combobox — the frozen denominator of issue #856).

function sevenRows(): SignalRow[] {
  const bodies = [
    'Card reader dropped the connection during the afternoon rush again',
    'Pastry case ran empty an hour before close',
    'Espresso machine repaired',
    'New vendor for oat milk confirmed',
    'Grinder 2 needs a burr replacement',
    'Cold brew kegs arrive Thursday',
    'Freezer alarm went off',
  ]
  return bodies.map((body, index) => row({
    id: `signal-${index + 1}`,
    body,
    attention: index === 0 ? 'Urgent' : index === 1 ? 'Needs attention' : 'FYI',
    occurred_at: `2026-07-1${index}T02:00:00Z`,
    retracted_at: null,
  }))
}

describe('issue #770 — the two-row Signals archive toolbar (AC-021/022/023)', () => {
  it('AC-021: 1440 Feed offers views, Feed|Table, search, Category, Team and Save view — and the head holds the Share door', async () => {
    mockListReadableSignals.mockResolvedValue(sevenRows().slice(0, 6))
    renderPage()
    await waitFor(() => expect(screen.getByText('Pastry case ran empty an hour before close')).toBeInTheDocument())

    // The view axis, the Feed|Table choice and search are exposed in the bar.
    await userEvent.click(screen.getByRole('combobox', { name: 'Signal views' }))
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['All', 'Needs attention', 'Retracted', 'I posted'])
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('combobox', { name: 'View as' }))
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['Table', 'Feed'])
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('searchbox', { name: /search signals/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()

    // Team and Save view sit behind the one door; Group stays Table-only.
    openViewOptions()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save view' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument()

    // No switch anywhere in the collection.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()

    // The head holds the Share door.
    expect(screen.getByTestId('page-head')).toContainElement(screen.getByRole('button', { name: 'Share signal' }))
  })

  it('AC-022: Table adds Group·Sort; Group = Team reads "Team", distinct from the Team filter', async () => {
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    openViewOptions()

    // Group defaults to none.
    const group = screen.getByRole('combobox', { name: 'Group' })
    expect(group).toHaveTextContent('No grouping')

    // Choosing Team groups by Team ( Kelompok: Tim in ID — AC-031's walk).
    await userEvent.click(group)
    await userEvent.click(await screen.findByRole('option', { name: 'Team' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Group' })).toHaveTextContent('Team'))
    expect(screen.getByTestId('location')).toHaveTextContent('group=team')

    // Distinct from the Team FILTER (a separate control with its own label).
    expect(screen.getAllByRole('combobox', { name: 'Team' })).toHaveLength(1)
  })

  it('AC-023: no "Show retracted" control exists at any width; the Retracted view lists tombstone rows', async () => {
    mockListReadableSignals.mockResolvedValue([
      ...sevenRows(),
      row({ id: 'signal-dead', body: 'The retracted one', retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Misposted' }),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Pastry case ran empty an hour before close')).toBeInTheDocument())
    expect(screen.queryByText(/show retracted/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()

    await chooseView('Retracted')
    await waitFor(() => expect(document.querySelector('[data-signal-id="signal-dead"]')).not.toBeNull())
    expect(screen.getAllByText(/This Signal was retracted/i).length).toBeGreaterThan(0)
  })
})

describe('issue #770 — archive rows and table grammar (AC-025/027)', () => {
  it('AC-025: seven Feed rows carry zero nested buttons or links, one activation target each, plain-text meta, no "Visible to"', async () => {
    mockListReadableSignals.mockResolvedValue(sevenRows())
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('signal-feed').length).toBeGreaterThan(0))

    const rows = Array.from(document.querySelectorAll('[data-testid="signal-feed"] [data-signal-id]'))
    expect(rows).toHaveLength(7)
    for (const rowElement of rows) {
      expect(rowElement.getAttribute('role')).toBe('button')
      expect(rowElement.querySelectorAll('button, a')).toHaveLength(0)
      expect(rowElement.textContent).not.toContain('Visible to')
    }

    // Meta = author · Team · date/time, plain text.
    expect(rows[0]!.textContent).toContain('Author One')
    expect(rows[0]!.textContent).toContain('HQ Operations')
    expect(rows[0]!.textContent).toMatch(/\d{2}:\d{2}/)

    // One activation target per row: clicking opens the record in the shared host.
    await userEvent.click(rows[0]!)
    await waitFor(() => expect(document.querySelector('[data-testid="signal-record-host-stub"]')).not.toBeNull())
  })

})

describe('issue #770 — Save view, phone door, and empty states (AC-028/029/030)', () => {
  it('AC-028: Save view opens a named-view form with focus in the name, and Escape closes it', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument())
    openViewOptions()

    const save = screen.getByRole('button', { name: 'Save view' })
    await userEvent.click(save)
    const field = await screen.findByLabelText('View name')
    expect(field).toHaveFocus()

    await userEvent.type(field, 'Cafe week')
    fireEvent.keyDown(field, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('View name')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Save view' })).toBeInTheDocument()
  })

  it('AC-029: 390 — search sits outside the door; the door holds Team, Category, View as and Save view without Share signal or a switch; rows have no buttons', async () => {
    desktopState.value = false
    mockListReadableSignals.mockResolvedValue(sevenRows())
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('signal-feed').length).toBeGreaterThan(0))

    // Search is OUTSIDE the door and reachable without opening it.
    expect(screen.getByRole('searchbox', { name: 'Search Signals' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Team' })).not.toBeInTheDocument()

    const rows = Array.from(document.querySelectorAll('[data-testid="signal-feed"] [data-signal-id]'))
    expect(rows).toHaveLength(7)
    for (const rowElement of rows) {
      expect(rowElement.querySelectorAll('button, a')).toHaveLength(0)
    }

    // The door holds the long tail — no Share signal, no switch.
    await userEvent.click(screen.getByRole('button', { name: /^filters & options/i }))
    const door = screen.getByRole('group', { name: /^filters & options/i })
    expect(within(door).getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(within(door).getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    expect(within(door).getByRole('combobox', { name: 'View as' })).toBeInTheDocument()
    expect(within(door).getByRole('button', { name: 'Save view' })).toBeInTheDocument()
    expect(within(door).queryByRole('button', { name: 'Share signal' })).not.toBeInTheDocument()
    expect(within(door).queryByRole('switch')).not.toBeInTheDocument()
  })

  it('issue 1032: 390 — the page head carries the Share signal door outside the Filters & options door, and a viewer who cannot post gets none', async () => {
    desktopState.value = false
    mockListReadableSignals.mockResolvedValue(sevenRows())
    const { unmount } = renderPage()
    await waitFor(() => expect(screen.getAllByTestId('signal-feed').length).toBeGreaterThan(0))
    const share = screen.getByRole('button', { name: 'Share signal' })
    expect(share.closest('[role="group"][aria-label="Filters & options"]')).toBeNull()
    unmount()

    composerCanPost.value = false
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('signal-feed').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Share signal' })).not.toBeInTheDocument()
  })

  it('AC-030: first-use Signals is short, keeps only the header Share action, and is not an all-clear', async () => {
    mockListReadableSignals.mockResolvedValue([])
    composerCanPost.value = false
    const { unmount } = renderPage()
    const empty = await screen.findByTestId('empty-state')
    expect(within(empty).getByText('No Signals yet.')).toBeInTheDocument()
    expect(within(empty).queryByRole('button')).not.toBeInTheDocument()
    expect(empty).toHaveAttribute('data-empty-variant', 'next-step')
    unmount()

    composerCanPost.value = true
    renderPage()
    const emptyWithShare = await screen.findByTestId('empty-state')
    expect(within(emptyWithShare).getByText('No Signals yet.')).toBeInTheDocument()
    expect(within(emptyWithShare).getByText('Use Share signal to post the first one.')).toBeInTheDocument()
    expect(within(emptyWithShare).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share signal' })).toBeInTheDocument()
  })
})

describe('issue #770 — AC-031: the archive renders one language at a time (ID)', () => {
  it('renders the eight category families, the attention words and the Team placeholder in Indonesian; "FYI" stays', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 's-fyi', body: 'FYI body', attention: 'FYI', category: 'Supply/vendor' }),
      row({ id: 's-needs', body: 'Needs body', attention: 'Needs attention', category: 'Quality' }),
      row({ id: 's-urgent', body: 'Urgent body', attention: 'Urgent', category: null }),
    ])
    renderPage('/work/signals?layout=table', null, undefined, undefined, 'id')
    await waitFor(() => expect(screen.getByText('FYI body')).toBeInTheDocument())

    // View axis in Indonesian.
    await userEvent.click(screen.getByRole('combobox', { name: 'Tampilan Sinyal' }))
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['Semua', 'Perlu perhatian', 'Ditarik', 'Saya posting'])
    await userEvent.keyboard('{Escape}')

    // Team filter (behind the door): Indonesian label + Indonesian placeholder ("Any team" → "Semua tim").
    openViewOptions()
    await userEvent.click(screen.getByRole('combobox', { name: 'Tim' }))
    expect(await screen.findByRole('option', { name: 'Semua tim' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    // Category filter: all eight families in Indonesian.
    await userEvent.click(screen.getByRole('combobox', { name: 'Kategori' }))
    for (const family of ['Pasokan/pemasok', 'Peralatan/fasilitas', 'Inventaris/ketersediaan', 'Kualitas', 'Pelanggan', 'Orang', 'Proses', 'Lainnya']) {
      expect(await screen.findByRole('option', { name: family })).toBeInTheDocument()
    }
    await userEvent.keyboard('{Escape}')

    // Attention words render in Indonesian; FYI stays the borrowed initialism. (Assert within the
    // table body.)
    const tableBody = document.querySelector('tbody')!
    expect(within(tableBody).getByText('Perlu perhatian')).toBeInTheDocument()
    expect(within(tableBody).getByText('Mendesak')).toBeInTheDocument()
    expect(within(tableBody).getByText('FYI')).toBeInTheDocument()
  })
})

describe('signals Team filter — historical team rows vs All Teams (AC-8)', () => {
  it('the Team filter still matches historical team rows while All Teams rows (no Team) stay neutral', async () => {
    mockListReadableSignals.mockResolvedValue([
      // An All Teams Signal has no owning Team, so it belongs to no Team bucket; a historical
      // team-audience Signal keeps its owning Team.
      row({ id: 's-org', body: 'All teams observation', audience: 'org', owning_team_id: null }),
      row({ id: 's-hist', body: 'Retired team note', audience: 'team', owning_team_id: 'team-radiant' }),
    ])
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('All teams observation')).toBeInTheDocument())
    expect(screen.getByText('Retired team note')).toBeInTheDocument()

    // Filtering by a Team keeps the historical team row and excludes the org-wide (Team-less) row.
    openViewOptions()
    await userEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Radiant Operations' }))
    expect(screen.getByText('Retired team note')).toBeInTheDocument()
    expect(screen.queryByText('All teams observation')).not.toBeInTheDocument()
  })

  // The Team filter is absent, not a disabled stub, when nothing on the page could ever match it.
  it('is absent (no disabled stub) when no loaded Signal has an owning Team', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 's-org-1', body: 'All teams observation', audience: 'org', owning_team_id: null }),
      row({ id: 's-org-2', body: 'Another org-wide note', audience: 'org', owning_team_id: null }),
    ])
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('All teams observation')).toBeInTheDocument())

    openViewOptions()
    expect(screen.queryByRole('combobox', { name: 'Team' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
  })

  it('lists only the Teams present on loaded rows, not every org Team', async () => {
    mockListReadableSignals.mockResolvedValue([
      row({ id: 's-hist', body: 'Retired team note', audience: 'team', owning_team_id: 'team-radiant' }),
    ])
    renderPage('/work/signals?layout=table')
    await waitFor(() => expect(screen.getByText('Retired team note')).toBeInTheDocument())

    openViewOptions()
    await userEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    expect(await screen.findByRole('option', { name: 'Radiant Operations' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'HQ Operations' })).not.toBeInTheDocument()
  })
})

// A pasted/bookmarked collection link naming a record (a hard load onto ?record=<id>) resolves to
// the canonical full page. The collection must not mount underneath that redirect: its panel
// open and URL sync would write the collection URL back over it and strand a blank page.
describe('SignalsArchivePage — a hard load onto ?record=<id> lands on the canonical page', () => {
  it('ends on /work/signals/<id> with the collection query kept, and stays there', async () => {
    bootSignal.id = 'signal-1'
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/signals?layout=feed&record=signal-1']}>
          <AuthContext.Provider value={{ status: 'unauthenticated' }}>
            <OverlayHostProvider>
              <LocationProbe />
              <Routes>
                <Route path="/work/signals" element={<SignalsArchivePage />} />
                <Route path="/work/signals/:signalId" element={<p data-testid="canonical-page">page</p>} />
              </Routes>
            </OverlayHostProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      </I18nProvider>,
    )
    await screen.findByTestId('canonical-page')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/work\/signals\/signal-1\?layout=feed$/)
    expect(screen.getByTestId('canonical-page')).toBeInTheDocument()
    expect(screen.queryByTestId('signal-record-host-stub')).not.toBeInTheDocument()
  })
})


describe('Signals archive — server paging', () => {
  const page = (start: number, length: number) => Array.from({ length }, (_, offset) => row({
    id: `paged-signal-${start + offset}`, body: `Paged signal ${start + offset}`,
  }))
  it('appends first, next and final windows without replacing or duplicating loaded rows', async () => {
    mockListReadableSignals.mockResolvedValueOnce(page(1, 50)).mockResolvedValueOnce(page(51, 50)).mockResolvedValueOnce(page(101, 1))
    renderPage()
    await screen.findByText('Paged signal 1')
    await userEvent.click(screen.getByRole('button', { name: /Load more/ }))
    await screen.findByText('Paged signal 100')
    expect(mockListReadableSignals).toHaveBeenLastCalledWith(expect.objectContaining({ before: expect.objectContaining({ id: 'paged-signal-50' }) }))
    await userEvent.click(screen.getByRole('button', { name: /Load more/ }))
    await screen.findByText('Paged signal 101')
    expect(screen.getByText('101 items loaded · end of list')).toBeInTheDocument()
    expect(screen.getAllByText('Paged signal 1')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })

  it('next-page errors preserve the list and retry the same window', async () => {
    mockListReadableSignals.mockResolvedValueOnce(page(1, 50)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(51, 1))
    renderPage()
    await screen.findByText('Paged signal 1')
    await userEvent.click(screen.getByRole('button', { name: /Load more/ }))
    await screen.findByText(/couldn’t load more/i)
    expect(screen.getByText('Paged signal 1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Paged signal 51')
    expect(mockListReadableSignals.mock.calls[1]).toEqual(mockListReadableSignals.mock.calls[2])
  })

  it('view filters start a fresh window and include retracted history at the server', async () => {
    mockListReadableSignals.mockResolvedValueOnce(page(1, 50)).mockResolvedValueOnce([
      row({ id: 'older-history', body: 'Retracted history', retracted_at: '2026-10-05T09:00:00Z', retract_reason: 'Historical record' }),
    ])
    renderPage()
    await screen.findByText('Paged signal 1')
    await chooseView('Retracted')
    await screen.findByText('Historical record')
    expect(screen.queryByText('Paged signal 1')).not.toBeInTheDocument()
    expect(mockListReadableSignals).toHaveBeenLastCalledWith({ includeRetracted: true, retractedOnly: true })
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })
})

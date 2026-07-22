// HomePage tests — TDD (AC-tagged, Task 4.3/4.4).
// Home v1: role-guarded finance KPI row (revenue + margin, finance/admin only — the
// fetch is skipped entirely for a member, so the tiles are absent, not a misleading
// zero — RLS-empty handling), an everyone-row (tasks + ops), the MyWeekPanel, and a
// FreshnessLabel. Every KPI tile is a drill-target <Link>.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// Finance reporting DAL (role-guarded fetch — mocked so we can assert it's never
// called for a member viewer).
vi.mock('../lib/db/reporting', () => ({
  listSalesDailyRevenue: vi.fn(),
  latestSnapshotAsOf: vi.fn((rows: { snapshot_as_of: string }[]) =>
    rows.length ? rows[rows.length - 1].snapshot_as_of : null,
  ),
  latestReportingDate: vi.fn((rows: { revenue_date: string }[]) =>
    rows.length ? rows[rows.length - 1].revenue_date : null,
  ),
}))
import { listSalesDailyRevenue } from '@/lib/db/reporting'
const mockListRevenue = vi.mocked(listSalesDailyRevenue)

vi.mock('../lib/db/reporting-margin', () => ({
  listSalesMarginDaily: vi.fn(),
  latestMarginSnapshotAsOf: vi.fn((rows: { snapshot_as_of: string }[]) =>
    rows.length ? rows[rows.length - 1].snapshot_as_of : null,
  ),
  latestMarginReportingDate: vi.fn((rows: { margin_date: string }[]) =>
    rows.length ? rows[rows.length - 1].margin_date : null,
  ),
}))
import { listSalesMarginDaily } from '@/lib/db/reporting-margin'
const mockListMargin = vi.mocked(listSalesMarginDaily)

// MyWeekPanel's own data layer (My Week body renders inside Home) — mocked exactly
// like my-week.test.tsx so HomePage tests stay fast/isolated. HomePage also uses
// listTasks directly for the tasks-count tile.
vi.mock('../lib/db/weekly-updates', () => ({
  getMyUpdate: vi.fn(),
  submit: vi.fn(),
  reopen: vi.fn(),
  addLine: vi.fn(),
  updateLine: vi.fn(),
  removeLine: vi.fn(),
  listTeamUpdates: vi.fn(),
}))
import { getMyUpdate } from '@/lib/db/weekly-updates'
const mockGetMyUpdate = vi.mocked(getMyUpdate)

vi.mock('../lib/db/team', () => ({
  getTeamForManager: vi.fn(),
}))

vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
}))
import { listTasks } from '@/lib/db/tasks'
const mockListTasks = vi.mocked(listTasks)

vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
const mockGetBUs = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

// Step 5 — attention brief data sources. Mentions lane (Inbox's own DAL).
vi.mock('../lib/db/notifications', () => ({
  listNotifications: vi.fn(),
  notificationRoute: () => null,
}))
import { listNotifications } from '@/lib/db/notifications'
const mockListNotifications = vi.mocked(listNotifications)

// Step 5 — failed-checks adapter (café rejected logs, RATIFY-3).
vi.mock('../lib/db/home-attention-data', () => ({
  loadFailedChecksForViewer: vi.fn(),
}))
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
const mockLoadFailedChecks = vi.mocked(loadFailedChecksForViewer)

// Signal ambient feed (Step 4 C3, AC-426/FR-414) — SignalFeedSection's own DAL fetch, mocked so
// the Home tests stay isolated (component tests mock the DAL, never a live one).
vi.mock('../lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return {
    ...actual,
    listReadableSignals: vi.fn().mockResolvedValue([]),
    correctSignal: vi.fn(),
    listAllTeams: vi.fn().mockResolvedValue([]),
  }
})
vi.mock('../shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: vi.fn() }),
}))

import { HomePage } from './home-page'
import { setRegionOrder, resolveRegionOrder } from '@/lib/home-region-order'

const financeViewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya@gordi.id',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
    accessRoles: ['finance'],
  },
  signOut: vi.fn(),
}

const memberViewer: AuthState = {
  ...financeViewer,
  viewer: { ...financeViewer.viewer, accessRoles: [] },
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

async function renderHome(auth: AuthState = financeViewer) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(createElement(HomePage), { wrapper })
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

function revenueRow(overrides: Record<string, unknown> = {}) {
  return {
    revenue_date: '2026-06-30',
    channel: 'POS',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    transactions: 80,
    clean_revenue: 12_300_000,
    snapshot_as_of: '2026-07-01T02:00:00Z',
    source_contract_version: 'v_daily_revenue_unified.v1',
    ...overrides,
  }
}

function marginRow(overrides: Record<string, unknown> = {}) {
  return {
    margin_date: '2026-06-30',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    revenue: 12_300_000,
    cogs_interim_sm: 6_800_000,
    cogs_budget_bom: 6_500_000,
    margin_interim: 5_500_000,
    margin_interim_pct: 0.4472,
    bom_coverage_pct: 0.92,
    snapshot_as_of: '2026-07-01T02:00:00Z',
    source_contract_version: 'pos_margin_interim.v1',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockListRevenue.mockResolvedValue([revenueRow()])
  mockListMargin.mockResolvedValue([marginRow()])
  mockGetMyUpdate.mockResolvedValue(null)
  mockListTasks.mockResolvedValue([])
  mockGetBUs.mockResolvedValue([])
  mockGetPeople.mockResolvedValue([])
  mockListNotifications.mockResolvedValue([])
  mockLoadFailedChecks.mockResolvedValue([])
})

// OD-REDESIGN-17 (owner critique "why dashboard AND home"): Home no longer duplicates the
// Money dashboard's revenue/margin KPI tiles. The finance KPI row + its snapshot provenance
// were removed from Home; financial *exceptions* surface only via the attention brief. These
// describe blocks are updated as a DELIBERATE removal per OD-17 (the goal-oracle for the old
// finance tiles moved to the dashboard, which owns them).
describe('AC-H01/OD-17: Home never renders the revenue/margin KPI tiles (dashboard owns them)', () => {
  it('does not render revenue or margin tiles even for a finance viewer', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())

    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
    // No finance snapshot provenance line on Home anymore.
    expect(screen.queryByText(/as of/i)).toBeNull()
  })

  it('does not issue the finance reporting query from Home for any viewer (OD-17)', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
  })
})

describe('AC-H02/OD-17: member-only viewer sees the My tasks card + My Week panel (never blank)', () => {
  it('does not render revenue/margin tiles and never calls the finance DAL', async () => {
    await renderHome(memberViewer)
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
  })

  it('renders the My tasks card + My Week panel (never blank)', async () => {
    await renderHome(memberViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
    // KPI tile for open tasks is removed — count now lives in My tasks card header
    expect(screen.queryByRole('group', { name: /open tasks/i })).toBeNull()
  })
})

describe('AC-H03: the My Week panel (MyTasksCard) is present for any viewer', () => {
  it('renders MyTasksCard head', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
  })
})

describe('F-C / OD-REDESIGN-64 — member Home has no legacy dead-link cards', () => {
  it('AC-W1-C: member Home keeps work visible but hides update and Daily Log cards', async () => {
    await renderHome(memberViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())

    expect(screen.queryByRole('region', { name: 'My weekly update' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Today on the Daily Log/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /write update/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /open the daily log/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /log entries/i })).toBeNull()
  })
})

describe('AC-H06: tasks tile is removed — open count lives in My tasks card header', () => {
  it('does NOT render the standalone KPI tile for open tasks', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
    expect(screen.queryByRole('group', { name: /open tasks/i })).toBeNull()
  })

  it('My tasks card header shows the open count once ready', async () => {
    mockListTasks.mockResolvedValue([
      {
        id: 't-1', org_id: 'org-1', title: 'Task 1', business_unit_id: 'bu-1',
        status: 'In Progress', responsible_person_id: financeViewer.viewer.person.id,
        accountable_person_id: 'other-1', consulted_person_ids: [], informed_person_ids: [],
        description: null, due_date: null, objective_id: null, work_line_id: null,
        last_activity_at: '2026-06-30T00:00:00Z', archived_at: null, created_by: 'x',
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
      },
      {
        id: 't-2', org_id: 'org-1', title: 'Task 2', business_unit_id: 'bu-1',
        status: 'Done', responsible_person_id: financeViewer.viewer.person.id,
        accountable_person_id: 'other-1', consulted_person_ids: [], informed_person_ids: [],
        description: null, due_date: null, objective_id: null, work_line_id: null,
        last_activity_at: '2026-06-30T00:00:00Z', archived_at: null, created_by: 'x',
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
      },
    ])
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
    // My tasks card header meta should include '1 open' (only In Progress, not Done)
    await waitFor(() =>
      expect(screen.getByText("Where you're PIC or Supervisor · off track first · 1 open")).toBeInTheDocument()
    )
  })
})

describe('Home decision context — an overdue attention row shows its PIC + owning-BU caption (Luna J01/J02)', () => {
  it('decorates the overdue task row with the Responsible person name and the BU caption from the directory', async () => {
    const viewerId = financeViewer.status === 'authenticated' ? financeViewer.viewer.person.id : ''
    mockListTasks.mockResolvedValue([
      {
        id: 't-late', org_id: 'org-1', title: 'Restock oat milk', business_unit_id: 'bu-cafe',
        status: 'In Progress', responsible_person_id: viewerId,
        accountable_person_id: 'other-1', consulted_person_ids: [], informed_person_ids: [],
        description: null, due_date: '2020-01-01', objective_id: null, work_line_id: null,
        last_activity_at: '2026-06-30T00:00:00Z', archived_at: null, created_by: 'x',
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
      },
    ])
    mockGetPeople.mockResolvedValue([{ id: viewerId, full_name: 'Cahya Cafe' }])
    mockGetBUs.mockResolvedValue([{ id: 'bu-cafe', name: 'Café' }])

    await renderHome(financeViewer)

    const region = await screen.findByRole('region', { name: 'Needs attention' })
    const row = await within(region).findByText('Restock oat milk')
    const link = row.closest('a')!
    await waitFor(() => expect(within(link).getByText('Cahya Cafe')).toBeInTheDocument())
    expect(within(link).getByText('Café')).toBeInTheDocument()
  })
})

describe('AC-512: default order = attention-first (Step 5)', () => {
  it('renders #attention-brief before the personal-canvas region when nothing is stored', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    const attentionRegion = document.getElementById('attention-brief')!
    const personalCanvas = screen.getByTestId('personal-canvas')
    // attentionRegion precedes personalCanvas in DOM order
    const position = attentionRegion.compareDocumentPosition(personalCanvas)
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })
})

describe('AC-513: personal-first reorders + the header summary survives (Step 5)', () => {
  it('renders personal-canvas before #attention-brief, plus a "Needs attention · N" header summary', async () => {
    const personId = financeViewer.viewer.person.id
    setRegionOrder(personId, 'personal-first')

    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    const attentionRegion = document.getElementById('attention-brief')!
    const personalCanvas = screen.getByTestId('personal-canvas')
    // personalCanvas precedes attentionRegion in DOM order
    const position = personalCanvas.compareDocumentPosition(attentionRegion)
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)

    const summaryLink = screen.getByRole('link', { name: /needs attention · \d+/i })
    expect(summaryLink.getAttribute('href')).toBe('#attention-brief')
  })

  // Jump-affordance fix — the header summary is a real link (already true), but must also
  // READ as one (styled affordance + a jump cue), not plain prose that happens to be clickable.
  it('the header summary is styled as a link affordance with a jump cue', async () => {
    const personId = financeViewer.viewer.person.id
    setRegionOrder(personId, 'personal-first')

    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    const summaryLink = screen.getByRole('link', { name: /needs attention · \d+/i })
    expect(summaryLink).toHaveClass('home-attention-jump')
    // Convention placement (mirrors "All tasks →", "Open the Daily Log →") — a trailing
    // arrow glyph signals "this jumps you somewhere", not just "this is styled".
    expect(summaryLink.textContent).toMatch(/→\s*$/)
  })
})

describe('AC-514: the order toggle persists (Step 5)', () => {
  it('reorders the regions and persists personal-first when "My items first" is clicked', async () => {
    const personId = financeViewer.viewer.person.id
    const user = userEvent.setup()
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByRole('radio', { name: /my items first/i }))
    })

    const attentionRegion = document.getElementById('attention-brief')!
    const personalCanvas = screen.getByTestId('personal-canvas')
    const position = personalCanvas.compareDocumentPosition(attentionRegion)
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(resolveRegionOrder(personId)).toBe('personal-first')
  })
})

describe('RI-1 (Q1, ratified Option B): the order control is a radiogroup, not a tablist', () => {
  it('exposes role=radiogroup/radio for the order control (never role=tab)', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /attention first/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /my items first/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

// RI-2 (Q2/Rule 8, ratified Option B) — mirrors tasks-workspace.test.tsx's stubMatchMedia:
// a query-aware matchMedia stub so useIsPhone()/useIsDesktop() resolve deterministically.
function stubMatchMedia(overrides: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      for (const [needle, value] of Object.entries(overrides)) {
        if (query.includes(needle)) { matches = value; break }
      }
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

describe('RI-2 (Q2/Rule 8, ratified Option B): the order toggle folds behind a disclosure at ≤390px', () => {
  // Restore the file's default matchMedia stub (matches: false for every query) so this
  // block's overrides never leak into later describes (e.g. AC-515).
  afterEach(() => stubMatchMedia({}))

  it('at ≤390px, the radiogroup is collapsed behind a single compact "View options" trigger — not the lead element', async () => {
    stubMatchMedia({ '390': true, '768': false })
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    expect(screen.queryByRole('radiogroup')).toBeNull()
    const trigger = screen.getByRole('button', { name: /view options/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('expanding the trigger reveals the radiogroup order control', async () => {
    stubMatchMedia({ '390': true, '768': false })
    const user = userEvent.setup()
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /view options/i }))
    })

    expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /attention first/i })).toBeInTheDocument()
  })

  it('above ≤390px, the radiogroup renders inline — no disclosure trigger (desktop unchanged)', async () => {
    stubMatchMedia({ '390': false, '768': true })
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument())

    expect(screen.getByRole('radiogroup', { name: /home order/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view options/i })).toBeNull()
  })
})

describe('AC-515: region order is width-independent, no CSS reflow (Step 5)', () => {
  async function renderAtWidth(width: number) {
    let utils!: ReturnType<typeof render>
    await act(async () => {
      utils = render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            I18nProvider,
            null,
            createElement('div', { style: { width } }, createElement(HomePage)),
          ),
        ),
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    return utils
  }

  it('keeps personal-canvas before #attention-brief at both 390px and desktop, with no CSS order override', async () => {
    const personId = financeViewer.viewer.person.id
    setRegionOrder(personId, 'personal-first')
    mockUseAuth.mockReturnValue(financeViewer)

    for (const width of [390, 1280]) {
      const utils = await renderAtWidth(width)
      await waitFor(() =>
        expect(within(utils.container).getByRole('region', { name: 'Needs attention' })).toBeInTheDocument(),
      )

      const wrapperEl = utils.container.querySelector('.home-regions') as HTMLElement
      expect(wrapperEl.getAttribute('data-region-order')).toBe('personal-first')

      const attentionEl = utils.container.querySelector('#attention-brief') as HTMLElement
      const personalEl = within(utils.container).getByTestId('personal-canvas')
      const position = personalEl.compareDocumentPosition(attentionEl)
      expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)

      // DOM-driven, not flex-`order`-driven — neither region node carries an inline `order` style.
      expect(attentionEl.style.order).toBe('')
      expect(personalEl.style.order).toBe('')

      utils.unmount()
    }
  })
})

// Home retry/projection convergence (convergence-audit 2026-07-21): the attention
// error branch previously supplied no retry callback at all — "Refresh to try again"
// was dead copy. Overdue and due-today both read the ONE tasks projection, so a
// retry must be wired to a SINGLE shared function (never two independent listTasks
// calls for the same data) and must be idempotent (a second click while the first
// retry is still in flight must not fire a second concurrent fetch).
describe('Home retry/projection convergence: the attention error lanes are actually retriable', () => {
  // Persistent (not -Once): HomePage's own attention fetch AND MyTasksCard's separate
  // fetch both call the same listTasks() DAL — a real, still-standing instance of the
  // very "duplicate projection" finding this slice narrows. Using a persistent reject
  // means the assertion doesn't depend on which of the two callers fires first.
  it('overdue lane Retry re-fetches the ONE tasks projection and recovers BOTH overdue and due-today', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    await renderHome(financeViewer)

    const attentionRegion = await waitFor(() => screen.getByRole('region', { name: 'Needs attention' }))
    await waitFor(() => expect(within(attentionRegion).getByRole('heading', { name: 'Overdue' })).toBeInTheDocument())
    // Both overdue and due-today lanes read the same failed tasks fetch.
    expect(within(attentionRegion).getByRole('heading', { name: 'Due today' })).toBeInTheDocument()
    expect(within(attentionRegion).getAllByText("Couldn't load this list. Refresh to try again.")).toHaveLength(2)

    const viewerId = financeViewer.viewer.person.id
    mockListTasks.mockResolvedValue([
      {
        id: 't-overdue', org_id: 'org-1', title: 'Overdue task', business_unit_id: 'bu-1',
        status: 'In Progress', responsible_person_id: viewerId, accountable_person_id: 'other-1',
        consulted_person_ids: [], informed_person_ids: [], description: null,
        due_date: '2000-01-01', objective_id: null, work_line_id: null,
        last_activity_at: '2026-06-30T00:00:00Z', archived_at: null, created_by: 'x',
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
      },
    ])

    // Both lane error blocks render their own Retry button, but MUST be wired to the
    // SAME retry function reference (single source, not two independent fetches).
    const retryButtons = within(attentionRegion).getAllByRole('button', { name: /retry/i })
    expect(retryButtons).toHaveLength(2)
    const callsBefore = mockListTasks.mock.calls.length
    await act(async () => {
      retryButtons[0].click()
      await Promise.resolve()
      await Promise.resolve()
    })

    // A single retry click issues exactly one new fetch (the one shared projection).
    expect(mockListTasks.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() => expect(within(attentionRegion).getByText('Overdue task')).toBeInTheDocument())
    // The error is gone from BOTH lanes, not just the one whose button was clicked.
    expect(within(attentionRegion).queryByText("Couldn't load this list. Refresh to try again.")).toBeNull()
  })

  it('a second Retry click while the first retry is still in flight does not issue a second concurrent fetch (idempotent)', async () => {
    mockListTasks.mockRejectedValue(new Error('network failure'))
    await renderHome(financeViewer)
    const attentionRegion = await waitFor(() => screen.getByRole('region', { name: 'Needs attention' }))
    await waitFor(() => expect(within(attentionRegion).getByRole('heading', { name: 'Overdue' })).toBeInTheDocument())

    mockListTasks.mockReturnValue(new Promise(() => {})) // never resolves — stays "in flight"

    const retryButton = within(attentionRegion).getAllByRole('button', { name: /retry/i })[0]
    const callsBeforeRetry = mockListTasks.mock.calls.length
    // Two clicks in the SAME synchronous batch (no await between them) — the second
    // click reaches the retry handler before React has re-rendered the lane back to
    // loading, so only an explicit in-flight guard (not "the button disappeared")
    // proves idempotency here.
    await act(async () => {
      retryButton.click()
      retryButton.click()
    })
    expect(mockListTasks.mock.calls.length).toBe(callsBeforeRetry + 1)
  })
})

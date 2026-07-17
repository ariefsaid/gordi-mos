// HomePage tests — TDD (AC-tagged, Task 4.3/4.4).
// Home v1: role-guarded finance KPI row (revenue + margin, finance/admin only — the
// fetch is skipped entirely for a member, so the tiles are absent, not a misleading
// zero — RLS-empty handling), an everyone-row (tasks + ops), the MyWeekPanel, and a
// FreshnessLabel. Every KPI tile is a drill-target <Link>.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
  upsertDraft: vi.fn(),
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
import { setRegionOrder } from '@/lib/home-region-order'

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

describe('AC-H01: finance viewer sees revenue + margin tiles, each drilling to /dashboard', () => {
  it('renders revenue + margin KPI tiles as links to /dashboard', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(mockListRevenue).toHaveBeenCalled())

    const revenueTile = screen.getByRole('group', { name: /revenue/i })
    const revenueLink = revenueTile.closest('a')
    expect(revenueLink).not.toBeNull()
    expect(revenueLink!.getAttribute('href')).toBe('/dashboard')

    const marginTile = screen.getByRole('group', { name: /gross margin/i })
    const marginLink = marginTile.closest('a')
    expect(marginLink).not.toBeNull()
    expect(marginLink!.getAttribute('href')).toBe('/dashboard')
  })

  it('shows snapshot provenance in fixed WIB time when finance data is populated', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(mockListMargin).toHaveBeenCalled())

    expect(screen.getByText(/as of/i)).toBeInTheDocument()
    expect(screen.getByText('01 Jul 2026, 09:00 WIB')).toBeInTheDocument()
  })

  it('AC-H07: margin tile shows the formatted margin value, a delta, and the "(interim)" label', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(mockListMargin).toHaveBeenCalled())
    const marginTile = screen.getByRole('group', { name: /gross margin \(interim\)/i })
    expect(marginTile.textContent).toMatch(/Rp/)
  })
})

describe('AC-H05: reporting fetch errors — finance tiles degrade, tasks/My-Week still render', () => {
  it('does not crash and the tasks/My-Week tiles still render', async () => {
    mockListRevenue.mockRejectedValue(new Error('reporting down'))
    mockListMargin.mockRejectedValue(new Error('reporting down'))
    await renderHome(financeViewer)

    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
    // No crash — the finance tiles degrade to a placeholder ("—"), never a stale/
    // misleading ready value, and are no longer stuck in the loading (aria-busy) state.
    const revenueTile = screen.getByRole('group', { name: /revenue/i })
    expect(revenueTile.getAttribute('aria-busy')).toBeNull()
    expect(revenueTile.textContent).toContain('—')

    const marginTile = screen.getByRole('group', { name: /gross margin/i })
    expect(marginTile.getAttribute('aria-busy')).toBeNull()
    expect(marginTile.textContent).toContain('—')
  })

  it('explains finance blanks with the next sync time instead of a bare dash', async () => {
    mockListRevenue.mockResolvedValue([])
    mockListMargin.mockResolvedValue([])
    await renderHome(financeViewer)

    await waitFor(() => expect(mockListRevenue).toHaveBeenCalled())
    expect(screen.getByText('No snapshot yet · next sync 03:30 WIB')).toBeInTheDocument()
  })
})

describe('AC-H02: member-only viewer never sees finance tiles (RLS-empty handling, never blank)', () => {
  it('does not render revenue/margin tiles and never calls the finance DAL', async () => {
    await renderHome(memberViewer)
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
  })

  it('still renders the tasks tile + My Week panel (never blank)', async () => {
    await renderHome(memberViewer)
    await waitFor(() => expect(screen.getByRole('group', { name: /open tasks/i })).toBeInTheDocument())
    expect(screen.getByText('My tasks')).toBeInTheDocument()
  })
})

describe('AC-H03: the My Week panel (MyTasksCard) is present for any viewer', () => {
  it('renders MyTasksCard head', async () => {
    await renderHome(financeViewer)
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
  })
})

describe('AC-H04: loading state — finance tiles show skeleton, tasks/My-Week render independently', () => {
  it('finance tiles show state=loading (aria-busy) while the reporting fetch is in flight', async () => {
    mockListRevenue.mockImplementation(() => new Promise(() => {}))
    mockListMargin.mockImplementation(() => new Promise(() => {}))
    mockUseAuth.mockReturnValue(financeViewer)
    render(createElement(HomePage), { wrapper })

    await waitFor(() => {
      const tile = screen.getByRole('group', { name: /revenue/i })
      expect(tile.getAttribute('aria-busy')).toBe('true')
    })
    // Tasks tile + My Week panel still render, unaffected
    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
  })
})

describe('AC-H05: reporting fetch errors — finance tiles degrade, tasks/My-Week still render', () => {
  it('does not crash and the tasks/My-Week tiles still render', async () => {
    mockListRevenue.mockRejectedValue(new Error('reporting down'))
    mockListMargin.mockRejectedValue(new Error('reporting down'))
    await renderHome(financeViewer)

    await waitFor(() => expect(screen.getByText('My tasks')).toBeInTheDocument())
    // No crash — the finance tiles degrade to a placeholder ("—"), never a stale/
    // misleading ready value, and are no longer stuck in the loading (aria-busy) state.
    const revenueTile = screen.getByRole('group', { name: /revenue/i })
    expect(revenueTile.getAttribute('aria-busy')).toBeNull()
    expect(revenueTile.textContent).toContain('—')

    const marginTile = screen.getByRole('group', { name: /gross margin/i })
    expect(marginTile.getAttribute('aria-busy')).toBeNull()
    expect(marginTile.textContent).toContain('—')
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

describe('AC-H06: tasks tile links to /tasks and shows the open-task count', () => {
  it('shows the R/A non-Done count and links to /tasks', async () => {
    mockListTasks.mockResolvedValue([
      {
        id: 't-1', org_id: 'org-1', title: 'Task 1', business_unit_id: 'bu-1',
        status: 'In Progress', responsible_person_id: financeViewer.status === 'authenticated' ? financeViewer.viewer.person.id : '',
        accountable_person_id: 'other-1', consulted_person_ids: [], informed_person_ids: [],
        description: null, due_date: null, objective_id: null, work_line_id: null,
        last_activity_at: '2026-06-30T00:00:00Z', archived_at: null, created_by: 'x',
        created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-30T00:00:00Z',
      },
    ])
    await renderHome(financeViewer)

    await waitFor(() => {
      const tile = screen.getByRole('group', { name: /open tasks/i })
      expect(tile.textContent).toMatch(/1/)
    })
    const tile = screen.getByRole('group', { name: /open tasks/i })
    const link = tile.closest('a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/tasks')
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
})

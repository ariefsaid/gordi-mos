// stacked-union-home.test.tsx — render + visibility-direction tests for the stacked-union Home
// (AC-HS10..HS14). The pure composition logic is covered by home-stack.test.ts; this asserts the
// RENDERED stack: persona combo → right sections in order; member → no finance; BU-head → own-BU
// (no whole-company tiles); drills (anchor A4); the AR slot drop point.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import type { RolesRow } from '@/lib/database.types'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// Directory (role tree + BUs) — the stacked page fetches these for role-scope detection.
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getRoles: vi.fn(),
}))
import { getBusinessUnits, getRoles } from '@/lib/db/directory'
const mockGetBUs = vi.mocked(getBusinessUnits)
const mockGetRoles = vi.mocked(getRoles)

// Finance reporting DAL — asserted NOT called at BU scope (visibility direction) / for members.
vi.mock('../lib/db/reporting', () => ({
  listSalesDailyRevenue: vi.fn(),
  latestSnapshotAsOf: vi.fn((r: { snapshot_as_of: string }[]) => (r.length ? r[r.length - 1].snapshot_as_of : null)),
  latestReportingDate: vi.fn((r: { revenue_date: string }[]) => (r.length ? r[r.length - 1].revenue_date : null)),
}))
import { listSalesDailyRevenue } from '@/lib/db/reporting'
const mockListRevenue = vi.mocked(listSalesDailyRevenue)

vi.mock('../lib/db/reporting-margin', () => ({
  listSalesMarginDaily: vi.fn(),
  latestMarginSnapshotAsOf: vi.fn((r: { snapshot_as_of: string }[]) => (r.length ? r[r.length - 1].snapshot_as_of : null)),
  latestMarginReportingDate: vi.fn((r: { margin_date: string }[]) => (r.length ? r[r.length - 1].margin_date : null)),
}))
import { listSalesMarginDaily } from '@/lib/db/reporting-margin'
const mockListMargin = vi.mocked(listSalesMarginDaily)

// MyWeekPanel / MyTasksCard data layer — mocked empty so the reused panels don't crash.
vi.mock('../lib/db/weekly-updates', () => ({
  getMyUpdate: vi.fn(),
  listTeamUpdates: vi.fn(),
}))
import { getMyUpdate, listTeamUpdates } from '@/lib/db/weekly-updates'
const mockGetMyUpdate = vi.mocked(getMyUpdate)
const mockListTeamUpdates = vi.mocked(listTeamUpdates)

vi.mock('../lib/db/team', () => ({ getTeamForManager: vi.fn() }))
import { getTeamForManager } from '@/lib/db/team'
const mockGetTeamForManager = vi.mocked(getTeamForManager)

vi.mock('../lib/db/ops-log', () => ({
  getTodayOpsSummary: vi.fn(),
}))
import { getTodayOpsSummary } from '@/lib/db/ops-log'
const mockGetTodayOpsSummary = vi.mocked(getTodayOpsSummary)

vi.mock('../lib/db/tasks', () => ({ listTasks: vi.fn() }))
import { listTasks } from '@/lib/db/tasks'
const mockListTasks = vi.mocked(listTasks)

import { getPeople } from '@/lib/db/directory'
const mockGetPeople = vi.mocked(getPeople)

import { StackedUnionHome } from './stacked-union-home'

// ── Fixtures: role tree + BUs (mirror supabase/seed.sql) ──────────────────────
const ORG = '10000000-0000-0000-0000-000000000001'
const BU_RETAIL = '20000000-0000-0000-0000-000000000014'
const BU_B2B_SALES = '20000000-0000-0000-0000-000000000016'
const BU_FINANCE = '20000000-0000-0000-0000-000000000013'

const MD_ROLE: RolesRow = { id: '30000000-0000-0000-0000-000000000000', org_id: ORG, business_unit_id: null, name: 'Managing Director', reports_to_role_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
const CAFE_LEAD: RolesRow = { id: '30000000-0000-0000-0000-000000000001', org_id: ORG, business_unit_id: BU_RETAIL, name: 'Cafe Ops Lead', reports_to_role_id: MD_ROLE.id, created_at: '2026-01-01', updated_at: '2026-01-01' }
const SALES_LEAD: RolesRow = { id: '30000000-0000-0000-0000-000000000004', org_id: ORG, business_unit_id: BU_B2B_SALES, name: 'Sales Lead', reports_to_role_id: MD_ROLE.id, created_at: '2026-01-01', updated_at: '2026-01-01' }
const FINANCE_LEAD: RolesRow = { id: '30000000-0000-0000-0000-000000000005', org_id: ORG, business_unit_id: BU_FINANCE, name: 'Finance Lead', reports_to_role_id: MD_ROLE.id, created_at: '2026-01-01', updated_at: '2026-01-01' }
// A mid-chain role inside Retail Ops (reports up to Cafe Lead, same BU) — NOT a BU apex.
const BARISTA: RolesRow = { id: '30000000-0000-0000-0000-000000000099', org_id: ORG, business_unit_id: BU_RETAIL, name: 'Barista', reports_to_role_id: CAFE_LEAD.id, created_at: '2026-01-01', updated_at: '2026-01-01' }

const ALL_ROLES = [MD_ROLE, CAFE_LEAD, SALES_LEAD, FINANCE_LEAD, BARISTA]
const ALL_BUS = [
  { id: BU_B2B_SALES, name: 'B2B Sales' },
  { id: BU_FINANCE, name: 'Finance' },
  { id: BU_RETAIL, name: 'Retail Ops' },
]

type AuthenticatedViewer = Extract<AuthState, { status: 'authenticated' }>['viewer']

function viewer(over: Partial<AuthenticatedViewer> & { roles?: RolesRow[] } = {}): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: ORG, user_id: 'u-1', full_name: 'Test Person',
        email: 't@gordi.id', archived_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      roles: over.roles ?? [],
      isManager: over.isManager ?? false,
      accessRoles: over.accessRoles ?? [],
    },
    signOut: vi.fn(),
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

async function renderStacked(auth: AuthState) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(createElement(StackedUnionHome), { wrapper })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRoles.mockResolvedValue(ALL_ROLES)
  mockGetBUs.mockResolvedValue(ALL_BUS)
  mockGetPeople.mockResolvedValue([])
  mockListRevenue.mockResolvedValue([])
  mockListMargin.mockResolvedValue([])
  mockGetMyUpdate.mockResolvedValue(null)
  mockListTeamUpdates.mockResolvedValue([])
  mockGetTeamForManager.mockResolvedValue([])
  mockGetTodayOpsSummary.mockResolvedValue({ count: 0, needsAttention: false })
  mockListTasks.mockResolvedValue([])
})

describe('V3 Home page-family grammar', () => {
  it('renders the conditional Home composition inside the same Workspace family as canonical Home', async () => {
    const { container } = await renderStacked(
      viewer({ roles: [BARISTA], accessRoles: ['member'] }),
    )
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument())
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelector('main')).toHaveAttribute('data-page-family', 'workspace')
    expect(screen.getAllByText('What needs my attention right now?')).toHaveLength(1)
  })
})

describe('AC-HS10: dual BU-head → two function-cockpits + My Week, in order', () => {
  it('renders B2B Sales + Retail Ops function cockpits then My Week (BU-name order)', async () => {
    await renderStacked(
      viewer({ roles: [CAFE_LEAD, SALES_LEAD], accessRoles: ['member'] }),
    )
    // Two function cockpits + My Week heading present
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /B2B Sales — function cockpit/i })).toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: /Retail Ops — function cockpit/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /My Week/i })).toBeInTheDocument()

    // Order: B2B Sales before Retail Ops before My Week (document order)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    const b2bIdx = headings.findIndex((h) => h?.includes('B2B Sales'))
    const retailIdx = headings.findIndex((h) => h?.includes('Retail Ops'))
    const myweekIdx = headings.findIndex((h) => h === 'My Week')
    expect(b2bIdx).toBeGreaterThanOrEqual(0)
    expect(retailIdx).toBeGreaterThan(b2bIdx)
    expect(myweekIdx).toBeGreaterThan(retailIdx)
  })
})

describe('AC-HS11: pure member → capture-first only, no finance, no cockpit', () => {
  it('renders the capture-first section and no cockpit/finance', async () => {
    await renderStacked(
      viewer({ roles: [BARISTA], accessRoles: ['member'] }), // mid-chain, not apex, not manager
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /what needs you/i })).toBeInTheDocument(),
    )
    expect(screen.queryByText(/cockpit/i)).toBeNull()
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
    // The finance DAL is never issued (no company-scope money section renders for a member).
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
  })
})

describe('AC-HS12: BU-head (no finance) sees only own-BU — no whole-company tiles', () => {
  it('renders the Finance function cockpit with a BU money slot, NOT whole-company revenue/margin', async () => {
    await renderStacked(
      viewer({ roles: [FINANCE_LEAD], accessRoles: ['member'] }), // BU-head, no finance/admin
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Finance — function cockpit/i })).toBeInTheDocument(),
    )
    // No whole-company revenue/margin tiles inside the function cockpit (visibility direction).
    expect(screen.queryByRole('group', { name: /revenue/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /gross margin/i })).toBeNull()
    // The company reporting DAL is not issued (company tiles only render at company scope + canSeeFinance).
    expect(mockListRevenue).not.toHaveBeenCalled()
    expect(mockListMargin).not.toHaveBeenCalled()
    // The BU-scoped money slot is present.
    expect(screen.getByText(/Finance.*revenue and margin land here/i)).toBeInTheDocument()
  })
})

describe('AC-HS13: drills — revenue/margin → /money, ops-KPI → /ops, cascade → /work/cascade', () => {
  it('owner-cockpit money tiles link to /money, ops-KPI to /ops, cascade to /work/cascade', async () => {
    mockListRevenue.mockResolvedValue([
      { revenue_date: '2026-07-06', channel: 'POS', esb_code: 'GHQ', branch_code: 'GHQ', branch_name: 'Gordi HQ', transactions: 80, clean_revenue: 12_000_000, snapshot_as_of: '2026-07-07T00:00:00Z', source_contract_version: 'v1' },
    ])
    mockListMargin.mockResolvedValue([
      { margin_date: '2026-07-06', esb_code: 'GHQ', branch_code: 'GHQ', branch_name: 'Gordi HQ', revenue: 12_000_000, cogs_interim_sm: 6_000_000, cogs_budget_bom: 6_000_000, margin_interim: 6_000_000, margin_interim_pct: 0.5, bom_coverage_pct: 0.9, snapshot_as_of: '2026-07-07T00:00:00Z', source_contract_version: 'v1' },
    ])
    await renderStacked(
      viewer({ roles: [MD_ROLE], accessRoles: ['admin'] }), // owner-director + admin
    )
    await waitFor(() => expect(mockListRevenue).toHaveBeenCalled())

    // Revenue + margin tiles drill to /money (the canonical Money noun; /dashboard is a
    // redirect alias — OD-REDESIGN identity cleanup).
    const revenueTile = screen.getByRole('group', { name: /revenue/i })
    expect(revenueTile.closest('a')!.getAttribute('href')).toBe('/money')
    const marginTile = screen.getByRole('group', { name: /gross margin/i })
    expect(marginTile.closest('a')!.getAttribute('href')).toBe('/money')

    // Ops-KPI placeholder drills to /ops
    const opsDrill = screen.getByRole('link', { name: /See today's floor activity/i })
    expect(opsDrill.getAttribute('href')).toBe('/ops')

    // Cascade drill → /work/cascade
    const cascadeDrill = screen.getByRole('link', { name: /Cascade progress/i })
    expect(cascadeDrill.getAttribute('href')).toBe('/work/cascade')
  })
})

describe('AC-HS14: AR slot drop point present (parallel-slice slot, no invented figure)', () => {
  it('renders a data-money-ar-slot element in the function cockpit', async () => {
    const { container } = await renderStacked(
      viewer({ roles: [FINANCE_LEAD], accessRoles: ['member'] }),
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Finance — function cockpit/i })).toBeInTheDocument(),
    )
    const arSlot = container.querySelector('[data-money-ar-slot]')
    expect(arSlot).not.toBeNull()
    // Placeholder copy, no invented AR figure
    expect(arSlot!.textContent).toMatch(/AR follow-ups/i)
  })
})

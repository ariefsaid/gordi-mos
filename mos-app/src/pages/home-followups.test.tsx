import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/config/features', () => ({
  SHOW_WEEKLY_UPDATES: false,
  SHOW_DAILY_LOG: false,
  SHOW_USER_VIEWS: false,
  SHOW_ASSISTANT: false,
  SHOW_INBOX: false,
  SHOW_FOLLOWUPS: true,
}))
vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/reporting', () => ({ listSalesDailyRevenue: vi.fn(), latestSnapshotAsOf: vi.fn(() => null), latestReportingDate: vi.fn(() => null) }))
vi.mock('@/lib/db/reporting-margin', () => ({ listSalesMarginDaily: vi.fn(), latestMarginSnapshotAsOf: vi.fn(() => null), latestMarginReportingDate: vi.fn(() => null) }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/lib/db/ops-log', () => ({ getTodayOpsSummary: vi.fn() }))
vi.mock('@/lib/db/weekly-updates', () => ({ getMyUpdate: vi.fn(), upsertDraft: vi.fn(), submit: vi.fn(), reopen: vi.fn(), addLine: vi.fn(), updateLine: vi.fn(), removeLine: vi.fn(), listTeamUpdates: vi.fn() }))
vi.mock('@/lib/db/team', () => ({ getTeamForManager: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn() }
})

import { useAuth } from '@/auth/use-auth'
import { listSalesDailyRevenue } from '@/lib/db/reporting'
import { listSalesMarginDaily } from '@/lib/db/reporting-margin'
import { listTasks } from '@/lib/db/tasks'
import { getTodayOpsSummary } from '@/lib/db/ops-log'
import { getMyUpdate } from '@/lib/db/weekly-updates'
import { getBusinessUnits } from '@/lib/db/directory'
import { listFollowUps, type FollowUpRow } from '@/lib/db/follow-ups'
import { HomePage } from './home-page'

const mockUseAuth = vi.mocked(useAuth)
const mockListRevenue = vi.mocked(listSalesDailyRevenue)
const mockListMargin = vi.mocked(listSalesMarginDaily)
const mockListTasks = vi.mocked(listTasks)
const mockGetTodayOpsSummary = vi.mocked(getTodayOpsSummary)
const mockGetMyUpdate = vi.mocked(getMyUpdate)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockListFollowUps = vi.mocked(listFollowUps)

const baseViewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Viewer', email: null, archived_at: null, created_at: '', updated_at: '' },
    roles: [],
    isManager: false,
    accessRoles: [],
  },
  signOut: vi.fn(),
}

const overdue: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales', source_invoice_ref: 'INV-1',
  original_amount: 100, running_balance: 100, state: 'chased', promise_date: null, issued_date: null, due_date: '2020-01-01', assigned_to: null, notes: null, created_at: '', updated_at: '',
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListRevenue.mockResolvedValue([])
  mockListMargin.mockResolvedValue([])
  mockListTasks.mockResolvedValue([])
  mockGetTodayOpsSummary.mockResolvedValue({ count: 0, needsAttention: false })
  mockGetMyUpdate.mockResolvedValue(null)
  mockGetBusinessUnits.mockResolvedValue([])
  mockListFollowUps.mockResolvedValue([overdue, { ...overdue, id: 'fu-2', state: 'promised', due_date: null }])
})

describe('Home follow-up AR aging tile', () => {
  it('AC-522: hides the AR aging tile for a member with no finance/chase lane', async () => {
    mockUseAuth.mockReturnValue(baseViewer)
    render(createElement(HomePage), { wrapper })
    await waitFor(() => expect(mockGetBusinessUnits).toHaveBeenCalled())
    expect(screen.queryByRole('group', { name: /AR aging/i })).toBeNull()
    expect(mockListFollowUps).not.toHaveBeenCalled()
  })

  it('AC-523: finance sees AR aging tile drilling to the overdue follow-up queue', async () => {
    mockUseAuth.mockReturnValue({ ...baseViewer, viewer: { ...baseViewer.viewer, accessRoles: ['finance'] } })
    render(createElement(HomePage), { wrapper })
    const tile = await screen.findByRole('group', { name: /AR aging/i })
    expect(tile.textContent).toContain('1')
    expect(tile.closest('a')?.getAttribute('href')).toBe('/work/follow-ups?filter=overdue')
  })
})

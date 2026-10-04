import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/use-cafe-stream', () => {
  const branch = { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }
  const stream = { branch, activity: 'kitchen', produces: true }
  const catalog = { branches: [branch], options: [stream], locationOptions: [stream], stream, homeStream: stream,
    myStreamKeys: new Set(['branch-1|kitchen']), branchId: branch.id }
  const resolve = vi.fn().mockResolvedValue(catalog)
  const adopt = vi.fn()
  const setStream = vi.fn()
  return { useCafeStream: () => ({ ...catalog, resolve, adopt, setStream }) }
})
vi.mock('@/lib/db/cafe-item-settings', () => ({
  canManageCafeItemSettings: vi.fn(), listCafeItemSettings: vi.fn(), saveCafeItemSettings: vi.fn(),
}))
vi.mock('@/lib/db/cafe-missing-item-reports', () => ({
  listCafeMissingItemReports: vi.fn(), resolveCafeMissingItemReport: vi.fn(), reportMissingCafeItem: vi.fn(),
}))

import { useAuth } from '@/auth/use-auth'
import { canManageCafeItemSettings, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeMissingItemReports, resolveCafeMissingItemReport } from '@/lib/db/cafe-missing-item-reports'
import { CafeItemSettingsPage } from './cafe-item-settings-page'

const mockUseAuth = vi.mocked(useAuth)
const mockCanManage = vi.mocked(canManageCafeItemSettings)
const mockListItems = vi.mocked(listCafeItemSettings)
const mockListReports = vi.mocked(listCafeMissingItemReports)
const mockResolveReport = vi.mocked(resolveCafeMissingItemReport)

const VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Test Manager',
      email: 'manager@example.test', archived_at: null, must_change_password: false,
      created_at: '', updated_at: '',
    },
    roles: [], isManager: true, accessRoles: ['manager'], affiliated: ['cafe'],
  },
  signOut: vi.fn(),
}

const REPORT = {
  id: 'report-1', branchId: 'branch-1', activity: 'kitchen', itemName: 'Oat milk',
  reportedAt: '2026-10-04T10:00:00Z', needsAttention: true, resolvedAt: null,
}

function renderPage(initialLocale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <MemoryRouter initialEntries={['/cafe/items']}>
        <CafeItemSettingsPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(VIEWER)
  mockCanManage.mockResolvedValue(true)
  mockListItems.mockResolvedValue([{
    id: 'item-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: 'RAW',
    defaultUnitId: null, units: [],
  }])
  mockListReports.mockResolvedValue([REPORT])
  mockResolveReport.mockResolvedValue()
})

describe('CafeItemSettingsPage missing-item queue', () => {
  it('shows only the selected stream reports to settings managers and resolves them', async () => {
    renderPage()
    const queue = await screen.findByRole('region', { name: 'Missing-item reports for this stream' })
    expect(queue).toHaveTextContent('Gordi HQ · Kitchen')
    expect(within(queue).getByText('Oat milk')).toBeInTheDocument()
    expect(mockListReports).toHaveBeenCalledWith(expect.objectContaining({ activity: 'kitchen' }))

    mockListReports.mockResolvedValueOnce([])
    fireEvent.click(within(queue).getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(mockResolveReport).toHaveBeenCalledWith('report-1'))
    await waitFor(() => expect(queue).toHaveTextContent('No missing-item reports need attention for this stream.'))
  })

  it('localizes the report queue stream label', async () => {
    renderPage('id')
    const queue = await screen.findByRole('region', { name: 'Laporan item hilang untuk stream ini' })
    expect(queue).toHaveTextContent('Gordi HQ · Dapur')
  })

  it('does not expose the reports queue to a read-only viewer', async () => {
    mockCanManage.mockResolvedValue(false)
    renderPage()
    expect(await screen.findByText('Reference settings are read-only. Retail Ops managers, Ops Leads and admins can edit them.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Missing-item reports for this stream' })).not.toBeInTheDocument()
    expect(mockListReports).not.toHaveBeenCalled()
  })
})

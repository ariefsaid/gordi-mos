import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { canManageCafeItemSettings, listCafeItemSettings, saveCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeMissingItemReports, resolveCafeMissingItemReport } from '@/lib/db/cafe-missing-item-reports'
import { CafeItemSettingsPage } from './cafe-item-settings-page'
import { useCafeItemSettingsSorting } from './cafe-item-settings-sorting'
import { isCafeItemDraftKind } from './cafe-item-settings-kind'

const mockUseAuth = vi.mocked(useAuth)
const mockCanManage = vi.mocked(canManageCafeItemSettings)
const mockListItems = vi.mocked(listCafeItemSettings)
const mockSaveItem = vi.mocked(saveCafeItemSettings)
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
    id: 'item-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: 'RAW', isActive: true,
    defaultUnitId: null, units: [],
  }])
  mockListReports.mockResolvedValue([REPORT])
  mockResolveReport.mockResolvedValue()
  mockSaveItem.mockResolvedValue()
})

describe('Cafe item table sorting', () => {
  it('keeps an empty sorting state stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useCafeItemSettingsSorting(undefined))
    const initialSorting = result.current

    rerender()

    expect(result.current).toBe(initialSorting)
  })
})

it('accepts only the three Café item kind select values', () => {
  expect(['', 'RAW', 'WIP'].every(isCafeItemDraftKind)).toBe(true)
  expect(['OTHER', 'raw', 'null'].some(isCafeItemDraftKind)).toBe(false)
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
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Missing-item reports for this stream' })).not.toBeInTheDocument())
  })

  it('does not show an empty report queue ahead of item settings', async () => {
    mockListReports.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockListReports).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Missing-item reports for this stream' })).not.toBeInTheDocument()
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

describe('CafeItemSettingsPage filters', () => {
  it('searches item names and filters visible rows by active state, kind, and unit setup', async () => {
    const unit = (id: string, isDefault: boolean) => ({
      id, name: 'KG', isShown: true, isDefault, labelOrdinal: null, labelCount: 1,
    })
    const item = (
      id: string,
      name: string,
      kind: 'RAW' | 'WIP' | null,
      isActive: boolean,
      needsSetup: boolean,
    ) => {
      const unitId = `${id}-unit`
      return {
        id,
        erpName: `ERP ${name}`,
        mosName: name,
        category: 'Dairy',
        kind,
        isActive,
        defaultUnitId: needsSetup ? null : unitId,
        units: [unit(unitId, !needsSetup)],
      }
    }
    mockListItems.mockResolvedValue([
      item('oat-milk', 'Oat milk', 'RAW', true, true),
      item('oat-powder', 'Oat powder', 'RAW', false, true),
      item('oat-syrup', 'Oat syrup', 'WIP', true, false),
      item('oat-flour', 'Oat flour', null, true, true),
      item('tea-leaves', 'Tea leaves', 'WIP', true, false),
    ])

    const user = userEvent.setup()
    renderPage()
    const search = await screen.findByRole('searchbox', { name: 'Find an ESB or MOS name' })
    await user.type(search, 'oat')
    await waitFor(() => {
      expect(screen.getByText('ERP Oat milk')).toBeInTheDocument()
      expect(screen.queryByText('ERP Tea leaves')).not.toBeInTheDocument()
    })

    const choose = async (label: string, option: string) => {
      await user.click(screen.getByRole('combobox', { name: label }))
      await user.click(await screen.findByRole('option', { name: option }))
    }

    await choose('Active status', 'Inactive')
    await waitFor(() => {
      expect(screen.getByText('ERP Oat powder')).toBeInTheDocument()
      expect(screen.queryByText('ERP Oat milk')).not.toBeInTheDocument()
      expect(screen.queryByText('ERP Oat syrup')).not.toBeInTheDocument()
    })

    await choose('Active status', 'All statuses')
    await choose('Item kind', 'Not set')
    await waitFor(() => {
      expect(screen.getByText('ERP Oat flour')).toBeInTheDocument()
      expect(screen.queryByText('ERP Oat milk')).not.toBeInTheDocument()
      expect(screen.queryByText('ERP Oat powder')).not.toBeInTheDocument()
    })

    await choose('Item kind', 'All kinds')
    await choose('Unit setup', 'Needs unit')
    await waitFor(() => {
      expect(screen.getByText('ERP Oat milk')).toBeInTheDocument()
      expect(screen.getByText('ERP Oat powder')).toBeInTheDocument()
      expect(screen.getByText('ERP Oat flour')).toBeInTheDocument()
      expect(screen.queryByText('ERP Oat syrup')).not.toBeInTheDocument()
    })
  })
})

describe('CafeItemSettingsPage unit multiples', () => {
  it('offers all active ERP units as defaults, defines factors in one multi-select, and saves only the default detail', async () => {
    mockListItems.mockResolvedValue([{
      id: 'item-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: 'RAW', isActive: true,
      defaultUnitId: 'unit-each',
      units: [
        { id: 'unit-each', name: 'each', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 },
        { id: 'unit-case', name: 'case', isShown: false, isDefault: false, labelOrdinal: null, labelCount: 1 },
      ],
      unitMultiples: [0.5],
    }])
    const user = userEvent.setup()
    renderPage()

    const defaultUnit = await screen.findByRole('combobox', { name: 'Default unit' })
    await user.click(defaultUnit)
    await user.click(await screen.findByRole('option', { name: 'case' }))

    const multiples = screen.getByRole('button', { name: 'Extra units for Oat milk' })
    await user.click(multiples)
    expect(screen.queryByRole('option', { name: '0.5 case' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(multiples)
    const factor = screen.getByRole('spinbutton', { name: 'Multiple of case' })
    await user.type(factor, '2')
    await user.click(screen.getByRole('button', { name: 'Add a multiple for Oat milk' }))
    expect(screen.getByRole('button', { name: 'Extra units for Oat milk' })).toHaveTextContent('2 case')

    await user.click(screen.getByRole('button', { name: 'Save settings for Oat milk' }))
    await waitFor(() => expect(mockSaveItem).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'item-1',
      defaultUnitId: 'unit-case',
      shownUnitIds: ['unit-case'],
      unitMultiples: [2],
    })))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})

describe('CafeItemSettingsPage default-unit setup note', () => {
  it('says once how many items need a default unit and tags each row briefly', async () => {
    const unit = (id: string) => ({ id, name: 'GR', isShown: true, isDefault: false, labelOrdinal: null, labelCount: 1 })
    mockListItems.mockResolvedValue([
      { id: 'item-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: 'RAW', isActive: true,
        defaultUnitId: null, units: [unit('u-1')] },
      { id: 'item-2', erpName: 'ERP Sugar', mosName: 'Sugar', category: 'Dry', kind: 'RAW', isActive: true,
        defaultUnitId: null, units: [unit('u-2')] },
    ])
    renderPage()
    expect(await screen.findAllByText('2 items need a default unit before they can be logged.')).toHaveLength(1)
    expect(screen.queryByText('Choose a shown default to enable logging.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Needs unit').length).toBeGreaterThanOrEqual(2)
  })
})

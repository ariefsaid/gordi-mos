import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
const selectedActivity = vi.hoisted(() => ({ initial: 'kitchen' as 'kitchen' | 'bar' | null }))
vi.mock('@/lib/use-cafe-stream', async () => {
  const { useState } = await import('react')
  const branch = { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }
  const stream: ProductionStream = { branch, activity: 'kitchen', produces: true }
  const bar: ProductionStream = { branch, activity: 'bar', produces: true }
  const catalog = { branches: [branch], options: [stream, bar], locationOptions: [stream, bar], stream, homeStream: stream,
    myStreamKeys: new Set(['branch-1|kitchen']), branchId: branch.id }
  const resolve = vi.fn().mockResolvedValue(catalog)
  const adopt = vi.fn()
  return { useCafeStream: () => {
    const [chosen, setStream] = useState<ProductionStream | null>(selectedActivity.initial === null ? null : selectedActivity.initial === 'bar' ? bar : stream)
    return { ...catalog, stream: chosen, resolve, adopt, setStream }
  } }
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
import { isCafeItemDraftKind } from './cafe-item-settings-kind'

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

let restoreMedia: (() => void) | null = null
afterEach(() => { restoreMedia?.(); restoreMedia = null })

beforeEach(() => {
  vi.clearAllMocks()
  selectedActivity.initial = 'kitchen'
  mockUseAuth.mockReturnValue(VIEWER)
  mockCanManage.mockResolvedValue(true)
  mockListItems.mockResolvedValue([{
    id: 'item-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: 'RAW', isActive: true,
    defaultUnitId: null, units: [],
  }])
  mockListReports.mockResolvedValue([REPORT])
  mockResolveReport.mockResolvedValue()
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
    expect(await screen.findByText('These item settings are read-only for you. Kitchen and Bar managers edit their own activity; Ops Leads, Ops Managers and admins edit all streams.')).toBeInTheDocument()
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

describe('Cafe item permissions per activity', () => {
  it('keeps the item list operable across a stream switch in Strict Mode', async () => {
    selectedActivity.initial = null
    const user = userEvent.setup()
    render(<StrictMode><MemoryRouter><I18nProvider initialLocale="en"><CafeItemSettingsPage /></I18nProvider></MemoryRouter></StrictMode>)
    await user.click(await screen.findByRole('button', { name: /Gordi HQ · Kitchen/ }))
    expect(await screen.findByRole('textbox', { name: 'MOS name' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /change stream/i }))
    await user.click(screen.getByRole('option', { name: /Gordi HQ · Bar/ }))
    await waitFor(() => expect(mockCanManage).toHaveBeenCalledWith('bar'))
    const search = screen.getByRole('searchbox', { name: 'Find an ESB or MOS name' })
    await user.type(search, 'missing')
    await waitFor(() => expect(screen.queryByRole('article', { name: 'ERP Oat milk' })).not.toBeInTheDocument())
    await user.clear(search)
    expect(await screen.findByRole('article', { name: 'ERP Oat milk' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'MOS name' })).toBeEnabled()
  })

  it.each([
    { activity: 'kitchen', desktop: false }, { activity: 'bar', desktop: false },
    { activity: 'kitchen', desktop: true }, { activity: 'bar', desktop: true },
  ] as const)('reads $activity settings without write controls (desktop=$desktop)', async ({ activity, desktop }) => {
    const mediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: desktop && query === '(min-width: 768px)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }))
    restoreMedia = () => mediaSpy.mockRestore()
    selectedActivity.initial = activity
    mockCanManage.mockResolvedValue(false)
    renderPage()
    const item = await screen.findByRole(desktop ? 'row' : 'article', { name: /ERP Oat milk/ })
    expect(mockCanManage).toHaveBeenCalledWith(activity)
    expect(item).toHaveTextContent('Oat milk')
    expect(within(item).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(item).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(item).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(item).queryByRole('button')).not.toBeInTheDocument()
    expect(mockListReports).not.toHaveBeenCalled()
  })

  it.each(['kitchen', 'bar'] as const)('offers existing item editors for an allowed %s activity', async activity => {
    selectedActivity.initial = activity
    renderPage()
    expect(await screen.findByRole('textbox', { name: 'MOS name' })).toBeEnabled()
    expect(mockCanManage).toHaveBeenCalledWith(activity)
  })

  it('checks Bar after switching from an allowed Kitchen stream and removes write controls', async () => {
    mockCanManage.mockImplementation(async activity => activity === 'kitchen')
    renderPage()
    expect(await screen.findByRole('textbox', { name: 'MOS name' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /change stream/i }))
    fireEvent.click(screen.getByRole('option', { name: /Gordi HQ · Bar/ }))
    const item = await screen.findByRole('article', { name: 'ERP Oat milk' })
    await waitFor(() => expect(mockCanManage).toHaveBeenCalledWith('bar'))
    expect(within(item).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(item).queryByRole('button')).not.toBeInTheDocument()
  })
})

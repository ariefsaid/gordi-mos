import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
const selectedActivity = vi.hoisted(() => ({ initial: 'kitchen' as 'kitchen' | 'bar' | null }))
const streamControls = vi.hoisted(() => ({ retrySameStream: undefined as (() => void) | undefined }))
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
    streamControls.retrySameStream = () => setStream(current => current ? { ...current } : null)
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
  it.each([
    { locale: 'en' as const, count: 1, summary: '1 item needs a default unit before it can be logged.' },
    { locale: 'en' as const, count: 2, summary: '2 items need a default unit before they can be logged.' },
    { locale: 'id' as const, count: 1, summary: '1 item perlu satuan default sebelum dapat dicatat.' },
    { locale: 'id' as const, count: 2, summary: '2 item perlu satuan default sebelum dapat dicatat.' },
  ])('localizes the $locale setup summary for $count item(s) and tags each row', async ({ locale, count, summary }) => {
    const unit = (id: string) => ({ id, name: 'GR', isShown: true, isDefault: false, labelOrdinal: null, labelCount: 1 })
    mockListItems.mockResolvedValue(Array.from({ length: count }, (_, index) => ({
      id: `item-${index + 1}`,
      erpName: `ERP item ${index + 1}`,
      mosName: `Item ${index + 1}`,
      category: 'Dry',
      kind: 'RAW' as const,
      isActive: true,
      defaultUnitId: null,
      units: [unit(`u-${index + 1}`)],
    })))
    const { container } = renderPage(locale)

    const summaryNote = await screen.findByText(summary, { exact: true })
    expect(summaryNote).toHaveAttribute('role', 'status')
    const statusTags = Array.from(container.querySelectorAll('.cafe-items__needs-unit-status'))
    expect(statusTags).toHaveLength(count)
    expect(statusTags.map(tag => tag.textContent)).toEqual(
      Array.from({ length: count }, () => locale === 'en' ? 'Needs unit' : 'Perlu satuan'),
    )
    expect(screen.queryByText('Choose a shown default to enable logging.')).not.toBeInTheDocument()
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

  it('confirms before switching streams with an unsaved item draft; Stay keeps the draft', async () => {
    const user = userEvent.setup()
    renderPage()
    const name = await screen.findByRole('textbox', { name: 'MOS name' })
    await user.clear(name)
    await user.type(name, 'Draft oat milk')

    await user.click(screen.getByRole('button', { name: /change stream/i }))
    await user.click(screen.getByRole('option', { name: /Gordi HQ · Bar/ }))

    expect(await screen.findByRole('dialog', { name: 'Discard unsaved item changes?' })).toBeInTheDocument()
    expect(mockCanManage).not.toHaveBeenCalledWith('bar')
    await user.click(screen.getByRole('button', { name: 'Stay on this page' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Gordi HQ · Kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'MOS name' })).toHaveValue('Draft oat milk')

    await user.click(screen.getByRole('button', { name: /change stream/i }))
    await user.click(screen.getByRole('option', { name: /Gordi HQ · Bar/ }))
    await user.click(screen.getByRole('button', { name: 'Discard and switch' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Gordi HQ · Bar' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'MOS name' })).toHaveValue('Oat milk'))
  })

  it('keeps a dirty draft through a failed permission recheck and its Retry', async () => {
    const user = userEvent.setup()
    renderPage()
    const name = await screen.findByRole('textbox', { name: 'MOS name' })
    await user.clear(name)
    await user.type(name, 'Draft oat milk')

    // A same-stream recheck follows the same item-loader path as the page's permission Retry.
    // Give the selected stream a fresh object identity without changing its stream key.
    mockCanManage.mockRejectedValueOnce(new Error('permission lookup unavailable'))
    act(() => streamControls.retrySameStream?.())
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not confirm edit access/i)
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('textbox', { name: 'MOS name' })).toHaveValue('Draft oat milk')
  })

  it('guards route departure while an item draft is unsaved', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([
      { path: '/cafe/items', element: <><CafeItemSettingsPage /><Link to="/elsewhere">Leave items</Link></> },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
    ], { initialEntries: ['/cafe/items'] })
    render(<I18nProvider initialLocale="en"><RouterProvider router={router} /></I18nProvider>)
    const name = await screen.findByRole('textbox', { name: 'MOS name' })
    await user.clear(name)
    await user.type(name, 'Draft oat milk')
    await user.click(screen.getByRole('link', { name: 'Leave items' }))

    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stay on this page' }))
    expect(screen.getByRole('textbox', { name: 'MOS name' })).toHaveValue('Draft oat milk')
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument()
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

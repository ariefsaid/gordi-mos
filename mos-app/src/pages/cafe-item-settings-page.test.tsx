import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafeItemSetting } from '@/lib/db/cafe-item-settings'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
const selectedActivity = vi.hoisted(() => ({ initial: 'kitchen' as 'kitchen' | 'bar' | null }))
vi.mock('@/lib/use-cafe-stream', async () => {
  const { useCallback, useState } = await import('react')
  const branch = { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }
  const stream: ProductionStream = { branch, activity: 'kitchen', produces: true }
  const bar: ProductionStream = { branch, activity: 'bar', produces: true }
  const radiant = { id: 'branch-2', code: 'radiant', name: 'Radiant' }
  const radiantBar: ProductionStream = { branch: radiant, activity: 'bar', produces: true }
  const catalog = { branches: [branch, radiant], options: [stream, bar, radiantBar], locationOptions: [stream, bar], stream, homeStream: stream,
    myStreamKeys: new Set(['branch-1|kitchen']), branchId: branch.id }
  const resolve = vi.fn().mockResolvedValue(catalog)
  return { useCafeStream: () => {
    const [chosen, setStream] = useState<ProductionStream | null>(selectedActivity.initial === null ? null : selectedActivity.initial === 'bar' ? bar : stream)
    // A catalog adopted on another stream than the bootstrap's (a linked stream) opens on it.
    const adopt = useCallback((next: { stream: ProductionStream | null }) => {
      if (next.stream && next.stream !== stream) setStream(next.stream)
    }, [])
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

  it('does not expose the reports queue or item editors to a read-only viewer', async () => {
    mockCanManage.mockResolvedValue(false)
    renderPage()
    expect(await screen.findByText('These item settings are read-only for you. Kitchen and Bar managers edit their own activity; Ops Leads, Ops Managers and admins edit all streams.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Missing-item reports for this stream' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'MOS name' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save settings/ })).not.toBeInTheDocument()
    expect(mockListReports).not.toHaveBeenCalled()
  })

  it('recovers read-only when edit access cannot be confirmed', async () => {
    mockCanManage.mockRejectedValueOnce(new Error('access check failed'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm edit access')
    expect(screen.queryByRole('textbox', { name: 'MOS name' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save settings/ })).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again', exact: true }))
    expect(await screen.findByRole('textbox', { name: 'MOS name' })).toBeEnabled()
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
  it('keeps dirty edits after a failed save and retry saves the selected default and factor', async () => {
    mockListItems.mockResolvedValue([{
      id: 'item-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: null, isActive: false,
      defaultUnitId: 'unit-each',
      units: [
        { id: 'unit-each', name: 'each', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 },
        { id: 'unit-case', name: 'case', isShown: false, isDefault: false, labelOrdinal: null, labelCount: 1 },
      ],
      unitMultiples: [0.5],
    }])
    let rejectSave!: (reason: Error) => void
    mockSaveItem.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject }))
    const user = userEvent.setup()
    renderPage()

    const name = await screen.findByRole('textbox', { name: 'MOS name' })
    const save = screen.getByRole('button', { name: 'Save settings for Oat milk' })
    await user.clear(name)
    await user.type(name, '   ')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a MOS name.')
    expect(save).toBeDisabled()

    await user.clear(name)
    await user.type(name, 'Oat milk for the bar')
    await user.click(screen.getByRole('combobox', { name: 'Kind for Oat milk for the bar' }))
    await user.click(await screen.findByRole('option', { name: 'Raw material', exact: true }))
    await user.click(screen.getByRole('checkbox', { name: 'Active for Oat milk for the bar' }))
    const defaultUnit = screen.getByRole('combobox', { name: 'Default unit' })
    await user.click(defaultUnit)
    await user.click(await screen.findByRole('option', { name: 'case' }))

    const multiples = screen.getByRole('button', { name: 'Extra units for Oat milk for the bar' })
    await user.click(multiples)
    expect(screen.queryByRole('option', { name: '0.5 case' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(multiples)
    await user.type(screen.getByRole('spinbutton', { name: 'Multiple of case' }), '2')
    await user.click(screen.getByRole('button', { name: 'Add a multiple for Oat milk for the bar' }))
    expect(multiples).toHaveTextContent('2 case')
    expect(save).toBeEnabled()

    await user.click(save)
    expect(save).toHaveTextContent('Saving…')
    expect(save).toBeDisabled()
    await act(async () => rejectSave(new Error('save failed')))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save this item. Your changes are still here.")
    expect(name).toHaveValue('Oat milk for the bar')
    expect(screen.getByRole('checkbox', { name: 'Active for Oat milk for the bar' })).toBeChecked()
    expect(multiples).toHaveTextContent('2 case')

    await user.click(screen.getByRole('button', { name: 'Try again', exact: true }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(mockSaveItem).toHaveBeenLastCalledWith(expect.objectContaining({
      itemId: 'item-1',
      mosName: 'Oat milk for the bar',
      kind: 'RAW',
      isActive: true,
      defaultUnitId: 'unit-case',
      shownUnitIds: ['unit-case'],
      unitMultiples: [2],
    }))
  })
})

it('shows the no-ESB empty state when settings contain no items', async () => {
  mockListItems.mockResolvedValueOnce([])
  renderPage()
  expect(await screen.findByRole('heading', { name: 'No ESB items on Gordi HQ · Kitchen', exact: true })).toBeInTheDocument()
})

it('shows loading during a failed item read and recovers when retried', async () => {
  let rejectRead!: (reason: Error) => void
  mockListItems.mockImplementationOnce(() => new Promise<CafeItemSetting[]>((_resolve, reject) => { rejectRead = reject }))
  renderPage()
  expect(await screen.findByRole('status', { name: 'Loading Café items' })).toBeVisible()
  await waitFor(() => expect(mockListItems).toHaveBeenCalledTimes(1))

  await act(async () => rejectRead(new Error('read failed')))
  expect(await screen.findByText("Couldn't load Café item settings. Try again.", { exact: true })).toBeVisible()
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again', exact: true }))
  expect(await screen.findByRole('article', { name: 'ERP Oat milk' })).toBeVisible()
  expect(mockListItems.mock.calls.length).toBeGreaterThan(1)
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
    { activity: 'kitchen', wide: false }, { activity: 'bar', wide: false },
    { activity: 'kitchen', wide: true }, { activity: 'bar', wide: true },
  ] as const)('reads $activity settings without write controls (wide=$wide)', async ({ activity, wide }) => {
    const mediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: wide && query === '(min-width: 1280px)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }))
    restoreMedia = () => mediaSpy.mockRestore()
    selectedActivity.initial = activity
    mockCanManage.mockResolvedValue(false)
    renderPage()
    const item = await screen.findByRole(wide ? 'row' : 'article', { name: /ERP Oat milk/ })
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

describe('Cafe items opened from a link (Money Branch page, #1436)', () => {
  it('opens on the linked stream with the item found, and drops the link parameters', async () => {
    selectedActivity.initial = 'kitchen'
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/cafe/items?q=Oat%20milk&stream=branch-1%7Cbar']}>
          <CafeItemSettingsPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockCanManage).toHaveBeenCalledWith('bar'))
    expect(screen.getByRole('searchbox', { name: 'Find an ESB or MOS name' })).toHaveValue('Oat milk')
    expect(await screen.findByRole('article', { name: 'ERP Oat milk' })).toBeInTheDocument()
  })

  it('opens a linked stream at another branch', async () => {
    selectedActivity.initial = 'kitchen'
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/cafe/items?q=Oat%20milk&stream=branch-2%7Cbar']}>
          <CafeItemSettingsPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockListItems).toHaveBeenCalledWith(expect.objectContaining({ branch: expect.objectContaining({ id: 'branch-2' }), activity: 'bar' })))
    expect(await screen.findByRole('article', { name: 'ERP Oat milk' })).toBeInTheDocument()
  })

  it('ignores a stream the org does not have', async () => {
    selectedActivity.initial = 'kitchen'
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/cafe/items?stream=branch-9%7Cbar']}>
          <CafeItemSettingsPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockCanManage).toHaveBeenCalledWith('kitchen'))
    expect(mockCanManage).not.toHaveBeenCalledWith('bar')
  })
})

describe('ESB-owned item fields (OD-2026-10-06-ESB-ITEMS)', () => {
  function viewportWidth(width: number) {
    const mediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(query => {
      const min = /min-width:\s*([\d.]+)px/.exec(query)
      const max = /max-width:\s*([\d.]+)px/.exec(query)
      return {
        matches: (!min || width >= Number(min[1])) && (!max || width <= Number(max[1])) && (min !== null || max !== null),
        media: query, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      }
    })
    restoreMedia = () => mediaSpy.mockRestore()
  }

  function esbField(scope: HTMLElement, label: string): HTMLElement {
    const term = within(scope).getByText(label, { selector: 'dt' })
    const value = term.nextElementSibling
    if (!(value instanceof HTMLElement) || value.tagName !== 'DD') throw new Error(`${label} has no value`)
    return value
  }

  it.each([390, 1024])('shows the ESB name and category as read-only values on a %ipx card while MOS settings stay editable', async width => {
    viewportWidth(width)
    renderPage()
    const card = await screen.findByRole('article', { name: 'ERP Oat milk' })
    expect(esbField(card, 'ESB name')).toHaveTextContent('ERP Oat milk')
    expect(esbField(card, 'ESB category')).toHaveTextContent('Dairy')
    expect(within(card).getAllByRole('textbox')).toEqual([within(card).getByRole('textbox', { name: 'MOS name' })])
    expect(within(card).getByRole('textbox', { name: 'MOS name' })).toHaveValue('Oat milk')
    expect(within(card).getByRole('checkbox', { name: 'Active for Oat milk' })).toBeEnabled()
  })

  it('lays the editor out as a table only at the wide width, with the ESB fields read-only', async () => {
    viewportWidth(1280)
    renderPage()
    const row = await screen.findByRole('row', { name: /ERP Oat milk/ })
    expect(screen.getByRole('columnheader', { name: 'ESB name' })).toBeInTheDocument()
    expect(within(row).getByText('ERP Oat milk')).toBeInTheDocument()
    expect(esbField(row, 'ESB category')).toHaveTextContent('Dairy')
    expect(within(row).getAllByRole('textbox')).toEqual([within(row).getByRole('textbox', { name: 'MOS name' })])
  })

  it('saves an edited MOS name without touching the ESB name', async () => {
    const user = userEvent.setup()
    renderPage()
    const card = await screen.findByRole('article', { name: 'ERP Oat milk' })
    const name = within(card).getByRole('textbox', { name: 'MOS name' })
    await user.clear(name)
    await user.type(name, 'Oat milk (barista)')
    await user.click(within(card).getByRole('button', { name: 'Save settings for Oat milk' }))
    await waitFor(() => expect(mockSaveItem).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'item-1', mosName: 'Oat milk (barista)',
    })))
    expect(await within(card).findByText('Saved')).toBeInTheDocument()
    expect(esbField(card, 'ESB name')).toHaveTextContent('ERP Oat milk')
  })

  it.each([
    { locale: 'en' as const, note: 'ESB names and categories are read-only here; change them in ESB and they update after the next refresh. MOS names and settings are stream-specific.' },
    { locale: 'id' as const, note: 'Nama dan kategori ESB hanya-baca di sini; ubah di ESB, dan perubahannya muncul setelah pembaruan berikutnya. Nama dan pengaturan MOS khusus untuk stream ini.' },
  ])('says in $locale where the read-only ESB fields are changed', async ({ locale, note }) => {
    renderPage(locale)
    expect(await screen.findByText(note, { exact: true })).toBeInTheDocument()
  })
})

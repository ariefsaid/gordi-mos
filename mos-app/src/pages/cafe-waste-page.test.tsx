import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
const cafeStreamMock = vi.hoisted(() => ({ produces: true }))
vi.mock('@/lib/use-cafe-stream', () => {
  const branch = { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }
  const stream = { branch, activity: 'bar', get produces() { return cafeStreamMock.produces } }
  const catalog = {
    branches: [branch],
    options: [stream],
    destinations: [],
    locationOptions: [stream],
    stream,
    homeStream: stream,
    myStreamKeys: new Set(['branch-1|bar']),
    branchId: 'branch-1',
  }
  const resolve = vi.fn().mockResolvedValue(catalog)
  const adopt = vi.fn()
  const setStream = vi.fn()
  return {
    useCafeStream: () => ({ ...catalog, resolve, adopt, setStream }),
  }
})
vi.mock('@/lib/db/cafe-item-settings', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-item-settings')>()
  return { ...actual, listCafeItemSettings: vi.fn() }
})
vi.mock('@/lib/db/kitchen-logs', () => ({
  insertKitchenLog: vi.fn(),
  resolveKitchenBuId: vi.fn(),
}))
vi.mock('@/lib/db/kitchen-waste-photos', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/kitchen-waste-photos')>()
  return {
    ...actual,
    listCurrentPersonKitchenWasteDrafts: vi.fn(),
    submitKitchenWasteLog: vi.fn(),
    restartKitchenWasteDraft: vi.fn(),
    uploadKitchenWastePhoto: vi.fn(),
  }
})
vi.mock('@/lib/db/cafe-opening', () => ({ wibToday: () => '2026-10-02' }))

import { useAuth } from '@/auth/use-auth'
import { listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { insertKitchenLog, resolveKitchenBuId } from '@/lib/db/kitchen-logs'
import {
  listCurrentPersonKitchenWasteDrafts,
  submitKitchenWasteLog,
  restartKitchenWasteDraft,
  uploadKitchenWastePhoto,
} from '@/lib/db/kitchen-waste-photos'
import type { KitchenWasteDraft } from '@/lib/db/kitchen-waste-photos'
import type { CafeItemSetting } from '@/lib/db/cafe-item-settings'
import { CafeWastePage } from './cafe-waste-page'

const mockUseAuth = vi.mocked(useAuth)
const mockListCafeItemSettings = vi.mocked(listCafeItemSettings)
const mockInsertKitchenLog = vi.mocked(insertKitchenLog)
const mockResolveKitchenBuId = vi.mocked(resolveKitchenBuId)
const mockRestartWaste = vi.mocked(restartKitchenWasteDraft)
const mockSubmitWaste = vi.mocked(submitKitchenWasteLog)
const mockUploadPhoto = vi.mocked(uploadKitchenWastePhoto)
const mockListWasteDrafts = vi.mocked(listCurrentPersonKitchenWasteDrafts)
const NativeURL = globalThis.URL

const VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Café member',
      email: 'member@example.test', archived_at: null, must_change_password: false,
      created_at: '', updated_at: '',
    },
    roles: [],
    isManager: false,
    accessRoles: ['member'],
    affiliated: ['cafe'],
  },
  signOut: vi.fn(),
}

const ITEM_SETTINGS: CafeItemSetting[] = [
  {
    id: 'wip-1', erpName: 'ERP Oat Latte', mosName: 'Oat Latte', category: 'Drinks', kind: 'WIP', isActive: true,
    defaultUnitId: 'unit-cup',
    units: [
      { id: 'unit-cup', name: 'cup', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 },
    ],
    unitMultiples: [0.5, 2],
  },
  {
    id: 'raw-1', erpName: 'ERP Oat milk', mosName: 'Oat milk', category: 'Dairy', kind: 'RAW', isActive: true,
    defaultUnitId: 'unit-litre',
    units: [{ id: 'unit-litre', name: 'litre', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cafe/waste']}>
      <I18nProvider>
        <CafeWastePage />
      </I18nProvider>
    </MemoryRouter>,
  )
}

function setPhoneMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function setWideMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 768px)' || query === '(min-width: 1280px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function image(name: string) {
  return new File(['realistic-image-bytes'], name, { type: 'image/jpeg' })
}

function wasteDraft(overrides: Partial<KitchenWasteDraft> = {}): KitchenWasteDraft {
  return {
    logId: 'old-waste-draft',
    itemId: 'wip-1',
    itemUnitId: 'unit-tray',
    unitName: 'tray',
    quantity: 2.5,
    logDate: '2026-10-01',
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    photos: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  cafeStreamMock.produces = true
  setPhoneMatchMedia()
  mockUseAuth.mockReturnValue(VIEWER)
  mockListCafeItemSettings.mockResolvedValue(ITEM_SETTINGS)
  mockResolveKitchenBuId.mockResolvedValue('bu-kitchen')
  let draft = 0
  mockInsertKitchenLog.mockImplementation(async () => `waste-${++draft}`)
  mockRestartWaste.mockResolvedValue({ logId: 'replacement-waste', logDate: '2026-10-02' })
  mockListWasteDrafts.mockResolvedValue([])
  mockSubmitWaste.mockResolvedValue()
  mockUploadPhoto.mockImplementation(async logId => ({
    logId,
    path: `org/${logId}/photo.jpg`,
    url: `https://storage.test/${logId}/photo.jpg`,
  }))
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  class TestURL extends NativeURL {
    static createObjectURL = vi.fn(() => 'blob:cafe-waste-photo')
    static revokeObjectURL = vi.fn()
  }
  vi.stubGlobal('URL', TestURL)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CafeWastePage', () => {
  it('restores an unsent waste draft after reload and clears it after confirmed submit', async () => {
    const first = renderPage()
    const quantity = await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })
    fireEvent.change(quantity, { target: { value: '2.5' } })
    await waitFor(() => expect(localStorage.length).toBeGreaterThan(0))
    first.unmount()

    renderPage()
    expect(await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toHaveValue(2.5)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add photo' })[0]!)
    const fileInput = await screen.findByLabelText(/take or choose photos/i)
    fireEvent.change(fileInput, { target: { files: [image('latte.jpg')] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Upload photos' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit waste' }))

    expect(await screen.findByText('1 waste entry submitted for review.')).toBeInTheDocument()
    expect(localStorage.length).toBe(0)
  })

  it('retries waste preparation with the same request id after a dropped response', async () => {
    mockInsertKitchenLog.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('waste-retry')
    renderPage()
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }), { target: { value: '2.5' } })
    const addPhoto = screen.getAllByRole('button', { name: 'Add photo' })[0]!
    fireEvent.click(addPhoto)
    await screen.findByText(/could not prepare this waste entry/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add photo' })[0]!)
    await waitFor(() => expect(mockInsertKitchenLog).toHaveBeenCalledTimes(2))
    expect(mockInsertKitchenLog.mock.calls[0]![0].client_request_id).toBeTruthy()
    expect(mockInsertKitchenLog.mock.calls[1]![0].client_request_id)
      .toBe(mockInsertKitchenLog.mock.calls[0]![0].client_request_id)
  })
  it('shows each waste item quantity and unit without a grouped numeric total', async () => {
    setWideMatchMedia()
    renderPage()

    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' }), { target: { value: '1.5' } })

    const aside = screen.getByRole('complementary', { name: 'Capture summary' })
    expect(aside).toHaveTextContent('2 cup')
    expect(aside).toHaveTextContent('1.5 litre')
    expect(aside.querySelector('.kl-capture-summary__totals')).toBeNull()
    expect(aside).not.toHaveTextContent('3.5')
    expect(within(aside).queryByRole('button', { name: 'Submit waste' })).toBeNull()
    expect(within(document.querySelector('.cwl-footer')!).getByRole('button', { name: 'Submit waste' })).toBeDisabled()
  })

  it('keeps a disabled Submit bar visible for an empty item list at wide width', async () => {
    setWideMatchMedia()
    mockListCafeItemSettings.mockResolvedValueOnce([])
    renderPage()

    await screen.findByTestId('empty-state')

    const footer = document.querySelector<HTMLElement>('.cwl-footer')
    expect(footer).toBeInTheDocument()
    expect(within(footer!).getByText('0 waste items')).toBeInTheDocument()
    expect(within(footer!).getByRole('button', { name: 'Submit waste' })).toBeDisabled()
  })

  it('receiving-only phone category and kind filters narrow the waste list', async () => {
    cafeStreamMock.produces = false
    renderPage()
    expect(await screen.findByText('Oat Latte')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('combobox', { name: /category/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Dairy' }))
    expect(screen.getByText('Oat milk')).toBeInTheDocument()
    expect(screen.queryByText('Oat Latte')).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: /category/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'All categories' }))
    fireEvent.click(screen.getByRole('combobox', { name: /kind/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'RAW' }))
    expect(screen.getByText('Oat milk')).toBeInTheDocument()
    expect(screen.queryByText('Oat Latte')).toBeNull()
  })

  it('names the item/unit resolver and links to Café item settings when no item is loggable', async () => {
    mockListCafeItemSettings.mockResolvedValue([])
    renderPage()
    const empty = await screen.findByTestId('empty-state')

    expect(within(empty).getByText(/ops lead, admin, or your stream manager/i)).toBeInTheDocument()
    expect(within(empty).getByRole('link', { name: /open café item settings/i })).toHaveAttribute('href', '/cafe/items')
  })

  it('loading shows the page label once without repeating the café context', async () => {
    mockListCafeItemSettings.mockReturnValue(new Promise(() => {}))
    renderPage()
    await screen.findByRole('heading', { name: 'Log waste' })
    expect(screen.getAllByRole('heading', { name: 'Log waste' })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Café · Log waste' })).toBeNull()
  })

  it('lists RAW and WIP MOS names with their configured default and shown units', async () => {
    renderPage()

    expect(await screen.findByText('Oat Latte')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Log waste' })).toBeInTheDocument()
    expect(screen.getByText('WIP', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Oat Latte')).toBeInTheDocument()
    expect(screen.getByText('RAW', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Oat milk')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' })).toBeInTheDocument()
    expect(screen.getByText('litre')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rumah Rames · Bar' })).toBeInTheDocument()
  })

  it('resumes a photo-backed draft explicitly with its captured facts and can submit it after the photo window', async () => {
    const photo = {
      logId: 'old-waste-draft',
      path: 'org-1/old-waste-draft/photo.jpg',
      url: 'https://storage.test/old-waste-draft/photo.jpg',
      name: 'waste.jpg',
    }
    mockListWasteDrafts.mockResolvedValue([
      wasteDraft({ photos: [photo] }),
      wasteDraft({ logId: 'another-waste-draft', quantity: 8.75, unitName: 'cup', itemUnitId: 'unit-cup' }),
    ])
    renderPage()

    const resumeButton = await screen.findByRole('button', { name: /resume oat latte · 2.5 tray/i })
    expect(mockListWasteDrafts).toHaveBeenCalledWith({
      orgId: 'org-1', personId: 'person-1', branchId: 'branch-1', activity: 'bar',
    })
    expect(screen.getAllByRole('button', { name: /resume oat latte/i })).toHaveLength(2)
    expect((screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('img', { name: /photo 1 preview/i })).not.toBeInTheDocument()
    fireEvent.click(resumeButton)

    const quantity = screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }) as HTMLInputElement
    const unit = screen.getByRole('combobox', { name: 'Waste unit for Oat Latte' })
    expect(quantity).toHaveValue(2.5)
    expect(quantity).toBeDisabled()
    expect(unit).toHaveTextContent('tray')
    expect(unit).toBeDisabled()
    expect(screen.getByRole('img', { name: /photo 1 preview/i })).toHaveAttribute('src', photo.url)
    expect(screen.getByRole('button', { name: /resume oat latte · 8.75 cup/i })).toBeDisabled()

    const submit = screen.getByRole('button', { name: 'Submit waste' })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(mockSubmitWaste).toHaveBeenCalledWith('old-waste-draft'))
  })

  it('keeps a prior-day draft resumable with its original date and submits its existing row', async () => {
    const photo = {
      logId: 'prior-day-waste-draft',
      path: 'org-1/prior-day-waste-draft/photo.jpg',
      url: 'https://storage.test/prior-day-waste-draft/photo.jpg',
      name: 'waste.jpg',
    }
    const draft = Object.assign(wasteDraft({ logId: 'prior-day-waste-draft', photos: [photo] }), {
      logDate: '2026-10-01',
    })
    mockListWasteDrafts.mockResolvedValue([draft])
    renderPage()

    const resumeButton = await screen.findByRole('button', { name: /resume oat latte · 2.5 tray · 1 oct 2026/i })
    expect(mockListWasteDrafts).toHaveBeenCalledWith({
      orgId: 'org-1', personId: 'person-1', branchId: 'branch-1', activity: 'bar',
    })
    fireEvent.click(resumeButton)
    expect(screen.getByText(/captured on 1 oct 2026/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit waste' }))
    await waitFor(() => expect(mockSubmitWaste).toHaveBeenCalledWith('prior-day-waste-draft'))
    expect(mockInsertKitchenLog).not.toHaveBeenCalled()
  })

  it('shows unavailable captured-unit metadata without blocking another draft or new capture', async () => {
    mockListWasteDrafts.mockResolvedValue([
      wasteDraft({ unitName: null }),
      wasteDraft({ logId: 'valid-draft', itemId: 'raw-1', unitName: 'litre', itemUnitId: 'unit-litre', photos: [{ logId: 'valid-draft', path: 'photo.jpg', url: 'https://storage.test/photo.jpg' }] }),
    ])
    renderPage()
    expect(await screen.findByRole('button', { name: /resume oat latte.*captured unit unavailable/i })).toBeDisabled()
    expect(screen.getByText('The captured unit cannot be read. Reload the page to try again.')).toBeInTheDocument()
    const valid = screen.getByRole('button', { name: /resume oat milk.*litre/i })
    expect(valid).toBeEnabled()
    fireEvent.click(valid)
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' })).toHaveValue(2.5)
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toBeEnabled()
    expect(mockInsertKitchenLog).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Submit waste' }))
    await waitFor(() => expect(mockSubmitWaste).toHaveBeenCalledWith('valid-draft'))
    expect(mockSubmitWaste).not.toHaveBeenCalledWith('old-waste-draft')
  })

  it('requires an explicit replacement for an expired photo-less draft and preserves its captured values and other rows', async () => {
    mockListWasteDrafts.mockResolvedValue([wasteDraft({
      itemUnitId: 'unit-cup', unitName: 'cup', quantity: 2.5, entryUnitFactor: 1,
    })])
    renderPage()

    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat milk' }), { target: { value: '4' } })
    fireEvent.click(await screen.findByRole('button', { name: /resume oat latte · 2.5 cup/i }))

    expect(await screen.findByText(/draft has no photo.*cannot be submitted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start new waste entry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit waste' })).toBeDisabled()
    expect(mockInsertKitchenLog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Start new waste entry' }))
    await waitFor(() => expect(mockRestartWaste).toHaveBeenCalledWith('old-waste-draft', '2026-10-02'))
    expect(mockInsertKitchenLog).not.toHaveBeenCalled()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toHaveValue(2.5)
    expect(screen.getByRole('combobox', { name: 'Waste unit for Oat Latte' })).toHaveTextContent('cup')
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' })).toHaveValue(4)
    expect(await screen.findByLabelText(/take or choose photos/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit waste' })).toBeDisabled()
  })

  it('offers the explicit restart when an upload reports that the existing draft window expired', async () => {
    mockUploadPhoto.mockRejectedValueOnce(new Error('WASTE_PHOTO_WINDOW_EXPIRED'))
    renderPage()

    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }), { target: { value: '3' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add photo' })[0]!)
    await waitFor(() => expect(mockInsertKitchenLog).toHaveBeenCalledTimes(1))
    fireEvent.change(await screen.findByLabelText(/take or choose photos/i), { target: { files: [image('late.jpg')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload photos' }))

    expect(await screen.findByRole('button', { name: 'Start new waste entry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit waste' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Start new waste entry' }))
    await waitFor(() => expect(mockRestartWaste).toHaveBeenCalledWith('waste-1', '2026-10-02'))
    expect(mockInsertKitchenLog).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toHaveValue(3)
    expect(mockUploadPhoto).toHaveBeenCalledWith('waste-1', expect.any(File))
    expect(mockSubmitWaste).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit waste' })).toBeDisabled()
  })

  it('keeps the original expired draft available when replacement fails and retries the same draft', async () => {
    mockListWasteDrafts.mockResolvedValue([wasteDraft({
      itemUnitId: 'unit-cup', unitName: 'cup', entryUnitFactor: 1, entryUnitName: 'cup',
    })])
    mockRestartWaste.mockRejectedValueOnce(new Error('Temporary restart failure'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /resume oat latte · 2.5 cup/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Start new waste entry' }))
    await waitFor(() => expect(mockRestartWaste).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: 'Start new waste entry' })).toBeEnabled()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toHaveValue(2.5)
    expect(mockInsertKitchenLog).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start new waste entry' }))
    await waitFor(() => expect(mockRestartWaste).toHaveBeenCalledTimes(2))
    expect(mockRestartWaste).toHaveBeenNthCalledWith(2, 'old-waste-draft', '2026-10-02')
    expect(await screen.findByLabelText(/take or choose photos/i)).toBeInTheDocument()
  })

  it('keeps each waste item name paired with a separate quantity column and its full unit label', async () => {
    const longUnitLabel = 'Extra-long unit label (20 servings per batch)'
    mockListCafeItemSettings.mockResolvedValueOnce([{
      ...ITEM_SETTINGS[0]!,
      id: 'long-unit-item',
      erpName: 'ERP Coffee Syrup',
      mosName: 'Coffee Syrup',
      defaultUnitId: 'unit-long',
      units: [
        { id: 'unit-long', name: longUnitLabel, isShown: true, isDefault: true, labelOrdinal: null, labelCount: 2 },
      ],
    }])

    renderPage()

    const row = await screen.findByRole('group', { name: 'WIP - Coffee Syrup' })
    const name = within(row).getByText('Coffee Syrup')
    const quantity = within(row).getByRole('spinbutton', { name: 'Waste quantity for Coffee Syrup' })
    const unit = within(row).getByRole('combobox', { name: 'Waste unit for Coffee Syrup' })

    expect(row.querySelector('.cwl-capture-row__item')).toContainElement(name)
    expect(row.querySelector('.cwl-capture-row__controls')).toContainElement(quantity)
    expect(unit).toHaveTextContent(longUnitLabel)
    expect(quantity.parentElement).toHaveClass('cwl-quantity-row')
    expect(unit.closest('.cwl-unit-select')?.parentElement).toBe(quantity.parentElement)
  })

  it('keeps the missing-item route beside the item controls on a long capture list', async () => {
    renderPage()
    const report = await screen.findByRole('button', { name: /missing an item\? report it/i })
    const firstQuantity = screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })
    expect(report.compareDocumentPosition(firstQuantity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('explains that a quantity unlocks Add photo and removes the hint once entered', async () => {
    renderPage()
    const addPhoto = (await screen.findAllByRole('button', { name: 'Add photo' }))[0]!
    expect(addPhoto).toBeDisabled()
    expect(screen.getAllByText('Enter a quantity before adding a photo.')).toHaveLength(2)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }), { target: { value: '2' } })
    await waitFor(() => expect(addPhoto).toBeEnabled())
    expect(screen.getAllByText('Enter a quantity before adding a photo.')).toHaveLength(1)
  })

  it('converts a selected multiple to the default ERP unit and stores its entry snapshot', async () => {
    setWideMatchMedia()
    renderPage()

    fireEvent.click(await screen.findByRole('combobox', { name: 'Waste unit for Oat Latte' }))
    fireEvent.click(await screen.findByRole('option', { name: '0.5 cup' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }), { target: { value: '4' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add photo' })[0]!)

    await waitFor(() => expect(mockInsertKitchenLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'waste',
      wip_item_id: 'wip-1',
      item_unit_id: 'unit-cup',
      qty_porsi: 2,
      entry_quantity: 4,
      entry_unit_factor: 0.5,
    })))
    expect(screen.getByRole('complementary', { name: 'Capture summary' })).toHaveTextContent('4 0.5 cup')
  })

  it('requires an uploaded photo for each staged item, then submits every Draft through the waste RPC', async () => {
    renderPage()

    const latte = await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })
    const milk = screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' })
    fireEvent.change(latte, { target: { value: '2' } })
    fireEvent.change(milk, { target: { value: '1.5' } })

    const addPhoto = screen.getAllByRole('button', { name: 'Add photo' })
    fireEvent.click(addPhoto[0]!)
    fireEvent.click(addPhoto[1]!)
    await waitFor(() => expect(mockInsertKitchenLog).toHaveBeenCalledTimes(2))
    expect(mockInsertKitchenLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: 'waste', destination_branch_id: null, wip_item_id: 'wip-1', item_unit_id: 'unit-cup', qty_porsi: 2,
    }))
    expect(mockInsertKitchenLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: 'waste', destination_branch_id: null, wip_item_id: 'raw-1', item_unit_id: 'unit-litre', qty_porsi: 1.5,
    }))

    await waitFor(() => expect(screen.getAllByLabelText(/take or choose photos/i)).toHaveLength(2))
    const submit = screen.getByRole('button', { name: 'Submit waste' })
    expect(submit).toBeDisabled()

    const fileInputs = screen.getAllByLabelText(/take or choose photos/i)
    fireEvent.change(fileInputs[0]!, { target: { files: [image('latte.jpg')] } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Upload photos' })[0]!)
    await screen.findByText('1 photo uploaded')
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getAllByLabelText(/take or choose photos/i)[1]!, { target: { files: [image('oat-milk.jpg')] } })
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Upload photos' })).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Upload photos' }))
    await waitFor(() => expect(submit).toBeEnabled())
    expect(mockUploadPhoto).toHaveBeenCalledTimes(2)

    fireEvent.click(submit)
    await waitFor(() => expect(mockSubmitWaste).toHaveBeenCalledTimes(2))
    expect(mockSubmitWaste).toHaveBeenNthCalledWith(1, 'waste-1')
    expect(mockSubmitWaste).toHaveBeenNthCalledWith(2, 'waste-2')
    expect(await screen.findByText('2 waste entries submitted for review.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log more waste' })).toBeInTheDocument()
  })

  it('gives each staged item a uniquely labelled photo region', async () => {
    renderPage()
    const quantities = [
      await screen.findByRole('spinbutton', { name: 'Waste quantity for Oat Latte' }),
      screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' }),
    ]
    fireEvent.change(quantities[0]!, { target: { value: '1' } })
    fireEvent.change(quantities[1]!, { target: { value: '1' } })
    const actions = screen.getAllByRole('button', { name: 'Add photo' })
    fireEvent.click(actions[0]!)
    fireEvent.click(actions[1]!)
    await waitFor(() => expect(mockInsertKitchenLog).toHaveBeenCalledTimes(2))
    const regions = await screen.findAllByRole('region', { name: 'Waste photos' })
    expect(regions).toHaveLength(2)
    expect(new Set(regions.map(region => region.getAttribute('aria-labelledby')).values()).size).toBe(2)
  })
})

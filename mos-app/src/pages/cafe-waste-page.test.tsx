import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/use-cafe-stream', () => {
  const branch = { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }
  const stream = { branch, activity: 'bar', produces: true }
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
    submitKitchenWasteLog: vi.fn(),
    uploadKitchenWastePhoto: vi.fn(),
  }
})
vi.mock('@/lib/db/cafe-opening', () => ({ wibToday: () => '2026-10-02' }))

import { useAuth } from '@/auth/use-auth'
import { listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { insertKitchenLog, resolveKitchenBuId } from '@/lib/db/kitchen-logs'
import { submitKitchenWasteLog, uploadKitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import type { CafeItemSetting } from '@/lib/db/cafe-item-settings'
import { CafeWastePage } from './cafe-waste-page'

const mockUseAuth = vi.mocked(useAuth)
const mockListCafeItemSettings = vi.mocked(listCafeItemSettings)
const mockInsertKitchenLog = vi.mocked(insertKitchenLog)
const mockResolveKitchenBuId = vi.mocked(resolveKitchenBuId)
const mockSubmitWaste = vi.mocked(submitKitchenWasteLog)
const mockUploadPhoto = vi.mocked(uploadKitchenWastePhoto)
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
      { id: 'unit-tray', name: 'tray', isShown: true, isDefault: false, labelOrdinal: null, labelCount: 1 },
    ],
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

function image(name: string) {
  return new File(['realistic-image-bytes'], name, { type: 'image/jpeg' })
}

beforeEach(() => {
  vi.clearAllMocks()
  setPhoneMatchMedia()
  mockUseAuth.mockReturnValue(VIEWER)
  mockListCafeItemSettings.mockResolvedValue(ITEM_SETTINGS)
  mockResolveKitchenBuId.mockResolvedValue('bu-kitchen')
  let draft = 0
  mockInsertKitchenLog.mockImplementation(async () => `waste-${++draft}`)
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
  it('lists RAW and WIP MOS names with their configured default and shown units', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Café · Log waste' })).toBeInTheDocument()
    expect(screen.getByText('WIP', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Oat Latte')).toBeInTheDocument()
    expect(screen.getByText('RAW', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Oat milk')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat Latte' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Waste quantity for Oat milk' })).toBeInTheDocument()
    expect(screen.getByText('litre')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rumah Rames · Bar' })).toBeInTheDocument()
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

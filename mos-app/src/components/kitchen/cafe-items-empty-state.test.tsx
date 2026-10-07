// An empty Café item list names its real cause and who fixes it (OD-2026-10-06-ESB-ITEMS, audit F02).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/cafe-item-settings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/cafe-item-settings')>('@/lib/db/cafe-item-settings')
  return { ...actual, listCafeItemSettings: vi.fn(), canManageCafeItemSettings: vi.fn() }
})
import { canManageCafeItemSettings, listCafeItemSettings, type CafeItemSetting } from '@/lib/db/cafe-item-settings'
import { CafeItemsEmptyState } from './cafe-items-empty-state'

const mockSettings = vi.mocked(listCafeItemSettings)
const mockCanManage = vi.mocked(canManageCafeItemSettings)
const KITCHEN = { branch: { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }, activity: 'kitchen' as const }
const BAR = { ...KITCHEN, activity: 'bar' as const }
const unsetItem = (id: string): CafeItemSetting => ({
  id, erpName: `Sirup Gula Aren Pandan Kental Botol Kaca ${id}`, mosName: `Sirup ${id}`, category: 'Bar',
  kind: null, isActive: false, defaultUnitId: null, units: [],
})

function renderEmpty(props: Parameters<typeof CafeItemsEmptyState>[0]) {
  return render(<MemoryRouter><CafeItemsEmptyState {...props} /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCanManage.mockResolvedValue(false)
})

describe('CafeItemsEmptyState', () => {
  it('says the stream has no ESB items, that they are added in ESB first, and offers nothing to click', async () => {
    mockSettings.mockResolvedValue([])
    renderEmpty({ stream: KITCHEN })
    const empty = await screen.findByTestId('empty-state')
    expect(within(empty).getByRole('heading', { name: 'No ESB items on Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(within(empty).getByText('Add it in ESB first; it appears here after the next refresh.', { exact: true })).toBeInTheDocument()
    expect(empty).not.toHaveTextContent(/ops lead|manager|admin/i)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('says the no-ESB copy in Indonesian', async () => {
    mockSettings.mockResolvedValue([])
    render(<I18nProvider initialLocale="id"><MemoryRouter><CafeItemsEmptyState stream={KITCHEN} /></MemoryRouter></I18nProvider>)
    const empty = await screen.findByTestId('empty-state')
    expect(within(empty).getByText('Tambahkan dulu di ESB; item muncul di sini setelah pembaruan berikutnya.', { exact: true })).toBeInTheDocument()
  })

  it('sends a person who can manage the items straight to Café items to set them up', async () => {
    mockSettings.mockResolvedValue([unsetItem('a'), unsetItem('b')])
    mockCanManage.mockResolvedValue(true)
    renderEmpty({ stream: KITCHEN })
    expect(await screen.findByRole('heading', { name: 'No items set up on Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(screen.getByText(/2 ESB items are on this stream/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set up items' })).toHaveAttribute('href', '/cafe/items')
    expect(mockCanManage).toHaveBeenCalledWith('kitchen')
  })

  it('tells a person who cannot manage the items who can, without a link they cannot use', async () => {
    mockSettings.mockResolvedValue([unsetItem('a')])
    renderEmpty({ stream: BAR })
    expect(await screen.findByText(/1 ESB item is on this stream/i)).toBeInTheDocument()
    expect(screen.getByText(/bar manager or an ops lead/i)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers no link when the manage check fails', async () => {
    mockSettings.mockResolvedValue([unsetItem('a')])
    mockCanManage.mockRejectedValue(new Error('rpc down'))
    renderEmpty({ stream: KITCHEN })
    expect(await screen.findByText(/kitchen manager or an ops lead/i)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('names no cause when the stream items cannot be read', async () => {
    mockSettings.mockRejectedValue(new Error('read failed'))
    renderEmpty({ stream: KITCHEN })
    expect(await screen.findByRole('heading', { name: 'No items to show on Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(screen.queryByText(/ESB item/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('uses the item count and manage right a page already read, without reading them again', async () => {
    renderEmpty({ stream: KITCHEN, esbItemCount: 1, canManage: true })
    expect(await screen.findByRole('link', { name: 'Set up items' })).toBeInTheDocument()
    expect(mockSettings).not.toHaveBeenCalled()
    expect(mockCanManage).not.toHaveBeenCalled()
  })

  it('speaks Indonesian in the id locale', async () => {
    mockSettings.mockResolvedValue([unsetItem('a'), unsetItem('b')])
    render(<MemoryRouter><I18nProvider initialLocale="id"><CafeItemsEmptyState stream={KITCHEN} /></I18nProvider></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Belum ada item yang siap di Rumah Rames · Dapur' })).toBeInTheDocument()
    expect(screen.getByText(/2 item ESB ada di stream ini/)).toBeInTheDocument()
    expect(screen.getByText(/Manajer dapur Anda atau ops lead/)).toBeInTheDocument()
  })
})

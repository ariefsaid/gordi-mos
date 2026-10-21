// @vitest-environment-options {"url": "http://localhost:4400/"}
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { messages } from '@/i18n/messages'
import { ContractError } from '@/lib/db/contract'
import { CafeMoveStockPage } from './cafe-move-stock-page'

const state = vi.hoisted(() => ({ offline: false, coverage: 'complete' as 'complete' | 'unallocated' | 'unavailable', roles: ['member'], available: '5' }))
const reads = vi.hoisted(() => ({ items: vi.fn(), locations: vi.fn(), balances: vi.fn(), defaults: vi.fn(), move: vi.fn(), place: vi.fn(), setStream: vi.fn(), resolve: vi.fn(), adopt: vi.fn() }))
const stream = { branch: { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }, activity: 'kitchen' as const }

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'person-1' }, accessRoles: state.roles, affiliated: ['cafe'], roles: [], isManager: false }, signOut: vi.fn() }),
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => state.offline }))
vi.mock('@/lib/use-cafe-stream', () => ({
  useCafeStream: () => ({
    options: [stream], stream, homeStream: stream, myStreamKeys: new Set(['branch-1:kitchen']),
    resolve: reads.resolve, adopt: reads.adopt, setStream: reads.setStream,
  }),
}))
vi.mock('@/lib/db/cafe-count', () => ({ listCafeCountableItems: reads.items }))
vi.mock('@/lib/db/cafe-locations', () => ({
  listCafeLocations: reads.locations, fetchCafeLocationBalances: reads.balances, moveCafeStock: reads.move,
  getCafeStreamLocationDefaults: reads.defaults, placeCafeUnassignedStock: reads.place,
}))

const renderPage = (locale: 'en' | 'id' = 'en') => render(<MemoryRouter><I18nProvider initialLocale={locale}><CafeMoveStockPage /></I18nProvider></MemoryRouter>)

beforeEach(() => {
  state.offline = false; state.coverage = 'complete'; state.roles = ['member']; state.available = '5'
  reads.resolve.mockResolvedValue({ branches: [stream.branch], options: [stream], destinations: [], locationOptions: [stream], stream, homeStream: stream, myStreamKeys: new Set(['branch-1:kitchen']) })
  reads.items.mockResolvedValue([{ id: 'item-1', name: 'Coffee beans', category: 'Raw', kind: 'RAW', unitId: 'unit-1', unitName: 'kg' }])
  reads.locations.mockResolvedValue([
    { id: 'store-1', name: 'Rumah Rames kitchen (Gordi HQ)', use: 'both', archived_at: null },
    { id: 'store-2', name: 'Rumah Rames outlet', use: 'storage', archived_at: null },
  ])
  reads.defaults.mockResolvedValue({ storage_location_id: 'store-1', production_location_id: 'store-1', row_version: 1 })
  reads.balances.mockImplementation(async () => ({
    rows: [
      { location_id: 'store-1', item_id: 'item-1', item_unit_id: 'unit-1', usable_qty: state.available, available_qty: '1' },
      { location_id: null, item_id: 'item-1', item_unit_id: 'unit-1', usable_qty: '7', available_qty: '3' },
    ], as_of: '2026-10-10T10:00:00Z', coverage: state.coverage, reason: null,
  }))
  reads.move.mockResolvedValue({ movement_id: 'move-1', row_version: 1 })
  reads.place.mockResolvedValue({ rows_written: 1 })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

for (const locale of ['en', 'id'] as const) {
  const text = messages[locale]
  const choose = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
    await user.click(screen.getByRole('combobox', { name: label }))
    await user.click(screen.getByRole('option', { name: option }))
  }
  const enterItem = async (user: ReturnType<typeof userEvent.setup>, quantity = '3') => {
    await choose(user, text['cafe.moveStock.item'], 'Coffee beans')
    await user.type(screen.getByLabelText(text['cafe.moveStock.quantity']), quantity)
  }

  describe(`Change location (${locale})`, () => {
    it('preselects the default kitchen and outlet, uses through-date stock, and keeps places/date after saving', async () => {
      const user = userEvent.setup()
      renderPage(locale)
      expect(await screen.findByRole('combobox', { name: text['cafe.locations.field.from'] })).toHaveTextContent('Rumah Rames kitchen (Gordi HQ)')
      expect(screen.getByRole('combobox', { name: text['cafe.locations.field.to'] })).toHaveTextContent('Rumah Rames outlet')
      await enterItem(user)
      expect(screen.getByText(locale === 'en' ? '5 kg available at the source.' : '5 kg tersedia di lokasi sumber.')).toBeInTheDocument()
      const date = (screen.getByLabelText(text['cafe.moveStock.date']) as HTMLInputElement).value
      reads.move.mockImplementationOnce(async () => { state.available = '2'; return { movement_id: 'move-1', row_version: 1 } })
      await user.click(screen.getByRole('button', { name: text['cafe.moveStock.submit'] }))
      expect(reads.move).toHaveBeenCalledWith({
        stream: { branch_id: 'branch-1', activity: 'kitchen' }, item_unit_id: 'unit-1', quantity: '3',
        from_location_id: 'store-1', to_location_id: 'store-2', movement_date: date, note: null,
      }, { client_request_id: expect.any(String) })
      await waitFor(() => expect(reads.balances).toHaveBeenCalledTimes(2))
      expect(await screen.findByRole('combobox', { name: text['cafe.moveStock.item'] })).toHaveTextContent(text['cafe.moveStock.itemChoose'])
      expect(screen.getByLabelText(text['cafe.moveStock.quantity'])).toHaveValue('')
      expect(screen.getByRole('combobox', { name: text['cafe.locations.field.from'] })).toHaveTextContent('Rumah Rames kitchen (Gordi HQ)')
      expect(screen.getByRole('combobox', { name: text['cafe.locations.field.to'] })).toHaveTextContent('Rumah Rames outlet')
      expect(screen.getByLabelText(text['cafe.moveStock.date'])).toHaveValue(date)
      await choose(user, text['cafe.moveStock.item'], 'Coffee beans')
      expect(screen.getByText(locale === 'en' ? '2 kg available at the source.' : '2 kg tersedia di lokasi sumber.')).toBeInTheDocument()
    })

    it('lets an unallocated stream attempt a move and explains the RPC refusal with a placement next step', async () => {
      state.coverage = 'unallocated'; state.roles = ['ops_lead']
      reads.move.mockRejectedValue(new ContractError('INVALID', 'CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED'))
      const user = userEvent.setup()
      renderPage(locale)
      await screen.findByRole('combobox', { name: text['cafe.moveStock.item'] })
      await enterItem(user)
      expect(screen.getByRole('button', { name: text['cafe.moveStock.submit'] })).toBeEnabled()
      await user.click(screen.getByRole('button', { name: text['cafe.moveStock.submit'] }))
      expect(await screen.findByRole('alert')).toHaveTextContent(locale === 'en' ? /opening|placed/i : /awal|ditempatkan/i)
      expect(screen.getByRole('button', { name: locale === 'en' ? 'Place all unassigned here' : 'Tempatkan semua yang belum ditempatkan di sini' })).toBeEnabled()
      expect(screen.getByLabelText(text['cafe.moveStock.quantity'])).toHaveValue('3')
    })

    it.each(['ops_lead', 'admin'])('lets %s place one Unassigned item using its remainder', async role => {
      state.roles = [role]; state.coverage = 'unallocated'
      const user = userEvent.setup()
      renderPage(locale)
      await screen.findByRole('combobox', { name: text['cafe.locations.field.from'] })
      await choose(user, text['cafe.locations.field.from'], locale === 'en' ? 'Unassigned (not placed yet)' : 'Belum ditempatkan')
      await enterItem(user, '6')
      expect(screen.getByText(locale === 'en' ? '7 kg available at the source.' : '7 kg tersedia di lokasi sumber.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: text['cafe.moveStock.submit'] }))
      expect(reads.place).toHaveBeenCalledWith({ stream: { branch_id: 'branch-1', activity: 'kitchen' }, to_location_id: 'store-2', as_of: expect.any(String), item_unit_id: 'unit-1', quantity: '6' }, { client_request_id: expect.any(String) })
      expect(reads.move).not.toHaveBeenCalled()
    })

    it('places all only after confirming; cancelling writes nothing', async () => {
      state.roles = ['ops_lead']; state.coverage = 'unallocated'
      const user = userEvent.setup()
      renderPage(locale)
      const label = locale === 'en' ? 'Place all unassigned here' : 'Tempatkan semua yang belum ditempatkan di sini'
      await user.click(await screen.findByRole('button', { name: label }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Rumah Rames outlet')
      expect(reads.place).not.toHaveBeenCalled()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: text['common.cancel'] }))
      expect(reads.place).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: label }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: text['cafe.moveStock.confirmPlace'] }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(reads.place).toHaveBeenCalledWith({ stream: { branch_id: 'branch-1', activity: 'kitchen' }, to_location_id: 'store-2', as_of: expect.any(String) }, { client_request_id: expect.any(String) })
    })

    it('does not offer Unassigned or bulk placement to a member', async () => {
      const user = userEvent.setup()
      renderPage(locale)
      await screen.findByRole('combobox', { name: text['cafe.locations.field.from'] })
      await user.click(screen.getByRole('combobox', { name: text['cafe.locations.field.from'] }))
      expect(screen.queryByRole('option', { name: /Unassigned|Belum ditempatkan/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Place all|Tempatkan semua/ })).not.toBeInTheDocument()
    })

    it('rejects overdraw and same-place moves without writing', async () => {
      const user = userEvent.setup()
      renderPage(locale)
      await screen.findByRole('combobox', { name: text['cafe.moveStock.item'] })
      await enterItem(user, '6')
      expect(screen.getByRole('alert')).toHaveTextContent(text['cafe.moveStock.quantityTooHigh'])
      expect(screen.getByRole('button', { name: text['cafe.moveStock.submit'] })).toBeDisabled()
      await choose(user, text['cafe.locations.field.to'], 'Rumah Rames kitchen (Gordi HQ)')
      expect(screen.getAllByRole('alert').some(alert => alert.textContent === text['cafe.moveStock.samePlace'])).toBe(true)
      expect(reads.move).not.toHaveBeenCalled()
    })
  })
}

it('retries an unchanged failed move with the same key, freezes inputs while pending, and prevents double saves', async () => {
  reads.move.mockRejectedValueOnce(new Error('network'))
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('combobox', { name: 'Item' })
  await user.click(screen.getByRole('combobox', { name: 'Item' }))
  await user.click(screen.getByRole('option', { name: 'Coffee beans' }))
  await user.type(screen.getByLabelText('Quantity'), '2')
  await user.click(screen.getByRole('button', { name: 'Change location' }))
  await screen.findByRole('alert')
  let finish!: () => void
  reads.move.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  await user.dblClick(screen.getByRole('button', { name: 'Change location' }))
  expect(reads.move).toHaveBeenCalledTimes(2)
  expect(reads.move.mock.calls[1][1]).toEqual(reads.move.mock.calls[0][1])
  expect(screen.getByLabelText('Quantity')).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'From storage' })).toBeDisabled()
  finish()
  await screen.findByText('Stock moved between locations.')
})

it('allows leaving untouched defaults, guards an unsaved item, and allows leaving after saving', async () => {
  const user = userEvent.setup()
  const router = createMemoryRouter([
    { path: '/cafe/locations/change-location', element: <I18nProvider initialLocale="en"><CafeMoveStockPage /></I18nProvider> },
    { path: '/cafe/locations', element: <p>Locations list</p> },
  ], { initialEntries: ['/cafe/locations/change-location'] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('combobox', { name: 'Item' })
  await user.click(screen.getByRole('link', { name: 'Back to Locations' }))
  expect(await screen.findByText('Locations list')).toBeInTheDocument()
  await router.navigate('/cafe/locations/change-location')
  await screen.findByRole('combobox', { name: 'Item' })
  await user.click(screen.getByRole('combobox', { name: 'Item' }))
  await user.click(screen.getByRole('option', { name: 'Coffee beans' }))
  await user.type(screen.getByLabelText('Quantity'), '2')
  await user.type(screen.getByLabelText('Note'), 'Morning send')
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-10' } })
  await screen.findByRole('combobox', { name: 'Item' })
  await user.click(screen.getByRole('link', { name: 'Back to Locations' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Your stock move is not saved.')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Quantity')).toHaveValue('2')
  await user.click(screen.getByRole('button', { name: 'Change location' }))
  await screen.findByText('Stock moved between locations.')
  await screen.findByRole('combobox', { name: 'Item' })
  await user.click(screen.getByRole('link', { name: 'Back to Locations' }))
  expect(await screen.findByText('Locations list')).toBeInTheDocument()
})

it('recovers a failed load and does not guess a destination when more than two places exist', async () => {
  reads.defaults.mockRejectedValueOnce(new Error('offline'))
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: /try again/i }))
  expect(await screen.findByRole('combobox', { name: 'To storage' })).toHaveTextContent('Rumah Rames outlet')
  cleanup()
  reads.locations.mockResolvedValue([
    { id: 'store-1', name: 'Kitchen', use: 'both' }, { id: 'store-2', name: 'Outlet', use: 'storage' }, { id: 'store-3', name: 'Other', use: 'storage' },
  ])
  renderPage()
  expect(await screen.findByRole('combobox', { name: 'To storage' })).toHaveTextContent('Choose…')
})

// @vitest-environment-options {"url": "http://localhost:4400/"}
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeMoveStockPage } from './cafe-move-stock-page'

const state = vi.hoisted(() => ({ offline: false, coverage: 'complete' as 'complete' | 'unallocated' | 'unavailable' }))
const reads = vi.hoisted(() => ({ items: vi.fn(), locations: vi.fn(), balances: vi.fn(), move: vi.fn(), setStream: vi.fn(), resolve: vi.fn(), adopt: vi.fn() }))
const stream = { branch: { id: 'branch-1', code: 'one', name: 'Branch One' }, activity: 'kitchen' as const }

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'person-1' }, accessRoles: ['admin'], affiliated: ['branch-1'], roles: [], isManager: false }, signOut: vi.fn() }),
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => state.offline }))
vi.mock('@/lib/cafe-affiliation', () => ({ canCaptureCafe: () => true }))
vi.mock('@/lib/use-cafe-stream', () => ({
  useCafeStream: () => ({
    options: [stream], stream, homeStream: stream, myStreamKeys: new Set(['branch-1:kitchen']),
    resolve: reads.resolve,
    adopt: reads.adopt, setStream: reads.setStream,
  }),
}))
vi.mock('@/lib/db/cafe-count', () => ({ listCafeCountableItems: reads.items }))
vi.mock('@/lib/db/cafe-locations', () => ({
  listCafeLocations: reads.locations, fetchCafeLocationBalances: reads.balances, moveCafeStock: reads.move,
}))

const renderPage = () => render(<MemoryRouter><CafeMoveStockPage /></MemoryRouter>)

beforeEach(() => {
  state.offline = false
  state.coverage = 'complete'
  reads.resolve.mockResolvedValue({ branches: [stream.branch], options: [stream], destinations: [], locationOptions: [stream], stream, homeStream: stream, myStreamKeys: new Set(['branch-1:kitchen']) })
  reads.items.mockResolvedValue([{ id: 'item-1', name: 'Coffee beans', category: 'Raw', kind: 'RAW', unitId: 'unit-1', unitName: 'kg' }])
  reads.locations.mockResolvedValue([
    { id: 'store-1', name: 'Store room', use: 'storage', archived_at: null },
    { id: 'store-2', name: 'Chiller', use: 'both', archived_at: null },
  ])
  reads.balances.mockImplementation(async () => ({
    rows: [{ location_id: 'store-1', item_id: 'item-1', item_unit_id: 'unit-1', usable_qty: '5', available_qty: '4.2500' }],
    as_of: '2026-10-10T10:00:00Z', coverage: state.coverage, reason: state.coverage === 'complete' ? null : 'opening_allocation_required',
  }))
  reads.move.mockResolvedValue({ movement_id: 'move-1', row_version: 1 })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Café Move stock', () => {
  it('keeps moves disabled and explains unallocated historical coverage', async () => {
    state.coverage = 'unallocated'
    const user = userEvent.setup()
    renderPage()
    expect((await screen.findAllByText(/Location coverage is unallocated/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Change location' })).toBeDisabled()
    expect(reads.move).not.toHaveBeenCalled()
    await user.click(screen.getByRole('combobox', { name: 'From storage' }))
    await user.click(screen.getByRole('option', { name: 'Store room' }))
    await user.click(screen.getByRole('combobox', { name: 'To storage' }))
    await user.click(screen.getByRole('option', { name: 'Chiller' }))
    expect(screen.getByRole('combobox', { name: 'Item' })).toBeDisabled()
  })

  it('validates source availability and posts a same-stream move with a retry key', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('combobox', { name: 'From storage' })
    await user.click(screen.getByRole('combobox', { name: 'From storage' }))
    await user.click(screen.getByRole('option', { name: 'Store room' }))
    await user.click(screen.getByRole('combobox', { name: 'To storage' }))
    await user.click(screen.getByRole('option', { name: 'Chiller' }))
    await user.click(screen.getByRole('combobox', { name: 'Item' }))
    await user.click(screen.getByRole('option', { name: 'Coffee beans' }))
    await user.type(screen.getByLabelText('Quantity'), '5')
    expect(await screen.findByRole('alert')).toHaveTextContent('The quantity exceeds stock available at the source location.')
    expect(screen.getByRole('button', { name: 'Change location' })).toBeDisabled()
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '1.25')
    await user.click(screen.getByRole('button', { name: 'Change location' }))
    expect(reads.move).toHaveBeenCalledWith({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, item_unit_id: 'unit-1', quantity: '1.25',
      from_location_id: 'store-1', to_location_id: 'store-2', movement_date: expect.any(String), note: null,
    }, { client_request_id: expect.any(String) })
    expect(await screen.findByText('Stock moved between locations.')).toBeInTheDocument()
  })
})

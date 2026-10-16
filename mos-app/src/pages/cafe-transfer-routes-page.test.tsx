import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeTransferRoutesPage } from './cafe-transfer-routes-page'

const HQ = { id: 'hq', code: 'gordi_hq', name: 'Gordi HQ' }
const RRS = { id: 'rrs', code: 'rumah_rames', name: 'Rumah Rames' }
const CIKAL = { id: 'cikal', code: 'cikal', name: 'Cikal' }
const auth = vi.hoisted(() => ({ roles: ['admin'] as string[] }))
const reads = vi.hoisted(() => ({ destinations: vi.fn(), pairs: vi.fn(), branches: vi.fn(), byIds: vi.fn() }))
const stubs = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: auth.roles, roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))
vi.mock('@/lib/db/kitchen-logs', () => ({ listCafeDestinations: reads.destinations, listStreamPairs: reads.pairs }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: reads.branches, listBranchesByIds: reads.byIds }))
// The disconnected stubs must never be reached from the screen.
vi.mock('@/lib/db/cafe-transfer-routes', () => ({
  listCafeTransferRoutes: stubs.list, createCafeTransferRoute: stubs.create, updateCafeTransferRoute: stubs.update, removeCafeTransferRoute: stubs.remove,
}))

const route = (o: string, a: 'kitchen' | 'bar', d: string) => ({ origin_branch_id: o, origin_activity: a, destination_branch_id: d })
const PAIRS = [
  { branch_id: 'hq', activity: 'kitchen', produces: true }, { branch_id: 'hq', activity: 'bar', produces: true },
  { branch_id: 'rrs', activity: 'kitchen', produces: true }, { branch_id: 'rrs', activity: 'bar', produces: true },
  { branch_id: 'cikal', activity: 'bar', produces: true },
]

function renderPage(search = '') {
  return render(<MemoryRouter initialEntries={[`/cafe/transfer-routes${search}`]}><CafeTransferRoutesPage /></MemoryRouter>)
}

beforeEach(() => {
  auth.roles = ['admin']
  reads.destinations.mockResolvedValue([route('hq', 'kitchen', 'cikal'), route('hq', 'kitchen', 'rrs')])
  reads.pairs.mockResolvedValue(PAIRS)
  reads.branches.mockResolvedValue([CIKAL, HQ, RRS])
  reads.byIds.mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Transfer routes (preview)', () => {
  it('lists the real stored routes with the floor alias and the built-in movements apart', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })).toBeInTheDocument()
    expect(screen.getAllByText('Gordi HQ · Kitchen').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Bungur/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Built-in movements' })).toBeInTheDocument()
    expect(screen.getByText(/Gordi HQ · Bar → Kitchen/)).toBeInTheDocument()
    expect(reads.destinations).toHaveBeenCalledTimes(1)
  })

  it('gives an admin Add route disabled with the reason, and never writes', async () => {
    const user = userEvent.setup()
    renderPage()
    const add = await screen.findByRole('button', { name: 'Add route' })
    expect(add).toBeDisabled()
    expect(screen.getAllByText('Route editing is not connected yet.').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Preview route form' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Preview route' })).toBeInTheDocument()
    expect(screen.getAllByText('Preview · not saved').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save route' })).toBeDisabled()
    for (const fn of Object.values(stubs)) expect(fn).not.toHaveBeenCalled()
  })

  it('offers only eligible destinations for the chosen origin and flags a duplicate', async () => {
    const user = userEvent.setup()
    renderPage('?route=new')
    await screen.findByRole('heading', { level: 2, name: 'Preview route' })
    const dialogRoot = screen.getByRole('group', { name: 'Preview route' })
    expect(within(dialogRoot).getByRole('combobox', { name: 'Destination branch' })).toBeDisabled()
    await user.click(within(dialogRoot).getByRole('combobox', { name: 'Origin stream' }))
    await user.click(await screen.findByRole('option', { name: 'Gordi HQ · Kitchen' }))
    await user.click(within(dialogRoot).getByRole('combobox', { name: 'Destination branch' }))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Cikal', 'Rumah Rames'])
    await user.click(screen.getByRole('option', { name: 'Cikal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This route already exists.')
  })

  it('shows a non-admin the routes read-only, with no edit entry points', async () => {
    auth.roles = ['member']
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })
    expect(screen.queryByRole('button', { name: 'Add route' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview route form' })).not.toBeInTheDocument()
    cleanup()
    renderPage('?route=hq:kitchen:cikal')
    expect(await screen.findByRole('heading', { level: 2, name: /Gordi HQ · Kitchen → Cikal/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Route' })).queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save route' })).not.toBeInTheDocument()
  })

  it('keeps an archived or unknown branch as Needs attention instead of dropping the route', async () => {
    reads.destinations.mockResolvedValue([route('hq', 'kitchen', 'old')])
    reads.byIds.mockResolvedValue([{ id: 'old', name: 'Old Branch' }])
    renderPage()
    expect(await screen.findByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Old Branch')).toBeInTheDocument()
  })

  it('says so, never an empty list, when the read fails', async () => {
    reads.destinations.mockRejectedValue(new Error('down'))
    renderPage()
    expect(await screen.findByText('Transfer routes could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText('No cross-branch routes configured')).not.toBeInTheDocument()
  })

  it('distinguishes a complete empty list (with a disabled Add for an admin)', async () => {
    reads.destinations.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No cross-branch routes configured')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add route' }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
})

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeTransferRoutesPage } from './cafe-transfer-routes-page'

const HQ = { id: 'hq', code: 'gordi_hq', name: 'Gordi HQ' }
const RRS = { id: 'rrs', code: 'rumah_rames', name: 'Rumah Rames' }
const CIKAL = { id: 'cikal', code: 'cikal', name: 'Cikal' }
const auth = vi.hoisted(() => ({ roles: ['admin'] as string[] }))
const reads = vi.hoisted(() => ({ routes: vi.fn(), pairs: vi.fn(), branches: vi.fn(), byIds: vi.fn(), esb: vi.fn() }))
const writes = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), setEsb: vi.fn() }))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: auth.roles, roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))
vi.mock('@/lib/db/kitchen-logs', () => ({ listStreamPairs: reads.pairs }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: reads.branches, listBranchesByIds: reads.byIds }))
vi.mock('@/lib/db/cafe-transfer-routes', () => ({
  listCafeTransferRoutes: reads.routes,
  createCafeTransferRoute: writes.create,
  updateCafeTransferRoute: writes.update,
  removeCafeTransferRoute: writes.remove,
  listCafeRouteEsbSwitches: reads.esb,
  setCafeRouteRecordInEsb: writes.setEsb,
}))

const route = (
  origin: string,
  activity: 'kitchen' | 'bar',
  destination: string,
  rowVersion = 1,
  eligibility: 'eligible' | 'needs_attention' = 'eligible',
  reason: string | null = null,
) => ({
  origin_branch_id: origin,
  origin_activity: activity,
  destination_branch_id: destination,
  row_version: rowVersion,
  updated_at: '2026-10-10T00:00:00Z',
  updated_by: 'admin-person',
  eligibility,
  reason,
})
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
  reads.routes.mockResolvedValue([route('hq', 'kitchen', 'cikal')])
  reads.pairs.mockResolvedValue(PAIRS)
  reads.branches.mockResolvedValue([CIKAL, HQ, RRS])
  reads.byIds.mockResolvedValue([])
  reads.esb.mockResolvedValue([{ origin_branch_id: 'hq', origin_activity: 'kitchen', destination_branch_id: 'cikal', record_in_esb: false }])
  writes.setEsb.mockResolvedValue(true)
  writes.create.mockResolvedValue(route('rrs', 'kitchen', 'hq', 1))
  writes.update.mockImplementation(async (_key, _version, input) => ({ ...input, row_version: 2, updated_at: '2026-10-10T00:01:00Z', updated_by: 'admin-person', eligibility: 'eligible', reason: null }))
  writes.remove.mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Transfer routes', () => {
  it('lists the org allowlist by branch name and built-in movements separately', async () => {
    reads.routes.mockResolvedValue([route('hq', 'kitchen', 'rrs')])
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })).toBeInTheDocument()
    expect(screen.getAllByText('Gordi HQ · Kitchen').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rumah Rames').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Bungur/)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Built-in movements' })).toBeInTheDocument()
    expect(screen.getByText(/Gordi HQ · Bar → Kitchen/)).toBeInTheDocument()
    expect(reads.routes).toHaveBeenCalledTimes(1)
  })

  it('lets an admin add an eligible route and then sees it in the allowlist', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })
    await user.click((await screen.findAllByRole('button', { name: 'Add route' }))[0])
    const form = await screen.findByRole('group', { name: 'Add route' })
    await user.click(within(form).getByRole('combobox', { name: 'Origin stream' }))
    await user.click(await screen.findByRole('option', { name: 'Rumah Rames · Kitchen' }))
    await user.click(within(form).getByRole('combobox', { name: 'Destination branch' }))
    await user.click(await screen.findByRole('option', { name: 'Gordi HQ' }))
    await user.click(screen.getByRole('button', { name: 'Save route' }))

    expect(writes.create).toHaveBeenCalledWith({
      origin_branch_id: 'rrs', origin_activity: 'kitchen', destination_branch_id: 'hq',
    }, expect.objectContaining({ client_request_id: expect.any(String) }))
    expect(await screen.findByRole('link', { name: 'View: Rumah Rames · Kitchen → Gordi HQ' })).toBeInTheDocument()
  })

  it('offers only eligible destinations and blocks a duplicate route', async () => {
    const user = userEvent.setup()
    reads.routes.mockResolvedValue([route('hq', 'kitchen', 'cikal'), route('hq', 'kitchen', 'rrs')])
    renderPage('?route=new')
    const form = await screen.findByRole('group', { name: 'Add route' })
    await user.click(within(form).getByRole('combobox', { name: 'Origin stream' }))
    await user.click(await screen.findByRole('option', { name: 'Gordi HQ · Kitchen' }))
    await user.click(within(form).getByRole('combobox', { name: 'Destination branch' }))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Cikal', 'Rumah Rames'])
    await user.click(screen.getByRole('option', { name: 'Cikal' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This route already exists.')
    expect(screen.getByRole('button', { name: 'Save route' })).toBeDisabled()
    expect(writes.create).not.toHaveBeenCalled()
  })

  it('lets an admin update an eligible route with its current version', async () => {
    const user = userEvent.setup()
    reads.routes.mockResolvedValue([route('hq', 'kitchen', 'cikal', 7)])
    renderPage()
    await user.click(await screen.findByRole('link', { name: 'View: Gordi HQ · Kitchen → Cikal' }))
    const form = await screen.findByRole('group', { name: 'Add route' })
    await user.click(within(form).getByRole('combobox', { name: 'Destination branch' }))
    await user.click(await screen.findByRole('option', { name: 'Rumah Rames' }))
    await user.click(screen.getByRole('button', { name: 'Save route' }))

    expect(writes.update).toHaveBeenCalledWith({
      origin_branch_id: 'hq', origin_activity: 'kitchen', destination_branch_id: 'cikal',
    }, 7, { origin_branch_id: 'hq', origin_activity: 'kitchen', destination_branch_id: 'rrs' },
    expect.objectContaining({ client_request_id: expect.any(String) }))
    expect(await screen.findByRole('link', { name: 'View: Gordi HQ · Kitchen → Rumah Rames' })).toBeInTheDocument()
  })

  it('disables a route while preserving existing records in the view', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('link', { name: 'View: Gordi HQ · Kitchen → Cikal' }))
    await user.click(screen.getByRole('button', { name: 'Disable route' }))

    expect(writes.remove).toHaveBeenCalledWith({
      origin_branch_id: 'hq', origin_activity: 'kitchen', destination_branch_id: 'cikal',
    }, 1, expect.objectContaining({ client_request_id: expect.any(String) }))
    expect(await screen.findByText('No cross-branch routes configured')).toBeInTheDocument()
  })

  it('shows members the route list without edit controls', async () => {
    auth.roles = ['member']
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })
    expect(screen.queryByRole('button', { name: 'Add route' })).not.toBeInTheDocument()
    await userEvent.setup().click(await screen.findByRole('link', { name: 'View: Gordi HQ · Kitchen → Cikal' }))
    expect(within(screen.getByRole('region', { name: 'Route' })).queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save route' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disable route' })).not.toBeInTheDocument()
  })

  it('keeps an archived branch visible as Needs attention', async () => {
    reads.routes.mockResolvedValue([route('hq', 'kitchen', 'old', 1, 'needs_attention', 'destination_unknown')])
    reads.byIds.mockResolvedValue([{ id: 'old', name: 'Old Branch' }])
    renderPage()
    expect(await screen.findByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Old Branch')).toBeInTheDocument()
  })

  it('shows an error rather than an empty list when routes cannot be read', async () => {
    reads.routes.mockRejectedValue(new Error('down'))
    renderPage()
    expect(await screen.findByText('Transfer routes could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText('No cross-branch routes configured')).not.toBeInTheDocument()
  })

  it('offers Add route from the complete empty state', async () => {
    const user = userEvent.setup()
    reads.routes.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No cross-branch routes configured')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Add route' })[0])
    expect(await screen.findByRole('heading', { level: 2, name: 'Add route' })).toBeInTheDocument()
  })
})

describe('Record in ESB switch (admins only, off by default)', () => {
  it('lets an admin see a route is off and turn it on', async () => {
    const user = userEvent.setup()
    renderPage('?route=hq:kitchen:cikal')
    const box = await screen.findByRole('switch', { name: 'Record in ESB' })
    expect(box).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/not sent to ESB/)).toBeInTheDocument()
    await user.click(box)
    expect(writes.setEsb).toHaveBeenCalledWith({ origin_branch_id: 'hq', origin_activity: 'kitchen', destination_branch_id: 'cikal' }, true)
    expect(await screen.findByRole('switch', { name: 'Record in ESB' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/are sent to ESB/)).toBeInTheDocument()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('UI half of AC-011: a non-admin never sees the switch and the page never asks for it', async () => {
    auth.roles = ['ops_lead']
    renderPage('?route=hq:kitchen:cikal')
    await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })
    expect(screen.queryByRole('switch', { name: 'Record in ESB' })).toBeNull()
    expect(screen.queryByText('Record in ESB')).toBeNull()
    expect(reads.esb).not.toHaveBeenCalled()
  })

  it('hides the control when the server refuses the read, and keeps the routes', async () => {
    reads.esb.mockRejectedValue(new Error('forbidden'))
    renderPage('?route=hq:kitchen:cikal')
    await screen.findByRole('heading', { level: 1, name: 'Transfer routes' })
    expect(screen.queryByRole('switch', { name: 'Record in ESB' })).toBeNull()
    expect(screen.getAllByText('Gordi HQ · Kitchen').length).toBeGreaterThan(0)
  })
})

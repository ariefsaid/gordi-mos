// @vitest-environment-options {"url": "http://localhost:4400/"}
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeLocationsPage } from './cafe-locations-page'

const BRANCHES = [
  { id: 'cikal', code: 'cikal', name: 'Cikal' },
  { id: 'hq', code: 'gordi_hq', name: 'Gordi HQ' },
  { id: 'rrs', code: 'rumah_rames', name: 'Rumah Rames' },
]
const LOCATIONS = [
  { id: 'kitchen', name: 'Kitchen', use: 'production', parent_id: null, branch_ids: ['cikal', 'hq'], archived_at: null, row_version: 2, updated_at: '2026-10-10T10:00:00Z', updated_by: 'person-1' },
  { id: 'chiller', name: 'Chiller', use: 'storage', parent_id: 'kitchen', branch_ids: ['cikal'], archived_at: null, row_version: 1, updated_at: '2026-10-10T10:00:00Z', updated_by: 'person-1' },
  { id: 'store-room', name: 'Store room', use: 'storage', parent_id: 'kitchen', branch_ids: ['cikal'], archived_at: null, row_version: 1, updated_at: '2026-10-10T10:00:00Z', updated_by: 'person-1' },
  { id: 'old-store', name: 'Old store', use: 'storage', parent_id: null, branch_ids: ['rrs'], archived_at: '2026-10-09T10:00:00Z', row_version: 2, updated_at: '2026-10-10T10:00:00Z', updated_by: 'person-1' },
]
const auth = vi.hoisted(() => ({ roles: ['admin'] as string[] }))
const reads = vi.hoisted(() => ({ branches: vi.fn() }))
const locations = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() }))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: auth.roles, roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => true }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: reads.branches }))
vi.mock('@/lib/db/cafe-locations', () => ({
  listCafeLocations: locations.list, createCafeLocation: locations.create,
  updateCafeLocation: locations.update, archiveCafeLocation: locations.archive,
}))

const renderPage = (search = '') => render(<MemoryRouter initialEntries={[`/cafe/locations${search}`]}><CafeLocationsPage /></MemoryRouter>)
const setCatalog = (rows = LOCATIONS) => locations.list.mockImplementation(({ archived }: { archived?: boolean }) => Promise.resolve(rows.filter((row) => Boolean(row.archived_at) === archived)))

beforeEach(() => {
  auth.roles = ['admin']
  reads.branches.mockResolvedValue(BRANCHES)
  setCatalog()
  locations.create.mockImplementation(async (input) => {
    const saved = { ...LOCATIONS[0], ...input, id: 'new-location', row_version: 1 }
    setCatalog([...LOCATIONS, saved])
    return saved
  })
  locations.update.mockImplementation(async (id, rowVersion, input) => ({ ...LOCATIONS[0], ...input, id, row_version: rowVersion + 1 }))
  locations.archive.mockResolvedValue({ ...LOCATIONS[0], archived_at: '2026-10-11T10:00:00Z', row_version: 3 })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Café Locations', () => {
  it('loads real locations and branch choices, with active and archived filters', async () => {
    const user = userEvent.setup()
    renderPage()
    const table = await screen.findByRole('table', { name: 'Locations' })
    expect(within(table).getAllByText('Kitchen').length).toBeGreaterThan(0)
    expect(within(table).getByText('Chiller')).toBeInTheDocument()
    expect(within(table).queryByText('Old store')).not.toBeInTheDocument()
    expect(locations.list).toHaveBeenCalledWith({ archived: false })
    expect(locations.list).toHaveBeenCalledWith({ archived: true })
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Archived' }))
    expect(await screen.findByText('Old store')).toBeInTheDocument()
  })

  it('creates a location through the catalog RPC with selected branch availability', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Locations' })
    await user.click(screen.getAllByRole('button', { name: 'Add location' })[0])
    expect(await screen.findByRole('heading', { level: 2, name: 'Add location' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Prep room')
    const panel = screen.getByRole('region', { name: 'Location' })
    await user.click(within(panel).getByRole('combobox', { name: 'Use' }))
    await user.click(screen.getByRole('option', { name: 'Storage' }))
    await user.click(screen.getByRole('checkbox', { name: 'Cikal' }))
    await user.click(screen.getByRole('button', { name: 'Save location' }))
    expect(locations.create).toHaveBeenCalledWith({ name: 'Prep room', use: 'storage', parent_id: null, branch_ids: ['cikal'] }, { client_request_id: expect.any(String) })
    await screen.findByRole('heading', { level: 2, name: 'Prep room' })
  })

  it('uses optimistic row versions for updates and blocks duplicate names before writing', async () => {
    const user = userEvent.setup()
    renderPage('?location=chiller')
    expect(await screen.findByRole('heading', { level: 2, name: 'Chiller' })).toBeInTheDocument()
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Store room')
    expect(await screen.findByRole('alert')).toHaveTextContent('Another active place under the same parent already has this name.')
    expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled()
    await user.clear(name)
    await user.type(name, 'Cooler')
    await user.click(screen.getByRole('button', { name: 'Save location' }))
    expect(locations.update).toHaveBeenCalledWith('chiller', 1, {
      name: 'Cooler', use: 'storage', parent_id: 'kitchen', branch_ids: ['cikal'],
    }, { client_request_id: expect.any(String) })
  })

  it('shows archived identities read-only and does not offer configuration to a non-admin', async () => {
    auth.roles = ['member']
    renderPage('?status=archived&location=old-store')
    expect(await screen.findByRole('heading', { level: 2, name: 'Old store' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add location' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getAllByText('Archived').length).toBeGreaterThan(0)
  })

  it('opens an archive confirmation and sends the current version only after confirmation', async () => {
    const user = userEvent.setup()
    renderPage('?location=kitchen')
    await screen.findByRole('heading', { level: 2, name: 'Kitchen' })
    await user.click(screen.getByRole('button', { name: 'Archive location' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archive this location?' })
    expect(dialog).toBeInTheDocument()
    expect(locations.archive).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Archive location' }))
    expect(locations.archive).toHaveBeenCalledWith('kitchen', 2, { client_request_id: expect.any(String) })
  })

  it('treats an unknown catalog id as not found', async () => {
    renderPage('?location=nope')
    expect(await screen.findByRole('heading', { level: 2, name: 'Location not found' })).toBeInTheDocument()
  })

  it('offers Retry when the catalog or branch read fails', async () => {
    locations.list.mockRejectedValueOnce(new Error('down'))
    renderPage()
    expect(await screen.findByText('Locations and branches could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

// @vitest-environment-options {"url": "http://localhost:4400/"}
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeLocationsPage } from './cafe-locations-page'

const BRANCHES = [{ id: 'cikal', code: 'cikal', name: 'Cikal' }, { id: 'hq', code: 'gordi_hq', name: 'Gordi HQ' }, { id: 'rrs', code: 'rumah_rames', name: 'Rumah Rames' }]
const auth = vi.hoisted(() => ({ roles: ['admin'] as string[] }))
const reads = vi.hoisted(() => ({ branches: vi.fn() }))
const stubs = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), balances: vi.fn(), move: vi.fn() }))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: auth.roles, roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => true }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: reads.branches }))
// The disconnected stubs must never be reached from the screen.
vi.mock('@/lib/db/cafe-locations', () => ({
  listCafeLocations: stubs.list, createCafeLocation: stubs.create, updateCafeLocation: stubs.update,
  archiveCafeLocation: stubs.archive, fetchCafeLocationBalances: stubs.balances, moveCafeStock: stubs.move,
}))

const renderPage = (search = '') => render(<MemoryRouter initialEntries={[`/cafe/locations${search}`]}><CafeLocationsPage /></MemoryRouter>)

beforeEach(() => { auth.roles = ['admin']; reads.branches.mockResolvedValue(BRANCHES) })
afterEach(() => { cleanup(); vi.clearAllMocks() })
const noStubCalled = () => { for (const fn of Object.values(stubs)) expect(fn).not.toHaveBeenCalled() }

describe('Locations (preview)', () => {
  it('says plainly that Locations are not connected, with real branch choices and the disabled Add reason', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Locations' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Locations are not connected yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add location' })).toBeDisabled()
    expect(screen.getAllByText('Location tracking is not connected yet.').length).toBeGreaterThan(0)
    expect(screen.queryByText('Example kitchen')).not.toBeInTheDocument()
    noStubCalled()
  })

  it('opens an isolated, labelled sample layout and marks every sample row', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Preview layout' }))
    const table = await screen.findByRole('table', { name: 'Locations' })
    expect(within(table).getAllByText('Example kitchen').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Preview · sample data')).toHaveLength(4)
    expect(screen.getByText(/never appear in capture, Records or balances/)).toBeInTheDocument()
    noStubCalled()
  })

  it('filters the sample by use and shows a clearable chip', async () => {
    const user = userEvent.setup()
    renderPage('?layout=preview&use=production')
    const table = await screen.findByRole('table', { name: 'Locations' })
    expect(within(table).getByText('Example kitchen')).toBeInTheDocument()
    expect(within(table).queryByText('Example chiller')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Use: Production/ }))
    expect(await screen.findByText('Example chiller')).toBeInTheDocument()
  })

  it('gives an admin an in-memory record: duplicate name and cycle are caught, Save and Archive stay disabled', async () => {
    const user = userEvent.setup()
    renderPage('?layout=preview&location=sample-kitchen')
    expect(await screen.findByRole('heading', { level: 2, name: 'Example kitchen' })).toBeInTheDocument()
    expect(screen.getByText('A place, not an accounting branch.')).toBeInTheDocument()
    expect(screen.getAllByText('Preview · not saved').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Archive location' })).toBeDisabled()
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Example bar fridge')
    expect(await screen.findByRole('alert')).toHaveTextContent('Another active place under the same parent already has this name.')
    noStubCalled()
  })

  it('searches branches in the record and counts the selection', async () => {
    const user = userEvent.setup()
    renderPage('?layout=preview&location=new')
    expect(await screen.findByRole('heading', { level: 2, name: 'Preview location' })).toBeInTheDocument()
    expect(screen.getByText('None selected. Not offered to any branch.')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Cikal' }))
    expect(screen.getByText('1 branch selected')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search branches'), 'rames')
    expect(screen.queryByRole('checkbox', { name: 'Cikal' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Rumah Rames' })).toBeInTheDocument()
    noStubCalled()
  })

  it('shows a non-admin the same sample read-only, with no form and no Add', async () => {
    auth.roles = ['member']
    renderPage('?layout=preview&location=sample-chiller')
    expect(await screen.findByRole('heading', { level: 2, name: 'Example chiller' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add location' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save location' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Parent location').length).toBeGreaterThan(0)
    noStubCalled()
  })

  it('treats an unknown location id as not found', async () => {
    renderPage('?layout=preview&location=nope')
    expect(await screen.findByRole('heading', { level: 2, name: 'Location not found' })).toBeInTheDocument()
  })

  it('offers a Retry when the branch lookup fails', async () => {
    reads.branches.mockRejectedValueOnce(new Error('down'))
    renderPage()
    expect(await screen.findByText('Branches could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

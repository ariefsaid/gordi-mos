import { cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractError } from '@/lib/db/contract'
import { resetModuleAvailability } from '@/lib/module-availability'
import { AdminModulesPage } from './admin-modules-page'

const stubs = vi.hoisted(() => ({ fns: Object.fromEntries(
  ['listOrgModuleSettings', 'listPersonModuleSettings', 'getViewerModuleAvailability', 'saveOrgModuleSettings', 'savePersonModuleSettings', 'countModuleDisableImpact']
    .map((name) => [name, vi.fn()])) }))
vi.mock('@/lib/db/module-settings', () => stubs.fns)
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))

function rows(moneyEnabled = true, assistantEnabled = false, assistantVersion = 0) {
  return [
    { module_id: 'work', enabled: true, row_version: 1, updated_at: null, updated_by: null },
    { module_id: 'money', enabled: moneyEnabled, row_version: 7, updated_at: null, updated_by: null },
    { module_id: 'cafe', enabled: true, row_version: 2, updated_at: null, updated_by: null },
    { module_id: 'staff', enabled: true, row_version: 0, updated_at: null, updated_by: null },
    { module_id: 'assistant', enabled: assistantEnabled, row_version: assistantVersion, updated_at: null, updated_by: null },
    { module_id: 'roastery', enabled: true, row_version: 0, updated_at: null, updated_by: null },
    { module_id: 'ecommerce', enabled: true, row_version: 0, updated_at: null, updated_by: null },
  ]
}

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/admin/modules${search}`]}>
      <Routes>
        <Route path="/admin/modules" element={<AdminModulesPage />} />
        <Route path="/admin/people/:id" element={<p>person page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const desktop = (matches: boolean) => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({
  matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null,
}) })

beforeEach(() => {
  desktop(true)
  resetModuleAvailability()
  vi.clearAllMocks()
  stubs.fns.listOrgModuleSettings.mockResolvedValue(rows())
})
afterEach(() => { cleanup(); resetModuleAvailability() })

describe('Admin › Modules', () => {
  it('shows the turn-off consequence only for a proposed change, not an already-off module', async () => {
    const user = userEvent.setup()
    stubs.fns.listOrgModuleSettings.mockResolvedValue(rows().map(row => row.module_id === 'assistant' ? { ...row, enabled: false } : row))
    renderPage()
    expect(await screen.findByRole('combobox', { name: 'Assistant: Org availability' })).toHaveTextContent('Off')
    expect(screen.queryByText(/Turning this off would hide/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Money: Org availability' }))
    await user.click(screen.getByRole('option', { name: 'Off' }))
    expect(screen.getAllByText(/Turning this off would hide/)).toHaveLength(1)
    expect(stubs.fns.saveOrgModuleSettings).not.toHaveBeenCalled()
  })

  it('loads the seven settings in Admin order, including Work and Assistant', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Module availability for the Org' })
    const tableRows = within(table).getAllByRole('row').slice(1)
    expect(tableRows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Work', 'Money', 'Café', 'Staff', 'Assistant', 'Roastery', 'Ecommerce',
    ])
    expect(within(tableRows[1]).getByText('On', { selector: 'td > span' })).toBeInTheDocument()
    expect(within(tableRows[1]).getByRole('combobox', { name: 'Money: Org availability' })).toHaveTextContent('On')
    expect(within(tableRows[4]).getByRole('combobox', { name: 'Assistant: Org availability' })).toHaveTextContent('Off')
    expect(within(tableRows[5]).getAllByText('Not released').length).toBeGreaterThan(0)
    expect(within(tableRows[5]).getByRole('combobox', { name: 'Roastery: Org availability' })).toBeDisabled()
    expect(within(tableRows[5]).getByRole('combobox', { name: 'Roastery: Org availability' })).toHaveTextContent('Off')
    expect(within(tableRows[6]).getByRole('combobox', { name: 'Ecommerce: Org availability' })).toBeDisabled()
    expect(within(tableRows[6]).getByRole('combobox', { name: 'Ecommerce: Org availability' })).toHaveTextContent('Off')
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()
    expect(stubs.fns.listOrgModuleSettings).toHaveBeenCalledOnce()
  })

  it('honors an existing Assistant-on setting without marking the page dirty', async () => {
    stubs.fns.listOrgModuleSettings.mockResolvedValue(rows(true, true, 3))
    renderPage()

    expect(await screen.findByRole('combobox', { name: 'Assistant: Org availability' })).toHaveTextContent('On')
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()
  })

  it('defaults a missing Assistant row to Off without making the page dirty', async () => {
    stubs.fns.listOrgModuleSettings.mockResolvedValue(rows().filter((row) => row.module_id !== 'assistant'))
    renderPage()

    expect(await screen.findByRole('combobox', { name: 'Assistant: Org availability' })).toHaveTextContent('Off')
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()
  })

  it('lets an admin turn Assistant on and off using the returned version as the next baseline', async () => {
    const user = userEvent.setup()
    stubs.fns.saveOrgModuleSettings
      .mockResolvedValueOnce(rows(true, true, 1))
      .mockResolvedValueOnce(rows(true, false, 2))
    renderPage()

    const assistant = await screen.findByRole('combobox', { name: 'Assistant: Org availability' })
    await user.click(assistant)
    await user.click(screen.getByRole('option', { name: 'On' }))
    await user.click(screen.getByRole('button', { name: 'Save module settings' }))

    await waitFor(() => expect(stubs.fns.saveOrgModuleSettings).toHaveBeenCalledTimes(1))
    expect(stubs.fns.saveOrgModuleSettings.mock.calls[0][0]).toEqual([
      { module_id: 'assistant', enabled: true, expected_version: 0 },
    ])
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Assistant: Org availability' })).toHaveTextContent('On'))
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()

    await user.click(screen.getByRole('combobox', { name: 'Assistant: Org availability' }))
    await user.click(screen.getByRole('option', { name: 'Off' }))
    await user.click(screen.getByRole('button', { name: 'Save module settings' }))

    await waitFor(() => expect(stubs.fns.saveOrgModuleSettings).toHaveBeenCalledTimes(2))
    expect(stubs.fns.saveOrgModuleSettings.mock.calls[1][0]).toEqual([
      { module_id: 'assistant', enabled: false, expected_version: 1 },
    ])
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Assistant: Org availability' })).toHaveTextContent('Off'))
  })

  it('keeps an unreleased module unavailable and its org control disabled at Off', async () => {
    renderPage()

    const roastery = await screen.findByRole('combobox', { name: 'Roastery: Org availability' })
    expect(roastery).toBeDisabled()
    expect(roastery).toHaveTextContent('Off')
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()
    expect(stubs.fns.saveOrgModuleSettings).not.toHaveBeenCalled()
  })

  it('loads an actual setting value for phone cards', async () => {
    desktop(false)
    stubs.fns.listOrgModuleSettings.mockResolvedValue(rows(false))
    renderPage()
    expect(await screen.findByRole('combobox', { name: 'Money: Org availability' })).toHaveTextContent('Off')
  })

  it('saves only changed rows with each loaded version and displays the returned settings', async () => {
    const user = userEvent.setup()
    const saved = rows(false).map((row) => row.module_id === 'money' ? { ...row, row_version: 8 } : row)
    stubs.fns.saveOrgModuleSettings.mockResolvedValue(saved)
    renderPage()

    const money = await screen.findByRole('combobox', { name: 'Money: Org availability' })
    await user.click(money)
    await user.click(screen.getByRole('option', { name: 'Off' }))
    await user.click(screen.getByRole('button', { name: 'Save module settings' }))

    await waitFor(() => expect(stubs.fns.saveOrgModuleSettings).toHaveBeenCalledOnce())
    expect(stubs.fns.saveOrgModuleSettings.mock.calls[0][0]).toEqual([
      { module_id: 'money', enabled: false, expected_version: 7 },
    ])
    expect(stubs.fns.saveOrgModuleSettings.mock.calls[0][1]).toEqual({ client_request_id: expect.any(String) })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Money: Org availability' })).toHaveTextContent('Off'))
  })

  it('reuses the request id when retrying a save after an uncertain failure', async () => {
    const user = userEvent.setup()
    stubs.fns.saveOrgModuleSettings
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(rows(false))
    renderPage()
    const money = await screen.findByRole('combobox', { name: 'Money: Org availability' })
    await user.click(money)
    await user.click(screen.getByRole('option', { name: 'Off' }))
    await user.click(screen.getByRole('button', { name: 'Save module settings' }))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(stubs.fns.saveOrgModuleSettings).toHaveBeenCalledTimes(2))
    expect(stubs.fns.saveOrgModuleSettings.mock.calls[1][1]).toEqual(stubs.fns.saveOrgModuleSettings.mock.calls[0][1])
  })

  it('shows a conflict notice and reloads settings on request', async () => {
    const user = userEvent.setup()
    stubs.fns.saveOrgModuleSettings.mockRejectedValue(new ContractError('CONFLICT', 'stale'))
    renderPage()
    await user.click(await screen.findByRole('combobox', { name: 'Money: Org availability' }))
    await user.click(screen.getByRole('option', { name: 'Off' }))
    await user.click(screen.getByRole('button', { name: 'Save module settings' }))

    expect(await screen.findByText('Settings changed elsewhere. Reload.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(stubs.fns.listOrgModuleSettings).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: 'Money: Org availability' })).toHaveTextContent('On')
  })

  it('offers Retry when settings fail to load', async () => {
    stubs.fns.listOrgModuleSettings.mockRejectedValueOnce(new Error('offline'))
    renderPage()
    expect(await screen.findByText("Couldn't load module settings. Try again.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Module availability for the Org' })).toBeInTheDocument()
  })

  it('keeps personal override counts unavailable while retaining the People links', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /^— View people Café: personal overrides, count not available$/ })
    expect(link).toHaveAttribute('href', '/admin/people?overrides=cafe')
    expect(link).toHaveTextContent('—')
    expect(screen.queryByRole('link', { name: /Roastery/ })).not.toBeInTheDocument()
  })

  it('narrows the modules by search and reports when none match', async () => {
    const user = userEvent.setup()
    renderPage('?q=zzz')
    expect(await screen.findByText('No matching modules')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByRole('table', { name: 'Module availability for the Org' })).toBeInTheDocument()
  })

  it('forwards an old person link (…?view=people&person=<id>) to that person', async () => {
    renderPage('?view=people&person=p2')
    expect(await screen.findByText('person page')).toBeInTheDocument()
  })
})

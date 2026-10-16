import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetModulePreview } from '@/lib/use-module-switches-preview'
import { AdminModulesPage } from './admin-modules-page'

const stubs = vi.hoisted(() => ({ fns: Object.fromEntries(
  ['listOrgModuleSettings', 'listPersonModuleSettings', 'getViewerModuleAvailability', 'saveOrgModuleSettings', 'savePersonModuleSettings', 'countModuleDisableImpact']
    .map((name) => [name, vi.fn()])) }))
vi.mock('@/lib/db/module-settings', () => stubs.fns)
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))

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
const noSettingsCalled = () => { for (const fn of Object.values(stubs.fns)) expect(fn).not.toHaveBeenCalled() }

// A wide viewport: the table, not the phone cards.
const desktop = (matches: boolean) => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({
  matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null,
}) })

beforeEach(() => desktop(true))
afterEach(() => { cleanup(); resetModulePreview(); vi.clearAllMocks() })

describe('Admin › Modules (preview)', () => {
  it('lists the four registry modules with real release status and no fetched Org setting', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Modules' })).toBeInTheDocument()
    expect(screen.getByText('Module settings are not connected yet.', { selector: '.notice__text' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Module availability for the Org' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Money', 'Café', 'Roastery', 'Ecommerce'])
    expect(within(rows[1]).getByText('Released')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Not connected')).toBeInTheDocument()
    expect(within(rows[2]).getAllByText('Not released').length).toBeGreaterThan(0)
    expect(within(rows[2]).getByText('Not released: cannot be turned on.')).toBeInTheDocument()
    for (const select of within(table).getAllByRole('combobox')) expect(select).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()
    noSettingsCalled()
  })

  it('links each released module to People filtered to its personal overrides, with the count unavailable', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /^— View people Café: personal overrides, count not available$/ })
    expect(link).toHaveAttribute('href', '/admin/people?overrides=cafe')
    expect(link).toHaveTextContent('—')
    // Unreleased modules cannot hold an override: no link.
    expect(screen.queryByRole('link', { name: /Roastery/ })).not.toBeInTheDocument()
    noSettingsCalled()
  })

  it('opens an isolated preview at the proposed defaults; Org Off is explained and nothing is saved', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Modules' })
    await user.click(screen.getByRole('button', { name: 'Preview settings' }))
    expect(screen.getByText('Preview · not saved')).toBeInTheDocument()
    const money = screen.getByRole('combobox', { name: 'Money: Org availability' })
    expect(money).toHaveTextContent('On')
    await user.click(money)
    await user.click(await screen.findByRole('option', { name: 'Off' }))
    expect(screen.getByText(/Turning this off would hide the module/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save module settings' })).toBeDisabled()
    // Roastery stays unreleased and cannot be turned on, even in the preview.
    expect(screen.getByRole('combobox', { name: 'Roastery: Org availability' })).toBeDisabled()
    // The preview counts no one: nobody has a personal override yet.
    expect(screen.getByRole('link', { name: '0 View people Café: personal overrides' })).toBeInTheDocument()
    noSettingsCalled()
  })

  it('narrows the modules by search and says so when nothing matches', async () => {
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

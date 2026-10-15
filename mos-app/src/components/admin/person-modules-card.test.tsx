import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { resetModulePreview } from '@/lib/use-module-switches-preview'
import { PersonModulesCard } from './person-modules-card'

const stubs = vi.hoisted(() => ({ fns: Object.fromEntries(
  ['listOrgModuleSettings', 'listPersonModuleSettings', 'getViewerModuleAvailability', 'saveOrgModuleSettings', 'savePersonModuleSettings', 'countModuleDisableImpact']
    .map((name) => [name, vi.fn()])) }))
vi.mock('@/lib/db/module-settings', () => stubs.fns)

const person = (roles: string[]): AdminPersonRow => ({
  id: 'p1', full_name: 'Bayu Barista', email: 'bayu@x.test', archived_at: null, login: 'active', access_roles: roles, jabatan: [], revenue_scope: [], teams: [],
})
const renderCard = (roles: string[]) => render(<MemoryRouter><PersonModulesCard person={person(roles)} /></MemoryRouter>)
const row = (name: string) => screen.getAllByRole('listitem').find((item) => within(item).queryByText(name, { selector: '.person-card__name' }))!

afterEach(() => {
  cleanup(); resetModulePreview(); vi.clearAllMocks()
})

describe("A person's Modules (preview)", () => {
  it('states only what is real: release and access level; the Org switch and personal setting are not connected', () => {
    renderCard(['member'])
    expect(within(row('Money')).getByText('Access level required')).toBeInTheDocument()
    expect(within(row('Roastery')).getByText('Not released')).toBeInTheDocument()
    expect(within(row('Café')).getByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Save person's modules" })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Org switches' })).toHaveAttribute('href', '/admin/modules')
    for (const fn of Object.values(stubs.fns)) expect(fn).not.toHaveBeenCalled()
  })

  it('previews Allow and Block in memory; Allow never grants what the access level withholds', async () => {
    const user = userEvent.setup()
    renderCard(['member'])
    await user.click(screen.getByRole('button', { name: 'Preview settings' }))
    expect(screen.getByText('Preview · not saved')).toBeInTheDocument()
    expect(within(row('Café')).getByText('Available')).toBeInTheDocument()
    await user.click(within(row('Money')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Allow' }))
    expect(within(row('Money')).getByText('Access level required')).toBeInTheDocument()
    await user.click(within(row('Café')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Block' }))
    expect(within(row('Café')).getByText('Blocked for this person')).toBeInTheDocument()
    // Not released modules have no control at all.
    expect(within(row('Roastery')).queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Save person's modules" })).toBeDisabled()
    for (const fn of Object.values(stubs.fns)) expect(fn).not.toHaveBeenCalled()
  })

  it('leaves the preview and forgets it', async () => {
    const user = userEvent.setup()
    renderCard(['member'])
    await user.click(screen.getByRole('button', { name: 'Preview settings' }))
    await user.click(screen.getByRole('button', { name: 'Leave preview' }))
    expect(screen.queryByText('Preview · not saved')).not.toBeInTheDocument()
    expect(within(row('Café')).getByText('Not connected')).toBeInTheDocument()
  })
})

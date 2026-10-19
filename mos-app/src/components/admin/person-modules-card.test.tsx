import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ModuleId, PersonModuleSetting } from '@/lib/db/module-settings'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { PersonModulesCard } from './person-modules-card'

const stubs = vi.hoisted(() => ({ fns: Object.fromEntries(
  ['listPersonModuleSettings', 'savePersonModuleSettings']
    .map((name) => [name, vi.fn()])) }))
vi.mock('@/lib/db/module-settings', () => stubs.fns)

const ids: ModuleId[] = ['work', 'money', 'cafe', 'assistant', 'roastery', 'ecommerce']
const person = (id: string, roles: string[] = ['member']): AdminPersonRow => ({
  id, full_name: 'Bayu Barista', email: 'bayu@x.test', archived_at: null, login: 'none',
  access_roles: roles, jabatan: [], revenue_scope: [], teams: [],
})
const makeRows = (personId: string, overrides: Partial<Record<ModuleId, { override?: string; row_version?: number; org_enabled?: boolean }>> = {}): PersonModuleSetting[] =>
  ids.map((module_id) => ({
    person_id: personId,
    module_id,
    override: overrides[module_id]?.override ?? 'inherit',
    row_version: overrides[module_id]?.row_version ?? 0,
    updated_at: null,
    updated_by: null,
    org_enabled: overrides[module_id]?.org_enabled ?? module_id !== 'assistant',
  } as PersonModuleSetting))
const renderCard = (target: AdminPersonRow, locale: 'en' | 'id' = 'en') => render(
  <I18nProvider initialLocale={locale}><MemoryRouter><PersonModulesCard person={target} /></MemoryRouter></I18nProvider>,
)
const moduleRow = (name: string) => screen.getAllByRole('listitem').find((item) => within(item).queryByText(name, { selector: '.person-card__name' }))!
const waitForModuleStatus = async (name: string, status: RegExp) => waitFor(() => expect(within(moduleRow(name)).getByText(status)).toBeInTheDocument())
const chooseModuleSetting = async (user: ReturnType<typeof userEvent.setup>, label: string, choice: string) => {
  const trigger = screen.getByRole('combobox', { name: label })
  const options = ['Inherit', 'Allow', 'Block']
  const distance = options.indexOf(choice) - options.indexOf(trigger.textContent?.trim() ?? '')
  await user.click(trigger)
  const direction = distance > 0 ? '{ArrowDown}' : '{ArrowUp}'
  await user.keyboard(`${direction.repeat(Math.abs(distance))}{Enter}`)
}

beforeEach(() => {
  const settings = new Map<string, PersonModuleSetting[]>()
  stubs.fns.listPersonModuleSettings.mockImplementation((personId: string) =>
    Promise.resolve(structuredClone(settings.get(personId) ?? makeRows(personId))))
  stubs.fns.savePersonModuleSettings.mockImplementation((personId: string, rows: readonly { module_id: ModuleId; override: string; expected_version: number }[]) => {
    const current = structuredClone(settings.get(personId) ?? makeRows(personId))
    for (const update of rows) {
      const target = current.find((row) => row.module_id === update.module_id)!
      target.override = update.override as PersonModuleSetting['override']
      target.row_version = update.expected_version + 1
    }
    settings.set(personId, current)
    return Promise.resolve(current)
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe("a person's module settings", () => {
  it('shows fetched choices and effective reasons in English and Indonesian', async () => {
    const english = renderCard(person('p1', ['member']))
    expect(await screen.findByText('Inherit · Access level required')).toBeInTheDocument()
    expect(within(moduleRow('Roastery')).getByText(/Not released/)).toBeInTheDocument()
    english.unmount()

    renderCard(person('p1', ['member']), 'id')
    expect(await screen.findByText('Ikuti Org · Perlu tingkat akses')).toBeInTheDocument()
    expect(within(moduleRow('Roastery')).getByText(/Belum dirilis/)).toBeInTheDocument()
  })

  it('lets an admin block Café and reset it to Inherit with versioned atomic saves', async () => {
    const user = userEvent.setup()
    renderCard(person('p1', ['member']))
    await waitForModuleStatus('Café', /Inherit.*Available/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await chooseModuleSetting(user, 'Café: setting for this person', 'Block')
    await user.click(screen.getByRole('button', { name: 'Save modules' }))

    await waitFor(() => expect(stubs.fns.savePersonModuleSettings).toHaveBeenCalledOnce())
    expect(await screen.findByText('Block · Blocked for this person')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Module settings saved.')
    const firstSave = stubs.fns.savePersonModuleSettings.mock.calls[0]
    expect(firstSave[0]).toBe('p1')
    expect(firstSave[1]).toEqual([{ module_id: 'cafe', override: 'block', expected_version: 0 }])
    expect(firstSave[2].client_request_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(await screen.findByText('Block · Blocked for this person')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Module settings saved.')

    await user.click(screen.getByRole('button', { name: 'Change' }))
    await chooseModuleSetting(user, 'Café: setting for this person', 'Inherit')
    await user.click(screen.getByRole('button', { name: 'Save modules' }))
    await waitFor(() => expect(stubs.fns.savePersonModuleSettings).toHaveBeenCalledTimes(2))
    expect(stubs.fns.savePersonModuleSettings.mock.calls[1][1]).toEqual([
      { module_id: 'cafe', override: 'inherit', expected_version: 1 },
    ])
    await waitForModuleStatus('Café', /Inherit.*Available/)
  })

  it('keeps a failed draft and retries the unchanged payload with the same request id', async () => {
    const user = userEvent.setup()
    stubs.fns.savePersonModuleSettings
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(makeRows('p1', { cafe: { override: 'block', row_version: 1 } }))
    renderCard(person('p1'))
    await waitForModuleStatus('Café', /Inherit.*Available/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await chooseModuleSetting(user, 'Café: setting for this person', 'Block')
    await user.click(screen.getByRole('button', { name: 'Save modules' }))
    expect(await screen.findByText("Couldn't save module settings. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Café: setting for this person' })).toHaveTextContent('Block')
    await user.click(screen.getByRole('button', { name: 'Save modules' }))
    await waitFor(() => expect(stubs.fns.savePersonModuleSettings).toHaveBeenCalledTimes(2))
    expect(stubs.fns.savePersonModuleSettings.mock.calls[1][2]).toEqual(stubs.fns.savePersonModuleSettings.mock.calls[0][2])
    expect(await screen.findByText('Block · Blocked for this person')).toBeInTheDocument()
  })

  it('requires reload after a version conflict and does not overwrite newer values', async () => {
    const user = userEvent.setup()
    stubs.fns.savePersonModuleSettings.mockRejectedValueOnce(new (await import('@/lib/db/contract')).ContractError('CONFLICT', 'reload'))
    stubs.fns.listPersonModuleSettings
      .mockResolvedValueOnce(makeRows('p1'))
      .mockResolvedValueOnce(makeRows('p1', { cafe: { override: 'allow', row_version: 4 } }))
    renderCard(person('p1'))
    await waitForModuleStatus('Café', /Inherit.*Available/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await chooseModuleSetting(user, 'Café: setting for this person', 'Block')
    await user.click(screen.getByRole('button', { name: 'Save modules' }))
    expect(await screen.findByText('Settings changed elsewhere. Reload.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(await screen.findByText('Allow · Available')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(stubs.fns.savePersonModuleSettings).toHaveBeenCalledOnce()
  })

  it('keeps Org Off precedence when drafting Allow', async () => {
    const user = userEvent.setup()
    stubs.fns.listPersonModuleSettings.mockResolvedValue(makeRows('p1', { cafe: { org_enabled: false } }))
    renderCard(person('p1', ['member']))
    await waitForModuleStatus('Café', /Inherit.*Org off/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await chooseModuleSetting(user, 'Café: setting for this person', 'Allow')
    expect(screen.getByText('Allow · Org off')).toBeInTheDocument()
    expect(screen.getByText('Org Off always wins over a personal Allow.')).toBeInTheDocument()
  })

  it('does not show stale settings when navigation changes to another person', async () => {
    let finishOld: ((rows: PersonModuleSetting[]) => void) | undefined
    stubs.fns.listPersonModuleSettings.mockImplementation((personId: string) => personId === 'p1'
      ? new Promise((resolve) => { finishOld = resolve })
      : Promise.resolve(makeRows(personId, { cafe: { override: 'block' } })))
    const view = renderCard(person('p1'))
    view.rerender(<I18nProvider><MemoryRouter><PersonModulesCard person={person('p2')} /></MemoryRouter></I18nProvider>)
    expect(await screen.findByText('Block · Blocked for this person')).toBeInTheDocument()
    await waitFor(() => finishOld?.(makeRows('p1', { cafe: { override: 'allow' } })))
    expect(screen.queryByText('Allow · Available')).not.toBeInTheDocument()
    expect(stubs.fns.listPersonModuleSettings).toHaveBeenCalledWith('p2')
  })

  it('supports keyboard selection and translated controls', async () => {
    const user = userEvent.setup()
    renderCard(person('p1'), 'id')
    await waitForModuleStatus('Café', /Ikuti Org.*Tersedia/)
    await user.click(screen.getByRole('button', { name: 'Ubah' }))
    const cafeChoice = screen.getByRole('combobox', { name: 'Café: pengaturan untuk orang ini' })
    cafeChoice.focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(cafeChoice).toHaveTextContent('Blokir')
  })
})

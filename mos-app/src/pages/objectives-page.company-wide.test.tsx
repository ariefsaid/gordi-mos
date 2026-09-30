// Objective create form: the Business Unit choice is exactly one of a unit, Company-wide, or unset.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/objectives', () => ({
  listObjectivesAll: vi.fn(),
  createObjective: vi.fn(),
  renameObjective: vi.fn(),
  setObjectiveArchived: vi.fn(),
}))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLinesAll: vi.fn() }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [], objective_content_org: false, objective_content_bu_ids: [] }),
  getWorkWriteScopes: vi.fn(),
}))
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))

import { listObjectivesAll, createObjective } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits } from '@/lib/db/directory'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { useAuth } from '@/auth/use-auth'
import type { AuthState } from '@/auth/context'
import { ObjectivesPage } from './objectives-page'

const viewer = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer',
      email: 'viewer@example.test', must_change_password: false, archived_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: ['admin'], affiliated: [],
  },
  signOut: vi.fn(),
} as AuthState

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue(viewer)
  vi.mocked(listObjectivesAll).mockResolvedValue([{ id: 'obj-1', name: 'Grow revenue', archived_at: null }])
  vi.mocked(listWorkLinesAll).mockResolvedValue([])
  vi.mocked(listTasks).mockResolvedValue([])
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Retail Ops', code: 'RO' }])
  vi.mocked(getWorkWriteScopes).mockResolvedValue({
    workline_org: true, objective_org: true, workline_bu_ids: [], objective_bu_ids: [],
    objective_content_org: true, objective_content_bu_ids: [],
  })
  vi.mocked(createObjective).mockResolvedValue({ id: 'obj-new', name: 'New', archived_at: null })
})

async function openForm() {
  render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/']}>
        <ObjectivesPage />
      </MemoryRouter>
    </I18nProvider>,
  )
  await screen.findByText('Grow revenue')
  fireEvent.click(screen.getByRole('button', { name: 'Create objective' }))
  const form = await screen.findByRole('form', { name: 'Create objective' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), { target: { value: 'Delight guests' } })
  return form
}

async function pick(form: HTMLElement, option: string) {
  fireEvent.click(within(form).getByRole('combobox', { name: 'Business Unit' }))
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('Objective create: Business Unit or Company-wide', () => {
  it('offers Not set, Company-wide and the units', async () => {
    const form = await openForm()
    await waitFor(() => expect(getBusinessUnits).toHaveBeenCalled())
    fireEvent.click(within(form).getByRole('combobox', { name: 'Business Unit' }))
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Not set', 'Company-wide', 'Retail Ops']))
  })

  it('creates a Company-wide Objective with no unit', async () => {
    const form = await openForm()
    await pick(form, 'Company-wide')
    fireEvent.submit(form)
    await waitFor(() => expect(createObjective).toHaveBeenCalledWith('Delight guests', { is_company_wide: true }))
  })

  it('creates a unit Objective without the Company-wide flag', async () => {
    const form = await openForm()
    await waitFor(() => expect(getBusinessUnits).toHaveBeenCalled())
    await pick(form, 'Retail Ops')
    fireEvent.submit(form)
    await waitFor(() => expect(createObjective).toHaveBeenCalledWith('Delight guests', { business_unit_id: 'bu-1' }))
  })

  it('switching from Company-wide back to Not set creates an unset Objective', async () => {
    const form = await openForm()
    await pick(form, 'Company-wide')
    await pick(form, 'Not set')
    fireEvent.submit(form)
    await waitFor(() => expect(createObjective).toHaveBeenCalledWith('Delight guests'))
  })

  it('never offers Company-wide to a viewer who cannot create without a unit', async () => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue({
      workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: ['bu-1'],
      objective_content_org: false, objective_content_bu_ids: [],
    })
    vi.mocked(useAuth).mockReturnValue({
      ...viewer,
      viewer: { ...(viewer as Extract<AuthState, { status: 'authenticated' }>).viewer, accessRoles: ['member'] },
    } as AuthState)
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/']}>
          <ObjectivesPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    await screen.findByText('Grow revenue')
    fireEvent.click(await screen.findByRole('button', { name: 'Create objective' }))
    const form = await screen.findByRole('form', { name: 'Create objective' })
    await waitFor(() => expect(getBusinessUnits).toHaveBeenCalled())
    fireEvent.click(within(form).getByRole('combobox', { name: 'Business Unit' }))
    await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Retail Ops']))
  })
})

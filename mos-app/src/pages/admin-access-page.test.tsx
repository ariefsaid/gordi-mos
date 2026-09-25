import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/admin-access', () => ({
  listRoleAuthority: vi.fn(),
  saveRoleAuthority: vi.fn(),
}))

vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: vi.fn() }))

import { listRoleAuthority, saveRoleAuthority } from '@/lib/db/admin-access'
import { AUTHORITY_ACTIONS, AUTHORITY_ROLES, type RoleAuthorityRow } from '@/lib/db/admin-access.types'
import { AdminAccessPage } from './admin-access-page'
import { useIsDesktop } from '@/shell/use-is-desktop'

const mockListRoleAuthority = vi.mocked(listRoleAuthority)
const mockSaveRoleAuthority = vi.mocked(saveRoleAuthority)
const mockUseIsDesktop = vi.mocked(useIsDesktop)

const SCOPE_BY_ACTION: Record<string, RoleAuthorityRow['scope']> = {
  'workline.manage': 'own_bu',
  'objective.manage': 'own_bu',
  'signal.post': 'org',
  'signal.tag': 'org',
  'signal.retract': 'own',
  'process.start': 'own_team',
  'process.close': 'own',
}

function authorityRows(): RoleAuthorityRow[] {
  return AUTHORITY_ACTIONS.flatMap((action) =>
    AUTHORITY_ROLES.map((role) => ({
      action,
      role,
      scope: role === 'admin' ? 'org' : role === 'member' ? SCOPE_BY_ACTION[action] : 'none',
    })),
  )
}

async function selectPicker(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: label })
  await waitFor(() => expect(trigger).toBeEnabled())
  await user.click(trigger)
  await user.click(await screen.findByRole('option', { name: option }))
}

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={['/admin/access']}>
        <AdminAccessPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseIsDesktop.mockReturnValue(true)
  mockListRoleAuthority.mockResolvedValue(authorityRows())
  mockSaveRoleAuthority.mockResolvedValue(undefined)
})

describe('AdminAccessPage', () => {
  it('renders the editable role × action table; Team leads live on the Teams tab, not here', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Roles & permissions' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Role access and authority' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Team leads' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Manage Projects & Processes — Member' })).toHaveTextContent('Own Business Unit')
    expect(screen.getAllByText('Organization-wide — fixed')).toHaveLength(AUTHORITY_ACTIONS.length)
    expect(screen.getByText(/Everyone in the organization can read Work/)).toBeInTheDocument()
  })

  it('names roles the way the person panel does, and says where the derived columns come from', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Role access and authority' })
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual([
      'Action',
      'Member',
      'Team leadFrom Team leadership',
      'BU headFrom Business Unit Position',
      'Ops Lead',
      'Admin',
      'Finance',
      'Manager',
      'Supervisor',
    ])
    expect(within(table).getByRole('link', { name: 'From Team leadership' })).toHaveAttribute('href', '/admin/teams')
    expect(within(table).getByRole('link', { name: 'From Business Unit Position' })).toHaveAttribute('href', '/admin/people')
  })

  it('asks before leaving with unsaved access rules, and Stay keeps the draft', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        { path: '/admin/access', element: <AdminAccessPage /> },
        { path: '/admin/people', element: <p>People tab</p> },
      ],
      { initialEntries: ['/admin/access'] },
    )
    render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
    await screen.findByRole('table', { name: 'Role access and authority' })

    await selectPicker(user, 'Manage Projects & Processes — Member', 'Organization')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'People' }))

    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Stay on this page' }))
    expect(router.state.location.pathname).toBe('/admin/access')
    expect(screen.getByRole('combobox', { name: 'Manage Projects & Processes — Member' })).toHaveTextContent('Organization')
    expect(mockSaveRoleAuthority).not.toHaveBeenCalled()
  })

  it('leaves without asking once the rules are saved', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        { path: '/admin/access', element: <AdminAccessPage /> },
        { path: '/admin/people', element: <p>People tab</p> },
      ],
      { initialEntries: ['/admin/access'] },
    )
    render(<I18nProvider><RouterProvider router={router} /></I18nProvider>)
    await screen.findByRole('table', { name: 'Role access and authority' })
    await selectPicker(user, 'Manage Projects & Processes — Member', 'Organization')
    await user.click(screen.getByRole('button', { name: 'Save access rules' }))
    await screen.findByRole('status', { name: 'Access rules saved' })

    await user.click(screen.getByRole('link', { name: 'People' }))
    expect(await screen.findByText('People tab')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull()
  })

  it('keeps an authority draft after save failure and retries the same draft', async () => {
    const user = userEvent.setup()
    mockSaveRoleAuthority.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined)
    renderPage()
    await screen.findByRole('table', { name: 'Role access and authority' })

    const manageMember = screen.getByRole('combobox', { name: 'Manage Projects & Processes — Member' })
    await selectPicker(user, 'Manage Projects & Processes — Member', 'Organization')
    await user.click(screen.getByRole('button', { name: 'Save access rules' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save access rules. Try again.')
    expect(mockSaveRoleAuthority).toHaveBeenCalledWith([
      { action: 'workline.manage', role: 'member', scope: 'org' },
    ])
    expect(manageMember).toHaveTextContent('Organization')
    await user.click(screen.getByRole('button', { name: 'Retry access rules' }))

    await waitFor(() => expect(mockSaveRoleAuthority).toHaveBeenCalledTimes(2))
    expect(manageMember).toHaveTextContent('Organization')
    expect(screen.getByRole('status', { name: 'Access rules saved' })).toBeInTheDocument()
  })

  it('renders the new settings copy in Indonesian', async () => {
    renderPage('id')

    expect(await screen.findByRole('heading', { level: 1, name: 'Peran & izin' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Bagian pengaturan admin' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Orang', 'Tim', 'Peran & izin'])
    expect(screen.getByRole('link', { name: 'Dari kepemimpinan Tim' })).toBeInTheDocument()
  })

  it('lets a phone user choose a role, edit its grant, and save only that change', async () => {
    const user = userEvent.setup()
    mockUseIsDesktop.mockReturnValue(false)
    renderPage()

    expect(await screen.findByLabelText('Role to edit')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Role access and authority' })).toBeNull()
    await selectPicker(user, 'Role to edit', 'Team lead')
    expect(screen.getByRole('combobox', { name: 'Manage Projects & Processes — Team lead' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save access rules' })).toBeNull()
    await selectPicker(user, 'Manage Projects & Processes — Team lead', 'Own Business Unit')
    await user.click(screen.getByRole('button', { name: 'Save access rules' }))
    await waitFor(() => expect(mockSaveRoleAuthority).toHaveBeenCalledWith([
      { action: 'workline.manage', role: 'team_lead', scope: 'own_bu' },
    ]))
    expect(screen.getByRole('status', { name: 'Access rules saved' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save access rules' })).toBeDisabled()
  })
})

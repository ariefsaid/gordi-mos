import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/admin-access', () => ({
  listRoleAuthority: vi.fn(),
  saveRoleAuthority: vi.fn(),
  listTeamLeadAssignments: vi.fn(),
  listTeamLeadCandidates: vi.fn(),
  saveTeamLeadAssignment: vi.fn(),
}))

vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: vi.fn() }))

import {
  listRoleAuthority,
  listTeamLeadAssignments,
  listTeamLeadCandidates,
  saveRoleAuthority,
  saveTeamLeadAssignment,
} from '@/lib/db/admin-access'
import { AUTHORITY_ACTIONS, AUTHORITY_ROLES, type RoleAuthorityRow } from '@/lib/db/admin-access.types'
import { AdminAccessPage } from './admin-access-page'
import { useIsDesktop } from '@/shell/use-is-desktop'

const mockListRoleAuthority = vi.mocked(listRoleAuthority)
const mockSaveRoleAuthority = vi.mocked(saveRoleAuthority)
const mockListTeamLeadAssignments = vi.mocked(listTeamLeadAssignments)
const mockListTeamLeadCandidates = vi.mocked(listTeamLeadCandidates)
const mockSaveTeamLeadAssignment = vi.mocked(saveTeamLeadAssignment)
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
  mockListTeamLeadAssignments.mockResolvedValue([
    {
      team_id: 'team-1',
      team_name: 'Café opening',
      business_unit_id: 'bu-1',
      lead_person_id: 'person-1',
      lead_name: 'Ari Lead',
    },
  ])
  mockListTeamLeadCandidates.mockResolvedValue([
    { person_id: 'person-1', full_name: 'Ari Lead' },
    { person_id: 'person-2', full_name: 'Dina Lead' },
  ])
  mockSaveRoleAuthority.mockResolvedValue(undefined)
  mockSaveTeamLeadAssignment.mockResolvedValue(undefined)
})

describe('AdminAccessPage', () => {
  it('renders the editable authority table and explicit Team lead section', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Access & authority' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Role access and authority' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Team leads' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Manage Projects & Processes — Member' })).toHaveTextContent('Own Business Unit')
    expect(screen.getByRole('combobox', { name: 'Café opening team lead' })).toHaveTextContent('Ari Lead')
    expect(screen.getAllByText('Organization-wide — fixed')).toHaveLength(AUTHORITY_ACTIONS.length)
    expect(screen.getByText(/Everyone in the organization can read Work/)).toBeInTheDocument()
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

  it('saves a changed Team lead and supports clearing the designation', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Team leads' })

    await selectPicker(user, 'Café opening team lead', 'No designated lead')
    await user.click(screen.getByRole('button', { name: 'Save Café opening team lead' }))

    await waitFor(() => expect(mockSaveTeamLeadAssignment).toHaveBeenCalledWith('team-1', null))
    expect(screen.getByRole('status', { name: 'Café opening team lead saved' })).toBeInTheDocument()
  })

  it('keeps a Team lead draft after failure and exposes a retry action', async () => {
    const user = userEvent.setup()
    mockSaveTeamLeadAssignment.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined)
    renderPage()
    await screen.findByRole('heading', { name: 'Team leads' })

    const picker = screen.getByRole('combobox', { name: 'Café opening team lead' })
    await selectPicker(user, 'Café opening team lead', 'Dina Lead')
    await user.click(screen.getByRole('button', { name: 'Save Café opening team lead' }))

    const row = picker.closest('[data-team-lead-row]') as HTMLElement
    expect(within(row).getByRole('alert')).toHaveTextContent('Could not save this Team lead. Try again.')
    expect(picker).toHaveTextContent('Dina Lead')
    await user.click(within(row).getByRole('button', { name: 'Retry Café opening team lead' }))

    await waitFor(() => expect(mockSaveTeamLeadAssignment).toHaveBeenCalledTimes(2))
    expect(picker).toHaveTextContent('Dina Lead')
  })

  it('keeps primary settings visible when one Team candidate list fails and retries that row independently', async () => {
    const user = userEvent.setup()
    mockListTeamLeadCandidates.mockRejectedValueOnce(new Error('candidate timeout')).mockResolvedValueOnce([
      { person_id: 'person-1', full_name: 'Ari Lead' },
      { person_id: 'person-2', full_name: 'Dina Lead' },
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Access & authority' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load Team members. Try again.")
    expect(screen.getByRole('table', { name: 'Role access and authority' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry Café opening members' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Café opening team lead' })).toBeEnabled())
  })

  it('renders the new settings copy in Indonesian', async () => {
    renderPage('id')

    expect(await screen.findByRole('heading', { name: 'Akses & kewenangan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ketua tim' })).toBeInTheDocument()
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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { useAuth } from '@/auth/use-auth'
import { I18nProvider } from '@/i18n/I18nProvider'
import { listRoleAuthority, listTeamLeadAssignments } from '@/lib/db/admin-access'
import { AUTHORITY_ACTIONS, AUTHORITY_ROLES, type RoleAuthorityRow } from '@/lib/db/admin-access.types'
import {
  addTeamMembership,
  assignJabatan,
  endTeamMembership,
  listAdminPeople,
  listRevenueScopeOptions,
  listRoles,
  listTeams,
  setPrimaryTeam,
} from '@/lib/db/admin-users'
import { getBusinessUnits, getRoles } from '@/lib/db/directory'
import { getCafeReceiptIssueAccess } from '@/lib/db/cafe-receipt-issues'
import type { AdminPersonRow, RoleOption, TeamOption } from '@/lib/db/admin-users.types'
import { AdminPersonPage } from './admin-person-page'

const usersDb = vi.hoisted(() => ({
  addTeamMembership: vi.fn(),
  archivePerson: vi.fn(),
  assignJabatan: vi.fn(),
  assignRevenueScope: vi.fn(),
  createLogin: vi.fn(),
  endTeamMembership: vi.fn(),
  grantRole: vi.fn(),
  listAdminPeople: vi.fn(),
  listRevenueScopeOptions: vi.fn(),
  listRoles: vi.fn(),
  listTeams: vi.fn(),
  removeJabatan: vi.fn(),
  removeRevenueScope: vi.fn(),
  resetPassword: vi.fn(),
  restorePerson: vi.fn(),
  revokeRole: vi.fn(),
  setLoginEnabled: vi.fn(),
  setPrimaryTeam: vi.fn(),
}))
const accessDb = vi.hoisted(() => ({
  listRoleAuthority: vi.fn(),
  listTeamLeadAssignments: vi.fn(),
}))
const directoryDb = vi.hoisted(() => ({
  getBusinessUnits: vi.fn(),
  getRoles: vi.fn(),
}))
const receiptIssueDb = vi.hoisted(() => ({
  getCafeReceiptIssueAccess: vi.fn(),
  setCafeReceiptIssueAccess: vi.fn(),
}))

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/admin-users', () => usersDb)
vi.mock('@/lib/db/admin-access', () => accessDb)
vi.mock('@/lib/db/directory', () => directoryDb)
vi.mock('@/lib/db/cafe-receipt-issues', () => receiptIssueDb)

const mockUseAuth = vi.mocked(useAuth)
const mockAddTeamMembership = vi.mocked(addTeamMembership)
const mockAssignJabatan = vi.mocked(assignJabatan)
const mockListAdminPeople = vi.mocked(listAdminPeople)
const mockListRevenueScopeOptions = vi.mocked(listRevenueScopeOptions)
const mockListRoles = vi.mocked(listRoles)
const mockListTeams = vi.mocked(listTeams)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetRoles = vi.mocked(getRoles)
const mockGetReceiptIssueAccess = vi.mocked(getCafeReceiptIssueAccess)
const mockListRoleAuthority = vi.mocked(listRoleAuthority)
const mockListTeamLeadAssignments = vi.mocked(listTeamLeadAssignments)

const person: AdminPersonRow = {
  id: 'person-1',
  full_name: 'Ayu Person',
  email: 'ayu@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['member'],
  jabatan: [{ role_id: 'role-retail-head', role_name: 'Retail Ops Head' }],
  revenue_scope: [],
  teams: [{ team_id: 'team-retail', is_primary: true }],
}
const teams: TeamOption[] = [
  { id: 'team-retail', name: 'Retail Operations', branch_name: null, activity: null },
  { id: 'team-cafe', name: 'Café Team', branch_name: null, activity: null },
]
const roles: RoleOption[] = [
  { id: 'role-retail-head', name: 'Retail Ops Head' },
  { id: 'role-cafe-lead', name: 'Café Lead' },
]
const authorityRows: RoleAuthorityRow[] = AUTHORITY_ACTIONS.flatMap((action) =>
  AUTHORITY_ROLES.map((role) => ({ action, role, scope: role === 'admin' ? 'org' : 'none' })),
)
const authState: AuthState = { status: 'unauthenticated' }

function renderPersonPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/admin/people/person-1']}>
        <Routes>
          <Route path="/admin/people/:personId" element={<AdminPersonPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(authState)
  mockListAdminPeople.mockResolvedValue([person])
  mockListRoles.mockResolvedValue(roles)
  mockListRevenueScopeOptions.mockResolvedValue([])
  mockListTeams.mockResolvedValue(teams)
  mockAddTeamMembership.mockResolvedValue(undefined)
  vi.mocked(endTeamMembership).mockResolvedValue(undefined)
  mockAssignJabatan.mockResolvedValue(undefined)
  vi.mocked(setPrimaryTeam).mockResolvedValue(undefined)
  mockListRoleAuthority.mockResolvedValue(authorityRows)
  mockListTeamLeadAssignments.mockResolvedValue([])
  mockGetRoles.mockResolvedValue([{ id: 'role-retail-head', business_unit_id: 'bu-retail', reports_to_role_id: null }])
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-retail', name: 'Retail Operations' }])
  mockGetReceiptIssueAccess.mockResolvedValue(false)
  vi.mocked(receiptIssueDb.setCafeReceiptIssueAccess).mockResolvedValue(undefined)
})

describe('AdminPersonPage', () => {
  it('lets an admin add a Position to the person', async () => {
    const user = userEvent.setup()
    renderPersonPage()

    await user.click(await screen.findByRole('button', { name: 'Change Position' }))
    await user.click(screen.getByRole('checkbox', { name: 'Café Lead' }))
    await user.click(screen.getByRole('button', { name: 'Save Position' }))

    await waitFor(() => expect(mockAssignJabatan).toHaveBeenCalledWith('person-1', 'role-cafe-lead'))
  })

  it('lets an admin add the person to a Team without changing their Home Team', async () => {
    const user = userEvent.setup()
    renderPersonPage()

    expect(await screen.findByText('Home team: Retail Operations')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change Teams' }))
    await user.click(screen.getByRole('checkbox', { name: 'Café Team' }))
    await user.click(screen.getByRole('button', { name: 'Save Teams' }))

    await waitFor(() => expect(mockAddTeamMembership).toHaveBeenCalledWith('person-1', 'team-cafe', false))
  })

  it('shows the Business Unit head line from the person’s Position', async () => {
    renderPersonPage()

    expect(await screen.findByText('Through this position they head Retail Operations.')).toBeInTheDocument()
    const canDo = screen.getByRole('region', { name: 'What they can do' })
    expect(within(canDo).getByText('Retail Operations, through their Position')).toBeInTheDocument()
  })

  it('reports a failed authority load and recovers when the admin retries', async () => {
    const user = userEvent.setup()
    mockListRoleAuthority.mockRejectedValueOnce(new Error('private load detail'))
    renderPersonPage()

    const canDo = await screen.findByRole('region', { name: 'What they can do' })
    expect(await within(canDo).findByRole('alert')).toHaveTextContent("Couldn't load what they can do.")
    expect(within(canDo).queryByText('private load detail')).not.toBeInTheDocument()
    await user.click(within(canDo).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(mockListRoleAuthority).toHaveBeenCalledTimes(2))
    expect(await within(canDo).findByText('Retail Operations, through their Position')).toBeInTheDocument()
  })

  it('exposes refresh failure, retains a visible retry state, and does not claim saved until reread succeeds', async () => {
    const user = userEvent.setup()
    renderPersonPage()

    await user.click(await screen.findByRole('button', { name: 'Change Position' }))
    await user.click(screen.getByRole('checkbox', { name: 'Café Lead' }))

    // First refresh attempt fails
    mockListAdminPeople.mockRejectedValueOnce(new Error('refresh failed'))
    await user.click(screen.getByRole('button', { name: 'Save Position' }))

    await waitFor(() => expect(mockAssignJabatan).toHaveBeenCalledWith('person-1', 'role-cafe-lead'))

    // Dialog stays open with visible retry state; card head does not claim saved
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent("Couldn't load people. Try again.")
    const positionCard = screen.getByRole('region', { name: 'Position', hidden: true })
    expect(positionCard.closest('.person-page')).toHaveAttribute('inert')
    const cardHead = positionCard.querySelector<HTMLElement>('.person-card__head')!
    expect(within(cardHead).queryByText('Saved')).not.toBeInTheDocument()

    // Subsequent reread succeeds
    const updatedWithPosition: AdminPersonRow = {
      ...person,
      jabatan: [
        { role_id: 'role-retail-head', role_name: 'Retail Ops Head' },
        { role_id: 'role-cafe-lead', role_name: 'Café Lead' },
      ],
    }
    mockListAdminPeople.mockResolvedValueOnce([updatedWithPosition])

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mockListAdminPeople).toHaveBeenCalledTimes(3))

    // After reread succeeds, dialog closes and card head claims saved
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(cardHead).getByText('Saved')).toBeInTheDocument()
  })
})

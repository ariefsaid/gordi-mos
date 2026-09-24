// PersonPanel — the person opens read-first (summary), then edits in sections that each save and
// report beside the row. The Access section carries the role-grant contract the old role editor
// owned: every assignable role, the self-assign and last-admin guards, grant/revoke calls, and
// the Admin confirmation.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/shell/use-is-phone', () => ({ useIsPhone: vi.fn(() => false) }))
import { useIsPhone } from '@/shell/use-is-phone'

vi.mock('@/lib/db/admin-users', () => ({
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  assignJabatan: vi.fn(),
  removeJabatan: vi.fn(),
  addTeamMembership: vi.fn(),
  endTeamMembership: vi.fn(),
  setPrimaryTeam: vi.fn(),
  assignRevenueScope: vi.fn(),
  removeRevenueScope: vi.fn(),
}))
import { addTeamMembership, endTeamMembership, grantRole, revokeRole } from '@/lib/db/admin-users'

import { PersonPanel, type PersonAuthoritySource } from './person-panel'
import type { AdminPersonRow, TeamOption } from '@/lib/db/admin-users.types'
import { AUTHORITY_ACTIONS, AUTHORITY_ROLES, type RoleAuthorityRow } from '@/lib/db/admin-access.types'

const mockUseAuth = vi.mocked(useAuth)
const mockUseIsPhone = vi.mocked(useIsPhone)
const mockGrantRole = vi.mocked(grantRole)
const mockRevokeRole = vi.mocked(revokeRole)
const mockAddTeam = vi.mocked(addTeamMembership)
const mockEndTeam = vi.mocked(endTeamMembership)

const ADMIN_VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'admin-person-id',
      org_id: 'org-1',
      user_id: 'admin-user-id',
      full_name: 'Admin Gordi',
      email: 'admin@example.test',
      must_change_password: false,
      archived_at: null,
      created_at: '',
      updated_at: '',
    },
    roles: [],
    isManager: false,
    accessRoles: ['admin'],
    affiliated: [],
  },
  signOut: vi.fn(),
}

const TEAMS: TeamOption[] = [
  { id: 't-bar', name: 'Gordi HQ Bar', branch_name: 'Gordi HQ', activity: 'bar' },
  { id: 't-hq', name: 'HQ Operations', branch_name: null, activity: null },
]

const BAYU: AdminPersonRow = {
  id: 'bayu-id',
  full_name: 'Bayu Barista',
  email: 'bayu@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['member', 'ops_lead'],
  jabatan: [],
  revenue_scope: [],
  teams: [
    { team_id: 't-hq', is_primary: false },
    { team_id: 't-bar', is_primary: true },
  ],
}

const SELF: AdminPersonRow = {
  ...BAYU,
  id: 'admin-person-id',
  full_name: 'Admin Gordi',
  access_roles: ['admin', 'member'],
}

const OTHER_ADMIN: AdminPersonRow = { ...BAYU, id: 'other-admin', full_name: 'Other Admin', access_roles: ['admin'] }

/** A small authority table: Member posts org-wide, Ops lead manages Projects org-wide, Team lead
 *  closes runs for its own Team, BU head manages Objectives in its BU; everything else none. */
function authorityRows(): RoleAuthorityRow[] {
  const grant: Record<string, RoleAuthorityRow['scope']> = {
    'signal.post:member': 'org',
    'workline.manage:ops_lead': 'org',
    'process.close:member': 'own',
    'process.close:team_lead': 'own_team',
    'objective.manage:bu_head': 'own_bu',
  }
  return AUTHORITY_ACTIONS.flatMap((action) => AUTHORITY_ROLES.map((role) => ({
    action,
    role,
    scope: role === 'admin' ? 'org' : grant[`${action}:${role}`] ?? 'none',
  })))
}

function authority(overrides: Partial<PersonAuthoritySource> = {}): PersonAuthoritySource {
  return {
    state: 'loaded',
    rows: authorityRows(),
    leads: [{ team_id: 't-hq', team_name: 'HQ Operations', business_unit_id: null, lead_person_id: 'bayu-id', lead_name: 'Bayu Barista' }],
    retry: vi.fn(),
    ...overrides,
  }
}

function renderPanel(
  person: AdminPersonRow = BAYU,
  opts: { people?: AdminPersonRow[]; authority?: PersonAuthoritySource; onClose?: () => void; refresh?: () => Promise<void> } = {},
) {
  return render(
    <MemoryRouter>
      <PersonPanel
        person={person}
        people={opts.people ?? [person, OTHER_ADMIN]}
        roles={[]}
        teams={TEAMS}
        scopeOptions={[]}
        authority={opts.authority ?? authority()}
        refresh={opts.refresh ?? vi.fn().mockResolvedValue(undefined)}
        onClose={opts.onClose ?? vi.fn()}
      />
    </MemoryRouter>,
  )
}

function accessRow(name: string | RegExp): HTMLElement {
  return screen.getByRole('checkbox', { name }).closest('.admin-check-row') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(ADMIN_VIEWER)
  mockUseIsPhone.mockReturnValue(false)
  mockGrantRole.mockResolvedValue(undefined)
  mockRevokeRole.mockResolvedValue(undefined)
})

describe('PersonPanel — read first', () => {
  it('is titled for the person, not for its first section', () => {
    renderPanel()
    expect(screen.getByRole('heading', { level: 2, name: 'Manage Bayu Barista' })).toBeInTheDocument()
    expect(screen.queryByText('Access level')).toBeNull()
  })

  it('summarizes access roles, Teams with Home marked and what Home decides, and the Teams they lead', () => {
    renderPanel()
    const summary = screen.getByRole('region', { name: 'Summary' })
    expect(within(summary).getByText('Ops Lead')).toBeInTheDocument()
    const teams = within(summary).getAllByRole('listitem').filter((li) => li.closest('.admin-person-teams'))
    // Home first, and marked.
    expect(teams[0]).toHaveTextContent('Gordi HQ Bar')
    expect(within(teams[0]).getByText('Home')).toBeInTheDocument()
    expect(teams[1]).toHaveTextContent('HQ Operations')
    expect(within(summary).getByText('The Home Team sets where Café production opens for them.')).toBeInTheDocument()
    expect(within(summary).getByText('HQ Operations', { selector: '.admin-person-facts dd > span' })).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: 'Change on Teams' })).toHaveAttribute('href', '/admin/teams')
  })

  it('"What they can do" names the widest scope per action and which role or leadership grants it', () => {
    renderPanel()
    const list = document.querySelector('.admin-person-cando') as HTMLElement
    const rowFor = (action: string) => within(list).getByText(action).closest('li') as HTMLElement

    expect(rowFor('Post Signals')).toHaveTextContent('Organization')
    expect(rowFor('Post Signals')).toHaveTextContent('Member baseline')
    expect(rowFor('Manage Projects & Processes')).toHaveTextContent('Organization')
    expect(rowFor('Manage Projects & Processes')).toHaveTextContent('via Ops Lead')
    // Leading HQ Operations lifts Close process runs from Member's own record to the Team.
    expect(rowFor('Close process runs')).toHaveTextContent('Own Team')
    expect(rowFor('Close process runs')).toHaveTextContent('via Team lead')
    expect(rowFor('Manage Objectives')).toHaveTextContent('Not allowed')
    // BU head authority comes from a Position this screen cannot see — said, not guessed.
    expect(screen.getByText(/A Business Unit head can get more from their Position/)).toBeInTheDocument()
  })

  it('a person who leads nothing gets only what their roles give', () => {
    renderPanel(BAYU, { authority: authority({ leads: [] }) })
    expect(screen.getByText("Doesn't lead a Team")).toBeInTheDocument()
    const list = document.querySelector('.admin-person-cando') as HTMLElement
    const close = within(list).getByText('Close process runs').closest('li') as HTMLElement
    expect(close).toHaveTextContent('Own record')
    expect(close).toHaveTextContent('Member baseline')
  })

  it('a failed authority load keeps the summary and offers Retry', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    renderPanel(BAYU, { authority: authority({ state: 'error', rows: [], leads: [], retry }) })
    expect(screen.getByText("Couldn't load what they can do.")).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Manage Bayu Barista' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('PersonPanel — sections', () => {
  it('runs Teams · Position · Access, and Revenue scope only while Supervisor is on', () => {
    const { unmount } = renderPanel()
    const toggles = () => screen.getAllByRole('button', { expanded: true }).map((b) => b.textContent)
    expect(toggles().map((text) => text?.replace(/\d+ selected/, '').trim())).toEqual(['Teams', 'Position', 'Access'])
    unmount()
    renderPanel({ ...BAYU, access_roles: ['member', 'supervisor'] })
    expect(screen.getByRole('button', { name: /Revenue scope/ })).toBeInTheDocument()
  })

  it('at phone width the sections are accordions with only Teams open', () => {
    mockUseIsPhone.mockReturnValue(true)
    renderPanel()
    expect(screen.getByRole('button', { name: /^Teams/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^Position/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /^Access/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' })).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: 'Ops Lead' })).toBeNull()
  })

  it('a collapsed section opens on its heading button', async () => {
    const user = userEvent.setup()
    mockUseIsPhone.mockReturnValue(true)
    renderPanel()
    await user.click(screen.getByRole('button', { name: /^Access/ }))
    expect(screen.getByRole('checkbox', { name: 'Ops Lead' })).toBeVisible()
  })
})

describe('PersonPanel — Access roles', () => {
  it('lists every assignable role with its description, never a raw slug, and checks the granted ones', () => {
    renderPanel()
    for (const name of ['Member', 'Ops Lead', 'Admin', 'Finance', 'Manager', 'Supervisor']) {
      expect(screen.getByRole('checkbox', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('Plans and approves')).toBeInTheDocument()
    expect(screen.queryByText('ops_lead')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Ops Lead' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Finance' })).toHaveAttribute('aria-checked', 'false')
  })

  it('granting a role commits directly and reads Saved beside it', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderPanel(BAYU, { refresh })
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledWith('bayu-id', 'finance'))
    await waitFor(() => expect(within(accessRow('Finance')).getByRole('status')).toHaveTextContent('Saved'))
    expect(refresh).toHaveBeenCalled()
  })

  it('removing a role calls revokeRole', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('checkbox', { name: 'Ops Lead' }))
    await waitFor(() => expect(mockRevokeRole).toHaveBeenCalledWith('bayu-id', 'ops_lead'))
  })

  it('a failed grant keeps the attempted value with Failed · Retry until Retry succeeds', async () => {
    const user = userEvent.setup()
    mockGrantRole.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    renderPanel()
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))

    await waitFor(() => expect(within(accessRow('Finance')).getByRole('alert')).toHaveTextContent('Failed'))
    expect(screen.getByRole('checkbox', { name: 'Finance' })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('button', { name: 'Retry Finance' }))
    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(accessRow('Finance')).getByRole('status')).toHaveTextContent('Saved'))
  })

  it('Admin asks first: Cancel writes nothing', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('checkbox', { name: 'Admin' }))

    const dialog = await screen.findByRole('dialog', { name: 'Make Bayu Barista an Admin?' })
    expect(dialog).toHaveTextContent(/change anyone's access and Team leads/)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Make Bayu Barista an Admin?' })).toBeNull()
    expect(mockGrantRole).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Admin' })).toHaveAttribute('aria-checked', 'false')
  })

  it('Admin asks first: Confirm writes exactly once and the row reports it', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('checkbox', { name: 'Admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Make Bayu Barista an Admin?' })
    await user.click(within(dialog).getByRole('button', { name: 'Make Admin' }))

    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledTimes(1))
    expect(mockGrantRole).toHaveBeenCalledWith('bayu-id', 'admin')
    await waitFor(() => expect(within(accessRow('Admin')).getByRole('status')).toHaveTextContent('Saved'))
  })

  it('removing Admin asks too', async () => {
    const user = userEvent.setup()
    renderPanel(OTHER_ADMIN, { people: [OTHER_ADMIN, SELF] })
    await user.click(screen.getByRole('checkbox', { name: 'Admin' }))
    expect(await screen.findByRole('dialog', { name: 'Remove Admin from Other Admin?' })).toBeInTheDocument()
    expect(mockRevokeRole).not.toHaveBeenCalled()
  })

  it('other grants never ask', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('checkbox', { name: 'Manager' }))
    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledWith('bayu-id', 'manager'))
    expect(screen.queryByRole('dialog', { name: /Admin/ })).toBeNull()
  })

  it('self-assign guard: admin, finance, manager and supervisor are disabled on your own row', () => {
    renderPanel(SELF, { people: [SELF, OTHER_ADMIN] })
    for (const name of ['Admin', 'Finance', 'Manager', 'Supervisor']) {
      expect(screen.getByRole('checkbox', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    expect(screen.getByRole('checkbox', { name: 'Member' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('checkbox', { name: 'Ops Lead' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('last-admin guard: the only active admin cannot lose Admin', () => {
    const onlyAdmin = { ...OTHER_ADMIN }
    renderPanel(onlyAdmin, { people: [onlyAdmin, BAYU] })
    expect(screen.getByRole('checkbox', { name: 'Admin' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Only admin — assign another first')).toBeInTheDocument()
  })
})

/** The panel over a fake server: `refresh` re-reads whatever the server holds now. */
function ServerBackedPanel({ server }: { server: { current: AdminPersonRow } }) {
  const [person, setPerson] = useState(server.current)
  return (
    <MemoryRouter>
      <PersonPanel
        person={person}
        people={[person, OTHER_ADMIN]}
        roles={[]}
        teams={TEAMS}
        scopeOptions={[]}
        authority={authority()}
        refresh={async () => setPerson(server.current)}
        onClose={vi.fn()}
      />
    </MemoryRouter>
  )
}

describe('PersonPanel — a failed request whose outcome is unknown', () => {
  it('access role: the server committed but the response was lost → the re-read row reads Saved, no Retry', async () => {
    const user = userEvent.setup()
    const server = { current: BAYU }
    mockGrantRole.mockImplementationOnce(async () => {
      server.current = { ...server.current, access_roles: [...server.current.access_roles, 'finance'] }
      throw new Error('response lost')
    })
    render(<ServerBackedPanel server={server} />)
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))

    await waitFor(() => expect(within(accessRow('Finance')).getByRole('status')).toHaveTextContent('Saved'))
    expect(within(accessRow('Finance')).queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry Finance' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Finance' })).toHaveAttribute('aria-checked', 'true')
    expect(mockRevokeRole).not.toHaveBeenCalled()
  })

  it('access role: nothing committed → Failed · Retry; clicking the row returns it to the server state without a write', async () => {
    const user = userEvent.setup()
    const server = { current: BAYU }
    mockGrantRole.mockRejectedValueOnce(new Error('offline'))
    render(<ServerBackedPanel server={server} />)
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await waitFor(() => expect(within(accessRow('Finance')).getByRole('alert')).toHaveTextContent('Failed'))

    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    expect(screen.getByRole('checkbox', { name: 'Finance' })).toHaveAttribute('aria-checked', 'false')
    expect(within(accessRow('Finance')).queryByRole('alert')).toBeNull()
    expect(mockGrantRole).toHaveBeenCalledTimes(1)
    expect(mockRevokeRole).not.toHaveBeenCalled()
  })

  it('access role: Retry re-sends the attempted value', async () => {
    const user = userEvent.setup()
    const server = { current: BAYU }
    mockGrantRole.mockRejectedValueOnce(new Error('offline'))
    render(<ServerBackedPanel server={server} />)
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await user.click(await screen.findByRole('button', { name: 'Retry Finance' }))

    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledTimes(2))
    expect(mockGrantRole).toHaveBeenLastCalledWith('bayu-id', 'finance')
    expect(mockRevokeRole).not.toHaveBeenCalled()
  })

  it('membership: the server committed but the response was lost → the re-read row reads Saved, no Retry', async () => {
    const user = userEvent.setup()
    const server = { current: { ...BAYU, teams: [{ team_id: 't-hq', is_primary: true }] } }
    mockAddTeam.mockImplementationOnce(async () => {
      server.current = { ...server.current, teams: [...server.current.teams, { team_id: 't-bar', is_primary: false }] }
      throw new Error('response lost')
    })
    render(<ServerBackedPanel server={server} />)
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))

    await waitFor(() => expect(within(accessRow('Gordi HQ Bar')).getByRole('status')).toHaveTextContent('Saved'))
    expect(screen.queryByRole('button', { name: 'Retry Gordi HQ Bar' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' })).toHaveAttribute('aria-checked', 'true')
    expect(mockEndTeam).not.toHaveBeenCalled()
  })
})

describe('PersonPanel — closing', () => {
  it('Close and Escape dismiss the panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel(BAYU, { onClose })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not close while a row is still saving', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockGrantRole.mockReturnValue(new Promise(() => {}))
    renderPanel(BAYU, { onClose })
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await waitFor(() => expect(within(accessRow('Finance')).getByRole('status')).toHaveTextContent('Saving…'))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('PersonPanel — Indonesian', () => {
  it('translates the title, summary, section heads, Home controls and row status', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider initialLocale="id">
        <MemoryRouter>
          <PersonPanel
            person={BAYU}
            people={[BAYU, OTHER_ADMIN]}
            roles={[]}
            teams={TEAMS}
            scopeOptions={[]}
            authority={authority()}
            refresh={vi.fn().mockResolvedValue(undefined)}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Kelola Bayu Barista' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Yang bisa dilakukan' })).toBeInTheDocument()
    expect(screen.getByText('Tim utama menentukan tempat produksi Kafe dibuka untuknya.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ubah di Tim' })).toBeInTheDocument()
    for (const head of [/^Tim/, /^Jabatan/, /^Akses/]) {
      expect(screen.getByRole('button', { name: head, expanded: true })).toBeInTheDocument()
    }
    expect(screen.getAllByText('Utama').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Jadikan utama — HQ Operations' })).toHaveTextContent('Jadikan utama')

    await user.click(screen.getByRole('checkbox', { name: 'Keuangan' }))
    const row = screen.getByRole('checkbox', { name: 'Keuangan' }).closest('.admin-check-row') as HTMLElement
    await waitFor(() => expect(within(row).getByRole('status')).toHaveTextContent('Tersimpan'))
  })
})

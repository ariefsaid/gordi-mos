// TeamPicker tests — the person panel's "put this person on a team" section.
//
// The three behaviours worth guarding are the ones with a consequence beyond the checkbox:
//   * removal is a SOFT END (endTeamMembership), never a delete — there is no DELETE grant, and
//     membership history is the record of who was on which line when;
//   * the first team someone joins becomes their HOME team, because a person on teams with no
//     primary resolves their capture stream to none (AC-001);
//   * ending the home team says so, rather than leaving that silently true.
//
// Membership is also an authorization input (mos.can_read_signal's R1 arm, the team post/start
// gates). The database is what refuses a non-admin (shared_13_team_membership_writes.sql owns
// that); this file is only about the screen.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/db/admin-users', () => ({
  addTeamMembership: vi.fn(),
  endTeamMembership: vi.fn(),
  setPrimaryTeam: vi.fn(),
}))
import { addTeamMembership, endTeamMembership, setPrimaryTeam } from '@/lib/db/admin-users'

import { TeamPicker } from './team-picker'
import { useRowCommits } from './use-row-commits'
import type { AdminPersonRow, TeamOption } from '@/lib/db/admin-users.types'

const mockAdd = vi.mocked(addTeamMembership)
const mockEnd = vi.mocked(endTeamMembership)
const mockSetPrimary = vi.mocked(setPrimaryTeam)

const TEAMS: TeamOption[] = [
  { id: 't-hq', name: 'HQ Operations', branch_name: null, activity: null },
  { id: 't-bar', name: 'Gordi HQ Bar', branch_name: 'Gordi HQ', activity: 'bar' },
  { id: 't-kitchen', name: 'Gordi HQ Kitchen', branch_name: 'Gordi HQ', activity: 'kitchen' },
]

const PERSON_NO_TEAM: AdminPersonRow = {
  id: 'p-1',
  full_name: 'Budi Santoso',
  email: 'budi@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['member'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

const PERSON_WITH_HOME: AdminPersonRow = {
  ...PERSON_NO_TEAM,
  teams: [{ team_id: 't-hq', is_primary: true }],
}

const PERSON_NO_HOME: AdminPersonRow = {
  ...PERSON_NO_TEAM,
  teams: [{ team_id: 't-hq', is_primary: false }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAdd.mockResolvedValue(undefined)
  mockEnd.mockResolvedValue(undefined)
  mockSetPrimary.mockResolvedValue(undefined)
})

function Harness({ person, teams, refresh }: { person: AdminPersonRow; teams: TeamOption[]; refresh: () => Promise<void> }) {
  const commits = useRowCommits<boolean>()
  return <TeamPicker person={person} teams={teams} commits={commits} refresh={refresh} />
}

function renderPicker(
  person: AdminPersonRow = PERSON_NO_TEAM,
  teams: TeamOption[] = TEAMS,
  opts: { refresh?: () => Promise<void> } = {},
) {
  return render(<Harness person={person} teams={teams} refresh={opts.refresh ?? vi.fn().mockResolvedValue(undefined)} />)
}

/** The row (checkbox + its trailing status) for a Team. */
function row(name: string): HTMLElement {
  return screen.getByRole('checkbox', { name }).closest('.admin-check-row') as HTMLElement
}

describe('TeamPicker', () => {
  it('lists every team, and names the (branch, activity) pair on the production streams', () => {
    renderPicker()
    expect(screen.getByRole('checkbox', { name: 'HQ Operations' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' })).toBeInTheDocument()
    // A stream team is not just another team — the pair is what makes it one (OD-WAY-49), so it is
    // spelled out rather than left to the name happening to contain it.
    expect(screen.getByText('Gordi HQ · Bar')).toBeInTheDocument()
    expect(screen.getByText('Gordi HQ · Kitchen')).toBeInTheDocument()
  })

  it('the FIRST team a person joins becomes their home team', async () => {
    const user = userEvent.setup()
    renderPicker(PERSON_NO_TEAM)
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))
    // Third argument is is_primary. A person on teams with no primary has no default capture
    // stream, so "added them, silently to nowhere" is not an acceptable outcome of a first join.
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('p-1', 't-bar', true))
  })

  it('...and a later team does not steal the home flag', async () => {
    const user = userEvent.setup()
    renderPicker(PERSON_WITH_HOME)
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('p-1', 't-bar', false))
  })

  it('unchecking a team ENDS the membership rather than deleting it', async () => {
    const user = userEvent.setup()
    renderPicker(PERSON_WITH_HOME)
    await user.click(screen.getByRole('checkbox', { name: 'HQ Operations' }))
    await waitFor(() => expect(mockEnd).toHaveBeenCalledWith('p-1', 't-hq'))
  })

  it('a committed row reads Saved beside itself once the reload lands — no toast', async () => {
    const user = userEvent.setup()
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderPicker(PERSON_WITH_HOME, TEAMS, { refresh })
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))
    await waitFor(() => expect(within(row('Gordi HQ Bar')).getByRole('status')).toHaveTextContent('Saved'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('marks the home team, and offers "Make home" only on the others', async () => {
    const user = userEvent.setup()
    const person: AdminPersonRow = {
      ...PERSON_NO_TEAM,
      teams: [
        { team_id: 't-hq', is_primary: true },
        { team_id: 't-bar', is_primary: false },
      ],
    }
    renderPicker(person)
    expect(within(row('HQ Operations')).getByText('Home')).toBeInTheDocument()
    const makeHome = screen.getAllByRole('button', { name: /^Make home/ })
    expect(makeHome).toHaveLength(1)
    expect(makeHome[0]).toHaveAccessibleName('Make home — Gordi HQ Bar')
    await user.click(makeHome[0])
    await waitFor(() => expect(mockSetPrimary).toHaveBeenCalledWith('p-1', 't-bar'))
  })

  it('says so when a person is on teams but has no home team', () => {
    renderPicker(PERSON_NO_HOME)
    expect(screen.getByRole('status')).toHaveTextContent(/no home team/i)
  })

  it('...and stays quiet when they have one, or belong to nothing yet', () => {
    const { unmount } = renderPicker(PERSON_WITH_HOME)
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    // Nobody on any team is a normal starting state, not a misconfiguration to shout about.
    renderPicker(PERSON_NO_TEAM)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a failed write keeps the attempted value with Failed · Retry beside the row, and reloads the truth', async () => {
    const user = userEvent.setup()
    mockAdd.mockRejectedValueOnce(new Error('add to team failed: permission denied')).mockResolvedValueOnce(undefined)
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderPicker(PERSON_NO_TEAM, TEAMS, { refresh })
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))

    await waitFor(() => expect(within(row('Gordi HQ Bar')).getByRole('alert')).toHaveTextContent('Failed'))
    // The attempted value survives the failure — the box stays checked, not snapped back.
    expect(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' })).toHaveAttribute('aria-checked', 'true')
    // Reload is mandatory after a failure: setPrimaryTeam clears the old primary BEFORE setting the
    // new one, so a throw can leave real state changed.
    expect(refresh).toHaveBeenCalled()

    await user.click(within(row('Gordi HQ Bar')).getByRole('button', { name: 'Retry Gordi HQ Bar' }))
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2))
    expect(mockAdd).toHaveBeenLastCalledWith('p-1', 't-bar', true)
    await waitFor(() => expect(within(row('Gordi HQ Bar')).getByRole('status')).toHaveTextContent('Saved'))
  })

  it('a failed row reverted by the admin clears without writing', async () => {
    const user = userEvent.setup()
    mockAdd.mockRejectedValueOnce(new Error('boom'))
    renderPicker(PERSON_NO_TEAM)
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))
    await waitFor(() => expect(within(row('Gordi HQ Bar')).getByRole('alert')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))
    expect(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' })).toHaveAttribute('aria-checked', 'false')
    expect(within(row('Gordi HQ Bar')).queryByRole('alert')).toBeNull()
    expect(mockAdd).toHaveBeenCalledTimes(1)
    expect(mockEnd).not.toHaveBeenCalled()
  })

  it('a long list opens on the person\'s own Teams, with a filter and Show all', async () => {
    const user = userEvent.setup()
    const many: TeamOption[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t-${i}`, name: `Team ${String.fromCharCode(65 + i)}`, branch_name: null, activity: null,
    }))
    const labels = () => screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))
    renderPicker({ ...PERSON_NO_TEAM, teams: [{ team_id: 't-7', is_primary: true }] }, many)
    expect(labels()).toEqual(['Team H'])

    await user.type(screen.getByRole('searchbox', { name: 'Filter Teams' }), 'team c')
    expect(labels()).toEqual(['Team C'])
    await user.clear(screen.getByRole('searchbox', { name: 'Filter Teams' }))

    await user.click(screen.getByRole('button', { name: 'Show all 10' }))
    // Chosen first, then the rest in their own order.
    expect(labels()).toEqual(['Team H', 'Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team I', 'Team J'])
  })

  it('renders the empty case without crashing when no teams exist', () => {
    renderPicker(PERSON_NO_TEAM, [])
    expect(screen.getByText('No Teams defined yet')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

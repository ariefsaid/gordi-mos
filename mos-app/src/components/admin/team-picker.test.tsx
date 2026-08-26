// TeamPicker tests — the admin's "put this person on a team" surface (owner, 2026-08-26).
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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/db/admin-users', () => ({
  addTeamMembership: vi.fn(),
  endTeamMembership: vi.fn(),
  setPrimaryTeam: vi.fn(),
}))
import { addTeamMembership, endTeamMembership, setPrimaryTeam } from '@/lib/db/admin-users'

import { TeamPicker } from './team-picker'
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

function renderPicker(
  person: AdminPersonRow = PERSON_NO_TEAM,
  teams: TeamOption[] = TEAMS,
  opts: { onDone?: () => void; onShowToast?: (message: string) => void } = {},
) {
  return render(
    <TeamPicker
      person={person}
      teams={teams}
      onDone={opts.onDone ?? vi.fn()}
      onShowToast={opts.onShowToast}
    />,
  )
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
    expect(screen.getByText('Home')).toBeInTheDocument()
    const makeHome = screen.getAllByRole('button', { name: 'Make home' })
    expect(makeHome).toHaveLength(1)
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

  it('surfaces a failed write inline instead of pretending it worked', async () => {
    const user = userEvent.setup()
    mockAdd.mockRejectedValue(new Error('add to team failed: permission denied'))
    const onDone = vi.fn()
    renderPicker(PERSON_NO_TEAM, TEAMS, { onDone })
    await user.click(screen.getByRole('checkbox', { name: 'Gordi HQ Bar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('add to team failed: permission denied'),
    )
    // A failed write must not trigger the caller's reload-and-carry-on path.
    expect(onDone).not.toHaveBeenCalled()
  })

  it('renders the empty case without crashing when no teams exist', () => {
    renderPicker(PERSON_NO_TEAM, [])
    expect(screen.getByText('No teams defined yet')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

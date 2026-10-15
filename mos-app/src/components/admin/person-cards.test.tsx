import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPersonRow, TeamOption } from '@/lib/db/admin-users.types'

const db = vi.hoisted(() => ({
  addTeamMembership: vi.fn(),
  endTeamMembership: vi.fn(),
  setPrimaryTeam: vi.fn(),
}))
vi.mock('@/lib/db/admin-users', () => db)

const { TeamsCard } = await import('./person-cards')
const { accountActionsFor, nextAccountAction } = await import('./account-actions')

afterEach(cleanup)
beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset().mockResolvedValue(undefined)
})

const teams: TeamOption[] = [
  { id: 'bar', name: 'Gordi HQ Bar', branch_name: 'Gordi HQ', activity: 'bar' },
  { id: 'ops', name: 'HQ Operations', branch_name: null, activity: null },
  { id: 'kitchen', name: 'Gordi HQ Kitchen', branch_name: 'Gordi HQ', activity: 'kitchen' },
]
const person = (over: Partial<AdminPersonRow> = {}): AdminPersonRow => ({
  id: 'p1', full_name: 'Bayu Barista', email: 'bayu@example.test', archived_at: null, login: 'active',
  access_roles: ['member'], jabatan: [], revenue_scope: [],
  teams: [{ team_id: 'bar', is_primary: true }, { team_id: 'ops', is_primary: false }],
  ...over,
})

async function saveTeams(p: AdminPersonRow, toggle: string[]) {
  const refresh = vi.fn().mockResolvedValue(undefined)
  render(<TeamsCard person={p} teams={teams} refresh={refresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'Change Teams' }))
  for (const name of toggle) fireEvent.click(screen.getByRole('checkbox', { name }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Teams' }))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
}

describe('Teams card', () => {
  it('ends the Home team before adding, and the first added Team takes the free Home slot', async () => {
    await saveTeams(person(), ['Gordi HQ Bar', 'Gordi HQ Kitchen'])
    expect(db.endTeamMembership).toHaveBeenCalledWith('p1', 'bar')
    expect(db.addTeamMembership).toHaveBeenCalledWith('p1', 'kitchen', true)
    expect(db.endTeamMembership.mock.invocationCallOrder[0]).toBeLessThan(db.addTeamMembership.mock.invocationCallOrder[0])
  })

  it('adds as an ordinary Team while the Home team stays', async () => {
    await saveTeams(person(), ['Gordi HQ Kitchen'])
    expect(db.addTeamMembership).toHaveBeenCalledWith('p1', 'kitchen', false)
  })

  it('keeps the Home slot taken when ending the Home team failed', async () => {
    db.endTeamMembership.mockRejectedValueOnce(new Error('refused'))
    await saveTeams(person(), ['Gordi HQ Bar', 'Gordi HQ Kitchen'])
    expect(db.addTeamMembership).toHaveBeenCalledWith('p1', 'kitchen', false)
  })

  it('Make home on the card sets that Team as Home', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<TeamsCard person={person()} teams={teams} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make home — HQ Operations' }))
    await waitFor(() => expect(db.setPrimaryTeam).toHaveBeenCalledWith('p1', 'ops'))
  })

  it('warns when someone is on Teams with no Home team', () => {
    render(<TeamsCard person={person({ teams: [{ team_id: 'ops', is_primary: false }] })} teams={teams} refresh={vi.fn()} />)
    expect(screen.getByText(/No Home Team/)).toBeInTheDocument()
  })
})

describe('Account actions by state', () => {
  const admin = person({ access_roles: ['admin'] })
  it('offers the fix for an unusual state first, else a password reset', () => {
    expect(nextAccountAction(person({ login: 'none' }))).toBe('create-login')
    expect(nextAccountAction(person({ login: 'disabled' }))).toBe('enable-login')
    expect(nextAccountAction(person({ archived_at: '2026-01-01' }))).toBe('restore')
    expect(nextAccountAction(person())).toBe('reset-password')
  })
  it('blocks disabling or archiving the only active admin', () => {
    expect(accountActionsFor(admin, [admin, person({ id: 'p2' })])).toEqual([
      { action: 'reset-password', blocked: false },
      { action: 'disable-login', blocked: true },
      { action: 'archive', blocked: true },
    ])
  })
})

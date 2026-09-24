import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/admin-access', () => ({
  listTeamLeadAssignments: vi.fn(),
  listTeamLeadCandidates: vi.fn(),
  saveTeamLeadAssignment: vi.fn(),
}))
vi.mock('@/lib/db/admin-users', () => ({ listTeams: vi.fn() }))

import { listTeamLeadAssignments, listTeamLeadCandidates, saveTeamLeadAssignment } from '@/lib/db/admin-access'
import { listTeams } from '@/lib/db/admin-users'
import { AdminTeamsPage } from './admin-teams-page'

const mockAssignments = vi.mocked(listTeamLeadAssignments)
const mockCandidates = vi.mocked(listTeamLeadCandidates)
const mockSave = vi.mocked(saveTeamLeadAssignment)

const CANDIDATES = [
  { person_id: 'person-1', full_name: 'Ari Lead' },
  { person_id: 'person-2', full_name: 'Dina Lead' },
]

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={['/admin/teams']}>
        <AdminTeamsPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  const trigger = screen.getByRole('combobox', { name: label })
  await waitFor(() => expect(trigger).toBeEnabled())
  await user.click(trigger)
  await user.click(await screen.findByRole('option', { name: option }))
}

function rowOf(team: string): HTMLElement {
  return screen.getByRole('combobox', { name: `Lead for ${team}` }).closest('[data-team-lead-row]') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockAssignments.mockResolvedValue([
    { team_id: 'team-1', team_name: 'Gordi HQ Bar', business_unit_id: 'bu-1', lead_person_id: 'person-1', lead_name: 'Ari Lead' },
    { team_id: 'team-2', team_name: 'Cikal Bar', business_unit_id: 'bu-1', lead_person_id: null, lead_name: null },
  ])
  mockCandidates.mockImplementation(async (teamId) => (teamId === 'team-1' ? CANDIDATES : []))
  vi.mocked(listTeams).mockResolvedValue([
    { id: 'team-1', name: 'Gordi HQ Bar', branch_name: 'Gordi HQ', activity: 'bar' },
    { id: 'team-2', name: 'Cikal Bar', branch_name: 'Cikal', activity: 'bar' },
  ])
  mockSave.mockResolvedValue(undefined)
})

describe('AdminTeamsPage', () => {
  it('lists each Team with its stream, active member count and lead — no Save buttons', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument()
    const bar = rowOf('Gordi HQ Bar')
    expect(within(bar).getByText('Gordi HQ · Bar')).toBeInTheDocument()
    await waitFor(() => expect(within(bar).getByText('2 active members')).toBeInTheDocument())
    expect(within(bar).getByRole('combobox', { name: 'Lead for Gordi HQ Bar' })).toHaveTextContent('Ari Lead')
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('a Team with no active members explains itself and offers no choice', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    const cikal = rowOf('Cikal Bar')
    await waitFor(() => expect(within(cikal).getByText('No active members in this Team.')).toBeInTheDocument())
    expect(within(cikal).getByRole('combobox', { name: 'Lead for Cikal Bar' })).toBeDisabled()
  })

  it('choosing a lead saves at once and reads Saved beside the row', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    await choose(user, 'Lead for Gordi HQ Bar', 'Dina Lead')

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('team-1', 'person-2'))
    expect(mockSave).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(rowOf('Gordi HQ Bar')).getByRole('status')).toHaveTextContent('Saved'))
  })

  it('No designated lead clears the designation', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    await choose(user, 'Lead for Gordi HQ Bar', 'No designated lead')
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('team-1', null))
  })

  it('a failed save keeps the chosen lead with Failed · Retry, and Retry saves that same choice', async () => {
    const user = userEvent.setup()
    mockSave.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined)
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    await choose(user, 'Lead for Gordi HQ Bar', 'Dina Lead')

    const row = rowOf('Gordi HQ Bar')
    await waitFor(() => expect(within(row).getByRole('alert')).toHaveTextContent('Failed'))
    expect(within(row).getByRole('combobox', { name: 'Lead for Gordi HQ Bar' })).toHaveTextContent('Dina Lead')

    await user.click(within(row).getByRole('button', { name: 'Retry Lead for Gordi HQ Bar' }))
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
    expect(mockSave).toHaveBeenLastCalledWith('team-1', 'person-2')
    await waitFor(() => expect(within(row).getByRole('status')).toHaveTextContent('Saved'))
    expect(within(row).getByRole('combobox', { name: 'Lead for Gordi HQ Bar' })).toHaveTextContent('Dina Lead')
  })

  it('choosing the saved lead again after a failure reverts without writing', async () => {
    const user = userEvent.setup()
    mockSave.mockRejectedValueOnce(new Error('network down'))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    await choose(user, 'Lead for Gordi HQ Bar', 'Dina Lead')
    await waitFor(() => expect(within(rowOf('Gordi HQ Bar')).getByRole('alert')).toBeInTheDocument())

    await choose(user, 'Lead for Gordi HQ Bar', 'Ari Lead')
    expect(within(rowOf('Gordi HQ Bar')).queryByRole('alert')).toBeNull()
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it('one Team failing to load its members leaves the others working and retries on its own', async () => {
    const user = userEvent.setup()
    mockCandidates.mockReset()
    mockCandidates
      .mockRejectedValueOnce(new Error('candidate timeout'))
      .mockResolvedValue(CANDIDATES)
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    expect(await screen.findByText("Couldn't load Team members. Try again.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry Gordi HQ Bar members' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Lead for Gordi HQ Bar' })).toBeEnabled())
  })

  it('reads in Indonesian', async () => {
    renderPage('id')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tim' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Ketua untuk Gordi HQ Bar' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('2 anggota aktif')).toBeInTheDocument())
  })
})

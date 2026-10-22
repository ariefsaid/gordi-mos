import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/staff-attendance', () => ({
  copyStaffRoster: vi.fn(),
  getStaffRoster: vi.fn(),
  listLedStaffTeams: vi.fn(),
  listMyStaffShifts: vi.fn(),
  listStaffSiteTemplates: vi.fn(),
  listStaffStandingHours: vi.fn(),
  publishStaffRoster: vi.fn(),
  removeStaffShift: vi.fn(),
  saveStaffShift: vi.fn(),
  saveStandingHours: vi.fn(),
}))

import {
  copyStaffRoster, getStaffRoster, listLedStaffTeams, listMyStaffShifts,
  listStaffSiteTemplates, listStaffStandingHours, publishStaffRoster, removeStaffShift, saveStaffShift, saveStandingHours,
} from '@/lib/db/staff-attendance'
import { StaffShiftsPage } from './staff-shifts-page'

function currentWeekStart(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const date = new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

function addWeeks(dateValue: string, weeks: number): string {
  const date = new Date(`${dateValue}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

const weekStart = currentWeekStart()
const nextWeekStart = addWeeks(weekStart, 1)
const team = { id: 'team-1', name: 'Radiant Crew', site_id: 'site-1', site_name: 'Radiant' }
const personalShift = {
  id: 'shift-1', team_id: 'team-1', team_name: 'Radiant Crew', site_id: 'site-1', site_name: 'Radiant',
  local_date: weekStart, template_name: 'Morning', start_at: `${weekStart}T00:00:00Z`, end_at: `${weekStart}T08:00:00Z`,
  crew: ['Nisa', 'Rani'],
}
const roster = {
  team_id: 'team-1', team_name: 'Radiant Crew', site_id: 'site-1', site_name: 'Radiant', week_start: weekStart, status: 'draft' as const,
  shifts: [], members: [{ person_id: 'person-1', full_name: 'Ayu Crew' }],
}
const scheduledShift = { ...personalShift, template_id: 'template-1', person_id: 'person-1', person_name: 'Ayu Crew' }
const shiftTemplate = { id: 'template-1', site_id: 'site-1', name: 'Morning', start_time: '07:00:00', end_time: '15:00:00', archived_at: null }
const standing = {
  effective_from: nextWeekStart, team_name: 'Radiant Crew', site_name: 'Radiant',
  current_default: null, current_exceptions: [],
  default: { active: true, working_days: [0, 1, 2, 3, 4], start_time: '09:00:00', end_time: '17:00:00' },
  exceptions: [],
}

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><MemoryRouter initialEntries={['/staff/shifts']}><StaffShiftsPage /></MemoryRouter></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(listLedStaffTeams).mockResolvedValue([team])
  vi.mocked(listMyStaffShifts).mockResolvedValue([personalShift])
  vi.mocked(getStaffRoster).mockResolvedValue(roster)
  vi.mocked(listStaffSiteTemplates).mockResolvedValue([shiftTemplate])
  vi.mocked(listStaffStandingHours).mockResolvedValue(standing)
  vi.mocked(saveStaffShift).mockResolvedValue('shift-new')
  vi.mocked(removeStaffShift).mockResolvedValue(undefined)
  vi.mocked(publishStaffRoster).mockResolvedValue(1)
  vi.mocked(copyStaffRoster).mockResolvedValue(1)
  vi.mocked(saveStandingHours).mockResolvedValue(nextWeekStart)
})

describe('StaffShiftsPage', () => {
  it('AC-007 shows a Person their shifts and only the same-shift crew in English', async () => {
    renderPage()
    expect(await screen.findByText('Radiant Crew · Radiant')).toBeInTheDocument()
    expect(screen.getByText('On this shift: Nisa, Rani')).toBeInTheDocument()
    expect(screen.getByText('07:00–15:00 WIB')).toBeInTheDocument()
  })

  it('AC-007 renders the personal shift and crew in Indonesian', async () => {
    renderPage('id')
    expect(await screen.findByText('Rekan satu shift: Nisa, Rani')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Shift saya' })).toBeInTheDocument()
  })

  it('AC-004 lets the Team lead add and publish a roster week', async () => {
    const user = userEvent.setup()
    vi.mocked(getStaffRoster).mockImplementation(async (_teamId, weekStart) => ({
      ...roster,
      week_start: weekStart,
      shifts: vi.mocked(saveStaffShift).mock.calls.length === 0 ? [] : [{
        ...personalShift, person_id: 'person-1', person_name: 'Ayu Crew', local_date: weekStart,
      }],
    }))
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Team roster' }))
    await screen.findByRole('button', { name: 'Add shift' })
    await user.click(screen.getByRole('button', { name: 'Add shift' }))
    await waitFor(() => expect(saveStaffShift).toHaveBeenCalledWith('team-1', 'person-1', expect.any(String), 'template-1', null))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish week' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Publish week' }))
    await waitFor(() => expect(publishStaffRoster).toHaveBeenCalledWith('team-1', expect.any(String)))
    expect(await screen.findByRole('status')).toHaveTextContent('Week published. 1 people were notified.')
  })

  it('AC-004 edits an existing shift without changing its date', async () => {
    const user = userEvent.setup()
    vi.mocked(getStaffRoster).mockResolvedValue({ ...roster, shifts: [scheduledShift] })
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Team roster' }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save shift' }))
    await waitFor(() => expect(saveStaffShift).toHaveBeenCalledWith('team-1', 'person-1', weekStart, 'template-1', 'shift-1'))
  })

  it('AC-004 removes a shift after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(getStaffRoster).mockResolvedValue({ ...roster, status: 'published', shifts: [scheduledShift] })
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Team roster' }))
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeStaffShift).toHaveBeenCalledWith('shift-1'))
    expect(await screen.findByRole('status')).toHaveTextContent('Shift removed.')
  })

  it('AC-005 copies last week into a new draft', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Team roster' }))
    await user.click(await screen.findByRole('button', { name: 'Copy last week' }))
    await waitFor(() => expect(copyStaffRoster).toHaveBeenCalledWith('team-1', expect.any(String)))
    expect(await screen.findByRole('status')).toHaveTextContent('1 shifts copied into a draft.')
  })

  it('AC-002 surfaces overlap refusal from the database without creating a shift', async () => {
    const user = userEvent.setup()
    vi.mocked(saveStaffShift).mockRejectedValueOnce(new Error('STAFF_SHIFT_OVERLAP'))
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Team roster' }))
    await user.click(await screen.findByRole('button', { name: 'Add shift' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already has a shift at that time')
  })

  it('saves Team standing hours and returns a Person to the Team default', async () => {
    const user = userEvent.setup()
    vi.mocked(listStaffStandingHours).mockResolvedValue({
      ...standing,
      exceptions: [{ person_id: 'person-1', full_name: 'Ayu Crew', active: true, working_days: [0, 1], start_time: '10:00:00', end_time: '18:00:00' }],
    })
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Standing hours' }))
    await screen.findByRole('heading', { name: 'Team default' })
    await user.click(screen.getByRole('button', { name: 'Save Team default' }))
    await waitFor(() => expect(saveStandingHours).toHaveBeenCalledWith('team-1', null, [0, 1, 2, 3, 4], '09:00', '17:00', true))
    await user.click(screen.getByRole('button', { name: 'Return to default' }))
    await waitFor(() => expect(saveStandingHours).toHaveBeenCalledWith('team-1', 'person-1', [], null, null, null))
  })

  it('AC-006 saves a Person exception with its own hours for next Monday', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Radiant Crew · Radiant')
    await user.click(screen.getByRole('tab', { name: 'Standing hours' }))
    await screen.findByRole('heading', { name: 'Team default' })
    await user.click(screen.getByRole('combobox', { name: 'Person' }))
    await user.click(await screen.findByRole('option', { name: 'Ayu Crew' }))
    const startFields = screen.getAllByLabelText('Starts · WIB')
    await user.clear(startFields[1])
    await user.type(startFields[1], '10:00')
    await user.click(screen.getByRole('button', { name: 'Save Person exception' }))
    await waitFor(() => expect(saveStandingHours).toHaveBeenCalledWith('team-1', 'person-1', [0, 1, 2, 3, 4], '10:00', '17:00', true))
  })
})


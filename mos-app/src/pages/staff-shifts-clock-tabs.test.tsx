import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/staff-attendance', () => ({ listLedStaffTeams: vi.fn() }))
vi.mock('@/components/staff-attendance/clock-panel', () => ({ ClockPanel: () => <p>clock panel</p> }))
vi.mock('@/components/staff-attendance/attendance-today-panel', () => ({ AttendanceTodayPanel: () => <p>today panel</p> }))
vi.mock('@/components/staff-attendance/staff-shift-panels', () => ({
  MyShiftsPanel: () => <p>my shifts panel</p>, StaffRosterPanel: () => <p>roster panel</p>, StandingHoursPanel: () => <p>standing panel</p>,
}))

import { listLedStaffTeams } from '@/lib/db/staff-attendance'
import { StaffShiftsPage } from './staff-shifts-page'

function renderPage(entry = '/staff/shifts') {
  return render(<I18nProvider initialLocale="en"><MemoryRouter initialEntries={[entry]}><StaffShiftsPage /></MemoryRouter></I18nProvider>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('StaffShiftsPage clock tabs', () => {
  it('AC-035 offers clock in/out to everyone and opens it from the Home link', async () => {
    vi.mocked(listLedStaffTeams).mockResolvedValue([])
    renderPage('/staff/shifts?view=clock')
    expect(await screen.findByText('clock panel')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Today’s attendance' })).not.toBeInTheDocument()
  })

  it('FR-040 offers today’s attendance only to people who lead a Team', async () => {
    const user = userEvent.setup()
    vi.mocked(listLedStaffTeams).mockResolvedValue([{ id: 't1', name: 'Bar', site_id: 's1', site_name: 'HQ' }])
    renderPage()
    await user.click(await screen.findByRole('tab', { name: 'Today’s attendance' }))
    expect(screen.getByText('today panel')).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/attendance-clock', () => ({
  attendanceSelfieUrl: vi.fn(), correctAttendanceRecord: vi.fn(), getAttendanceRecord: vi.fn(), listTeamAttendance: vi.fn(),
}))

import { attendanceSelfieUrl, correctAttendanceRecord, getAttendanceRecord, listTeamAttendance, type TeamAttendanceRow } from '@/lib/db/attendance-clock'
import { AttendanceTodayPanel } from './attendance-today-panel'

const teams = [{ id: 'team-1', name: 'Bar', site_id: 'site-1', site_name: 'HQ' }]
const row = (patch: Partial<TeamAttendanceRow>): TeamAttendanceRow => ({
  person_id: 'p1', person_name: 'Arif', start_at: '2026-10-22T00:00:00Z', end_at: '2026-10-22T08:00:00Z', status: 'scheduled',
  record_id: null, clock_in_at: null, clock_out_at: null, late_minutes: null, early_minutes: null, corrected: false, ...patch,
})

function renderPanel(locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><AttendanceTodayPanel teams={teams} /></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(attendanceSelfieUrl).mockResolvedValue('https://signed.example/selfie.jpg')
  vi.mocked(getAttendanceRecord).mockResolvedValue({
    id: 'rec-1', person_id: 'p1', status: 'closed', shift_start_at: '2026-10-22T00:00:00Z', shift_end_at: '2026-10-22T08:00:00Z',
    clock_in_at: '2026-10-22T00:05:00Z', clock_out_at: null, in_distance_m: 80, in_accuracy_m: 20, late: false, late_minutes: null,
    early_leave: false, early_minutes: null, closure: 'no_clock_out', source: 'device', selfie_path: 'org/rec/x.jpg', history: [],
  })
})

describe('AttendanceTodayPanel', () => {
  it('FR-040 lists each Person with their status for the day', async () => {
    vi.mocked(listTeamAttendance).mockResolvedValue([
      row({ person_name: 'Arif', status: 'missing' }),
      row({ person_id: 'p2', person_name: 'Bulan', status: 'late', record_id: 'rec-2', clock_in_at: '2026-10-22T00:15:00Z' }),
      row({ person_id: 'p3', person_name: 'Cahya', status: 'in', record_id: 'rec-3', clock_in_at: '2026-10-21T23:58:00Z' }),
      row({ person_id: 'p4', person_name: 'Dimas', status: 'no_clock_out', record_id: 'rec-4', clock_in_at: '2026-10-22T00:05:00Z' }),
    ])
    renderPanel()
    expect(await screen.findByText('Missing')).toBeInTheDocument()
    expect(screen.getByText('Late')).toBeInTheDocument()
    expect(screen.getByText('Clocked in')).toBeInTheDocument()
    expect(screen.getByText('No clock-out')).toBeInTheDocument()
    expect(screen.getByText(/in 07:15/)).toBeInTheDocument()
  })

  it('FR-040 shows the statuses in Indonesian', async () => {
    vi.mocked(listTeamAttendance).mockResolvedValue([row({ status: 'missing' })])
    renderPanel('id')
    expect(await screen.findByText('Belum hadir')).toBeInTheDocument()
  })

  it('FR-040 shows an empty state and a retry on error', async () => {
    const user = userEvent.setup()
    vi.mocked(listTeamAttendance).mockRejectedValueOnce(new Error('x')).mockResolvedValue([])
    renderPanel()
    await screen.findByText('Attendance could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No shifts for this Team on this date.')).toBeInTheDocument()
  })

  it('AC-033 a correction needs a reason and then sends the new times in WIB', async () => {
    const user = userEvent.setup()
    vi.mocked(listTeamAttendance).mockResolvedValue([row({ person_name: 'Dimas', status: 'no_clock_out', record_id: 'rec-1', clock_in_at: '2026-10-22T00:05:00Z' })])
    vi.mocked(correctAttendanceRecord).mockResolvedValue('rec-1')
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Open Dimas' }))
    const form = await screen.findByRole('form', { name: 'Correct record for Dimas' })
    expect(await screen.findByRole('img', { name: 'Clock-in selfie of Dimas' })).toBeInTheDocument()
    await user.type(within(form).getByLabelText('Clock-out · WIB'), '15:00')
    await user.click(within(form).getByRole('button', { name: 'Save correction' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Give a reason for the correction.')
    expect(correctAttendanceRecord).not.toHaveBeenCalled()
    await user.type(within(form).getByLabelText('Reason (required)'), 'Phone died at the door')
    await user.click(within(form).getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(correctAttendanceRecord).toHaveBeenCalledWith('p1', '2026-10-22T00:00:00Z', '2026-10-22T00:05:00.000Z', '2026-10-22T08:00:00.000Z', 'Phone died at the door'))
  })

  it('AC-033 an overnight correction puts the clock-out on the next day', async () => {
    const user = userEvent.setup()
    vi.mocked(listTeamAttendance).mockResolvedValue([row({ person_name: 'Dimas', status: 'no_clock_out', record_id: 'rec-1', start_at: '2026-10-22T15:00:00Z', end_at: '2026-10-22T23:00:00Z', clock_in_at: '2026-10-22T15:00:00Z' })])
    vi.mocked(correctAttendanceRecord).mockResolvedValue('rec-1')
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Open Dimas' }))
    const form = await screen.findByRole('form', { name: 'Correct record for Dimas' })
    await user.type(within(form).getByLabelText('Clock-out · WIB'), '06:00')
    await user.type(within(form).getByLabelText('Reason (required)'), 'Forgot to clock out')
    await user.click(within(form).getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(correctAttendanceRecord).toHaveBeenCalledWith('p1', '2026-10-22T15:00:00Z', '2026-10-22T15:00:00.000Z', '2026-10-22T23:00:00.000Z', 'Forgot to clock out'))
  })
})

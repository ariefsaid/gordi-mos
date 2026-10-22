import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/attendance-clock', () => ({ getAttendanceSettings: vi.fn(), saveAttendanceSettings: vi.fn() }))
vi.mock('@/lib/db/staff-attendance', () => ({ listAttendanceSites: vi.fn(), saveAttendanceSite: vi.fn() }))

import { getAttendanceSettings, saveAttendanceSettings, type AttendanceSettings } from '@/lib/db/attendance-clock'
import { listAttendanceSites, saveAttendanceSite } from '@/lib/db/staff-attendance'
import { AdminAttendanceSettingsPage } from './admin-attendance-settings-page'

const defaults: AttendanceSettings = {
  late_grace_min: 10, clock_in_open_min: 30, max_accuracy_m: 50, missing_alert_min: 30,
  no_clockout_close_min: 120, uncovered_alert_min: 120, leave_cutoff_days: 3, selfie_retention_days: 90,
}

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><MemoryRouter initialEntries={['/admin/attendance-settings']}><AdminAttendanceSettingsPage /></MemoryRouter></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAttendanceSettings).mockResolvedValue(defaults)
  vi.mocked(listAttendanceSites).mockResolvedValue([
    { id: 'site-1', name: 'HQ', latitude: -6.2, longitude: 106.82, attendance_radius_m: 100 },
    { id: 'site-2', name: 'Cikal', latitude: null, longitude: null, attendance_radius_m: 100 },
  ])
  vi.mocked(saveAttendanceSettings).mockResolvedValue('2026-10-22T03:00:00Z')
  vi.mocked(saveAttendanceSite).mockResolvedValue(undefined)
})

describe('AdminAttendanceSettingsPage', () => {
  it('AC-036 saves the late grace and the Site pin and radius together', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Attendance settings' })).toBeInTheDocument()
    const grace = screen.getByLabelText(/Late grace \(minutes\)/)
    await user.clear(grace)
    await user.type(grace, '5')
    const radius = screen.getByLabelText(/Attendance radius/)
    await user.clear(radius)
    await user.type(radius, '150')
    await user.click(screen.getByRole('button', { name: 'Save attendance settings' }))
    await waitFor(() => expect(saveAttendanceSettings).toHaveBeenCalledWith({ ...defaults, late_grace_min: 5 }))
    expect(saveAttendanceSite).toHaveBeenCalledWith('site-1', -6.2, 106.82, 150)
    expect(await screen.findByRole('status')).toHaveTextContent('Attendance settings saved.')
  })

  it('AC-036 says the change applies from the next shift and lists the other defaults', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/applies from the next shift that starts after you save/)).toBeInTheDocument()
    await user.click(screen.getByText('Other attendance defaults'))
    const list = screen.getByText('Clock-in opens').closest('div') as HTMLElement
    expect(within(list).getByText('30 min before start')).toBeInTheDocument()
    expect(screen.getByText('90 days')).toBeInTheDocument()
  })

  it('AC-036 refuses a grace outside 0 to 120 minutes without saving', async () => {
    const user = userEvent.setup()
    renderPage()
    const grace = await screen.findByLabelText(/Late grace \(minutes\)/)
    await user.clear(grace)
    await user.type(grace, '500')
    await user.click(screen.getByRole('button', { name: 'Save attendance settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('whole number of minutes from 0 to 120')
    expect(saveAttendanceSettings).not.toHaveBeenCalled()
  })

  it('AC-036 warns when a Site has no map point, in Indonesian too', async () => {
    const user = userEvent.setup()
    renderPage('id')
    await screen.findByRole('heading', { level: 1, name: 'Pengaturan kehadiran' })
    await user.click(screen.getByRole('combobox', { name: 'Lokasi' }))
    await user.click(await screen.findByRole('option', { name: 'Cikal' }))
    expect(await screen.findByText(/Site ini belum punya titik peta/)).toBeInTheDocument()
  })
})

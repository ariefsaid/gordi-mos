import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/staff-attendance', () => ({ listNextMyStaffShifts: vi.fn() }))

import { listNextMyStaffShifts, type StaffShift } from '@/lib/db/staff-attendance'
import { HomeStaffShifts } from './home-staff-shifts'

const mockList = vi.mocked(listNextMyStaffShifts)
const shifts: StaffShift[] = [{
  id: 'shift-1', team_id: 'team-1', team_name: 'Radiant Crew', site_id: 'site-1', site_name: 'Radiant',
  local_date: '2026-10-26', template_name: 'Pagi', start_at: '2026-10-26T00:00:00.000Z',
  end_at: '2026-10-26T08:00:00.000Z', crew: ['Nisa', 'Rani'],
}]

function renderCard(locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><MemoryRouter><HomeStaffShifts /></MemoryRouter></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockResolvedValue(shifts)
})

describe('HomeStaffShifts', () => {
  it('shows the next published shift, its crew, and a route to the full schedule', async () => {
    renderCard()
    expect(await screen.findByText('07:00–15:00 WIB')).toBeInTheDocument()
    expect(screen.getByText('Radiant · Radiant Crew')).toBeInTheDocument()
    expect(screen.getByText('On this shift: Nisa, Rani')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View my shifts' })).toHaveAttribute('href', '/work/shifts')
  })

  it('announces an error and retries into the empty state in Indonesian', async () => {
    const user = userEvent.setup()
    mockList.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    renderCard('id')
    expect(await screen.findByRole('alert')).toHaveTextContent('Shift berikutnya tidak dapat dimuat.')
    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))
    expect(await screen.findByText('Belum ada shift mendatang yang diterbitkan.')).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/staff-attendance', () => ({
  archiveSiteShiftTemplate: vi.fn(),
  listAttendanceSites: vi.fn(),
  listStaffSiteTemplates: vi.fn(),
  saveAttendanceSite: vi.fn(),
  saveSiteShiftTemplate: vi.fn(),
}))

import {
  listAttendanceSites, listStaffSiteTemplates, saveAttendanceSite, saveSiteShiftTemplate,
} from '@/lib/db/staff-attendance'
import { AdminAttendancePage } from './admin-attendance-page'

const sites = vi.mocked(listAttendanceSites)
const templates = vi.mocked(listStaffSiteTemplates)
const saveSite = vi.mocked(saveAttendanceSite)
const saveTemplate = vi.mocked(saveSiteShiftTemplate)

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><MemoryRouter initialEntries={['/admin/shift-builder']}><AdminAttendancePage /></MemoryRouter></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  sites.mockResolvedValue([{ id: 'site-1', name: 'HQ', latitude: null, longitude: null, attendance_radius_m: 100 }])
  templates.mockResolvedValue([])
  saveSite.mockResolvedValue(undefined)
  saveTemplate.mockResolvedValue('template-1')
})

describe('AdminAttendancePage', () => {
  it('AC-036 saves Site coordinates, radius, and a named shift', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Shift builder' })).toBeInTheDocument()

    const sitePanel = await screen.findByRole('region', { name: 'Site location' })
    await user.click(within(sitePanel).getByText('Site location'))
    await user.type(within(sitePanel).getByRole('spinbutton', { name: 'Latitude' }), '0')
    await user.type(within(sitePanel).getByRole('spinbutton', { name: 'Longitude' }), '0')
    await user.click(within(sitePanel).getByRole('button', { name: 'Save' }))
    expect(saveSite).toHaveBeenCalledWith('site-1', 0, 0, 100)

    await user.click(screen.getByRole('button', { name: 'Add Site shift' }))
    await user.type(screen.getByRole('textbox', { name: 'Shift name' }), 'Morning')
    await user.click(screen.getByRole('button', { name: 'Add Site shift' }))
    expect(saveTemplate).toHaveBeenCalledWith('site-1', null, 'Morning', '07:00', '15:00')
  })

  it('edits and archives a Site shift template', async () => {
    const user = userEvent.setup()
    const original = { id: 'template-1', site_id: 'site-1', name: 'Morning', start_time: '07:00:00', end_time: '15:00:00', archived_at: null }
    const edited = { ...original, name: 'Evening', start_time: '14:00:00', end_time: '22:00:00' }
    templates.mockResolvedValueOnce([original]).mockResolvedValueOnce([edited]).mockResolvedValueOnce([{ ...edited, archived_at: '2026-10-22T00:00:00Z' }])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await screen.findByRole('button', { name: 'Edit' })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const name = screen.getByRole('textbox', { name: 'Shift name' })
    await user.clear(name)
    await user.type(name, 'Evening')
    const start = screen.getByLabelText('Starts · WIB')
    const end = screen.getByLabelText(/^Ends · WIB/)
    await user.clear(start)
    await user.type(start, '14:00')
    await user.clear(end)
    await user.type(end, '22:00')
    await user.click(within(name.closest('form')!).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveTemplate).toHaveBeenCalledWith('site-1', 'template-1', 'Evening', '14:00', '22:00'))
    await screen.findByText('Evening')
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    expect(vi.mocked(window.confirm)).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('combobox', { name: 'Shift status' }))
    await user.click(await screen.findByRole('option', { name: 'Archived shifts' }))
    expect(await screen.findByText('Archived · unavailable for new assignments')).toBeInTheDocument()
  })

  it('shows the complete Admin settings surface in Indonesian', async () => {
    renderPage('id')
    expect(await screen.findByRole('heading', { level: 1, name: 'Penyusun shift' })).toBeInTheDocument()
    expect(screen.getByText('Lokasi Site')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shift di Site ini' })).toBeInTheDocument()
  })

  it('AC-036 rejects an incomplete Site pin before saving', async () => {
    const user = userEvent.setup()
    renderPage()
    const sitePanel = await screen.findByRole('region', { name: 'Site location' })
    await user.click(within(sitePanel).getByText('Site location'))
    await user.type(within(sitePanel).getByRole('spinbutton', { name: 'Latitude' }), '0')
    await user.click(within(sitePanel).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid latitude and longitude together')
    expect(saveSite).not.toHaveBeenCalled()
  })
})

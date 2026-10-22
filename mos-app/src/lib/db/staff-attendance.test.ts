import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { schema: () => ({ rpc: mocks.rpc, from: mocks.from }) } }))

import {
  archiveSiteShiftTemplate, copyStaffRoster, getStaffRoster, listAttendanceAdminDirectory, listAttendanceSites,
  listLedStaffTeams, listMyStaffShifts, listNextMyStaffShifts, listStaffSiteTemplates,
  listStaffStandingHours, publishStaffRoster, removeStaffShift, saveAttendanceSite,
  saveAttendanceTeamSite, saveSiteShiftTemplate, saveStaffShift, saveStandingHours,
} from './staff-attendance'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: 'row-id', error: null })
  mocks.from.mockImplementation((table: string) => {
    const data = table === 'sites'
      ? [{ id: 'site-1', name: 'HQ', latitude: null, longitude: null, attendance_radius_m: 100 }]
      : [{ id: 'team-1', name: 'Operations', site_id: 'site-1' }]
    const query = {
      select: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(async () => ({ data, error: null })),
    }
    return query
  })
})

describe('staff attendance database contract', () => {
  it('reads directory rows and invokes every checked attendance action with its server contract', async () => {
    const directory = await listAttendanceAdminDirectory()
    expect(directory.sites).toHaveLength(1)
    expect(directory.teams[0]).toMatchObject({ id: 'team-1', site_id: 'site-1' })
    expect(mocks.from).toHaveBeenCalledTimes(2)
    expect(await listAttendanceSites()).toHaveLength(1)
    expect(mocks.from).toHaveBeenCalledTimes(3)

    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === 'list_staff_site_templates' || name === 'list_led_staff_teams'
        || name === 'list_staff_standing_hours' || name === 'list_my_staff_shifts' || name === 'list_next_my_staff_shifts'
        ? [] : 'row-id',
      error: null,
    }))
    await saveAttendanceSite('site-1', 0, 0, 100)
    await saveAttendanceTeamSite('team-1', 'site-1')
    await listStaffSiteTemplates('site-1')
    await saveSiteShiftTemplate('site-1', null, 'Morning', '07:00', '15:00')
    await archiveSiteShiftTemplate('template-1')
    await listLedStaffTeams()
    await getStaffRoster('team-1', '2026-10-26')
    await saveStaffShift('team-1', 'person-1', '2026-10-26', 'template-1')
    await removeStaffShift('shift-1')
    await publishStaffRoster('team-1', '2026-10-26')
    await copyStaffRoster('team-1', '2026-11-02')
    await saveStandingHours('team-1', null, [0, 1, 2, 3, 4], '09:00', '17:00', true)
    await listStaffStandingHours('team-1')
    await listMyStaffShifts('2026-10-26')
    await listNextMyStaffShifts()

    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      'save_attendance_site', 'save_attendance_team_site', 'list_staff_site_templates',
      'save_site_shift_template', 'archive_site_shift_template', 'list_led_staff_teams',
      'get_staff_roster', 'save_staff_shift', 'remove_staff_shift', 'publish_staff_roster',
      'copy_staff_roster', 'save_standing_hours', 'list_staff_standing_hours',
      'list_my_staff_shifts', 'list_next_my_staff_shifts',
    ])
    expect(mocks.rpc).toHaveBeenCalledWith('save_attendance_site', {
      p_site_id: 'site-1', p_latitude: 0, p_longitude: 0, p_radius_m: 100,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('save_attendance_team_site', { p_team_id: 'team-1', p_site_id: 'site-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('save_standing_hours', expect.objectContaining({
      p_team_id: 'team-1', p_person_id: null, p_working_days: [0, 1, 2, 3, 4], p_active: true,
    }))
  })

  it('maps database refusals to typed errors and does not expose raw Postgres details', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23P01', message: 'STAFF_SHIFT_OVERLAP: private detail' } })
    await expect(saveStaffShift('team-1', 'person-1', '2026-10-26', 'template-1')).rejects.toMatchObject({
      name: 'ContractError', code: 'CONFLICT', message: 'STAFF_SHIFT_OVERLAP',
    })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'private database detail' } })
    await expect(saveAttendanceTeamSite('team-1', 'site-1')).rejects.toMatchObject({
      name: 'ContractError', code: 'FORBIDDEN', message: 'saveAttendanceTeamSite failed',
    })
  })

  it('fails the Admin directory read when either RLS-protected table cannot be loaded', async () => {
    mocks.from.mockImplementationOnce(() => ({
      select: () => ({ is: () => ({ order: async () => ({ data: null, error: { code: '42501', message: 'no access' } }) }) }),
    }))
    await expect(listAttendanceAdminDirectory()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

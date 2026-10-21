import { supabase } from '@/lib/supabase'
import { ContractError } from './contract'

export type AttendanceSite = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  attendance_radius_m: number
}
export type AttendanceTeam = { id: string; name: string; site_id: string | null }
export type ShiftTemplate = { id: string; site_id: string; name: string; start_time: string; end_time: string; archived_at: string | null }
export type StaffShift = {
  id: string | null
  person_id?: string
  person_name?: string
  team_id: string
  team_name: string
  site_id: string
  site_name: string
  local_date: string
  template_id?: string | null
  template_name: string
  start_at: string
  end_at: string
  crew?: string[]
}
type RosterMember = { person_id: string; full_name: string }
export type StaffRoster = {
  team_id: string; team_name: string; site_id: string | null; site_name: string | null
  week_start: string; status: 'draft' | 'published'; shifts: StaffShift[]; members: RosterMember[]
}
export type LedStaffTeam = { id: string; name: string; site_id: string | null; site_name: string | null }
export type StandingRule = {
  active: boolean; working_days: number[]; start_time: string | null; end_time: string | null
}
type StandingException = StandingRule & { person_id: string; full_name: string }
export type StandingSchedule = {
  effective_from: string; team_name: string; site_name: string | null
  current_default: StandingRule | null; current_exceptions: StandingException[]
  default: StandingRule | null; exceptions: StandingException[]
}

function safeError(operation: string, error: { code?: string; message?: string }): ContractError {
  const token = error.message?.match(/STAFF_[A-Z_]+/)?.[0]
  const code = error.code === '42501' ? 'FORBIDDEN'
    : error.code === 'P0002' ? 'NOT_FOUND'
      : error.code === '23505' || error.code === '23P01' || error.code === 'P0003' ? 'CONFLICT'
        : error.code === '22023' || error.code === '23514' ? 'INVALID'
          : 'UNAVAILABLE'
  return new ContractError(code, token ?? `${operation} failed`)
}

export function jsonRows<T>(value: unknown, operation: string): T[] {
  if (!Array.isArray(value)) throw new ContractError('UNAVAILABLE', `${operation} returned invalid data`)
  return value as T[]
}

export async function rpc<T>(operation: string, name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.schema('ops').rpc(name, args)
  if (error) throw safeError(operation, error)
  return data as T
}

export async function listAttendanceSites(): Promise<AttendanceSite[]> {
  const { data, error } = await supabase.schema('shared').from('sites')
    .select('id,name,latitude,longitude,attendance_radius_m').is('archived_at', null).order('name')
  if (error) throw safeError('listAttendanceSites', error)
  return (data ?? []) as AttendanceSite[]
}

export async function listAttendanceAdminDirectory(): Promise<{ sites: AttendanceSite[]; teams: AttendanceTeam[] }> {
  const [sites, teamsResult] = await Promise.all([
    listAttendanceSites(),
    supabase.schema('shared').from('teams').select('id,name,site_id').is('archived_at', null).order('name'),
  ])
  if (teamsResult.error) throw safeError('listAttendanceAdminDirectory', teamsResult.error)
  return { sites, teams: (teamsResult.data ?? []) as AttendanceTeam[] }
}

export async function saveAttendanceSite(siteId: string, latitude: number | null, longitude: number | null, radius: number): Promise<void> {
  await rpc<void>('saveAttendanceSite', 'save_attendance_site', {
    p_site_id: siteId, p_latitude: latitude, p_longitude: longitude, p_radius_m: radius,
  })
}

export async function saveAttendanceTeamSite(teamId: string, siteId: string | null): Promise<void> {
  await rpc<void>('saveAttendanceTeamSite', 'save_attendance_team_site', { p_team_id: teamId, p_site_id: siteId })
}

export async function listStaffSiteTemplates(siteId: string): Promise<ShiftTemplate[]> {
  return jsonRows(await rpc<unknown>('listStaffSiteTemplates', 'list_staff_site_templates', { p_site_id: siteId }), 'listStaffSiteTemplates')
}

export async function saveSiteShiftTemplate(siteId: string, templateId: string | null, name: string, start: string, end: string): Promise<string> {
  return rpc<string>('saveSiteShiftTemplate', 'save_site_shift_template', {
    p_site_id: siteId, p_template_id: templateId, p_name: name, p_start_time: start, p_end_time: end,
  })
}

export async function archiveSiteShiftTemplate(templateId: string): Promise<void> {
  await rpc<void>('archiveSiteShiftTemplate', 'archive_site_shift_template', { p_template_id: templateId })
}

export async function listLedStaffTeams(): Promise<LedStaffTeam[]> {
  return jsonRows(await rpc<unknown>('listLedStaffTeams', 'list_led_staff_teams'), 'listLedStaffTeams')
}

export async function getStaffRoster(teamId: string, weekStart: string): Promise<StaffRoster> {
  return rpc<StaffRoster>('getStaffRoster', 'get_staff_roster', { p_team_id: teamId, p_week_start: weekStart })
}

export async function saveStaffShift(teamId: string, personId: string, localDate: string, templateId: string, shiftId: string | null = null): Promise<string> {
  return rpc<string>('saveStaffShift', 'save_staff_shift', {
    p_team_id: teamId, p_person_id: personId, p_local_date: localDate, p_template_id: templateId, p_shift_id: shiftId,
  })
}

export async function removeStaffShift(shiftId: string): Promise<void> {
  await rpc<void>('removeStaffShift', 'remove_staff_shift', { p_shift_id: shiftId })
}

export async function publishStaffRoster(teamId: string, weekStart: string): Promise<number> {
  return rpc<number>('publishStaffRoster', 'publish_staff_roster', { p_team_id: teamId, p_week_start: weekStart })
}

export async function copyStaffRoster(teamId: string, weekStart: string): Promise<number> {
  return rpc<number>('copyStaffRoster', 'copy_staff_roster', { p_team_id: teamId, p_week_start: weekStart })
}

export async function listStaffStandingHours(teamId: string): Promise<StandingSchedule> {
  return rpc<StandingSchedule>('listStaffStandingHours', 'list_staff_standing_hours', { p_team_id: teamId })
}

export async function saveStandingHours(teamId: string, personId: string | null, days: number[], start: string | null, end: string | null, active: boolean | null): Promise<string> {
  return rpc<string>('saveStandingHours', 'save_standing_hours', {
    p_team_id: teamId, p_person_id: personId, p_working_days: days, p_start_time: start, p_end_time: end, p_active: active,
  })
}

export async function listMyStaffShifts(weekStart: string): Promise<StaffShift[]> {
  return jsonRows(await rpc<unknown>('listMyStaffShifts', 'list_my_staff_shifts', { p_week_start: weekStart }), 'listMyStaffShifts')
}

export async function listNextMyStaffShifts(): Promise<StaffShift[]> {
  return jsonRows(await rpc<unknown>('listNextMyStaffShifts', 'list_next_my_staff_shifts'), 'listNextMyStaffShifts')
}

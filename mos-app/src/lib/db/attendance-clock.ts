import { supabase } from '@/lib/supabase'
import { ContractError } from './contract'
import { jsonRows, rpc } from './staff-attendance'

export type ClockRefusalReason =
  | 'consent_needed' | 'no_shift' | 'too_early' | 'shift_over' | 'already_in' | 'photo_needed'
  | 'weak_gps' | 'too_far' | 'site_not_set' | 'closed'
export type ClockRefusal = {
  ok: false; reason: ClockRefusalReason
  distance_m?: number; radius_m?: number; accuracy_m?: number; max_accuracy_m?: number; opens_at?: string
}
export type ClockPosition = { latitude: number; longitude: number; accuracy: number }
export type ClockRecord = {
  id: string; status: 'in' | 'out' | 'closed'; late: boolean; late_minutes: number | null
  early_leave: boolean; early_minutes: number | null; closure: 'no_clock_out' | null
  clock_in_at: string | null; clock_out_at: string | null
}
export type ClockShift = {
  start_at: string; end_at: string; local_date: string; template_name: string
  site_id: string; site_name: string; team_name: string; opens_at: string
  site_ready: boolean; radius_m: number; max_accuracy_m: number; record: ClockRecord | null
}
export type ClockState = { notice_version: string; consented: boolean; now: string; shifts: ClockShift[] }
export type ClockInAccepted = { ok: true; record_id: string; status: 'in'; clock_in_at: string; late: boolean; late_minutes: number | null }
export type ClockOutAccepted = { ok: true; record_id: string; status: 'out'; clock_out_at: string; early_leave: boolean; early_minutes: number | null }
export type ClockBegin = { ok: true; attempt_id: string; org_id: string; shift_end_at: string } | ClockRefusal

export type AttendanceSettings = {
  late_grace_min: number; clock_in_open_min: number; max_accuracy_m: number; missing_alert_min: number
  no_clockout_close_min: number; uncovered_alert_min: number; leave_cutoff_days: number; selfie_retention_days: number
}
export type TeamAttendanceStatus = 'scheduled' | 'in' | 'late' | 'out' | 'early_leave' | 'missing' | 'no_clock_out'
export type TeamAttendanceRow = {
  person_id: string; person_name: string; start_at: string; end_at: string; status: TeamAttendanceStatus
  record_id: string | null; clock_in_at: string | null; clock_out_at: string | null
  late_minutes: number | null; early_minutes: number | null; corrected: boolean
}
export type AttendanceRecordDetail = {
  id: string; person_id: string; status: string; shift_start_at: string; shift_end_at: string
  clock_in_at: string | null; clock_out_at: string | null; in_distance_m: number | null; in_accuracy_m: number | null
  late: boolean; late_minutes: number | null; early_leave: boolean; early_minutes: number | null
  closure: string | null; source: string; selfie_path: string | null
  history: { at: string; by: string; reason: string; before: Record<string, unknown> | null; after: Record<string, unknown> }[]
}

const SELFIE_BUCKET = 'attendance-selfies'

export async function getMyClockState(): Promise<ClockState> {
  return rpc<ClockState>('getMyClockState', 'get_my_clock_state')
}

export async function recordAttendanceConsent(noticeVersion: string, language: 'en' | 'id'): Promise<void> {
  await rpc<void>('recordAttendanceConsent', 'record_attendance_consent', { p_notice_version: noticeVersion, p_language: language })
}

export async function beginClockIn(shiftStartAt: string): Promise<ClockBegin> {
  return rpc<ClockBegin>('beginClockIn', 'begin_attendance_clock_in', { p_shift_start_at: shiftStartAt })
}

export async function uploadAttendanceSelfie(orgId: string, attemptId: string, image: Blob): Promise<void> {
  const path = `${orgId}/${attemptId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(SELFIE_BUCKET).upload(path, image, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new ContractError('UNAVAILABLE', 'uploadAttendanceSelfie failed')
}

export async function clockIn(attemptId: string, position: ClockPosition): Promise<ClockInAccepted | ClockRefusal> {
  return rpc('clockIn', 'clock_in_attendance', {
    p_attempt_id: attemptId, p_latitude: position.latitude, p_longitude: position.longitude, p_accuracy_m: position.accuracy,
  })
}

export async function clockOut(recordId: string, position: ClockPosition): Promise<ClockOutAccepted | ClockRefusal> {
  return rpc('clockOut', 'clock_out_attendance', {
    p_record_id: recordId, p_latitude: position.latitude, p_longitude: position.longitude, p_accuracy_m: position.accuracy,
  })
}

export async function listTeamAttendance(teamId: string, localDate: string): Promise<TeamAttendanceRow[]> {
  return jsonRows(await rpc<unknown>('listTeamAttendance', 'list_team_attendance', { p_team_id: teamId, p_local_date: localDate }), 'listTeamAttendance')
}

export async function getAttendanceRecord(recordId: string): Promise<AttendanceRecordDetail> {
  return rpc<AttendanceRecordDetail>('getAttendanceRecord', 'get_attendance_record', { p_record_id: recordId })
}

/** A 60-second signed link, issued only after the storage check passes for this reader. */
export async function attendanceSelfieUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(SELFIE_BUCKET).createSignedUrl(path, 60)
  return error ? null : data?.signedUrl ?? null
}

export async function correctAttendanceRecord(personId: string, shiftStartAt: string, clockInAt: string | null, clockOutAt: string | null, reason: string): Promise<string> {
  return rpc<string>('correctAttendanceRecord', 'correct_attendance_record', {
    p_person_id: personId, p_shift_start_at: shiftStartAt, p_clock_in_at: clockInAt, p_clock_out_at: clockOutAt, p_reason: reason,
  })
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  return rpc<AttendanceSettings>('getAttendanceSettings', 'get_attendance_settings')
}

export async function saveAttendanceSettings(settings: AttendanceSettings): Promise<string> {
  return rpc<string>('saveAttendanceSettings', 'save_attendance_settings', {
    p_late_grace_min: settings.late_grace_min, p_clock_in_open_min: settings.clock_in_open_min,
    p_max_accuracy_m: settings.max_accuracy_m, p_missing_alert_min: settings.missing_alert_min,
    p_no_clockout_close_min: settings.no_clockout_close_min, p_uncovered_alert_min: settings.uncovered_alert_min,
    p_leave_cutoff_days: settings.leave_cutoff_days, p_selfie_retention_days: settings.selfie_retention_days,
  })
}

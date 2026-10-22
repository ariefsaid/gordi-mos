import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), signed: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { schema: () => ({ rpc: mocks.rpc }), storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.signed }) } },
}))

import {
  attendanceSelfieUrl, beginClockIn, clockIn, clockOut, correctAttendanceRecord, getAttendanceRecord, getAttendanceSettings,
  getMyClockState, listTeamAttendance, recordAttendanceConsent, saveAttendanceSettings, uploadAttendanceSelfie,
} from './attendance-clock'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })
  mocks.upload.mockResolvedValue({ error: null })
})

const position = { latitude: 1, longitude: 2, accuracy: 15 }

describe('attendance clock data layer', () => {
  it('AC-031 sends the reported position to the server actions that decide', async () => {
    await beginClockIn('2026-10-22T00:00:00Z')
    await clockIn('attempt-1', position)
    await clockOut('rec-1', position)
    expect(mocks.rpc).toHaveBeenCalledWith('begin_attendance_clock_in', { p_shift_start_at: '2026-10-22T00:00:00Z' })
    expect(mocks.rpc).toHaveBeenCalledWith('clock_in_attendance', { p_attempt_id: 'attempt-1', p_latitude: 1, p_longitude: 2, p_accuracy_m: 15 })
    expect(mocks.rpc).toHaveBeenCalledWith('clock_out_attendance', { p_record_id: 'rec-1', p_latitude: 1, p_longitude: 2, p_accuracy_m: 15 })
  })

  it('NFR-002 uploads the selfie to a fresh canonical path and never overwrites', async () => {
    const image = new Blob(['x'], { type: 'image/jpeg' })
    await uploadAttendanceSelfie('org-1', 'attempt-1', image)
    const [path, body, options] = mocks.upload.mock.calls[0]
    expect(path).toMatch(/^org-1\/attempt-1\/[0-9a-f-]{36}\.jpg$/)
    expect(body).toBe(image)
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: false })
  })

  it('NFR-002 reports a failed upload without leaking the storage error', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'bucket details' } })
    await expect(uploadAttendanceSelfie('org-1', 'attempt-1', new Blob(['x']))).rejects.toMatchObject({ message: 'uploadAttendanceSelfie failed' })
  })

  it('ADR-0064 asks for a short-lived signed link and returns null when the check refuses', async () => {
    mocks.signed.mockResolvedValueOnce({ data: { signedUrl: 'https://signed' }, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'no' } })
    expect(await attendanceSelfieUrl('org/rec/x.jpg')).toBe('https://signed')
    expect(mocks.signed).toHaveBeenCalledWith('org/rec/x.jpg', 60)
    expect(await attendanceSelfieUrl('org/rec/y.jpg')).toBeNull()
  })

  it('AC-033 and AC-036 call the checked reads, corrections and settings actions', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    await getMyClockState()
    await recordAttendanceConsent('v1', 'id')
    await listTeamAttendance('team-1', '2026-10-22')
    await getAttendanceRecord('rec-1')
    await correctAttendanceRecord('p1', 's', 'a', null, 'why')
    await getAttendanceSettings()
    await saveAttendanceSettings({ late_grace_min: 5, clock_in_open_min: 30, max_accuracy_m: 50, missing_alert_min: 30, no_clockout_close_min: 120, uncovered_alert_min: 120, leave_cutoff_days: 3, selfie_retention_days: 90 })
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_my_clock_state', 'record_attendance_consent', 'list_team_attendance', 'get_attendance_record',
      'correct_attendance_record', 'get_attendance_settings', 'save_attendance_settings',
    ])
    expect(mocks.rpc).toHaveBeenCalledWith('record_attendance_consent', { p_notice_version: 'v1', p_language: 'id' })
    expect(mocks.rpc).toHaveBeenCalledWith('correct_attendance_record', { p_person_id: 'p1', p_shift_start_at: 's', p_clock_in_at: 'a', p_clock_out_at: null, p_reason: 'why' })
    expect(mocks.rpc).toHaveBeenCalledWith('save_attendance_settings', expect.objectContaining({ p_late_grace_min: 5, p_selfie_retention_days: 90 }))
  })

  it('AC-034 turns a database refusal into a safe error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'STAFF_ATTENDANCE_FORBIDDEN secret detail' } })
    await expect(getAttendanceRecord('rec-1')).rejects.toMatchObject({ message: 'STAFF_ATTENDANCE_FORBIDDEN' })
  })
})

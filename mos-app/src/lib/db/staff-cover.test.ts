import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), signed: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { schema: () => ({ rpc: mocks.rpc }), storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.signed }) } },
}))
vi.mock('./photo-evidence', () => ({ prepareEvidencePhoto: vi.fn(async (file: Blob) => file) }))

import {
  assignStaffCover, attachStaffAbsenceNote, cancelStaffAbsence, cancelStaffOffer, claimStaffShift, decideStaffAbsence,
  decideStaffClaim, listMyStaffAbsences, listOpenStaffShifts, listStaffAbsences, listStaffCoverQueue, listStaffMonthlyTotals,
  offerStaffShift, reportStaffAbsence, staffNoteUrl, withdrawStaffClaim,
} from './staff-cover'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: 'row-id', error: null })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.signed.mockResolvedValue({ data: { signedUrl: 'https://signed.example/note' }, error: null })
})

describe('staff absence and cover database contract', () => {
  it('AC-010 AC-012 reports an absence on a rostered shift or a standing day, optionally for someone else', async () => {
    await reportStaffAbsence({ kind: 'sick', shiftId: 's1' })
    expect(mocks.rpc).toHaveBeenLastCalledWith('report_staff_absence', {
      p_kind: 'sick', p_shift_id: 's1', p_team_id: null, p_local_date: null, p_person_id: null, p_reason: null,
    })
    await reportStaffAbsence({ kind: 'leave', teamId: 't1', localDate: '2026-11-04', personId: 'p1', reason: ' family ' })
    expect(mocks.rpc).toHaveBeenLastCalledWith('report_staff_absence', {
      p_kind: 'leave', p_shift_id: null, p_team_id: 't1', p_local_date: '2026-11-04', p_person_id: 'p1', p_reason: 'family',
    })
  })

  it('AC-011 AC-016 sends every decision and cover action to its checked function', async () => {
    await decideStaffAbsence('a1', false, ' no cover ')
    expect(mocks.rpc).toHaveBeenLastCalledWith('decide_staff_absence', { p_absence_id: 'a1', p_approve: false, p_reason: 'no cover' })
    await cancelStaffAbsence('a1')
    await offerStaffShift('s1')
    await cancelStaffOffer('o1')
    await claimStaffShift('o1')
    await withdrawStaffClaim('c1')
    await decideStaffClaim('c1', true)
    await assignStaffCover('o1', 'p2')
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual([
      'decide_staff_absence', 'cancel_staff_absence', 'offer_staff_shift', 'cancel_staff_offer', 'claim_staff_shift',
      'withdraw_staff_claim', 'decide_staff_claim', 'assign_staff_cover',
    ])
  })

  it('AC-013 stores a note photo under the absence path, then attaches it', async () => {
    await attachStaffAbsenceNote('abs-1', 'org-1', new File(['x'], 'note.jpg', { type: 'image/jpeg' }))
    const path = mocks.upload.mock.calls[0][0] as string
    expect(path).toMatch(/^org-1\/abs-1\/[0-9a-f-]{36}\.jpg$/)
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({ upsert: false })
    expect(mocks.rpc).toHaveBeenCalledWith('attach_staff_absence_note', { p_absence_id: 'abs-1', p_path: path })
    expect(await staffNoteUrl(path)).toBe('https://signed.example/note')
  })

  it('AC-013 a refused upload never reaches the attach step', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'denied' } })
    await expect(attachStaffAbsenceNote('abs-1', 'org-1', new File(['x'], 'n.jpg', { type: 'image/jpeg' }))).rejects.toThrow('STAFF_NOTE_UPLOAD_FAILED')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('AC-034 names the server refusal so the screen can explain it', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'STAFF_ABSENCE_TOO_LATE' } })
    await expect(reportStaffAbsence({ kind: 'leave', shiftId: 's1' })).rejects.toMatchObject({ code: 'INVALID', message: 'STAFF_ABSENCE_TOO_LATE' })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'STAFF_CLAIM_TAKEN' } })
    await expect(claimStaffShift('o1')).rejects.toMatchObject({ code: 'CONFLICT', message: 'STAFF_CLAIM_TAKEN' })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } })
    await expect(listStaffMonthlyTotals('2026-10-01')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('reads the Person, queue and HR views and rejects malformed data', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await listMyStaffAbsences()).toEqual([])
    mocks.rpc.mockResolvedValueOnce({ data: { open: [], mine: [] }, error: null })
    expect(await listOpenStaffShifts()).toEqual({ open: [], mine: [] })
    mocks.rpc.mockResolvedValueOnce({ data: { absences: [], claims: [], uncovered: [], sick: [], candidates: [] }, error: null })
    expect((await listStaffCoverQueue()).candidates).toEqual([])
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    await listStaffAbsences('2026-10-01', '2026-10-31')
    expect(mocks.rpc).toHaveBeenLastCalledWith('list_staff_absences', { p_from: '2026-10-01', p_to: '2026-10-31', p_team_id: null })
    mocks.rpc.mockResolvedValueOnce({ data: { open: 1 }, error: null })
    await expect(listOpenStaffShifts()).rejects.toThrow('invalid data')
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null })
    await expect(listStaffCoverQueue()).rejects.toThrow('invalid data')
  })
})

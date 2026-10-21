import { supabase } from '@/lib/supabase'
import { ContractError } from './contract'
import { prepareEvidencePhoto } from './photo-evidence'

// Stage 2 of staff attendance: absences, cover, the lead's queue and the HR views. Every rule runs in a
// checked database action; this module only calls them and names the failure the screen should explain.

export type AbsenceKind = 'sick' | 'permission' | 'leave'
export type AbsenceStatus = 'accepted' | 'pending' | 'approved' | 'rejected' | 'withdrawn'

export type MyAbsence = {
  id: string; kind: AbsenceKind; status: AbsenceStatus; flagged: boolean; documented: boolean; note_path: string | null
  local_date: string; start_at: string; end_at: string; team_name: string; site_name: string
  reason: string | null; decision_reason: string | null; recorded_by_other: boolean
}
type OpenShift = {
  offer_id: string; shift_id: string; kind: 'absence' | 'swap'; status: 'open' | 'claimed'
  local_date: string; start_at: string; end_at: string; template_name: string; team_name: string; site_name: string
  my_claim_id: string | null; my_claim_status: 'pending' | null; can_claim: boolean
}
type MyOffer = {
  offer_id: string; shift_id: string; kind: 'absence' | 'swap'; status: 'open' | 'claimed'
  local_date: string; start_at: string; end_at: string; template_name: string; site_name: string; claimant_name: string | null
}
export type OpenShiftsView = { open: OpenShift[]; mine: MyOffer[] }

type QueueAbsence = {
  id: string; person_name: string; team_name: string; kind: AbsenceKind; local_date: string
  start_at: string; end_at: string; reason: string | null; can_decide: boolean
}
type QueueClaim = {
  id: string; offer_kind: 'absence' | 'swap'; claimant_name: string; person_name: string; team_name: string
  local_date: string; start_at: string; end_at: string; can_decide: boolean
}
type QueueUncovered = {
  offer_id: string; offer_kind: 'absence' | 'swap'; person_name: string; team_name: string; team_id: string; site_id: string
  local_date: string; start_at: string; end_at: string; can_decide: boolean
}
type QueueSick = { id: string; person_name: string; team_name: string; local_date: string; documented: boolean }
type QueueCandidate = { person_id: string; full_name: string; site_id: string }
export type CoverQueue = {
  absences: QueueAbsence[]; claims: QueueClaim[]; uncovered: QueueUncovered[]; sick: QueueSick[]; candidates: QueueCandidate[]
}

export type HrAbsence = {
  id: string; person_id: string; person_name: string; team_id: string; team_name: string; kind: AbsenceKind; status: AbsenceStatus
  flagged: boolean; documented: boolean; note_path: string | null; local_date: string; start_at: string; end_at: string
  reason: string | null; decision_reason: string | null
}
/** null means the stage-3 clock records that fill it do not exist yet: shown as "not yet recorded". */
export type MonthlyTotal = {
  person_id: string; full_name: string; team_id: string; team_name: string
  shifts_worked: number | null; late: number | null; early_leave: number | null
  sick_documented: number; sick_undocumented: number; permission: number; leave: number; no_show: number
}

const NOTE_BUCKET = 'staff-notes'
const SIGNED_URL_SECONDS = 60 * 60

function safeError(operation: string, error: { code?: string; message?: string }): ContractError {
  const token = error.message?.match(/STAFF_[A-Z_]+/)?.[0]
  const code = error.code === '42501' ? 'FORBIDDEN'
    : error.code === 'P0002' ? 'NOT_FOUND'
      : error.code === '23505' || error.code === '23P01' || error.code === 'P0003' ? 'CONFLICT'
        : error.code === '22023' || error.code === '23514' ? 'INVALID'
          : 'UNAVAILABLE'
  return new ContractError(code, token ?? `${operation} failed`)
}

async function rpc<T>(operation: string, name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.schema('ops').rpc(name, args)
  if (error) throw safeError(operation, error)
  return data as T
}

function rows<T>(value: unknown, operation: string): T[] {
  if (!Array.isArray(value)) throw new ContractError('UNAVAILABLE', `${operation} returned invalid data`)
  return value as T[]
}

export type ReportAbsenceInput = {
  kind: AbsenceKind
  /** A rostered shift. Standing-hours days have no shift row: pass teamId and localDate instead. */
  shiftId?: string | null
  teamId?: string | null
  localDate?: string | null
  /** The Team lead recording for someone else. */
  personId?: string | null
  reason?: string
}

export async function reportStaffAbsence(input: ReportAbsenceInput): Promise<string> {
  return rpc<string>('reportStaffAbsence', 'report_staff_absence', {
    p_kind: input.kind, p_shift_id: input.shiftId ?? null, p_team_id: input.teamId ?? null, p_local_date: input.localDate ?? null,
    p_person_id: input.personId ?? null, p_reason: input.reason?.trim() || null,
  })
}

export async function decideStaffAbsence(absenceId: string, approve: boolean, reason?: string): Promise<void> {
  await rpc<void>('decideStaffAbsence', 'decide_staff_absence', { p_absence_id: absenceId, p_approve: approve, p_reason: reason?.trim() || null })
}

export async function cancelStaffAbsence(absenceId: string): Promise<void> {
  await rpc<void>('cancelStaffAbsence', 'cancel_staff_absence', { p_absence_id: absenceId })
}

/** Store a doctor's note photo (one compressed JPEG in the private bucket), then attach it to the absence. */
export async function attachStaffAbsenceNote(absenceId: string, orgId: string, file: File): Promise<void> {
  const body = await prepareEvidencePhoto(file)
  const path = `${orgId}/${absenceId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(NOTE_BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new ContractError('UNAVAILABLE', 'STAFF_NOTE_UPLOAD_FAILED')
  await rpc<void>('attachStaffAbsenceNote', 'attach_staff_absence_note', { p_absence_id: absenceId, p_path: path })
}

/** A short-lived private link, issued only after the database's read check passes. */
export async function staffNoteUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(NOTE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) throw new ContractError('FORBIDDEN', 'STAFF_NOTE_UNAVAILABLE')
  return data.signedUrl
}

export async function listMyStaffAbsences(): Promise<MyAbsence[]> {
  return rows(await rpc<unknown>('listMyStaffAbsences', 'list_my_staff_absences'), 'listMyStaffAbsences')
}

export async function listOpenStaffShifts(): Promise<OpenShiftsView> {
  const value = await rpc<unknown>('listOpenStaffShifts', 'list_open_staff_shifts')
  const view = value as Partial<OpenShiftsView> | null
  if (!view || !Array.isArray(view.open) || !Array.isArray(view.mine)) throw new ContractError('UNAVAILABLE', 'listOpenStaffShifts returned invalid data')
  return { open: view.open, mine: view.mine }
}

export async function offerStaffShift(shiftId: string): Promise<string> {
  return rpc<string>('offerStaffShift', 'offer_staff_shift', { p_shift_id: shiftId })
}

export async function cancelStaffOffer(offerId: string): Promise<void> {
  await rpc<void>('cancelStaffOffer', 'cancel_staff_offer', { p_offer_id: offerId })
}

export async function claimStaffShift(offerId: string): Promise<string> {
  return rpc<string>('claimStaffShift', 'claim_staff_shift', { p_offer_id: offerId })
}

export async function withdrawStaffClaim(claimId: string): Promise<void> {
  await rpc<void>('withdrawStaffClaim', 'withdraw_staff_claim', { p_claim_id: claimId })
}

export async function decideStaffClaim(claimId: string, confirm: boolean, reason?: string): Promise<void> {
  await rpc<void>('decideStaffClaim', 'decide_staff_claim', { p_claim_id: claimId, p_confirm: confirm, p_reason: reason?.trim() || null })
}

export async function assignStaffCover(offerId: string, personId: string): Promise<void> {
  await rpc<void>('assignStaffCover', 'assign_staff_cover', { p_offer_id: offerId, p_person_id: personId })
}

export async function listStaffCoverQueue(): Promise<CoverQueue> {
  const value = await rpc<unknown>('listStaffCoverQueue', 'list_staff_cover_queue')
  const queue = value as Partial<CoverQueue> | null
  if (!queue || !Array.isArray(queue.absences) || !Array.isArray(queue.claims) || !Array.isArray(queue.uncovered)
    || !Array.isArray(queue.sick) || !Array.isArray(queue.candidates)) {
    throw new ContractError('UNAVAILABLE', 'listStaffCoverQueue returned invalid data')
  }
  return queue as CoverQueue
}

export async function listStaffAbsences(from: string, to: string, teamId: string | null = null): Promise<HrAbsence[]> {
  return rows(await rpc<unknown>('listStaffAbsences', 'list_staff_absences', { p_from: from, p_to: to, p_team_id: teamId }), 'listStaffAbsences')
}

export async function listStaffMonthlyTotals(month: string): Promise<MonthlyTotal[]> {
  return rows(await rpc<unknown>('listStaffMonthlyTotals', 'list_staff_monthly_totals', { p_month: month }), 'listStaffMonthlyTotals')
}

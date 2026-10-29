import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { staffCoverMessages } from '@/i18n/staff-cover'

vi.mock('@/lib/db/staff-attendance', () => ({ listMyStaffShifts: vi.fn() }))
vi.mock('@/lib/db/staff-cover', () => ({
  assignStaffCover: vi.fn(), attachStaffAbsenceNote: vi.fn(), cancelStaffAbsence: vi.fn(), cancelStaffOffer: vi.fn(),
  claimStaffShift: vi.fn(), decideStaffAbsence: vi.fn(), decideStaffClaim: vi.fn(), listMyStaffAbsences: vi.fn(),
  listOpenStaffShifts: vi.fn(), listStaffAbsences: vi.fn(), listStaffCoverQueue: vi.fn(), listStaffMonthlyTotals: vi.fn(),
  offerStaffShift: vi.fn(), reportStaffAbsence: vi.fn(), staffNoteUrl: vi.fn(), withdrawStaffClaim: vi.fn(),
}))

import { listMyStaffShifts } from '@/lib/db/staff-attendance'
import * as cover from '@/lib/db/staff-cover'
import { AbsencePanel, CoverPanel, HrPanel, RequestsPanel } from './staff-cover-panels'

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
const later = new Date(Date.now() + 3 * 3600_000).toISOString()
const muchLater = new Date(Date.now() + 5 * 3600_000).toISOString()
const shift = { id: 'shift-1', team_id: 't1', team_name: 'Bar', site_id: 's1', site_name: 'HQ', local_date: today(), template_name: 'Pagi', start_at: later, end_at: muchLater }

function renderIn(ui: React.ReactElement, locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listMyStaffShifts).mockResolvedValue([shift])
  vi.mocked(cover.listMyStaffAbsences).mockResolvedValue([])
  vi.mocked(cover.reportStaffAbsence).mockResolvedValue('abs-1')
  vi.mocked(cover.listOpenStaffShifts).mockResolvedValue({ open: [], mine: [] })
  vi.mocked(cover.listStaffCoverQueue).mockResolvedValue({ absences: [], claims: [], uncovered: [], sick: [], candidates: [] })
  vi.mocked(cover.listStaffMonthlyTotals).mockResolvedValue([])
  vi.mocked(cover.listStaffAbsences).mockResolvedValue([])
})

describe('AbsencePanel', () => {
  it('uses the Jakarta date for today’s sick shift across UTC midnight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-04-30T17:30:00Z'))
    try {
      vi.mocked(listMyStaffShifts).mockResolvedValue([{ ...shift, local_date: '2026-05-01', start_at: '2026-05-01T00:00:00Z', end_at: '2026-05-01T08:00:00Z' }])
      renderIn(<AbsencePanel orgId="org-1" />)
      expect(await screen.findByRole('button', { name: 'Report sick today' })).toBeEnabled()
      expect(listMyStaffShifts).toHaveBeenCalledWith('2026-04-27')
    } finally { vi.useRealTimers() }
  })

  it('AC-010 reports sick for today and says it was accepted and the lead told', async () => {
    renderIn(<AbsencePanel orgId="org-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Report sick today' }))
    expect(cover.reportStaffAbsence).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sick', shiftId: 'shift-1' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Accepted. Your lead has been told')
  })

  it('AC-012 a request that is too late tells the Person to talk to their lead', async () => {
    vi.mocked(cover.reportStaffAbsence).mockRejectedValue(new Error('STAFF_ABSENCE_TOO_LATE'))
    renderIn(<AbsencePanel orgId="org-1" />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Why can’t you make it?' }))
    await userEvent.click(screen.getByRole('option', { name: 'Leave' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Talk to your Team lead')
  })

  it('AC-012 shows the same refusal in Indonesian', async () => {
    vi.mocked(cover.reportStaffAbsence).mockRejectedValue(new Error('STAFF_ABSENCE_TOO_LATE'))
    renderIn(<AbsencePanel orgId="org-1" />, 'id')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Mengapa Anda tidak bisa hadir?' }))
    await userEvent.click(screen.getByRole('option', { name: /Cuti/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Kirim permintaan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Hubungi Team lead')
  })

  it('AC-013 offers a doctor’s note on an undocumented sick report and lets a pending request be withdrawn', async () => {
    vi.mocked(cover.listMyStaffAbsences).mockResolvedValue([
      { id: 'a1', kind: 'sick', status: 'accepted', flagged: true, documented: false, note_path: null, local_date: today(), start_at: later, end_at: muchLater, team_name: 'Bar', site_name: 'HQ', reason: null, decision_reason: null, recorded_by_other: false },
      { id: 'a2', kind: 'leave', status: 'pending', flagged: false, documented: false, note_path: null, local_date: today(), start_at: later, end_at: muchLater, team_name: 'Bar', site_name: 'HQ', reason: null, decision_reason: null, recorded_by_other: false },
    ])
    vi.mocked(cover.attachStaffAbsenceNote).mockResolvedValue(undefined)
    vi.mocked(cover.cancelStaffAbsence).mockResolvedValue(undefined)
    renderIn(<AbsencePanel orgId="org-1" />)
    expect(await screen.findByText('Same-day sick')).toBeInTheDocument()
    const file = new File(['x'], 'note.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/Add doctor’s note/), file)
    expect(cover.attachStaffAbsenceNote).toHaveBeenCalledWith('a1', 'org-1', file)
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw request' }))
    expect(cover.cancelStaffAbsence).toHaveBeenCalledWith('a2')
  })

  it('shows an empty state with no upcoming shift', async () => {
    vi.mocked(listMyStaffShifts).mockResolvedValue([])
    renderIn(<AbsencePanel orgId="org-1" />)
    expect(await screen.findByText(/no upcoming shifts to report/)).toBeInTheDocument()
  })

  it('shows a retryable error when shifts cannot load', async () => {
    vi.mocked(listMyStaffShifts).mockRejectedValue(new Error('x'))
    renderIn(<AbsencePanel orgId="org-1" />)
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
  })
})

describe('CoverPanel', () => {
  const open = { offer_id: 'o1', shift_id: 'x', kind: 'absence' as const, status: 'open' as const, local_date: today(), start_at: later, end_at: muchLater, template_name: 'Pagi', team_name: 'Bar', site_name: 'HQ', my_claim_id: null, my_claim_status: null, can_claim: true }

  it('AC-014 claims an open shift and says the lead confirms', async () => {
    vi.mocked(cover.listOpenStaffShifts).mockResolvedValue({ open: [open], mine: [] })
    vi.mocked(cover.claimStaffShift).mockResolvedValue('c1')
    renderIn(<CoverPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Claim this shift' }))
    expect(cover.claimStaffShift).toHaveBeenCalledWith('o1')
    expect(await screen.findByRole('status')).toHaveTextContent('Your lead confirms')
  })

  it('AC-015 a lost race says someone else claimed it first', async () => {
    vi.mocked(cover.listOpenStaffShifts).mockResolvedValue({ open: [open], mine: [] })
    vi.mocked(cover.claimStaffShift).mockRejectedValue(new Error('STAFF_CLAIM_TAKEN'))
    renderIn(<CoverPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Claim this shift' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else claimed it first')
  })

  it('never shows why a shift is open and lets the Person withdraw a held claim', async () => {
    vi.mocked(cover.listOpenStaffShifts).mockResolvedValue({ open: [{ ...open, my_claim_id: 'c9', my_claim_status: 'pending', can_claim: false }], mine: [] })
    vi.mocked(cover.withdrawStaffClaim).mockResolvedValue(undefined)
    renderIn(<CoverPanel />)
    expect(await screen.findByText('Your claim is waiting for your lead')).toBeInTheDocument()
    expect(screen.queryByText(/sick/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw my claim' }))
    expect(cover.withdrawStaffClaim).toHaveBeenCalledWith('c9')
  })

  it('AC-014 offers my own shift for a swap', async () => {
    vi.mocked(cover.offerStaffShift).mockResolvedValue('o9')
    renderIn(<CoverPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Offer this shift' }))
    expect(cover.offerStaffShift).toHaveBeenCalledWith('shift-1')
  })
})

describe('RequestsPanel', () => {
  it('AC-011 AC-016 AC-018 shows requests, claims and uncovered shifts, each with its decision', async () => {
    vi.mocked(cover.listStaffCoverQueue).mockResolvedValue({
      absences: [{ id: 'a1', person_name: 'Ayu', team_name: 'Bar', kind: 'leave', local_date: today(), start_at: later, end_at: muchLater, reason: null, can_decide: true }],
      claims: [{ id: 'c1', offer_kind: 'absence', claimant_name: 'Nisa', person_name: 'Ayu', team_name: 'Bar', local_date: today(), start_at: later, end_at: muchLater, can_decide: true }],
      uncovered: [{ offer_id: 'o1', offer_kind: 'absence', person_name: 'Dimas', team_name: 'Bar', team_id: 't1', site_id: 's1', local_date: today(), start_at: later, end_at: muchLater, can_decide: true }],
      sick: [], candidates: [{ person_id: 'p9', full_name: 'Rani', site_id: 's1' }],
    })
    vi.mocked(cover.decideStaffAbsence).mockResolvedValue(undefined)
    vi.mocked(cover.decideStaffClaim).mockResolvedValue(undefined)
    vi.mocked(cover.assignStaffCover).mockResolvedValue(undefined)
    renderIn(<RequestsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(cover.decideStaffAbsence).toHaveBeenCalledWith('a1', true)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cover' }))
    expect(cover.decideStaffClaim).toHaveBeenCalledWith('c1', true)
    await userEvent.click(screen.getByRole('combobox', { name: 'Assign directly' }))
    await userEvent.click(screen.getByRole('option', { name: 'Rani' }))
    await userEvent.click(screen.getByRole('button', { name: 'Assign cover' }))
    expect(cover.assignStaffCover).toHaveBeenCalledWith('o1', 'p9')
  })

  it('AC-011 a rejection asks for a reason before it is sent', async () => {
    vi.mocked(cover.listStaffCoverQueue).mockResolvedValue({
      absences: [{ id: 'a1', person_name: 'Ayu', team_name: 'Bar', kind: 'leave', local_date: today(), start_at: later, end_at: muchLater, reason: null, can_decide: true }],
      claims: [], uncovered: [], sick: [], candidates: [],
    })
    vi.mocked(cover.decideStaffAbsence).mockRejectedValue(new Error('STAFF_REASON_REQUIRED'))
    renderIn(<RequestsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Add a reason first')
  })

  it('AC-020 HR receiving a Team without a lead sees the request but no decision buttons', async () => {
    vi.mocked(cover.listStaffCoverQueue).mockResolvedValue({
      absences: [{ id: 'a1', person_name: 'Ayu', team_name: 'Bar', kind: 'leave', local_date: today(), start_at: later, end_at: muchLater, reason: null, can_decide: false }],
      claims: [], uncovered: [], sick: [], candidates: [],
    })
    renderIn(<RequestsPanel />)
    expect(await screen.findByText(/no lead/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('shows an empty state when nothing needs the lead', async () => {
    renderIn(<RequestsPanel />)
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument()
  })
})

describe('HrPanel', () => {
  it('AC-040 shows monthly totals and marks the clock-based counts as not yet recorded', async () => {
    vi.mocked(cover.listStaffMonthlyTotals).mockResolvedValue([
      { person_id: 'p1', full_name: 'Ayu', team_id: 't1', team_name: 'Bar', shifts_worked: null, late: null, early_leave: null, sick_documented: 1, sick_undocumented: 2, permission: 0, leave: 3, no_show: 4 },
    ])
    renderIn(<HrPanel />)
    const card = (await screen.findByText('Ayu')).closest('article') as HTMLElement
    expect(within(card).getAllByText('Not yet recorded')).toHaveLength(3)
    expect(within(card).getByText('Sick without note').nextSibling).toHaveTextContent('2')
    expect(within(card).getByText('No-show').nextSibling).toHaveTextContent('4')
  })

  it('AC-040 lists every Team’s absences and offers the note to HR', async () => {
    vi.mocked(cover.listStaffAbsences).mockResolvedValue([
      { id: 'a1', person_id: 'p1', person_name: 'Ayu', team_id: 't1', team_name: 'Bar', kind: 'sick', status: 'accepted', flagged: true, documented: true, note_path: 'o/a/n.jpg', local_date: today(), start_at: later, end_at: muchLater, reason: null, decision_reason: null },
    ])
    renderIn(<HrPanel />)
    expect(await screen.findByRole('button', { name: 'View note' })).toBeInTheDocument()
  })

  it('AC-034 a view the Person may not open shows the error state', async () => {
    vi.mocked(cover.listStaffMonthlyTotals).mockRejectedValue(new Error('STAFF_ABSENCE_FORBIDDEN'))
    renderIn(<HrPanel />)
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument())
  })
})

describe('strings', () => {
  it('every key exists in both languages and Indonesian differs from English', () => {
    const en = Object.keys(staffCoverMessages.en).sort()
    expect(Object.keys(staffCoverMessages.id).sort()).toEqual(en)
    const same = en.filter((key) => (staffCoverMessages.en as Record<string, string>)[key] === (staffCoverMessages.id as Record<string, string>)[key])
    expect(same).toEqual(['tab.hr'])
  })
})

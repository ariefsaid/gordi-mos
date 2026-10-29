import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/attendance-clock', () => ({
  beginClockIn: vi.fn(), clockIn: vi.fn(), clockOut: vi.fn(), getMyClockState: vi.fn(),
  recordAttendanceConsent: vi.fn(), uploadAttendanceSelfie: vi.fn(),
}))
vi.mock('@/lib/attendance-capture', () => {
  class PositionError extends Error { kind: string; constructor(kind: string) { super(kind); this.kind = kind } }
  return { PositionError, readPosition: vi.fn(), compressSelfie: vi.fn() }
})

import {
  beginClockIn, clockIn, clockOut, getMyClockState, recordAttendanceConsent, uploadAttendanceSelfie,
  type ClockShift, type ClockState,
} from '@/lib/db/attendance-clock'
import { compressSelfie, PositionError, readPosition } from '@/lib/attendance-capture'
import { ClockPanel } from './clock-panel'

const shift: ClockShift = {
  start_at: '2026-10-22T00:00:00Z', end_at: '2026-10-22T08:00:00Z', local_date: '2026-10-22', template_name: 'Pagi',
  site_id: 'site-1', site_name: 'HQ', team_name: 'Bar', opens_at: '2026-10-21T23:30:00Z',
  site_ready: true, radius_m: 100, max_accuracy_m: 50, record: null,
}
const state = (patch: Partial<ClockState> = {}): ClockState => ({
  notice_version: 'attendance-2026-10-r2', consented: true, now: '2026-10-22T00:05:00Z', shifts: [shift], ...patch,
})
const position = { latitude: 0.0007, longitude: 0, accuracy: 20 }

function renderPanel(locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><ClockPanel /></I18nProvider>)
}

async function attachSelfie(user: ReturnType<typeof userEvent.setup>, label = 'Take selfie') {
  await user.upload(await screen.findByLabelText(label), new File(['x'], 'me.jpg', { type: 'image/jpeg' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getMyClockState).mockResolvedValue(state())
  vi.mocked(readPosition).mockResolvedValue(position)
  vi.mocked(compressSelfie).mockResolvedValue(new Blob(['small'], { type: 'image/jpeg' }))
  vi.mocked(beginClockIn).mockResolvedValue({ ok: true, attempt_id: 'attempt-1', org_id: 'org-1', shift_end_at: shift.end_at })
  vi.mocked(uploadAttendanceSelfie).mockResolvedValue(undefined)
})

describe('ClockPanel', () => {
  it('AC-035 shows an empty state when no shift is assigned', async () => {
    vi.mocked(getMyClockState).mockResolvedValue(state({ shifts: [] }))
    renderPanel()
    expect(await screen.findByText(/No shift to clock in for right now/)).toBeInTheDocument()
  })

  it('AC-035 asks for consent first with an unticked control and records nothing on decline', async () => {
    const user = userEvent.setup()
    vi.mocked(getMyClockState).mockResolvedValue(state({ consented: false }))
    renderPanel()
    const box = await screen.findByRole('checkbox', { name: 'I agree to the statement above.' })
    expect(box).not.toBeChecked()
    expect(screen.getByText(/I agree that Gordi may collect my location and GPS accuracy/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agree and continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tick the box to agree')
    expect(recordAttendanceConsent).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    expect(await screen.findByText('You have not given consent')).toBeInTheDocument()
    expect(recordAttendanceConsent).not.toHaveBeenCalled()
    expect(readPosition).not.toHaveBeenCalled()
  })

  it('AC-035 records consent with the notice version and the language, then offers clock-in', async () => {
    const user = userEvent.setup()
    vi.mocked(getMyClockState).mockResolvedValueOnce(state({ consented: false })).mockResolvedValue(state())
    vi.mocked(recordAttendanceConsent).mockResolvedValue(undefined)
    renderPanel('id')
    await user.click(await screen.findByRole('checkbox', { name: 'Saya setuju dengan pernyataan di atas.' }))
    await user.click(screen.getByRole('button', { name: 'Setuju dan lanjutkan' }))
    await waitFor(() => expect(recordAttendanceConsent).toHaveBeenCalledWith('attendance-2026-10-r2', 'id'))
    expect(await screen.findByRole('button', { name: 'Catat masuk' })).toBeInTheDocument()
  })

  it('AC-030 clock-in reads position once, uploads the selfie to the attempt, then asks the server to decide', async () => {
    const user = userEvent.setup()
    vi.mocked(clockIn).mockResolvedValue({ ok: true, record_id: 'rec-1', status: 'in', clock_in_at: '2026-10-22T00:05:00Z', late: false, late_minutes: null })
    renderPanel()
    await attachSelfie(user)
    await user.click(await screen.findByRole('button', { name: 'Clock in' }))
    await waitFor(() => expect(clockIn).toHaveBeenCalledWith('attempt-1', position))
    expect(readPosition).toHaveBeenCalledTimes(1)
    expect(beginClockIn).toHaveBeenCalledWith(shift.start_at)
    expect(uploadAttendanceSelfie).toHaveBeenCalledWith('org-1', 'attempt-1', expect.any(Blob))
    expect(await screen.findByText(/Clock-in recorded/)).toBeInTheDocument()
  })

  it('AC-030 clock-in without a selfie never reaches the server', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Clock in' }))
    expect(await screen.findByText('Selfie needed')).toBeInTheDocument()
    expect(beginClockIn).not.toHaveBeenCalled()
  })

  it.each([
    ['too_far', { distance_m: 150, radius_m: 100 }, 'Too far from the Site', 'You are 150 m away; the allowed radius is 100 m.'],
    ['weak_gps', { accuracy_m: 80, max_accuracy_m: 50 }, 'GPS accuracy is too low', 'Accuracy ±80 m; the maximum is ±50 m.'],
    ['photo_needed', {}, 'Selfie needed', 'Take a selfie now, then try again.'],
    ['shift_over', {}, 'This shift has ended', 'Clock-in is closed for this shift.'],
  ] as const)('AC-035 shows the %s refusal with what to do (English)', async (reason, detail, title, body) => {
    const user = userEvent.setup()
    vi.mocked(clockIn).mockResolvedValue({ ok: false, reason, ...detail })
    renderPanel()
    await attachSelfie(user)
    await user.click(await screen.findByRole('button', { name: 'Clock in' }))
    const alert = await screen.findByText(title)
    expect(alert.closest('[role="alert"]')).toHaveTextContent(body)
    expect(screen.getByText('Not recorded · fix the check above')).toBeInTheDocument()
  })

  it.each([
    ['too_far', { distance_m: 150, radius_m: 100 }, 'Terlalu jauh dari Site', 'Jarak Anda 150 m; radius yang diizinkan 100 m.'],
    ['weak_gps', { accuracy_m: 80, max_accuracy_m: 50 }, 'Akurasi GPS terlalu rendah', 'Akurasi ±80 m; maksimum ±50 m.'],
    ['too_early', { opens_at: '2026-10-21T23:30:00Z' }, 'Catatan masuk belum dibuka', 'pukul 06.30 WIB'],
  ] as const)('AC-035 shows the %s refusal with what to do (Indonesian)', async (reason, detail, title, body) => {
    const user = userEvent.setup()
    vi.mocked(clockIn).mockResolvedValue({ ok: false, reason, ...detail })
    vi.mocked(beginClockIn).mockResolvedValue(reason === 'too_early' ? { ok: false, reason, ...detail } : { ok: true, attempt_id: 'attempt-1', org_id: 'org-1', shift_end_at: shift.end_at })
    renderPanel('id')
    await attachSelfie(user, 'Ambil swafoto')
    await user.click(await screen.findByRole('button', { name: 'Catat masuk' }))
    const alert = await screen.findByText(title)
    expect(alert.closest('[role="alert"]')).toHaveTextContent(body)
  })

  it.each([
    ['denied', 'Location permission is blocked', 'Allow location for MOS in your browser settings'],
    ['unavailable', 'Your location could not be read', 'Turn on location services'],
  ] as const)('AC-035 shows the %s location failure and records nothing', async (kind, title, body) => {
    const user = userEvent.setup()
    vi.mocked(readPosition).mockRejectedValue(new PositionError(kind))
    renderPanel()
    await attachSelfie(user)
    await user.click(await screen.findByRole('button', { name: 'Clock in' }))
    const alert = await screen.findByText(title)
    expect(alert.closest('[role="alert"]')).toHaveTextContent(body)
    expect(beginClockIn).not.toHaveBeenCalled()
  })

  it('AC-030 a retry after a refusal keeps one attempt and uploads the same selfie once', async () => {
    const user = userEvent.setup()
    vi.mocked(clockIn).mockResolvedValueOnce({ ok: false, reason: 'too_far', distance_m: 150, radius_m: 100 })
      .mockResolvedValue({ ok: true, record_id: 'rec-1', status: 'in', clock_in_at: '2026-10-22T00:06:00Z', late: false, late_minutes: null })
    renderPanel()
    await attachSelfie(user)
    await user.click(await screen.findByRole('button', { name: 'Clock in' }))
    await screen.findByText('Too far from the Site')
    await user.click(screen.getByRole('button', { name: 'Clock in' }))
    await screen.findByText(/Clock-in recorded/)
    expect(uploadAttendanceSelfie).toHaveBeenCalledTimes(1)
  })

  it('FR-033 clock-out needs no selfie and shows the early-leave flag', async () => {
    const user = userEvent.setup()
    const record = { id: 'rec-1', status: 'in' as const, late: true, late_minutes: 5, early_leave: false, early_minutes: null, closure: null, clock_in_at: '2026-10-22T00:15:00Z', clock_out_at: null }
    vi.mocked(getMyClockState).mockResolvedValueOnce(state({ shifts: [{ ...shift, record }] }))
      .mockResolvedValue(state({ shifts: [{ ...shift, record: { ...record, status: 'out', early_leave: true, early_minutes: 20, clock_out_at: '2026-10-22T07:40:00Z' } }] }))
    vi.mocked(clockOut).mockResolvedValue({ ok: true, record_id: 'rec-1', status: 'out', clock_out_at: '2026-10-22T07:40:00Z', early_leave: true, early_minutes: 20 })
    renderPanel()
    expect(await screen.findByText(/late by 5 min/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Take selfie')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clock out' }))
    await waitFor(() => expect(clockOut).toHaveBeenCalledWith('rec-1', position))
    expect(beginClockIn).not.toHaveBeenCalled()
    expect(await screen.findByText(/left 20 min early/)).toBeInTheDocument()
  })

  it('FR-034 a record closed without a clock-out says who must correct it', async () => {
    const record = { id: 'rec-1', status: 'closed' as const, late: false, late_minutes: null, early_leave: false, early_minutes: null, closure: 'no_clock_out' as const, clock_in_at: '2026-10-22T00:05:00Z', clock_out_at: null }
    vi.mocked(getMyClockState).mockResolvedValue(state({ shifts: [{ ...shift, record }] }))
    renderPanel()
    expect(await screen.findByText(/Your Team lead or HR must correct it with a reason/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clock out' })).not.toBeInTheDocument()
  })

  it('AC-035 a Site without a map point cannot be clocked at', async () => {
    vi.mocked(getMyClockState).mockResolvedValue(state({ shifts: [{ ...shift, site_ready: false }] }))
    renderPanel()
    expect(await screen.findByText(/no map point yet, so clock-in is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clock in' })).toBeDisabled()
  })

  it('AC-1888 leaving the clock open across a shift boundary selects the current eligible shift', async () => {
    vi.useFakeTimers()
    const shift1: ClockShift = {
      ...shift,
      start_at: '2026-10-22T00:00:00Z',
      opens_at: '2026-10-21T23:30:00Z',
      end_at: '2026-10-22T08:00:00Z',
      template_name: 'Pagi',
      record: { id: 'rec-1', status: 'out', late: false, late_minutes: null, early_leave: false, early_minutes: null, closure: null, clock_in_at: '2026-10-22T00:00:00Z', clock_out_at: '2026-10-22T07:55:00Z' },
    }
    const shift2: ClockShift = {
      ...shift,
      start_at: '2026-10-22T08:00:00Z',
      opens_at: '2026-10-22T07:30:00Z',
      end_at: '2026-10-22T16:00:00Z',
      template_name: 'Siang',
      record: null,
    }

    const stateAt720 = state({
      now: '2026-10-22T00:20:00Z',
      shifts: [shift1, shift2],
    })
    const stateAt730 = state({
      now: '2026-10-22T00:30:00Z',
      shifts: [shift1, shift2],
    })

    vi.mocked(getMyClockState)
      .mockResolvedValueOnce(stateAt720)
      .mockResolvedValue(stateAt730)

    renderPanel()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(getMyClockState).toHaveBeenCalledTimes(1)

    // Advance by 10 minutes (600,000 ms) to shift boundary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000)
    })

    expect(getMyClockState).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('AC-1888 resuming the clock on visibility change or focus refreshes the authoritative shift snapshot', async () => {
    const shift2: ClockShift = {
      ...shift,
      start_at: '2026-10-22T08:00:00Z',
      opens_at: '2026-10-22T07:30:00Z',
      end_at: '2026-10-22T16:00:00Z',
      template_name: 'Siang',
      record: null,
    }
    vi.mocked(getMyClockState)
      .mockResolvedValueOnce(state())
      .mockResolvedValue(state({ shifts: [shift2] }))

    renderPanel()
    await screen.findByRole('button', { name: 'Clock in' })
    expect(getMyClockState).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(getMyClockState).toHaveBeenCalledTimes(2))
  })

  it('AC-1888 unmount and stale responses do not overwrite newer state or throw errors', async () => {
    let resolveFirst!: (val: ClockState) => void
    let resolveSecond!: (val: ClockState) => void
    const firstPromise = new Promise<ClockState>((res) => { resolveFirst = res })
    const secondPromise = new Promise<ClockState>((res) => { resolveSecond = res })

    vi.mocked(getMyClockState)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => secondPromise)

    const { unmount } = renderPanel()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    await act(async () => {
      resolveSecond(state({ notice_version: 'v2-newer' }))
    })

    await act(async () => {
      resolveFirst(state({ notice_version: 'v1-stale' }))
    })

    unmount()
  })
})

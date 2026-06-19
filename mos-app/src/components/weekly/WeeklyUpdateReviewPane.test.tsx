// WeeklyUpdateReviewPane unit tests — week navigation + state coverage.
// AC-NC-02: "Previous week" nav calls onWeekChange with the prior Monday ISO.
// AC-NC-03: "Next week" button is disabled when viewing the current week.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WeeklyUpdateReviewPane } from './WeeklyUpdateReviewPane'

// ── Mock data layer ─────────────────────────────────────────────────────────
vi.mock('../../lib/db/weeklyUpdates', () => ({
  listTeamUpdates: vi.fn().mockResolvedValue([]),
}))
import { listTeamUpdates } from '@/lib/db/weeklyUpdates'
const mockListTeamUpdates = vi.mocked(listTeamUpdates)

// ── Shared team fixture ──────────────────────────────────────────────────────
const team = [
  { person_id: 'p1', full_name: 'Budi Santoso', role_label: 'Ops Lead' },
]

// ── Helper: render pane and flush all async state updates ────────────────────
// act(async () => { await Promise.resolve() }) flushes the listTeamUpdates mock
// promise so that the loadState → 'ready' state update is processed inside act().
// This silences "not wrapped in act()" console warnings.
async function renderPane(props: {
  weekStart: string
  currentWeekStart: string
  onWeekChange: ReturnType<typeof vi.fn>
}) {
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <WeeklyUpdateReviewPane
        team={team}
        weekStart={props.weekStart}
        onWeekChange={props.onWeekChange}
        currentWeekStart={props.currentWeekStart}
      />,
    )
    // Flush the mock-resolved listTeamUpdates Promise so state updates settle
    await Promise.resolve()
  })
  return utils
}

// ── AC-NC-02 & AC-NC-03: Week navigation behavior ────────────────────────────
// Fixed wall-clock so weekStartISO(now, ...) is deterministic.
// 2026-06-10T05:00:00Z = Wed 10 Jun 2026 12:00 WIB → Monday of that week = 2026-06-08.
const FIXED_NOW_UTC      = '2026-06-10T05:00:00Z'
const CURRENT_WEEK_START = '2026-06-08'
const PREV_WEEK_START    = '2026-06-01'

describe('AC-NC-02: Previous week navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW_UTC))
    mockListTeamUpdates.mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('clicking "Previous week" calls onWeekChange with the prior Monday (AC-NC-02)', async () => {
    const onWeekChange = vi.fn()
    await renderPane({ weekStart: CURRENT_WEEK_START, currentWeekStart: CURRENT_WEEK_START, onWeekChange })

    const prevBtn = screen.getByRole('button', { name: /previous week/i })
    fireEvent.click(prevBtn)

    expect(onWeekChange).toHaveBeenCalledOnce()
    // Prior Monday of 2026-06-08 is 2026-06-01
    expect(onWeekChange).toHaveBeenCalledWith(PREV_WEEK_START)
  })

  it('clicking "Previous week" from prior-week view calls onWeekChange with week further back (AC-NC-02)', async () => {
    const onWeekChange = vi.fn()
    await renderPane({ weekStart: PREV_WEEK_START, currentWeekStart: CURRENT_WEEK_START, onWeekChange })

    const prevBtn = screen.getByRole('button', { name: /previous week/i })
    fireEvent.click(prevBtn)

    expect(onWeekChange).toHaveBeenCalledOnce()
    // Two weeks back from current = 2026-05-25
    expect(onWeekChange).toHaveBeenCalledWith('2026-05-25')
  })
})

describe('AC-NC-03: Next week button disabled at current week', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW_UTC))
    mockListTeamUpdates.mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('"Next week" button is disabled when viewing the current week (AC-NC-03)', async () => {
    const onWeekChange = vi.fn()
    await renderPane({ weekStart: CURRENT_WEEK_START, currentWeekStart: CURRENT_WEEK_START, onWeekChange })

    const nextBtn = screen.getByRole('button', { name: /next week/i })
    expect(nextBtn).toBeDisabled()
  })

  it('"Next week" button is enabled when viewing a prior week (AC-NC-03)', async () => {
    const onWeekChange = vi.fn()
    await renderPane({ weekStart: PREV_WEEK_START, currentWeekStart: CURRENT_WEEK_START, onWeekChange })

    const nextBtn = screen.getByRole('button', { name: /next week/i })
    expect(nextBtn).not.toBeDisabled()
  })

  it('"Next week" button click from prior week calls onWeekChange with current week (AC-NC-03)', async () => {
    const onWeekChange = vi.fn()
    await renderPane({ weekStart: PREV_WEEK_START, currentWeekStart: CURRENT_WEEK_START, onWeekChange })

    const nextBtn = screen.getByRole('button', { name: /next week/i })
    fireEvent.click(nextBtn)

    expect(onWeekChange).toHaveBeenCalledOnce()
    expect(onWeekChange).toHaveBeenCalledWith(CURRENT_WEEK_START)
  })

  it('"Next week" click does nothing when at current week (AC-NC-03)', async () => {
    const onWeekChange = vi.fn()
    await renderPane({ weekStart: CURRENT_WEEK_START, currentWeekStart: CURRENT_WEEK_START, onWeekChange })

    const nextBtn = screen.getByRole('button', { name: /next week/i })
    fireEvent.click(nextBtn)

    // disabled button — onWeekChange must not be called
    expect(onWeekChange).not.toHaveBeenCalled()
  })
})

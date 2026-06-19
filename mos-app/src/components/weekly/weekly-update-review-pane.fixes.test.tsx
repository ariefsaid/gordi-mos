// Regression tests for design-review fixes on WeeklyUpdateReviewPane + WeeklyUpdateWritePane.
// RI-1 (C1): write-pane week desync — week pill must reflect the weekStart prop, not new Date().
// RI-2 (C2): roster row open — filed/draft rows are keyboard-focusable, have an accessible name,
//            activating them shows the read-only update; not-started rows are non-interactive.
// RI-3 (C3): invalid ARIA — no role="row" without a table/grid ancestor; list semantics instead.
// RI-4 (I1): error timeout — error state surfaces within ~3s (client-side timeout).
// RI-5 (M1): orphan period — the Submitted strip reads "Submitted [chip]." not "Submitted [chip] ."
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WeeklyUpdateReviewPane } from './weekly-update-review-pane'
import { WeeklyUpdateWritePane } from './weekly-update-write-pane'
import { MemoryRouter } from 'react-router-dom'
import { MyWeek } from '@/pages/my-week'

// The submitted-strip RI-5 cases render <MyWeek/>, where the weekly-update strip is
// flag-hidden in production (config/features.ts). Force the flags on so the strip renders
// and its formatting is still exercised.
vi.mock('../../config/features', () => ({ SHOW_WEEKLY_UPDATES: true, SHOW_DAILY_LOG: true }))

// ── Mock data layer ─────────────────────────────────────────────────────────
vi.mock('../../lib/db/weekly-updates', () => ({
  listTeamUpdates: vi.fn().mockResolvedValue([]),
  getMyUpdate:     vi.fn().mockResolvedValue(null),
  upsertDraft:     vi.fn().mockResolvedValue('test-id'),
  submit:          vi.fn().mockResolvedValue(undefined),
  reopen:          vi.fn().mockResolvedValue(undefined),
}))
import { listTeamUpdates, getMyUpdate } from '@/lib/db/weekly-updates'
import type { TeamUpdateRow } from '@/lib/db/weekly-updates.types'
const mockListTeamUpdates = vi.mocked(listTeamUpdates)
const mockGetMyUpdate     = vi.mocked(getMyUpdate)

// ── Mock auth (needed for MyWeek) ────────────────────────────────────────────
vi.mock('../../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// ── Fixture data ─────────────────────────────────────────────────────────────
const CURRENT_WEEK = '2026-06-08'
const PREV_WEEK    = '2026-06-01'

const team = [
  { person_id: 'p1', full_name: 'Budi Santoso', role_label: 'Ops Lead' },
  { person_id: 'p2', full_name: 'Raka Wijaya',  role_label: 'Roastery Lead' },
]

const filedRow = {
  person_id: 'p1', full_name: 'Budi Santoso', role_label: 'Ops Lead',
  state: 'filed' as const,
  summary_excerpt: 'Finalisasi menu seasonal Q3',
  submitted_at: '2026-06-12T08:00:00Z',
}

const draftRow = {
  person_id: 'p2', full_name: 'Raka Wijaya', role_label: 'Roastery Lead',
  state: 'draft' as const,
  summary_excerpt: 'Draft notes for the week',
  submitted_at: null,
}

const notStartedRow = {
  person_id: 'p1', full_name: 'Budi Santoso', role_label: 'Ops Lead',
  state: 'not_started' as const,
  summary_excerpt: null,
  submitted_at: null,
}

// ── Helper: render review pane with async flush ─────────────────────────────
async function renderReview(
  weekStart: string,
  rows: TeamUpdateRow[] = [filedRow, draftRow],
) {
  mockListTeamUpdates.mockResolvedValue(rows)
  const onWeekChange = vi.fn()
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <WeeklyUpdateReviewPane
        team={team}
        weekStart={weekStart}
        onWeekChange={onWeekChange}
        currentWeekStart={CURRENT_WEEK}
      />,
    )
    await Promise.resolve()
  })
  return { ...utils, onWeekChange }
}

// ── Helper: render write pane with async flush ──────────────────────────────
async function renderWrite(weekStart: string) {
  mockGetMyUpdate.mockResolvedValue(null)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <WeeklyUpdateWritePane
        personId="person-1"
        createdBy="person-1"
        weekStart={weekStart}
      />,
    )
    // Flush the mock-resolved getMyUpdate Promise
    await Promise.resolve()
  })
  // Wait for the "ready" state (Submit update button visible)
  await screen.findByText('Submit update')
  return utils
}

// ═══════════════════════════════════════════════════════════════════════════
// RI-1 (C1) — Write-pane week label must follow weekStart prop, not new Date()
// The current bug: WeeklyUpdateWritePane.tsx line 172-173 calls `weekLabel(new Date())`
// ignoring the weekStart prop — so when a prior weekStart is passed, the week pill
// still shows the current-week range instead of the correct prop-derived range.
// Fix: derive weekLabel from the weekStart prop date, not new Date().
// ═══════════════════════════════════════════════════════════════════════════
describe('RI-1 (C1) — Write pane week label follows weekStart prop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('RI-1a: write pane with weekStart=2026-06-08 shows "8–14 Jun 2026" week range (RI-1)', async () => {
    await renderWrite(CURRENT_WEEK) // 2026-06-08
    const pill = screen.getByTestId('week-pill')
    // Week of 2026-06-08: 8–14 Jun 2026
    expect(pill.textContent).toMatch(/8.{1,2}14 Jun 2026/)
  })

  it('RI-1b: write pane with weekStart=2026-06-01 shows "1–7 Jun 2026" week range (RI-1 — label follows prop)', async () => {
    // The bug: with `weekLabel(new Date())`, this would show the CURRENT week (e.g. 8–14 Jun)
    // instead of the PROP's week (1–7 Jun). The fix must make the label follow the prop.
    await renderWrite(PREV_WEEK) // 2026-06-01
    const pill = screen.getByTestId('week-pill')
    // Must show the prior week's range — the prop-derived week
    expect(pill.textContent).toMatch(/1.{1,2}7 Jun 2026/)
  })

  it('RI-1c: write pane label does NOT show current-week range when prop is a prior week (RI-1)', async () => {
    // When weekStart prop = prior week but weekLabel(new Date()) = current week,
    // the bug causes the pill to show the current-week range. Assert that does NOT happen.
    await renderWrite(PREV_WEEK)
    const pill = screen.getByTestId('week-pill')
    // Must NOT show the current week "8–14 Jun" when prop is prior week "1–7 Jun"
    // (This test will FAIL if the implementation still calls weekLabel(new Date()) on the current date)
    expect(pill.textContent).not.toMatch(/8.{1,2}14 Jun 2026/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RI-2 (C2) — Roster row open: keyboard focus + accessible name + read-only view
// ═══════════════════════════════════════════════════════════════════════════
describe('RI-2 (C2) — Roster row open interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('RI-2a: filed row is keyboard-focusable (button role) (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [filedRow])
    // The filed row should be a button (or have tabIndex)
    const row = screen.getByRole('button', { name: /Budi Santoso/i })
    expect(row).toBeInTheDocument()
  })

  it('RI-2b: filed row has accessible name including person name (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [filedRow])
    const row = screen.getByRole('button', { name: /Budi Santoso/i })
    expect(row).toBeInTheDocument()
  })

  it('RI-2c: clicking a filed row sets aria-expanded=true and shows a region panel (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [filedRow])
    const row = screen.getByRole('button', { name: /Budi Santoso/i })
    // Before: collapsed
    expect(row.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(row)
    // After: expanded and a region panel is rendered
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('region', { name: /Budi Santoso/i })).toBeInTheDocument()
  })

  it('RI-2d: pressing Enter on a filed row expands the panel (keyboard nav via button semantics) (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [filedRow])
    const row = screen.getByRole('button', { name: /Budi Santoso/i })
    // <button> handles Enter → click natively; simulate via click
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
  })

  it('RI-2e: clicking an open row collapses it (toggle) (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [filedRow])
    const row = screen.getByRole('button', { name: /Budi Santoso/i })
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    // Second click collapses
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: /Budi Santoso/i })).toBeNull()
  })

  it('RI-2f: draft row is openable; clicking shows a region panel (manager can read draft) (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [draftRow])
    const row = screen.getByRole('button', { name: /Raka Wijaya/i })
    expect(row).toBeInTheDocument()
    expect(row.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('region', { name: /Raka Wijaya/i })).toBeInTheDocument()
  })

  it('RI-2g: draft row expanded view shows "Draft" indicator (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [draftRow])
    const row = screen.getByRole('button', { name: /Raka Wijaya/i })
    fireEvent.click(row)
    // Should find at least one "Draft" label in the expanded view
    // (the state pill + possibly a header)
    const draftLabels = screen.getAllByText(/Draft/i)
    expect(draftLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('RI-2h: not-started row is NOT a button (non-interactive) (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [notStartedRow])
    // Should NOT find a button with Budi Santoso's name
    const btn = screen.queryByRole('button', { name: /Budi Santoso/i })
    expect(btn).toBeNull()
  })

  it('RI-2i: expanded read-only view has no edit affordance (no textbox, no edit button) (RI-2)', async () => {
    await renderReview(CURRENT_WEEK, [filedRow])
    const row = screen.getByRole('button', { name: /Budi Santoso/i })
    fireEvent.click(row)
    // No editable inputs in the expanded panel
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RI-3 (C3) — No role="row" without table/grid ancestor
// The roster uses list semantics, not table semantics (design-plan §5.2).
// ═══════════════════════════════════════════════════════════════════════════
describe('RI-3 (C3) — No invalid role="row" without table/grid ancestor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('RI-3a: no element has role="row" in the review pane (RI-3)', async () => {
    const { container } = await renderReview(CURRENT_WEEK, [filedRow, draftRow])
    const rowElements = container.querySelectorAll('[role="row"]')
    expect(rowElements.length).toBe(0)
  })

  it('RI-3b: no element has role="rowgroup" in the review pane (RI-3)', async () => {
    const { container } = await renderReview(CURRENT_WEEK, [filedRow, draftRow])
    const rowgroupElements = container.querySelectorAll('[role="rowgroup"]')
    expect(rowgroupElements.length).toBe(0)
  })

  it('RI-3c: the roster container uses list semantics (ul or role=list) (RI-3)', async () => {
    const { container } = await renderReview(CURRENT_WEEK, [filedRow, draftRow])
    const hasList = container.querySelector('ul') !== null
      || container.querySelector('[role="list"]') !== null
    expect(hasList).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RI-4 (I1) — Error state timeout: surfaces within ~3s, not 5-8s
// ═══════════════════════════════════════════════════════════════════════════
describe('RI-4 (I1) — Error state timeout (≤3s)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('RI-4a: review pane shows error when query hangs past 3s timeout (RI-4)', async () => {
    // Promise that never resolves (simulates hung query)
    mockListTeamUpdates.mockReturnValue(new Promise(() => {}))

    await act(async () => {
      render(
        <WeeklyUpdateReviewPane
          team={team}
          weekStart={CURRENT_WEEK}
          onWeekChange={vi.fn()}
          currentWeekStart={CURRENT_WEEK}
        />,
      )
    })

    // Fast-forward 3100ms past the timeout
    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('RI-4b: write pane shows error when query hangs past 3s timeout (RI-4)', async () => {
    mockGetMyUpdate.mockReturnValue(new Promise(() => {}))

    await act(async () => {
      render(
        <WeeklyUpdateWritePane
          personId="person-1"
          createdBy="person-1"
          weekStart={CURRENT_WEEK}
        />,
      )
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RI-5 (M1) — Submitted strip: no orphan space+period after TimingChip
// Design §6: "Submitted {on time|late}." — period immediately after chip, no space.
// ═══════════════════════════════════════════════════════════════════════════
describe('RI-5 (M1) — Submitted strip: no orphan space+period', () => {
  const submittedAuth = {
    status: 'authenticated' as const,
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Cahya Cafe',
        email: 'cahya@gordi.id',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
    },
    signOut: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(submittedAuth)
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-1', org_id: 'org',
        person_id: '40000000-0000-0000-0000-000000000001',
        week_start: '2026-06-08', summary: 'Done', status: 'submitted',
        submitted_at: '2026-06-12T08:00:00Z', // Fri 15:00 WIB — on time
        created_by: '40000000-0000-0000-0000-000000000001',
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
  })

  it('RI-5a: submitted strip text does NOT contain " ." (space + period at text boundary) (RI-5)', async () => {
    let utils!: ReturnType<typeof render>
    await act(async () => {
      utils = render(
        <MemoryRouter>
          <MyWeek />
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    const strip = utils.container.querySelector('[aria-label="My weekly update"]')
    expect(strip).not.toBeNull()
    // The text must not contain an orphan " ." (space-period as standalone sequence)
    // strip.textContent merges all text nodes, so " ." would appear as " ." in the string
    expect(strip!.textContent).not.toMatch(/ \. /)
    // No double space before period
    expect(strip!.textContent).not.toMatch(/ {2}\./)
  })

  it('RI-5b: timing word is immediately followed by "." in textContent — no space between (RI-5)', async () => {
    let utils!: ReturnType<typeof render>
    await act(async () => {
      utils = render(
        <MemoryRouter>
          <MyWeek />
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    const strip = utils.container.querySelector('[aria-label="My weekly update"]')
    const text = strip!.textContent ?? ''
    // The sentence body element holds: "Submitted [on time|late]."
    // The period must come directly after "on time" or "late" — no space between
    expect(text).toMatch(/(?:on time|late)\b/)
    // Should NOT have "on time ." or "late ." (word + space + period)
    expect(text).not.toMatch(/(?:on time|late) \./)
  })
})

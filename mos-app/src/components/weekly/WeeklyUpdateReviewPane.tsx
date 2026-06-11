// WeeklyUpdateReviewPane — manager-review surface (PR-c).
// Design authority: docs/plans/2026-06-12-weekly-updates-design.md §3 + signed mock pane B.
// All states: loading skeleton / error+Retry / populated / empty-team / no-reports.
// Read-only throughout (FR-034, AC-043). No edit/ack/comment affordances.
// AC-040..046, FR-030..036.
import { useState, useEffect, useCallback } from 'react'
import { listTeamUpdates, type TeamMember } from '../../lib/db/weeklyUpdates'
import type { TeamUpdateRow } from '../../lib/db/weeklyUpdates.types'
import { weekLabel, weekStartISO } from '../../lib/week'
import TimingChip from './TimingChip'
import './WeeklyUpdateReviewPane.css'

// ── Initials helper ────────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Format submit time — "Mon 09:12" tabular (§3.2) ──────────────────────────
function formatSubmitTime(submittedAt: string): string {
  return new Date(submittedAt).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

// ── State pill (§3.3) ──────────────────────────────────────────────────────────
function StatePill({ state }: { state: TeamUpdateRow['state'] }) {
  const cls = state === 'filed'
    ? 'wup-state-filed'
    : state === 'draft'
    ? 'wup-state-draft'
    : 'wup-state-notstarted'
  const label = state === 'filed' ? 'Filed' : state === 'draft' ? 'Draft' : 'Not started'
  return (
    <span className={`wup-state-pill ${cls}`}>
      <span className="wup-state-pill-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

// ── Skeleton (3 rows, 60px each) ──────────────────────────────────────────────
function ReviewSkeleton() {
  return (
    <div data-testid="review-pane-skeleton" aria-hidden="true">
      {[1, 2, 3].map(i => (
        <div key={i} className="wup-review-skeleton">
          <div className="wup-review-skeleton-circle" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="wup-review-skeleton-line" style={{ height: 13, width: '45%' }} />
            <div className="wup-review-skeleton-line" style={{ height: 12, width: '30%' }} />
          </div>
          <div className="wup-review-skeleton-line" style={{ height: 22, width: 96 }} />
        </div>
      ))}
    </div>
  )
}

// ── Single roster row (§3.2) ──────────────────────────────────────────────────
function ReviewRow({ row, weekStart }: { row: TeamUpdateRow; weekStart: string }) {
  return (
    <div className="wup-review-row" role="row">
      {/* Avatar (§3.2) */}
      <div className="wup-review-avatar" aria-hidden="true">
        {initials(row.full_name)}
      </div>

      {/* Main: name + role + excerpt */}
      <div className="wup-review-main">
        <div>
          <span className="wup-review-name">{row.full_name}</span>
          {row.role_label && (
            <span className="wup-review-role"> · {row.role_label}</span>
          )}
        </div>
        <div className="wup-review-excerpt">
          {row.summary_excerpt
            ? row.summary_excerpt
            : <span className="wup-review-excerpt-empty">No update yet</span>}
        </div>
      </div>

      {/* Meta: time · timing chip · state pill */}
      <div className="wup-review-meta">
        {row.submitted_at ? (
          <>
            <span className="wup-review-time tabular-nums">
              {formatSubmitTime(row.submitted_at)}
            </span>
            <TimingChip submittedAt={row.submitted_at} weekStart={weekStart} />
          </>
        ) : (
          <span className="wup-review-time" aria-label="No submission time">—</span>
        )}
        <StatePill state={row.state} />
      </div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface WeeklyUpdateReviewPaneProps {
  /** The team roster (person_id + full_name + role_label) resolved by the caller from directory. */
  team: TeamMember[]
  /** The currently selected week_start (shared with write pane). */
  weekStart: string
  /** Called when the user navigates weeks, so the parent can update the shared weekStart. */
  onWeekChange: (newWeekStart: string) => void
  /** The current WIB week start (used to disable "next" at current week). */
  currentWeekStart: string
}

export default function WeeklyUpdateReviewPane({
  team,
  weekStart,
  onWeekChange,
  currentWeekStart,
}: WeeklyUpdateReviewPaneProps) {
  const [rows, setRows]       = useState<TeamUpdateRow[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')

  // Track weekOffset (week-count) relative to current week for navigation (§3.5)
  // Derive offset from weekStart vs currentWeekStart — counts whole weeks, not days
  const currentWeekMs  = new Date(currentWeekStart).getTime()
  const selectedWeekMs = new Date(weekStart).getTime()
  const weekOffset     = Math.round((selectedWeekMs - currentWeekMs) / (7 * 24 * 3600 * 1000))
  const atCurrentWeek  = weekOffset >= 0

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const result = await listTeamUpdates(weekStart, team)
      setRows(result)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [weekStart, team])

  useEffect(() => { load() }, [load])

  // Week nav (§3.5) — relative to current week
  const handlePrevWeek = useCallback(() => {
    const now = new Date()
    const newWeekStart = weekStartISO(now, weekOffset - 1)
    onWeekChange(newWeekStart)
  }, [weekOffset, onWeekChange])

  const handleNextWeek = useCallback(() => {
    if (atCurrentWeek) return
    const now = new Date()
    const newWeekStart = weekStartISO(now, weekOffset + 1)
    onWeekChange(newWeekStart)
  }, [atCurrentWeek, weekOffset, onWeekChange])

  // Derive the week label for the head row pill (using the selected weekStart)
  const selectedWeekDate = new Date(weekStart + 'T00:00:00+07:00')
  const wib = weekLabel(selectedWeekDate)

  // Counts (§3.4)
  const filedCount      = rows.filter(r => r.state === 'filed').length
  const draftCount      = rows.filter(r => r.state === 'draft').length
  const notStartedCount = rows.filter(r => r.state === 'not_started').length

  // ── Week pill ────────────────────────────────────────────────────────────────
  const WeekPill = (
    <span
      className="tabular-nums"
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 22, padding: '0 9px', borderRadius: 999,
        background: 'hsl(240 4.8% 95.9%)',
        color: 'hsl(240 4% 40%)',
        fontSize: 12, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      Week of {wib.range}
    </span>
  )

  return (
    <section
      aria-label="Team updates"
      className="bg-card border border-border rounded-md"
      style={{ padding: '16px 20px' }}
    >
      {/* Card head row: h2 + week pill + prior-week nav (§3.1, §3.5) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>Team updates</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {WeekPill}
          {/* Prior-week nav (§3.5) */}
          <div className="wup-week-nav" role="navigation" aria-label="Week navigation">
            <button
              type="button"
              className="wup-week-nav-btn"
              aria-label="Previous week"
              onClick={handlePrevWeek}
            >
              ‹
            </button>
            <button
              type="button"
              className="wup-week-nav-btn"
              aria-label="Next week"
              disabled={atCurrentWeek}
              aria-disabled={atCurrentWeek ? 'true' : 'false'}
              onClick={handleNextWeek}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loadState === 'loading' && <ReviewSkeleton />}

      {/* Error state (AC-046) */}
      {loadState === 'error' && (
        <div
          role="alert"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}
        >
          <span style={{ fontSize: 14, color: 'hsl(240 4% 40%)' }}>
            Couldn't load team updates
          </span>
          <button
            type="button"
            onClick={load}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8,
              border: '1px solid hsl(240 5.9% 90%)',
              background: 'hsl(0 0% 100%)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              color: 'hsl(240 10% 3.9%)',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Ready: counts + roster */}
      {loadState === 'ready' && (
        <>
          {/* Summary counts (§3.4, AC-041, AC-045) */}
          <div className="wup-review-counts" data-testid="review-counts" aria-live="polite">
            <span><b>{filedCount}</b> filed</span>
            <span><b>{draftCount}</b> draft</span>
            <span><b>{notStartedCount}</b> not started</span>
          </div>

          {/* No-reports guard: nothing to review */}
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'hsl(240 4% 40%)', padding: '8px 0' }}>
              No direct reports to review.
            </p>
          ) : (
            /* Roster (§3.2, AC-040) */
            <div role="rowgroup" aria-label="Team roster">
              {rows.map(row => (
                <ReviewRow key={row.person_id} row={row} weekStart={weekStart} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// WeeklyUpdateReviewPane — manager-review surface (PR-c).
// Design authority: docs/plans/2026-06-12-weekly-updates-design.md §3 + signed mock pane B.
// All states: loading skeleton / error+Retry / populated / empty-team / no-reports.
// Read-only throughout (FR-034, AC-043). No edit/ack/comment affordances.
// AC-040..046, FR-030..036.
//
// Design-review fixes applied:
//   C2 — roster row open: filed/draft rows are interactive (button), keyboard-operable,
//         open a read-only in-place panel; not-started rows are non-interactive.
//   C3 — ARIA: replaced invalid role="row"/"rowgroup" with list semantics (<ul>/<li>).
//   I1 — 3s client-side timeout surfaces error faster (AbortController + setTimeout).
import { useState, useEffect, useCallback, useRef } from 'react'
import { listTeamUpdates, type TeamMember } from '../../lib/db/weeklyUpdates'
import type { TeamUpdateRow } from '../../lib/db/weeklyUpdates.types'
import { weekLabel, weekStartISO } from '../../lib/week'
import TimingChip from './TimingChip'
import { CardHead } from '../ui/CardHead'
import { ErrorState } from '../ui/StateKit'
import { Pill } from '../ui/Pill'
// VIS-4 (PR-2): the weekly-update lifecycle pill now lives in the shared ui module
// and re-skins onto <Pill>. Re-exported here so existing import sites stay stable.
export { StatePill } from '../ui/StatePill'
import { StatePill } from '../ui/StatePill'
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

// ── Read-only expanded panel (C2: in-place expand under the row) ──────────────
// Reuses StaticLineRow pattern + ProgressMarker static. No edit/ack/comment (OD-P2-12).
interface ReadOnlyPanelProps {
  row: TeamUpdateRow
  weekStart: string
}

function ReadOnlyPanel({ row, weekStart }: ReadOnlyPanelProps) {
  const isDraft = row.state === 'draft'
  return (
    <div
      className="wup-review-panel"
      role="region"
      aria-label={`${row.full_name}'s weekly update`}
    >
      {/* Panel head: name + state pill + optional timing chip */}
      <div className="wup-review-panel-head">
        <span className="wup-review-panel-name">{row.full_name}</span>
        {isDraft && (
          <StatePill state="draft" />
        )}
        {row.submitted_at && (
          <TimingChip submittedAt={row.submitted_at} weekStart={weekStart} />
        )}
      </div>

      {/* Summary — static text, §3.2 / §2.4 read-only rendering */}
      <div className="wup-review-panel-section">
        <div className="wup-review-panel-label">This week's summary</div>
        <p className="wup-review-panel-body">
          {row.summary_excerpt
            ? row.summary_excerpt
            : <span style={{ color: 'hsl(240 4% 40%)', fontStyle: 'italic' }}>(no summary)</span>
          }
        </p>
      </div>
    </div>
  )
}

// ── Single roster row (§3.2, C2: interactive for filed/draft, non-interactive for not_started) ──
interface ReviewRowProps {
  row: TeamUpdateRow
  weekStart: string
  isOpen: boolean
  onToggle: () => void
}

function ReviewRow({ row, weekStart, isOpen, onToggle }: ReviewRowProps) {
  const isInteractive = row.state !== 'not_started'

  // C2: filed/draft rows are buttons (implicit role="button", focusable, keyboard-operable).
  // not_started rows are plain <li> items — no cursor, no onClick, no keyboard handler.
  const rowContent = (
    <>
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
    </>
  )

  if (!isInteractive) {
    // C3: plain list item, no interactive affordance (not_started has nothing to open)
    return (
      <li className="wup-review-row wup-review-row-static">
        {rowContent}
      </li>
    )
  }

  // C2: interactive row — use a <button> wrapper so it's focusable and has the right
  // accessible role. aria-expanded signals the open/closed state of the panel below.
  return (
    <li className="wup-review-li">
      <button
        type="button"
        className={`wup-review-row wup-review-row-btn ${isOpen ? 'wup-review-row-open' : ''}`}
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-label={`${row.full_name}${row.role_label ? ` · ${row.role_label}` : ''} — ${row.state === 'filed' ? 'Filed' : 'Draft'}`}
        onClick={onToggle}
      >
        {rowContent}
      </button>
      {/* In-place read-only panel — collapsed when isOpen = false */}
      {isOpen && (
        <ReadOnlyPanel row={row} weekStart={weekStart} />
      )}
    </li>
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
  const [rows, setRows]           = useState<TeamUpdateRow[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')
  // C2: track which person_id has their panel open (single-open)
  const [openPersonId, setOpenPersonId] = useState<string | null>(null)
  // I1: AbortController ref for 3s timeout
  const abortRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track weekOffset (week-count) relative to current week for navigation (§3.5)
  const currentWeekMs  = new Date(currentWeekStart).getTime()
  const selectedWeekMs = new Date(weekStart).getTime()
  const weekOffset     = Math.round((selectedWeekMs - currentWeekMs) / (7 * 24 * 3600 * 1000))
  const atCurrentWeek  = weekOffset >= 0

  const load = useCallback(async () => {
    setLoadState('loading')
    setOpenPersonId(null) // collapse any open panel on reload

    // I1: set a 3s client-side timeout — if the query hasn't resolved by then, show error
    if (abortRef.current) clearTimeout(abortRef.current)
    let timedOut = false
    abortRef.current = setTimeout(() => {
      timedOut = true
      setLoadState('error')
    }, 3000)

    try {
      const result = await listTeamUpdates(weekStart, team)
      // Only apply result if timeout hasn't fired yet
      if (!timedOut) {
        if (abortRef.current) clearTimeout(abortRef.current)
        setRows(result)
        setLoadState('ready')
      }
    } catch {
      if (!timedOut) {
        if (abortRef.current) clearTimeout(abortRef.current)
        setLoadState('error')
      }
    }
  }, [weekStart, team])

  useEffect(() => {
    load()
    return () => {
      // Cleanup timeout on unmount / dep change
      if (abortRef.current) clearTimeout(abortRef.current)
    }
  }, [load])

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

  // C2: toggle handler for row open/close
  const handleRowToggle = useCallback((personId: string) => {
    setOpenPersonId(prev => prev === personId ? null : personId)
  }, [])

  // ── Week pill ────────────────────────────────────────────────────────────────
  const WeekPill = (
    <Pill tone="neutral" className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
      Week of {wib.range}
    </Pill>
  )

  return (
    <section
      aria-label="Team updates"
      className="bg-card border border-border rounded-lg shadow-rest"
      style={{ padding: '16px 20px' }}
    >
      {/* Card head (IA-3: shared <CardHead>) — title + trailing week pill + nav */}
      <CardHead
        className="wup-review-card-head"
        title="Team updates"
        action={(
          <>
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
          </>
        )}
      />

      {/* Loading skeleton */}
      {loadState === 'loading' && <ReviewSkeleton />}

      {/* Error state (AC-046) — IXD-5 shared <ErrorState> */}
      {loadState === 'error' && (
        <ErrorState
          className="wup-review-error"
          message="Couldn't load team updates"
          onRetry={load}
        />
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
            /* Roster (§3.2, AC-040) — C3: <ul> list semantics (design-plan §5.2) */
            <ul
              role="list"
              aria-label="Team roster"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {rows.map(row => (
                <ReviewRow
                  key={row.person_id}
                  row={row}
                  weekStart={weekStart}
                  isOpen={openPersonId === row.person_id}
                  onToggle={() => handleRowToggle(row.person_id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

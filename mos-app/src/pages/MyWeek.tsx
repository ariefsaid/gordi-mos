import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { weekLabel, weekStartISO, weeklyUpdateTiming } from '../lib/week'
import { getMyUpdate } from '../lib/db/weeklyUpdates'
import type { MyUpdate } from '../lib/db/weeklyUpdates.types'

export default function MyWeek() {
  useDocumentTitle('My Week — Gordi MOS')

  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  const now = new Date()
  const wib = weekLabel(now)
  const weekStart = weekStartISO(now, 0)

  const subtitle = `Week of ${wib.range} · ${wib.today} · what needs you, your update, and today on the floor`

  // ── Weekly update strip state (AC-050, AC-051) ──────────────────────────────
  const personId = viewer?.person?.id ?? null
  const [stripLoad, setStripLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [myUpdate, setMyUpdate]   = useState<MyUpdate | null>(null)

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    getMyUpdate(personId, weekStart).then(result => {
      if (!cancelled) {
        setMyUpdate(result)
        setStripLoad('ready')
      }
    }).catch(() => {
      if (!cancelled) setStripLoad('error')
    })
    return () => { cancelled = true }
  }, [personId, weekStart])

  // Derive strip state
  const stripStatus = myUpdate?.update.status ?? null
  const submittedAt = myUpdate?.update.submitted_at ?? null

  return (
    <PageFrame>
        <PageHead title="My Week" subtitle={subtitle} />

        {/* ===== Dominant module: task-table card ===== */}
        <section
          className="bg-card border border-border rounded-md mb-4"
          aria-label="My tasks this week"
        >
          {/* Card head */}
          <div
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border"
            style={{ padding: '16px 20px 14px' }}
          >
            <span className="font-semibold text-foreground whitespace-nowrap" style={{ fontSize: 18, letterSpacing: '-0.01em' }}>
              My tasks
            </span>
            <span className="text-muted-foreground" style={{ fontSize: 13 }}>
              Where you're Responsible or Accountable · off track first
            </span>
            <Link
              to="/tasks"
              className="ml-auto font-semibold text-primary no-underline"
              style={{ fontSize: 13 }}
            >
              All tasks →
            </Link>
          </div>

          {/* Table */}
          <table
            className="w-full border-collapse"
            style={{ tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: '38%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-left text-muted-foreground font-semibold uppercase border-b border-border"
                  style={{ height: 36, padding: '0 20px', fontSize: 11, letterSpacing: '0.06em' }}
                >
                  Task
                </th>
                <th
                  scope="col"
                  className="text-left text-muted-foreground font-semibold uppercase border-b border-border"
                  style={{ height: 36, padding: '0 20px', fontSize: 11, letterSpacing: '0.06em' }}
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="text-left text-muted-foreground font-semibold uppercase border-b border-border"
                  style={{ height: 36, padding: '0 20px', fontSize: 11, letterSpacing: '0.06em' }}
                >
                  Owner
                </th>
                <th
                  scope="col"
                  className="text-right text-muted-foreground font-semibold uppercase border-b border-border"
                  style={{ height: 36, padding: '0 20px', fontSize: 11, letterSpacing: '0.06em' }}
                >
                  Due
                </th>
                <th
                  scope="col"
                  className="text-right text-muted-foreground font-semibold uppercase border-b border-border"
                  style={{ height: 36, padding: '0 20px', fontSize: 11, letterSpacing: '0.06em' }}
                >
                  Activity
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Empty state row — no group headers (FR-014) */}
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-muted-foreground"
                  style={{ height: 46, padding: '0 20px', fontSize: 13 }}
                >
                  No tasks where you're R or A this week — you're clear.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ===== Auxiliary strip 1: weekly update (AC-050, AC-051) ===== */}
        <WeeklyUpdateStrip
          stripLoad={stripLoad}
          stripStatus={stripStatus}
          submittedAt={submittedAt}
          weekStart={weekStart}
          fridayShort={wib.fridayShort}
        />

        {/* ===== Auxiliary strip 2: ops ===== */}
        <section
          className="bg-card border border-border rounded-md flex flex-wrap items-center gap-x-4 gap-y-2 mb-3"
          style={{ minHeight: 60, padding: '12px 20px' }}
          aria-label="Today on the floor"
        >
          {/* Neutral pill */}
          <span
            className="bg-secondary text-muted-foreground rounded-full font-semibold flex-none"
            style={{ height: 24, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
          >
            0 events
          </span>
          <span className="flex-1 min-w-[160px]" style={{ fontSize: 14 }}>
            No ops events logged today.
          </span>
          <Link
            to="/ops"
            className="font-semibold text-primary no-underline flex-none w-full sm:w-auto"
            style={{ fontSize: 13 }}
          >
            Today on Ops →
          </Link>
        </section>

        {/* ===== Role-conditional: manager team module (FR-017, OD-P0-8) ===== */}
        {viewer?.isManager && (
          <>
            <p
              className="text-muted-foreground font-semibold uppercase"
              style={{ fontSize: 11, letterSpacing: '0.06em', margin: '22px 4px 8px' }}
            >
              Your team — Week of {wib.rangeShort}
            </p>
            <div className="bg-card border border-border rounded-md">
              <div
                className="flex items-center text-muted-foreground"
                style={{ height: 46, padding: '0 20px', fontSize: 13 }}
              >
                Nothing from your team yet.
              </div>
            </div>
          </>
        )}
    </PageFrame>
  )
}

// ── Weekly update strip (§6 design-plan, AC-050/051) ────────────────────────
interface WeeklyUpdateStripProps {
  stripLoad: 'loading' | 'ready' | 'error'
  stripStatus: 'draft' | 'submitted' | null
  submittedAt: string | null
  weekStart: string
  fridayShort: string
}

function WeeklyUpdateStrip({
  stripLoad,
  stripStatus,
  submittedAt,
  weekStart,
  fridayShort,
}: WeeklyUpdateStripProps) {
  // Gate: while loading, show muted pill area (no flash, §6 design-plan)
  // On error: fall back to neutral "No update" with link
  const isLoading = stripLoad === 'loading'
  const isError   = stripLoad === 'error'

  // Derive state
  const isSubmitted = !isLoading && !isError && stripStatus === 'submitted'
  const isDraft     = !isLoading && !isError && stripStatus === 'draft'

  // On-time/late signal
  const timing = isSubmitted && submittedAt
    ? weeklyUpdateTiming(submittedAt, weekStart)
    : null
  const onTime = timing === 'on-time'

  // Pill config (§6 design-plan table)
  let pillContent: React.ReactNode
  let pillStyle: React.CSSProperties = {}

  if (isLoading) {
    // Blank pill while loading — no text, just a muted shell (no flash)
    pillStyle = { background: 'hsl(240 4.8% 95.9%)', color: 'transparent' }
    pillContent = '⠀' // zero-width space for height
  } else if (isSubmitted) {
    // success/14% tint + success dot
    pillStyle = { background: 'hsl(142 71% 45% / 0.14)', color: 'hsl(142 64% 30%)' }
    pillContent = (
      <>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(142 71% 45%)', flexShrink: 0 }} />
        Submitted
      </>
    )
  } else if (isDraft) {
    // warning/18% tint + warning dot
    pillStyle = { background: 'hsl(43 96% 56% / 0.18)', color: 'hsl(22 78% 26%)' }
    pillContent = (
      <>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(43 96% 56%)', flexShrink: 0 }} />
        Draft
      </>
    )
  } else {
    // No update (or error — fallback)
    pillStyle = { background: 'hsl(240 4.8% 95.9%)', color: 'hsl(240 4% 40%)' }
    pillContent = 'No update'
  }

  // Body sentence + link (§6 design-plan table)
  let sentence: React.ReactNode
  let linkLabel: string

  if (isSubmitted && timing) {
    // "Submitted on time." or "Submitted late."
    const lateStyle: React.CSSProperties = onTime
      ? { color: 'hsl(142 64% 30%)' }
      : { color: 'hsl(22 78% 26%)' } // warning-foreground for late
    sentence = (
      <>Submitted{' '}
        <span style={lateStyle}>{onTime ? 'on time' : 'late'}</span>.
      </>
    )
    linkLabel = 'View update →'
  } else if (isDraft) {
    sentence = (
      <>Draft — not filed yet.{' '}<span className="text-muted-foreground">Due Fri {fridayShort}</span></>
    )
    linkLabel = 'Continue draft →'
  } else {
    // No update or loading or error
    sentence = (
      <>No weekly update for this week yet.{' '}<span className="text-muted-foreground">Due Fri {fridayShort}</span></>
    )
    linkLabel = 'Write update →'
  }

  return (
    <section
      className="bg-card border border-border rounded-md flex flex-wrap items-center gap-x-4 gap-y-2 mb-3"
      style={{ minHeight: 60, padding: '12px 20px' }}
      aria-label="My weekly update"
    >
      {/* State pill (24px height matching sibling ops strip) */}
      <span
        className="rounded-full font-semibold flex-none"
        style={{
          height: 24, padding: '0 10px', fontSize: 12,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          ...pillStyle,
        }}
      >
        {pillContent}
      </span>

      {/* Body sentence */}
      <span className="flex-1 min-w-[160px]" style={{ fontSize: 14 }}>
        {sentence}
      </span>

      {/* Trailing link (always /updates) */}
      <Link
        to="/updates"
        className="font-semibold text-primary no-underline flex-none w-full sm:w-auto"
        style={{ fontSize: 13 }}
        aria-label={linkLabel.replace(' →', '')}
      >
        {linkLabel}
      </Link>
    </section>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { weekLabel, weekStartISO } from '../lib/week'
import { getMyUpdate, listTeamUpdates } from '../lib/db/weeklyUpdates'
import type { MyUpdate } from '../lib/db/weeklyUpdates.types'
import type { TeamMember } from '../lib/db/weeklyUpdates'
import type { TeamUpdateRow } from '../lib/db/weeklyUpdates.types'
import { getTeamForManager } from '../lib/db/team'
import TimingChip from '../components/weekly/TimingChip'
import { StatePill } from '../components/weekly/WeeklyUpdateReviewPane'
import { getTodayOpsSummary } from '../lib/db/opsLog'
import type { TodayOpsSummary } from '../lib/db/opsLog'

export default function MyWeek() {
  useDocumentTitle('My Week — Gordi MOS')

  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  // Stable "now" snapshot — memoized so useCallback deps don't change on every render
  const now = useMemo(() => new Date(), [])
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

  // ── Ops strip state (AC-080/081/082) ────────────────────────────────────────
  const [opsLoad, setOpsLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [opsSummary, setOpsSummary] = useState<TodayOpsSummary>({ count: 0, needsAttention: false })

  const loadOpsSummary = useCallback(() => {
    let cancelled = false
    getTodayOpsSummary(now).then(summary => {
      if (!cancelled) {
        setOpsSummary(summary)
        setOpsLoad('ready')
      }
    }).catch(() => {
      if (!cancelled) setOpsLoad('error')
    })
    return () => { cancelled = true }
  }, [now])

  useEffect(() => {
    const cancel = loadOpsSummary()
    return cancel
  }, [loadOpsSummary])

  // ── Team module state (FR-017, OD-P0-8 — wired for managers only) ─────────────
  const isManager      = viewer?.isManager ?? false
  const viewerRoleIds  = viewer?.roles?.map((r: { id: string }) => r.id) ?? []

  const [teamLoad,  setTeamLoad]  = useState<'loading' | 'ready' | 'error'>('loading')
  const [teamRows,  setTeamRows]  = useState<TeamUpdateRow[]>([])

  const loadTeam = useCallback(async () => {
    if (!isManager) return
    try {
      const roster: TeamMember[] = viewerRoleIds.length > 0
        ? await getTeamForManager(viewerRoleIds)
        : []
      const rows = await listTeamUpdates(weekStart, roster)
      setTeamRows(rows)
      setTeamLoad('ready')
    } catch {
      setTeamLoad('error')
    }
  // viewerRoleIds is an array — serialize to avoid spurious re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, weekStart, JSON.stringify(viewerRoleIds)])

  useEffect(() => {
    if (!isManager) return
    loadTeam()
  }, [isManager, loadTeam])

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

        {/* ===== Auxiliary strip 2: ops (AC-080/081/082) ===== */}
        <OpsStrip
          opsLoad={opsLoad}
          summary={opsSummary}
          onRetry={loadOpsSummary}
        />

        {/* ===== Role-conditional: manager team module (FR-017, OD-P0-8) ===== */}
        {isManager && (
          <>
            <p
              className="text-muted-foreground font-semibold uppercase"
              style={{ fontSize: 11, letterSpacing: '0.06em', margin: '22px 4px 8px' }}
            >
              Your team — Week of {wib.rangeShort}
            </p>
            <TeamModule
              loadState={teamLoad}
              rows={teamRows}
              onRetry={loadTeam}
            />
          </>
        )}
    </PageFrame>
  )
}

// ── Ops strip (AC-080/081/082, FR-060/061/062) ───────────────────────────────
// Mirrors WeeklyUpdateStrip: card strip, own load-state machine, degrades independently.
// Amber when any non-archived needs_attention entry exists today (D-E, org-readable set).
interface OpsStripProps {
  opsLoad: 'loading' | 'ready' | 'error'
  summary: TodayOpsSummary
  onRetry: () => void
}

function OpsStrip({ opsLoad, summary, onRetry }: OpsStripProps) {
  const isLoading = opsLoad === 'loading'
  const isError   = opsLoad === 'error'
  const isAmber   = !isLoading && !isError && summary.needsAttention
  const { count } = summary

  // Pill (§6 design-plan table)
  let pillContent: React.ReactNode
  let pillStyle: React.CSSProperties = {}
  if (isLoading) {
    pillStyle = { background: 'hsl(var(--secondary))', color: 'transparent' }
    pillContent = '⠀' // zero-width space for height
  } else if (isAmber) {
    // amber: --ops-attn-strip-bg (warning/18%) + --ops-attn-strip-text (warning-foreground)
    pillStyle = { background: 'hsl(var(--warning) / 0.18)', color: 'hsl(var(--warning-foreground))' }
    pillContent = (
      <>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(var(--warning))', flexShrink: 0 }} />
        {count} today
      </>
    )
  } else {
    pillStyle = { background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }
    pillContent = `${count} today`
  }

  // Sentence + link
  let sentence: React.ReactNode
  let linkLabel: string
  if (isError) {
    sentence = (
      <>
        <span>Couldn&apos;t load today&apos;s ops.</span>
        {' '}
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-primary"
          style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Retry
        </button>
      </>
    )
    linkLabel = 'Open the Daily Log →'
  } else if (isAmber) {
    sentence = (
      <>
        {count} log entr{count === 1 ? 'y' : 'ies'} today · something needs attention.
      </>
    )
    linkLabel = 'See what needs attention →'
  } else if (count > 0) {
    sentence = (
      <>
        {count} log entr{count === 1 ? 'y' : 'ies'} on the floor today.
      </>
    )
    linkLabel = 'Open the Daily Log →'
  } else {
    sentence = <>No log entries on the floor today.</>
    linkLabel = 'Open the Daily Log →'
  }

  return (
    <section
      className="bg-card border border-border rounded-md flex flex-wrap items-center gap-x-4 gap-y-2 mb-3"
      style={{ minHeight: 60, padding: '12px 20px' }}
      aria-label="Today on the Daily Log"
    >
      {/* Count pill (24px height matching weekly-update strip) */}
      <span
        className="rounded-full font-semibold flex-none"
        data-ops-attn={isAmber ? 'true' : undefined}
        style={{
          height: 24, padding: '0 10px', fontSize: 12,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          ...pillStyle,
        }}
        aria-hidden={isLoading ? 'true' : undefined}
      >
        {pillContent}
      </span>

      {/* Body sentence */}
      <span className="flex-1 min-w-[160px]" style={{ fontSize: 14 }}>
        {sentence}
      </span>

      {/* Trailing link (always /ops) */}
      <Link
        to="/ops"
        className="font-semibold text-primary no-underline flex-none w-full sm:w-auto"
        style={{ fontSize: 13 }}
        aria-label={linkLabel.replace(' →', '')}
      >
        {linkLabel}
      </Link>
    </section>
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

  // Pill config (§6 design-plan table)
  let pillContent: React.ReactNode
  let pillStyle: React.CSSProperties = {}

  if (isLoading) {
    // Blank pill while loading — no text, just a muted shell (no flash)
    pillStyle = { background: 'hsl(var(--secondary))', color: 'transparent' }
    pillContent = '⠀' // zero-width space for height
  } else if (isSubmitted) {
    // success/14% tint + success dot
    pillStyle = { background: 'hsl(var(--success) / 0.14)', color: 'hsl(var(--status-won-text))' }
    pillContent = (
      <>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(var(--success))', flexShrink: 0 }} />
        Submitted
      </>
    )
  } else if (isDraft) {
    // warning/18% tint + warning dot
    pillStyle = { background: 'hsl(var(--warning) / 0.18)', color: 'hsl(var(--warning-foreground))' }
    pillContent = (
      <>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(var(--warning))', flexShrink: 0 }} />
        Draft
      </>
    )
  } else {
    // No update (or error — fallback)
    pillStyle = { background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }
    pillContent = 'No update'
  }

  // Body sentence + link (§6 design-plan table)
  let sentence: React.ReactNode
  let linkLabel: string

  if (isSubmitted && submittedAt) {
    // "Submitted " + TimingChip + "." — the period must sit flush after the chip with NO gap.
    // Fix M1: wrap only "Submitted" + TimingChip in the inline-flex (gap applies between them),
    // then append "." as a plain text node sibling OUTSIDE the gapped flex container.
    sentence = (
      <>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Submitted
          <TimingChip submittedAt={submittedAt} weekStart={weekStart} />
        </span>
        <span>.</span>
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

// ── Team module (My Week manager card, FR-017, OD-P0-8) ─────────────────────
// Shows each direct report's weekly-update status for the current week,
// sourced from the same listTeamUpdates call the review pane uses (RI-CROSS).
interface TeamModuleProps {
  loadState: 'loading' | 'ready' | 'error'
  rows: TeamUpdateRow[]
  onRetry: () => void
}

function TeamModule({ loadState, rows, onRetry }: TeamModuleProps) {
  if (loadState === 'loading') {
    return (
      <div
        className="bg-card border border-border rounded-md"
        aria-label="Team weekly updates"
        aria-busy="true"
      >
        <div
          className="flex items-center text-muted-foreground"
          style={{ height: 46, padding: '0 20px', fontSize: 13 }}
        >
          Loading…
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div
        className="bg-card border border-border rounded-md"
        aria-label="Team weekly updates"
      >
        <div
          className="flex items-center gap-3 text-muted-foreground"
          style={{ minHeight: 46, padding: '12px 20px', fontSize: 13 }}
        >
          <span>Couldn't load team updates.</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold text-primary"
            style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Ready state
  if (rows.length === 0) {
    return (
      <div
        className="bg-card border border-border rounded-md"
        aria-label="Team weekly updates"
      >
        <div
          className="flex items-center text-muted-foreground"
          style={{ height: 46, padding: '0 20px', fontSize: 13 }}
        >
          No direct reports found.
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-card border border-border rounded-md"
      aria-label="Team weekly updates"
    >
      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row, i) => (
          <li
            key={row.person_id}
            className="flex items-center gap-3"
            style={{
              padding: '10px 20px',
              borderBottom: i < rows.length - 1 ? '1px solid hsl(var(--border))' : undefined,
              fontSize: 14,
            }}
          >
            {/* Name + role */}
            <span className="flex-1 min-w-0">
              <span className="font-medium text-foreground">{row.full_name}</span>
              {row.role_label && (
                <span className="text-muted-foreground" style={{ fontSize: 12, marginLeft: 6 }}>
                  {row.role_label}
                </span>
              )}
            </span>
            {/* Weekly update status pill — same StatePill as review pane (RI-CROSS) */}
            <StatePill state={row.state} />
          </li>
        ))}
      </ul>
    </div>
  )
}

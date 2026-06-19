// UpdatesPage — /updates route.
// Hosts the write pane (PR-b) and the manager review pane (PR-c).
// Design authority: docs/plans/2026-06-12-weekly-updates-design.md §1, §2, §3.
// AC-031..038 owned by WeeklyUpdateWritePane. Review pane AC-040..046 here + WeeklyUpdateReviewPane.
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/auth/useAuth'
import PageFrame from '@/shell/PageFrame'
import PageHead from '@/shell/PageHead'
import { useDocumentTitle } from '@/shell/useDocumentTitle'
import { weekLabel, weekStartISO } from '@/lib/week'
import WeeklyUpdateWritePane from '@/components/weekly/WeeklyUpdateWritePane'
import WeeklyUpdateReviewPane from '@/components/weekly/WeeklyUpdateReviewPane'
import { getTeamForManager } from '@/lib/db/team'
import type { TeamMember } from '@/lib/db/weeklyUpdates'

export default function UpdatesPage() {
  useDocumentTitle('Weekly Updates — Gordi MOS')

  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const isManager = viewer?.isManager ?? false

  const now = new Date()
  const currentWeekStart = weekStartISO(now, 0)

  // C1 fix (design-review): write pane = ALWAYS current week (never moves with review nav).
  // Review pane has its own independent week navigation (§3.5, "latter" model).
  // The write pane always loads/shows the author's OWN update for THIS week — even when
  // a manager is reviewing a prior week for their team. Both are useful at once.
  const [reviewWeekStart, setReviewWeekStart] = useState(currentWeekStart)

  // Team roster for the review pane (lazy-loaded for managers only)
  const [team, setTeam] = useState<TeamMember[]>([])

  const viewerRoleIds = viewer?.roles.map(r => r.id) ?? []

  const loadTeam = useCallback(async () => {
    if (!isManager || viewerRoleIds.length === 0) return
    try {
      const result = await getTeamForManager(viewerRoleIds)
      setTeam(result)
    } catch {
      // Non-fatal: review pane will show empty team. listTeamUpdates is the authoritative load.
      setTeam([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, JSON.stringify(viewerRoleIds)])

  useEffect(() => { loadTeam() }, [loadTeam])

  // Page subtitle uses currentWeekStart (the write pane's week) per §1.1 design-plan
  const wib = weekLabel(new Date(currentWeekStart + 'T00:00:00+07:00'))

  // Page subtitle (§1.1 design-plan): full for managers, short for non-managers
  const subtitle = isManager
    ? `Week of ${wib.range} · due Fri ${wib.fridayShort} · write yours, then review your team's`
    : `Week of ${wib.range} · due Fri ${wib.fridayShort}`

  const personId  = viewer?.person?.id ?? ''
  const createdBy = viewer?.person?.id ?? ''

  return (
    <PageFrame>
      {/* Page head (§1.1) — h1 "Weekly Updates" */}
      <PageHead title="Weekly Updates" subtitle={subtitle} />

      {/* Write pane caption (§1.2, overline style) */}
      <p
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--muted-foreground)', /* muted-foreground */
          margin: '0 4px 8px',
        }}
        aria-hidden="true"
      >
        Write — my weekly update
      </p>

      {/* Write pane (PR-b) — always loads current week (C1 fix: not review weekStart) */}
      {personId ? (
        <WeeklyUpdateWritePane
          personId={personId}
          createdBy={createdBy}
          weekStart={currentWeekStart}
        />
      ) : (
        // Not yet authenticated — render an accessible waiting card
        <section
          aria-label="My weekly update"
          className="bg-card border border-border rounded-lg shadow-rest"
          style={{ padding: '16px 20px' }}
        >
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Loading…</p>
        </section>
      )}

      {/* Review pane (PR-c) — manager conditional (§3, FR-030) */}
      {isManager && (
        <>
          <p
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)', /* muted-foreground */
              margin: '28px 4px 8px', /* 28px air between panes (§1.2) */
            }}
            aria-hidden="true"
          >
            Review — my team&rsquo;s updates
          </p>
          <WeeklyUpdateReviewPane
            team={team}
            weekStart={reviewWeekStart}
            onWeekChange={setReviewWeekStart}
            currentWeekStart={currentWeekStart}
          />
        </>
      )}
    </PageFrame>
  )
}

// UpdatesPage — /updates route.
// Hosts the write pane (PR-b) and a placeholder seam for the review pane (PR-c).
// Design authority: docs/plans/2026-06-12-weekly-updates-design.md §1, §2.
// AC-031..038 owned by WeeklyUpdateWritePane. Review pane (AC-040..046) in PR-c.
import { useAuth } from '../auth/useAuth'
import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { weekLabel, weekStartISO } from '../lib/week'
import WeeklyUpdateWritePane from '../components/weekly/WeeklyUpdateWritePane'

export default function UpdatesPage() {
  useDocumentTitle('Weekly update — Gordi MOS')

  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const isManager = viewer?.isManager ?? false

  const now = new Date()
  const wib = weekLabel(now)
  const weekStart = weekStartISO(now, 0)

  // Page subtitle (§1.1 design-plan): full for managers, short for non-managers
  const subtitle = isManager
    ? `Week of ${wib.range} · due Fri ${wib.fridayShort} · write yours, then review your team's`
    : `Week of ${wib.range} · due Fri ${wib.fridayShort}`

  const personId  = viewer?.person?.id ?? ''
  const createdBy = viewer?.person?.id ?? ''

  return (
    <PageFrame>
      {/* Page head (§1.1) — h1 "Weekly update" */}
      <PageHead title="Weekly update" subtitle={subtitle} />

      {/* Write pane caption (§1.2, overline style) */}
      <p
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'hsl(240 4% 40%)', /* muted-foreground */
          margin: '0 4px 8px',
        }}
        aria-hidden="true"
      >
        Write — my weekly update
      </p>

      {/* Write pane (PR-b) */}
      {personId ? (
        <WeeklyUpdateWritePane
          personId={personId}
          createdBy={createdBy}
          weekStart={weekStart}
        />
      ) : (
        // Not yet authenticated — render an accessible waiting card
        <section
          aria-label="My weekly update"
          className="bg-card border border-border rounded-md"
          style={{ padding: '16px 20px' }}
        >
          <p style={{ fontSize: 14, color: 'hsl(240 4% 40%)' }}>Loading…</p>
        </section>
      )}

      {/* Review pane (PR-c seam — manager only) */}
      {isManager && (
        <>
          <p
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'hsl(240 4% 40%)', /* muted-foreground */
              margin: '28px 4px 8px', /* 28px air between panes (§1.2) */
            }}
            aria-hidden="true"
          >
            Review — my team&rsquo;s updates
          </p>
          {/* PR-c placeholder — will be replaced by WeeklyUpdateReviewPane */}
          <section
            aria-label="Team updates"
            data-testid="review-pane-placeholder"
            className="bg-card border border-border rounded-md"
            style={{ padding: '16px 20px', minHeight: 80 }}
          >
            <div style={{ fontSize: 14, color: 'hsl(240 4% 40%)' }}>
              Team updates — review pane loads in PR-c.
            </div>
          </section>
        </>
      )}
    </PageFrame>
  )
}

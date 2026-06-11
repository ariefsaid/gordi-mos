import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { weekLabel } from '../lib/week'

export default function MyWeek() {
  useDocumentTitle('My Week — Gordi MOS')

  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  const now = new Date()
  const wib = weekLabel(now)

  const subtitle = `Week of ${wib.range} · ${wib.today} · what needs you, your update, and today on the floor`

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
            className="flex items-baseline gap-3 border-b border-border"
            style={{ padding: '16px 20px 14px' }}
          >
            <span className="font-semibold text-foreground" style={{ fontSize: 18, letterSpacing: '-0.01em' }}>
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

        {/* ===== Auxiliary strip 1: weekly update ===== */}
        <section
          className="bg-card border border-border rounded-md flex items-center gap-4 mb-3"
          style={{ minHeight: 60, padding: '0 20px' }}
          aria-label="My weekly update"
        >
          {/* Neutral pill */}
          <span
            className="bg-secondary text-muted-foreground rounded-full font-semibold flex-none"
            style={{ height: 24, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
          >
            No update
          </span>
          <span className="flex-1 min-w-0" style={{ fontSize: 14 }}>
            No weekly update for this week yet.{' '}
            <span className="text-muted-foreground">Due Fri {wib.fridayShort}</span>
          </span>
          <Link
            to="/updates"
            className="font-semibold text-primary no-underline flex-none"
            style={{ fontSize: 13 }}
          >
            Open Updates →
          </Link>
        </section>

        {/* ===== Auxiliary strip 2: ops ===== */}
        <section
          className="bg-card border border-border rounded-md flex items-center gap-4 mb-3"
          style={{ minHeight: 60, padding: '0 20px' }}
          aria-label="Today on the floor"
        >
          {/* Neutral pill */}
          <span
            className="bg-secondary text-muted-foreground rounded-full font-semibold flex-none"
            style={{ height: 24, padding: '0 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
          >
            0 events
          </span>
          <span className="flex-1 min-w-0" style={{ fontSize: 14 }}>
            No ops events logged today.
          </span>
          <Link
            to="/ops"
            className="font-semibold text-primary no-underline flex-none"
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

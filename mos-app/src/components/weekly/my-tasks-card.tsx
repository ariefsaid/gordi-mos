// MyTasksCard — My Week dominant module (PR-4, AC-W01..W06).
// Fetches tasks where the viewer is R or A, sorts off-track-first, and renders
// a mini-table with the shared overline header treatment (OD-P4-10, AC-W02).
// Loading: skeleton rows; Error: scoped inline Retry (rest of My Week unaffected).
// Empty: "you're clear" copy (AC-W03). Name chip-link to /tasks/:id (AC-W01/W06).
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listTasks } from '@/lib/db/tasks'
import { getPeople } from '@/lib/db/directory'
import type { PersonOption } from '@/lib/db/directory'
import { raciOwner } from '@/lib/raci-member'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { StatusPill } from '@/components/tasks/status-pill'
import { OwnerCell } from '@/components/tasks/owner-cell'
import { formatDate, formatAge, otherRaciCount } from '@/components/tasks/task-formatters'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { CardHead } from '@/components/ui/card-head'
import './my-tasks-card.css'

type LoadState = 'loading' | 'ready' | 'error'

type MyTasksCardProps = {
  viewerId: string
  now: Date
}

type FetchedData = {
  tasks: TaskListRow[]
  personMap: Map<string, string>
}

export function MyTasksCard({ viewerId, now }: MyTasksCardProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [data, setData] = useState<FetchedData | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoadState('loading')
    Promise.all([listTasks({}), getPeople()])
      .then(([tasks, people]) => {
        if (cancelled) return
        const personMap = new Map<string, string>(
          (people as PersonOption[]).map(p => [p.id, p.full_name]),
        )
        setData({ tasks, personMap })
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => { cancelled = true }
  }, []) // no deps — viewerId & now are stable between loads; BDD: refetch clears prior state

  useEffect(() => {
    return load()
  }, [load])

  // ── Filter + sort (client-side, org-readable set, Gordi scale is trivial) ──
  const myTasks: TaskListRow[] = data
    ? data.tasks
      .filter(t => raciOwner(t, viewerId))
      .sort((a, b) => compareOffTrackFirst(a, b, now))
    : []

  return (
    <section
      className="bg-card border border-border rounded-lg shadow-rest mb-4"
      aria-label="My tasks this week"
      aria-busy={loadState === 'loading' ? 'true' : undefined}
    >
      <CardHead
        title="My tasks"
        meta="Where you're Responsible or Accountable · off track first"
        action={
          <Link
            to="/tasks"
            className="font-semibold text-primary no-underline"
            style={{ fontSize: 15 }}
          >
            All tasks →
          </Link>
        }
      />

      {/* ── Loading: skeleton rows, chrome stays visible (AC-W04) ────────── */}
      {loadState === 'loading' && (
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '40%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <SkeletonBody rows={3} />
        </table>
      )}

      {/* ── Error: scoped inline block + Retry (rest of My Week unaffected) ─ */}
      {loadState === 'error' && (
        <div className="mini-error-block" role="status">
          <span>Couldn&apos;t load your tasks.</span>
          <button
            type="button"
            className="font-semibold text-primary"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15 }}
            onClick={load}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Ready state ───────────────────────────────────────────────────── */}
      {loadState === 'ready' && (
        <table
          className="w-full border-collapse"
          style={{ tableLayout: 'fixed', fontSize: 15 }}
        >
          <colgroup>
            <col style={{ width: '40%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="th-overline">Task</th>
              <th scope="col" className="th-overline">Status</th>
              <th scope="col" className="th-overline">Owner (R)</th>
              <th scope="col" className="th-overline">Due</th>
              <th scope="col" className="th-overline">Activity</th>
            </tr>
          </thead>
          <tbody className="mini-tbody">
            {myTasks.length === 0 ? (
              // AC-W03: empty state — preserve existing "you're clear" copy
              <tr>
                <td
                  colSpan={5}
                  className="mini-td text-center text-muted-foreground"
                >
                  No tasks where you&apos;re R or A this week — you&apos;re clear.
                </td>
              </tr>
            ) : (
              myTasks.map(task => (
                <MiniTaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  personMap={data!.personMap}
                />
              ))
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ── MiniTaskRow — one row of the mini-table ──────────────────────────────────
type MiniTaskRowProps = {
  task: TaskListRow
  now: Date
  personMap: Map<string, string>
}

function MiniTaskRow({ task, now, personMap }: MiniTaskRowProps) {
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const dueClass = taskOverdue ? 'mini-due-overdue' : ds === 'soon' ? 'mini-due-soon' : ds === 'calm' ? 'mini-due-calm' : 'mini-due-none'
  const dueText = task.due_date
    ? (taskOverdue
      ? `Overdue · ${formatDate(task.due_date)}`
      : formatDate(task.due_date))
    : '—'

  const ownerName = personMap.get(task.responsible_person_id) ?? task.responsible_person_id
  const others = buildOthers(task, task.responsible_person_id, personMap)
  const otherN = otherRaciCount(task)

  return (
    <tr>
      <td className="mini-td">
        {/* AC-W01/W06: Chip-link, truncate + title (no-bleed) */}
        <Link
          to={`/tasks/${task.id}`}
          className="mini-name-chip truncate"
          title={task.title}
        >
          {task.title}
        </Link>
      </td>
      <td className="mini-td mini-td-nowrap">
        {/* AC-W01: StatusPill (dot + text, AC-W06: never wraps) */}
        <StatusPill status={task.status} />
      </td>
      <td className="mini-td">
        {/* AC-W01: R-avatar + name + "+N" others */}
        <OwnerCell
          fullName={ownerName}
          otherCount={otherN}
          others={others}
        />
      </td>
      <td className={`mini-td mini-td-nowrap tabular-nums ${dueClass}`}>
        {dueText}
      </td>
      <td className="mini-td mini-meta">
        {formatAge(task.last_activity_at, now)}
      </td>
    </tr>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Off-track-first comparator for the "My tasks" card (OD-P0-8, AC-W01).
 *
 * Regression-invariant: an OVERDUE task outranks any NON-OVERDUE task regardless of
 * status — so the card's "off track first" subtitle is honoured. We do NOT key on the
 * workspace STATUS_ORDER here (that constant status-GROUPS the full table — a different
 * purpose); using it as the primary key sank overdue-Blocked rows below calm In-Progress
 * rows.
 *
 * Order, in precedence:
 *   1. Done always last (never off-track — isOverdue() already excludes Done).
 *   2. Off-track (overdue OR Blocked) before on-track.
 *   3. Due date ascending (nulls last).
 */
function compareOffTrackFirst(a: TaskListRow, b: TaskListRow, now: Date): number {
  const aDone = a.status === 'Done'
  const bDone = b.status === 'Done'
  if (aDone !== bDone) return aDone ? 1 : -1

  const aOff = isOverdue(a, now) || a.status === 'Blocked'
  const bOff = isOverdue(b, now) || b.status === 'Blocked'
  if (aOff !== bOff) return aOff ? -1 : 1

  // Due date ascending, nulls last.
  if (!a.due_date && !b.due_date) return 0
  if (!a.due_date) return 1
  if (!b.due_date) return -1
  return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
}

/** Build the "others" list for OwnerCell (A + C + I persons who are NOT the R). */
function buildOthers(
  task: TaskListRow,
  rId: string,
  personMap: Map<string, string>,
) {
  const seen = new Set<string>()
  const result: { role: 'A' | 'C' | 'I'; name: string }[] = []

  function add(id: string, role: 'A' | 'C' | 'I') {
    if (id !== rId && !seen.has(id)) {
      seen.add(id)
      result.push({ role, name: personMap.get(id) ?? id })
    }
  }

  add(task.accountable_person_id, 'A')
  for (const id of task.consulted_person_ids) add(id, 'C')
  for (const id of task.informed_person_ids) add(id, 'I')
  return result
}

/** Skeleton body rows while loading (AC-W04). */
function SkeletonBody({ rows }: { rows: number }) {
  return (
    <>
      <thead>
        <tr>
          {[40, 16, 20, 14, 10].map((w, i) => (
            <th
              key={i}
              scope="col"
              className="th-overline"
              style={{ width: `${w}%` }}
            >
              {/* empty — overline chrome visible */}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            <td className="mini-td">
              <span className="mini-skeleton-bar" style={{ width: `${130 + i * 30}px` }} />
            </td>
            <td className="mini-td">
              <span className="mini-skeleton-bar" style={{ width: 60 }} />
            </td>
            <td className="mini-td">
              <span className="mini-skeleton-bar" style={{ width: 80 }} />
            </td>
            <td className="mini-td">
              <span className="mini-skeleton-bar" style={{ width: 50 }} />
            </td>
            <td className="mini-td">
              <span className="mini-skeleton-bar" style={{ width: 28 }} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  )
}

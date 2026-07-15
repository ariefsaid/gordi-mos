// MyTasksCard — My Week dominant module (PR-4, AC-W01..W06).
// Fetches tasks where the viewer is PIC or Supervisor, sorts off-track-first, and
// renders the typed Team/PIC/Supervisor grammar (OD-62, AC-W02).
// Loading: skeleton rows; Error: scoped inline Retry (rest of My Week unaffected).
// Empty: "you're clear" copy (AC-W03). Name chip-link to /tasks/:id (AC-W01/W06).
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { listTasks } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { StatusPill } from '@/components/tasks/status-pill'
import { formatDate, formatAge } from '@/components/tasks/task-formatters'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { CardHead } from '@/components/ui/card-head'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import './my-tasks-card.css'

type LoadState = 'loading' | 'ready' | 'error'

type MyTasksCardProps = {
  viewerId: string
  now: Date
}

type FetchedData = {
  tasks: TaskListRow[]
  personMap: Map<string, string>
  teamMap: Map<string, string>
}

const desktopMiniColWidths = ['auto', '120px', '160px', '180px', '180px', '144px', '88px'] as const

export function MyTasksCard({ viewerId, now }: MyTasksCardProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [data, setData] = useState<FetchedData | null>(null)
  const isDesktop = useIsDesktop()
  const t = useT()

  const load = useCallback(() => {
    let cancelled = false
    setLoadState('loading')
    Promise.all([listTasks({}), getBusinessUnits(), getPeople()])
      .then(([tasks, teams, people]) => {
        if (cancelled) return
        const personMap = new Map<string, string>(
          (people as PersonOption[]).map(p => [p.id, p.full_name]),
        )
        const teamMap = new Map<string, string>(
          (teams as BusinessUnitOption[]).map(team => [team.id, team.name]),
        )
        setData({ tasks, personMap, teamMap })
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
      .filter(t => t.responsible_person_id === viewerId || t.accountable_person_id === viewerId)
      .sort((a, b) => compareOffTrackFirst(a, b, now))
    : []

  return (
    <section
      className="bg-card border border-border rounded-lg shadow-rest mb-4"
      aria-label={t('tasks.myTitle')}
      aria-busy={loadState === 'loading' ? 'true' : undefined}
    >
      <CardHead
        title={t('tasks.myTitle')}
        meta={t('tasks.myMeta')}
        action={
          <Link
            to="/tasks"
            className="font-semibold text-primary no-underline"
            style={{ fontSize: 15 }}
          >
            {t('tasks.all')}
          </Link>
        }
      />

      {/* ── Loading: skeleton rows, chrome stays visible (AC-W04) ────────── */}
      {loadState === 'loading' && (isDesktop ? (
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {desktopMiniColWidths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <SkeletonBody rows={3} />
        </table>
      ) : <MobileSkeleton />)}

      {/* ── Error: scoped inline block + Retry (rest of My Week unaffected) ─ */}
      {loadState === 'error' && (
        <div className="mini-error-block" role="status">
          <span>{t('tasks.error.load')}</span>
          <button
            type="button"
            className="font-semibold text-primary"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15 }}
            onClick={load}
          >
            {t('tasks.retry')}
          </button>
        </div>
      )}

      {/* ── Ready state ───────────────────────────────────────────────────── */}
      {loadState === 'ready' && (isDesktop ? (
        <table
          className="w-full border-collapse"
          style={{ tableLayout: 'fixed', fontSize: 15 }}
        >
          <colgroup>
            {desktopMiniColWidths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="th-overline">{t('tasks.label.task')}</th>
              <th scope="col" className="th-overline">{t('tasks.filter.status')}</th>
              <th scope="col" className="th-overline">{t('tasks.team')}</th>
              <th scope="col" className="th-overline">{t('tasks.pic')}</th>
              <th scope="col" className="th-overline">{t('tasks.supervisor')}</th>
              <th scope="col" className="th-overline">{t('tasks.dueLabel')}</th>
              <th scope="col" className="th-overline">{t('tasks.activityLabel')}</th>
            </tr>
          </thead>
          <tbody className="mini-tbody">
            {myTasks.length === 0 ? (
              // AC-W03: empty state — preserve existing "you're clear" copy
              <tr>
                <td
                  colSpan={7}
                  className="mini-td text-center text-muted-foreground"
                >
                  {t('tasks.myEmpty')}
                </td>
              </tr>
            ) : (
              myTasks.map(task => (
                <MiniTaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  personMap={data!.personMap}
                  teamMap={data!.teamMap}
                />
              ))
            )}
          </tbody>
        </table>
      ) : (
        <MobileTaskList tasks={myTasks} now={now} personMap={data!.personMap} teamMap={data!.teamMap} />
      ))}
    </section>
  )
}

// ── MiniTaskRow — one row of the mini-table ──────────────────────────────────
type MiniTaskRowProps = {
  task: TaskListRow
  now: Date
  personMap: Map<string, string>
  teamMap: Map<string, string>
}

function MiniTaskRow({ task, now, personMap, teamMap }: MiniTaskRowProps) {
  const t = useT()
  const { locale } = useI18n()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const dueClass = taskOverdue ? 'mini-due-overdue' : ds === 'soon' ? 'mini-due-soon' : ds === 'calm' ? 'mini-due-calm' : 'mini-due-none'
  const dueText = task.due_date
    ? (taskOverdue
      ? t('tasks.overdueDate', { date: formatDate(task.due_date, locale) })
      : formatDate(task.due_date, locale))
    : '—'
  const teamName = teamMap.get(task.business_unit_id) ?? task.business_unit_id
  const picName = personMap.get(task.responsible_person_id) ?? task.responsible_person_id
  const supervisorName = personMap.get(task.accountable_person_id) ?? task.accountable_person_id

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
      <td className="mini-td">{teamName}</td>
      <td className="mini-td">{picName}</td>
      <td className="mini-td">{supervisorName}</td>
      <td className={`mini-td mini-td-nowrap mini-due-cell tabular-nums ${dueClass}`}>
        {dueText}
      </td>
      <td className="mini-td mini-meta">
        {formatAge(task.last_activity_at, now)}
      </td>
    </tr>
  )
}

function MobileTaskList({ tasks, now, personMap, teamMap }: { tasks: TaskListRow[]; now: Date; personMap: Map<string, string>; teamMap: Map<string, string> }) {
  const t = useT()
  if (tasks.length === 0) {
    return (
      <div className="mini-mobile-empty text-muted-foreground">
        {t('tasks.myEmpty')}
      </div>
    )
  }

  return (
    <div className="mini-mobile-list">
      {tasks.map(task => (
        <MobileTaskCard key={task.id} task={task} now={now} personMap={personMap} teamMap={teamMap} />
      ))}
    </div>
  )
}

function MobileTaskCard({ task, now, personMap, teamMap }: MiniTaskRowProps) {
  const t = useT()
  const { locale } = useI18n()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const dueClass = taskOverdue ? 'mini-due-overdue' : ds === 'soon' ? 'mini-due-soon' : ds === 'calm' ? 'mini-due-calm' : 'mini-due-none'
  const dueText = task.due_date
    ? (taskOverdue ? t('tasks.overdueDate', { date: formatDate(task.due_date, locale) }) : formatDate(task.due_date, locale))
    : '—'
  const teamName = teamMap.get(task.business_unit_id) ?? task.business_unit_id
  const picName = personMap.get(task.responsible_person_id) ?? task.responsible_person_id
  const supervisorName = personMap.get(task.accountable_person_id) ?? task.accountable_person_id

  return (
    <article className="mini-mobile-card">
      <Link to={`/tasks/${task.id}`} className="mini-name-chip" title={task.title}>
        {task.title}
      </Link>
      <div className="mini-mobile-grid">
        <div className="mini-mobile-field">
          <span className="mini-mobile-label">{t('tasks.filter.status')}</span>
          <StatusPill status={task.status} />
        </div>
        <div className="mini-mobile-field">
          <span className="mini-mobile-label">{t('tasks.team')}</span>
          <span className="mini-mobile-value">{teamName}</span>
        </div>
        <div className="mini-mobile-field">
          <span className="mini-mobile-label">{t('tasks.pic')}</span>
          <span className="mini-mobile-value">{picName}</span>
        </div>
        <div className="mini-mobile-field">
          <span className="mini-mobile-label">{t('tasks.supervisor')}</span>
          <span className="mini-mobile-value">{supervisorName}</span>
        </div>
        <div className="mini-mobile-field">
          <span className="mini-mobile-label">{t('tasks.dueLabel')}</span>
          <span className={`mini-mobile-value tabular-nums ${dueClass}`}>{dueText}</span>
        </div>
        <div className="mini-mobile-field">
          <span className="mini-mobile-label">{t('tasks.activityLabel')}</span>
          <span className="mini-mobile-value mini-meta">{formatAge(task.last_activity_at, now)}</span>
        </div>
      </div>
    </article>
  )
}

function MobileSkeleton() {
  return (
    <div className="mini-mobile-list" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="mini-mobile-card">
          <span className="mini-skeleton-bar" style={{ width: '72%' }} />
          <div className="mini-mobile-grid">
            <span className="mini-skeleton-bar" style={{ width: 72 }} />
            <span className="mini-skeleton-bar" style={{ width: 96 }} />
            <span className="mini-skeleton-bar" style={{ width: 88 }} />
            <span className="mini-skeleton-bar" style={{ width: 56 }} />
          </div>
        </div>
      ))}
    </div>
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

/** Skeleton body rows while loading (AC-W04). */
function SkeletonBody({ rows }: { rows: number }) {
  return (
    <>
      <thead>
        <tr>
          {desktopMiniColWidths.map((width, i) => (
            <th
              key={i}
              scope="col"
              className="th-overline"
              style={{ width }}
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

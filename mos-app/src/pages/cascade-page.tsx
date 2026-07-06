import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { listTasks } from '@/lib/db/tasks'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import { useCascadeCatalogs } from '@/components/tasks/use-cascade-catalogs'
import { GroupHeaderRow } from '@/components/tasks/group-header-row'
import { WorkloadCaption, type WorkloadSummary } from '@/components/tasks/workload-caption'
import { can } from '@/lib/capabilities'
import { buildLadder, type Ladder } from '@/lib/cascade/build-ladder'
import { formatDate, firstName } from '@/components/tasks/task-formatters'
import { dueStatus } from '@/lib/due-status'
import { StatusPill } from '@/components/tasks/status-pill'
import type { TaskListRow } from '@/lib/db/tasks.types'

function CascadeTaskLeaf({ task, personMap, overdueLabel }: { task: TaskListRow; personMap: Map<string, string>; overdueLabel: string }) {
  const dueLabel = task.due_date ? formatDate(task.due_date) : '—'
  const ownerName = personMap.get(task.responsible_person_id) ?? '—'
  const dueTone = task.due_date ? dueStatus(task.due_date, new Date()) : 'none'

  return (
    <div style={{ paddingLeft: 48, paddingTop: 8, paddingBottom: 8 }}>
      <div>{task.title}</div>
      <div className="text-muted-foreground" style={{ fontSize: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>{ownerName}</span>
        <span>{dueTone === 'overdue' ? `${overdueLabel} · ${dueLabel}` : dueLabel}</span>
        <StatusPill status={task.status} />
      </div>
    </div>
  )
}

// ── Phone card (NFR-300 phone-first) ──────────────────────────────────────────
// Matches the shipped Tasks DB-view card grammar (.task-card / .task-card-link /
// .task-card-head / .task-card-meta, defined in TasksWorkspace.css) so the cascade phone surface
// shares the same card visual as the Tasks workspace. Read-only (no +Add/overdue workspace
// controls) — the everyone cascade surface has no write affordance (FR-311). The two-level ladder
// (objective → work_line → task) is preserved so line-of-sight + the "(Unlinked)" / "No
// Project/Process" branches render identically to desktop (keeps AC-305 e2e green).
function CascadeTaskCard({ task, personMap, ownerLabel, dueLabel, overdueLabel }: {
  task: TaskListRow
  personMap: Map<string, string>
  ownerLabel: string
  dueLabel: string
  overdueLabel: string
}) {
  const ownerName = personMap.get(task.responsible_person_id) ?? '—'
  const dueText = task.due_date ? formatDate(task.due_date) : '—'
  const dueTone = task.due_date ? dueStatus(task.due_date, new Date()) : 'none'
  const shown = dueTone === 'overdue' ? `${overdueLabel} · ${dueText}` : dueText

  return (
    <article data-testid="task-card" className="task-card">
      <Link to={`/tasks/${task.id}`} className="task-card-link">
        <div className="task-card-head">
          <span className="task-name">{task.title}</span>
          <StatusPill status={task.status} />
        </div>
        <dl className="task-card-meta">
          <span className="task-card-meta-pair">
            <dt>{ownerLabel}</dt>
            <dd>{ownerName}</dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{dueLabel}</dt>
            <dd className={dueTone === 'overdue' ? 'due-overdue' : 'due-calm'}>{shown}</dd>
          </span>
        </dl>
      </Link>
    </article>
  )
}

export function CascadePage() {
  const t = useT()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const { objectives, workLines } = useCascadeCatalogs()
  const [tasks, setTasks] = useState<TaskListRow[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [mine, setMine] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    Promise.all([listTasks({}), getPeople()])
      .then(([taskRows, peopleRows]) => {
        if (cancelled) return
        setTasks(taskRows)
        setPeople(peopleRows)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => load(), [load])

  const personMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const person of people) map.set(person.id, person.full_name)
    return map
  }, [people])

  const ladder = useMemo<Ladder>(() => buildLadder({
    objectives,
    workLines,
    tasks,
    viewerId,
    mine,
    labels: {
      unlinked: t('cascade.unlinked'),
      noWorkLine: t('cascade.noWorkLine'),
      untitledObjective: t('cascade.untitledObjective'),
      untitledWorkLine: t('cascade.untitledWorkLine'),
    },
  }), [mine, objectives, workLines, tasks, viewerId, t])

  const workloadSummary = useMemo<WorkloadSummary | null>(() => {
    if (!mine || !viewerId) return null
    const viewer = people.find((person) => person.id === viewerId)
    if (!viewer) return null
    const workLineTypeMap = new Map(workLines.map((workLine) => [workLine.id, workLine.type]))
    const projectIds = new Set<string>()
    const dailyIds = new Set<string>()
    let unassignedCount = 0

    for (const task of tasks) {
      const ownsTask = task.responsible_person_id === viewerId || task.accountable_person_id === viewerId
      if (!ownsTask || task.status === 'Done' || task.archived_at != null) continue
      if (!task.work_line_id) {
        unassignedCount++
        continue
      }
      const workLineType = workLineTypeMap.get(task.work_line_id)
      if (workLineType === 'project') projectIds.add(task.work_line_id)
      if (workLineType === 'process') dailyIds.add(task.work_line_id)
    }

    return {
      isSelf: true,
      firstName: firstName(viewer.full_name),
      projectCount: projectIds.size,
      dailyCount: dailyIds.size,
      unassignedCount,
    }
  }, [mine, people, tasks, viewerId, workLines])

  const overdueLabel = t('cascade.overdue')
  const ownerLabel = t('cascade.card.owner')
  const dueLabel = t('cascade.card.due')

  return (
    <PageFrame variant="data">
      <PageHead title={t('cascade.title')} subtitle={t('cascade.subtitle')} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {can(accessRoles, 'objective.manage') && (
          <Link to="/work/objectives">{t('cascade.manage.objectives')}</Link>
        )}
        {can(accessRoles, 'workline.manage') && (
          <Link to="/work/projects-processes">{t('cascade.manage.projects')}</Link>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setMine(true)}>{t('cascade.mine')}</button>
        <button type="button" onClick={() => setMine(false)}>{t('cascade.all')}</button>
      </div>

      {workloadSummary && <WorkloadCaption summary={workloadSummary} />}

      {loading && <p>{t('cascade.loading')}</p>}
      {error && (
        <div>
          <p>{t('cascade.error.title')}</p>
          <button type="button" onClick={() => load()}>{t('cascade.error.retry')}</button>
        </div>
      )}
      {!loading && !error && ladder.length === 0 && (
        <div>
          <p>{mine ? t('cascade.mine.empty.title') : t('cascade.empty.title')}</p>
          <p>{mine ? t('cascade.mine.empty.body') : t('cascade.empty.body')}</p>
        </div>
      )}

      {!loading && !error && ladder.length > 0 && (
        isDesktop ? (
          <DesktopLadder ladder={ladder} personMap={personMap} overdueLabel={overdueLabel} />
        ) : (
          <PhoneLadder ladder={ladder} personMap={personMap} overdueLabel={overdueLabel} ownerLabel={ownerLabel} dueLabel={dueLabel} title={t('cascade.title')} />
        )
      )}
    </PageFrame>
  )
}

// Desktop: dense grouped nested table (the pre-existing render — GroupHeaderRow reused).
function DesktopLadder({ ladder, personMap, overdueLabel }: {
  ladder: Ladder
  personMap: Map<string, string>
  overdueLabel: string
}) {
  return (
    <>
      {ladder.map((objective) => (
        <div key={objective.key}>
          <table style={{ width: '100%' }}>
            <tbody>
              <GroupHeaderRow
                label={objective.label}
                count={objective.workLines.reduce((sum, workLine) => sum + workLine.tasks.length, 0)}
                overdue={0}
                collapsed={false}
                colSpan={1}
                onToggle={() => {}}
                onAddTask={() => {}}
                onOverdueFilter={() => {}}
                readOnly
              />
              {objective.workLines.map((workLine) => (
                <tr key={workLine.key}>
                  <td>
                    <table style={{ width: '100%' }}>
                      <tbody>
                        <GroupHeaderRow
                          label={workLine.label}
                          count={workLine.tasks.length}
                          overdue={0}
                          collapsed={false}
                          colSpan={1}
                          onToggle={() => {}}
                          onAddTask={() => {}}
                          onOverdueFilter={() => {}}
                          workLineType={workLine.type}
                          readOnly
                        />
                      </tbody>
                    </table>
                    {workLine.tasks.map((task) => (
                      <CascadeTaskLeaf key={task.id} task={task} personMap={personMap} overdueLabel={overdueLabel} />
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

// Phone: grouped cards reusing the Tasks DB-view .mgc-* / .task-card grammar (NFR-300). Two-level
// (objective → work_line → card) so the ladder + synthetic branches render as on desktop.
function PhoneLadder({ ladder, personMap, overdueLabel, ownerLabel, dueLabel, title }: {
  ladder: Ladder
  personMap: Map<string, string>
  overdueLabel: string
  ownerLabel: string
  dueLabel: string
  title: string
}) {
  return (
    <div className="mgc" role="list" aria-label={title}>
      {ladder.map((objective) => {
        const objectiveCount = objective.workLines.reduce((sum, workLine) => sum + workLine.tasks.length, 0)
        return (
          <section key={objective.key} className="mgc-group" role="listitem" aria-label={objective.label}>
            <div className="mgc-group-head">
              <span className="mgc-label">{objective.label}</span>
              <span className="mgc-count tabular-nums">{objectiveCount}</span>
            </div>
            {objective.workLines.map((workLine) => (
              <div key={workLine.key} className="mgc-group">
                <div className="mgc-group-head">
                  <span className="mgc-label">{workLine.label}</span>
                  <span className="mgc-count tabular-nums">{workLine.tasks.length}</span>
                </div>
                {workLine.tasks.map((task) => (
                  <CascadeTaskCard
                    key={task.id}
                    task={task}
                    personMap={personMap}
                    ownerLabel={ownerLabel}
                    dueLabel={dueLabel}
                    overdueLabel={overdueLabel}
                  />
                ))}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

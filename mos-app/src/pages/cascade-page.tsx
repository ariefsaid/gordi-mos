import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { listTasks } from '@/lib/db/tasks'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import { useCascadeCatalogs } from '@/components/tasks/use-cascade-catalogs'
import { GroupHeaderRow } from '@/components/tasks/group-header-row'
import { WorkloadCaption, type WorkloadSummary } from '@/components/tasks/workload-caption'
import { can } from '@/lib/capabilities'
import { buildLadder } from '@/lib/cascade/build-ladder'
import { formatDate, firstName } from '@/components/tasks/task-formatters'
import { dueStatus } from '@/lib/due-status'
import { StatusPill } from '@/components/tasks/status-pill'
import type { TaskListRow } from '@/lib/db/tasks.types'

function CascadeTaskLeaf({ task, personMap }: { task: TaskListRow; personMap: Map<string, string> }) {
  const dueLabel = task.due_date ? formatDate(task.due_date) : '—'
  const ownerName = personMap.get(task.responsible_person_id) ?? '—'
  const dueTone = task.due_date ? dueStatus(task.due_date, new Date()) : 'none'

  return (
    <div style={{ paddingLeft: 48, paddingTop: 8, paddingBottom: 8 }}>
      <div>{task.title}</div>
      <div className="text-muted-foreground" style={{ fontSize: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>{ownerName}</span>
        <span>{dueTone === 'overdue' ? `Overdue · ${dueLabel}` : dueLabel}</span>
        <StatusPill status={task.status} />
      </div>
    </div>
  )
}

export function CascadePage() {
  const t = useT()
  const auth = useAuth()
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

  const ladder = useMemo(() => buildLadder({
    objectives,
    workLines,
    tasks,
    viewerId,
    mine,
    labels: { unlinked: t('cascade.unlinked'), noWorkLine: t('cascade.noWorkLine') },
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

  return (
    <PageFrame variant="data">
      <PageHead title={t('cascade.title')} subtitle={t('cascade.subtitle')} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {can(accessRoles, 'objective.manage') && (
          <Link to="/objectives">{t('cascade.manage.objectives')}</Link>
        )}
        {can(accessRoles, 'workline.manage') && (
          <Link to="/projects-processes">{t('cascade.manage.projects')}</Link>
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

      {!loading && !error && ladder.map((objective) => (
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
                      <CascadeTaskLeaf key={task.id} task={task} personMap={personMap} />
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </PageFrame>
  )
}

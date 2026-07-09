import './cascade-page.css'
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
import { WorkloadCaption, type WorkloadSummary } from '@/components/tasks/workload-caption'
import { can } from '@/lib/capabilities'
import { buildLadder, type Ladder } from '@/lib/cascade/build-ladder'
import { formatDate, firstName } from '@/components/tasks/task-formatters'
import { dueStatus } from '@/lib/due-status'
import { StatusPill } from '@/components/tasks/status-pill'
import { DataTable } from '@/components/dashboard/data-table'
import type { DataTableColumn, DataTableGroup } from '@/components/dashboard/data-table'
import { CutToggle } from '@/components/dashboard/cut-toggle'
import { Tag } from '@/components/ui/tag'
import type { TaskListRow } from '@/lib/db/tasks.types'

// Work-line type chip — mirrors the Tasks work-line group tag (FR-233 / WCAG 1.4.1:
// text label always present, never color-only). Rides the DataTable group-header
// `headerActions` slot so the project/daily classifier survives the single-level fold.
function WorkLineTypeTag({ type }: { type: 'project' | 'process' }) {
  if (type === 'project') {
    return <Tag color="blue" weight="medium">Project</Tag>
  }
  return <Tag color="gray" weight="medium">Daily / ongoing</Tag>
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

  const labels = useMemo(() => ({
    unlinked: t('cascade.unlinked'),
    noWorkLine: t('cascade.noWorkLine'),
    untitledObjective: t('cascade.untitledObjective'),
    untitledWorkLine: t('cascade.untitledWorkLine'),
  }), [t])

  const ladder = useMemo<Ladder>(() => buildLadder({
    objectives,
    workLines,
    tasks,
    viewerId,
    mine,
    labels,
  }), [mine, objectives, workLines, tasks, viewerId, labels])

  // W1-4: fold the 3-level ladder (objective → work_line → task) to the shared
  // DataTable's SINGLE-level groups. groups = work_lines; the parent objective
  // rides as the group `hint` so line-of-sight survives the flatten; the
  // synthetic buckets keep their labels — "(Unlinked)" as the objective hint,
  // "No Project/Process" as the work-line label. No tree information is dropped
  // (the work-line type tag rides the group headerActions).
  const tableGroups = useMemo<DataTableGroup<TaskListRow>[]>(() => {
    const out: DataTableGroup<TaskListRow>[] = []
    for (const objective of ladder) {
      for (const workLine of objective.workLines) {
        out.push({
          key: `${objective.key}:${workLine.key}`,
          label: workLine.label,
          hint: objective.label,
          count: workLine.tasks.length,
          rows: workLine.tasks,
          headerActions: workLine.type ? <WorkLineTypeTag type={workLine.type} /> : undefined,
        })
      }
    }
    return out
  }, [ladder])

  const flatRows = useMemo<TaskListRow[]>(
    () => tableGroups.flatMap((group) => group.rows),
    [tableGroups],
  )

  const ready = !loading && !error
  const overdueLabel = t('cascade.overdue')
  const ownerLabel = t('cascade.card.owner')
  const dueLabel = t('cascade.card.due')
  const mineLabel = t('cascade.mine')
  const allLabel = t('cascade.all')
  const now = useMemo(() => new Date(), [])

  // W1-4: task-row columns mirror the Tasks DB-view row (title link + owner +
  // due/overdue signal + status) via DataTableColumn.render, so a cascade task
  // row reads like a Tasks row. The DataTable single-renders desktop <table> /
  // phone card list from the same columns (no bespoke ladder branches).
  const columns = useMemo<DataTableColumn<TaskListRow>[]>(() => [
    {
      key: 'task',
      header: t('cascade.link'),
      cardLabel: '',
      render: (task) => (
        <Link to={`/tasks/${task.id}`} title={task.title} className="cascade-task-link">
          {task.title}
        </Link>
      ),
    },
    {
      key: 'owner',
      header: ownerLabel,
      cardLabel: ownerLabel,
      render: (task) => personMap.get(task.responsible_person_id) ?? '—',
    },
    {
      key: 'due',
      header: dueLabel,
      cardLabel: dueLabel,
      render: (task) => {
        const tone = task.due_date ? dueStatus(task.due_date, now) : 'none'
        const text = task.due_date ? formatDate(task.due_date) : '—'
        const shown = tone === 'overdue' ? `${overdueLabel} · ${text}` : text
        return (
          <span style={tone === 'overdue' ? { color: 'var(--status-lost-text)', fontWeight: 600 } : undefined}>
            {shown}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      cardLabel: 'Status',
      render: (task) => <StatusPill status={task.status} />,
    },
  ], [personMap, now, overdueLabel, ownerLabel, dueLabel, t])

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

  const showManageObjectives = can(accessRoles, 'objective.manage')
  const showManageWorkLines = can(accessRoles, 'workline.manage')

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title={t('cascade.title')}
        count={ready ? flatRows.length : null}
        meta={<span>{t('cascade.subtitle')}</span>}
      />

      {/* W1-3: secondary manage-links nav — a slim muted context row directly
          under the head (not a tool rail, not floating above the body). */}
      {(showManageObjectives || showManageWorkLines) && (
        <div className="cascade-ctx text-muted-foreground">
          {showManageObjectives && (
            <Link to="/work/objectives" className="text-muted-foreground">{t('cascade.manage.objectives')}</Link>
          )}
          {showManageWorkLines && (
            <Link to="/work/projects-processes" className="text-muted-foreground">{t('cascade.manage.projects')}</Link>
          )}
        </div>
      )}

      {/* W1-2: Mine/All tool-rail segmented control (the shared seg grammar). */}
      <div style={{ marginBottom: 12 }}>
        <CutToggle
          options={[mineLabel, allLabel]}
          value={mine ? mineLabel : allLabel}
          onChange={(value) => setMine(value === mineLabel)}
          ariaLabel="Ownership filter"
        />
      </div>

      {workloadSummary && <WorkloadCaption summary={workloadSummary} />}

      {loading && <p>{t('cascade.loading')}</p>}
      {error && (
        <div>
          <p>{t('cascade.error.title')}</p>
          <button type="button" onClick={() => load()}>{t('cascade.error.retry')}</button>
        </div>
      )}
      {ready && ladder.length === 0 && (
        <div>
          <p>{mine ? t('cascade.mine.empty.title') : t('cascade.empty.title')}</p>
          <p>{mine ? t('cascade.mine.empty.body') : t('cascade.empty.body')}</p>
        </div>
      )}

      {/* W1-4: the body is the shared grouped DataTable (single-level work-line
          groups). Desktop/phone single-render via the DataTable's own branch. */}
      {ready && ladder.length > 0 && (
        <DataTable
          columns={columns}
          rows={flatRows}
          groups={tableGroups}
          isDesktop={isDesktop}
          state="ready"
          caption={t('cascade.title')}
        />
      )}
    </PageFrame>
  )
}

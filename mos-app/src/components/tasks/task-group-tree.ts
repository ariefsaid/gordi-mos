// The Tasks table's row tree: group headers as parent rows, tasks as their sub-rows. The
// projector still owns which groups exist, their order, labels and subtotals; this module only
// shapes that unchanged output into TanStack row-model data, and keeps the persisted
// "collapsed group ids" set in step with the table's `expanded` state.
import { useCallback, useState } from 'react'
import type { ExpandedState, Updater } from '@tanstack/react-table'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { RenderGroup } from './tasks-grouping'
import type { TaskCollectionQuery } from './task-collection-adapter'

export type TaskTreeNode =
  | { kind: 'group'; id: string; group: RenderGroup; subRows: TaskTreeNode[] }
  | { kind: 'leaf'; id: string; task: TaskListRow }

type GroupBy = TaskCollectionQuery['groupBy']

export const groupRowId = (groupKey: string) => `g:${groupKey}`

/** Grouped: one parent node per group holding its tasks. `none`: the tasks themselves, flat. */
export function buildTaskTree(groups: readonly RenderGroup[], groupBy: GroupBy): TaskTreeNode[] {
  if (groupBy === 'none') {
    return groups.flatMap((group) => group.rows.map((task): TaskTreeNode => (
      { kind: 'leaf', id: `t:${task.id}`, task }
    )))
  }
  return groups.map((group): TaskTreeNode => ({
    kind: 'group',
    id: groupRowId(group.key),
    group,
    subRows: group.rows.map((task): TaskTreeNode => (
      { kind: 'leaf', id: `t:${group.key}/${task.id}`, task }
    )),
  }))
}

type CollapseState = Partial<Record<GroupBy, string[]>>
const NO_IDS: readonly string[] = []
const COLLAPSE_KEY = 'mos.tasks.collapsedGroups'
const COLLAPSE_DIMENSIONS = ['none', 'status', 'pic', 'bu', 'workline', 'objective', 'occurrence'] as const

function readCollapseState(): CollapseState {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: CollapseState = {}
    for (const key of COLLAPSE_DIMENSIONS) {
      const values = (parsed as Record<string, unknown>)[key]
      if (Array.isArray(values)) result[key] = values.filter((value): value is string => typeof value === 'string')
    }
    return result
  } catch {
    return {}
  }
}

/**
 * The persisted collapsed-id set per grouping dimension, exposed as TanStack `expanded` state.
 * `expanded` is derived from the ids of the groups currently on screen; a change writes the
 * collapsed ids back, keeping ids of groups that are not on screen.
 */
export function useTaskCollapsePreference(groupBy: GroupBy, groupKeys: readonly string[]) {
  const [collapsed, setCollapsed] = useState<CollapseState>(() => readCollapseState())
  const collapsedIds = collapsed[groupBy] ?? NO_IDS
  const isCollapsed = useCallback((groupKey: string) => collapsedIds.includes(groupKey), [collapsedIds])

  const expanded: ExpandedState = Object.fromEntries(
    groupKeys.filter((key) => !collapsedIds.includes(key)).map((key) => [groupRowId(key), true]),
  )

  const onExpandedChange = useCallback((updater: Updater<ExpandedState>) => {
    setCollapsed((previous) => {
      const current = previous[groupBy] ?? []
      const before: ExpandedState = Object.fromEntries(
        groupKeys.filter((key) => !current.includes(key)).map((key) => [groupRowId(key), true]),
      )
      const after = typeof updater === 'function' ? updater(before) : updater
      const isOpen = (key: string) => after === true || after[groupRowId(key)] === true
      const kept = current.filter((id) => !groupKeys.includes(id) || !isOpen(id))
      const added = groupKeys.filter((key) => !isOpen(key) && !kept.includes(key))
      const next = { ...previous, [groupBy]: [...kept, ...added] }
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* storage disabled */ }
      return next
    })
  }, [groupBy, groupKeys])

  return { expanded, isCollapsed, onExpandedChange }
}

/**
 * useCascadeCatalogs — mount-once non-blocking loader for the cascade lookup tables
 * (objectives and work-lines). Collapses the 3 duplicated fetch sites in:
 *   - tasks-workspace.tsx (TasksWorkspace)
 *   - task-surface.tsx (ViewSurface + CreateSurface)
 *
 * Design invariants:
 * - NEVER blocks the primary loading gate (tasks + directory are the blocking loads;
 *   these catalogs are non-critical and load independently).
 * - Load is triggered once at mount — never refetched on filter/BU/status changes.
 *   Catalogs are stable within a session; re-triggering on every filter change was
 *   a performance regression (Fix-7 in the cascade fix-round).
 * - A catalog failure is silently swallowed: work-line/objective ids render as "—"
 *   until (or if) the names arrive. This preserves the non-blocking contract.
 */
import { useState, useEffect, useMemo } from 'react'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'

export type CascadeCatalogs = {
  objectives: ObjectiveRow[]
  workLines: WorkLineRow[]
  /** id → name map for objectives (for fast per-row resolution). */
  objectiveMap: Map<string, string>
  /** id → name map for work-lines (for fast per-row resolution). */
  workLineMap: Map<string, string>
}

/**
 * Mount-once loader for objectives + work-lines lookup tables.
 * Returns the raw arrays and id→name Maps. The load is non-blocking:
 * the returned arrays start empty and populate asynchronously; callers
 * must never gate their primary render on these values.
 */
export function useCascadeCatalogs(): CascadeCatalogs {
  const [objectives, setObjectives] = useState<ObjectiveRow[]>([])
  const [workLines, setWorkLines] = useState<WorkLineRow[]>([])

  // Mount-once load — the empty dep array is intentional: catalog data is stable
  // within a session. Filter / BU / status changes must NOT re-trigger this.
  useEffect(() => {
    let cancelled = false
    listObjectives().then(o => { if (!cancelled) setObjectives(o) }).catch(() => {})
    listWorkLines().then(w => { if (!cancelled) setWorkLines(w) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Build Maps once per array identity change (only on catalog load).
  const objectiveMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of objectives) m.set(o.id, o.name)
    return m
  }, [objectives])

  const workLineMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const wl of workLines) m.set(wl.id, wl.name)
    return m
  }, [workLines])

  return { objectives, workLines, objectiveMap, workLineMap }
}

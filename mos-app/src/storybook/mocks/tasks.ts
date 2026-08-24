// Storybook stand-in for @/lib/db/tasks (aliased in .storybook/main.ts — production Vite
// never loads it). It mirrors the real module's FULL runtime export surface (#404 port:
// v4's mock exported only searchTasksByTitle, and dev components reachable from the story
// graph — signal-record-host, task-surface, catalog-collection-adapter — now import more,
// which fails the Rollup build on the missing names).
//
// Philosophy unchanged from v4: the workbench proves rendered states, not persistence.
// Reads resolve to empty (stories show real empty/idle states); mutations are no-ops;
// getTask throws LOUDLY so a story that silently depends on record hydration is caught
// instead of rendering a half-real record. Type-only imports resolve against the real
// module (tsc paths are not aliased) and are erased before Rollup sees them.

import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'

export interface TaskListFilters {
  includeArchived?: boolean
  businessUnitId?: string
  status?: TaskStatus
}

export interface TaskTitleRef {
  id: string
  title: string
  status: TaskStatus
}

export async function listTasks(f: TaskListFilters = {}): Promise<TaskListRow[]> {
  void f
  return []
}

export async function getTask(id: string): Promise<never> {
  throw new Error(`storybook tasks mock: getTask(${id}) is not wired — stories prove rendered states, not hydration`)
}

export async function createTask(): Promise<string> {
  return 'storybook-task-id'
}

export async function updateTaskStatus(): Promise<void> {}

export async function updateTaskFields(): Promise<void> {}

export async function updateTaskRaci(): Promise<void> {}

export async function archiveTask(): Promise<void> {}

export async function unarchiveTask(): Promise<void> {}

export async function getTaskTitlesByIds(ids: string[]): Promise<TaskTitleRef[]> {
  void ids
  return []
}

export async function searchTasksByTitle(query: string): Promise<TaskTitleRef[]> {
  // The command palette story proves the overlay shell and its idle state. Search
  // persistence belongs to the application service and is intentionally not run
  // by the Storybook workbench.
  void query
  return []
}

export async function addChecklistItem(): Promise<void> {}

export async function toggleChecklistItem(): Promise<void> {}

export async function reorderChecklistItem(): Promise<void> {}

export async function deleteChecklistItem(): Promise<void> {}

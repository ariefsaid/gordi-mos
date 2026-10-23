import { supabase } from '@/lib/supabase'
import type { TaskViewerRow } from './tasks.types'

// Data layer for mos.task_viewers: the who-can-see list of a private Task. RLS is the authority —
// anyone who can read the Task reads its list; only who may change the Task's privacy can add or
// remove people. org_id is stamped by the DB default and never sent.
const mos = () => supabase.schema('mos')
const COLUMNS = 'id,org_id,task_id,person_id,created_by,created_at'
const UNIQUE_VIOLATION = '23505'

/** The people on a Task's who-can-see list, oldest first. Empty for a Task the caller cannot read. */
export async function listTaskViewers(taskId: string): Promise<TaskViewerRow[]> {
  const { data, error } = await mos().from('task_viewers').select(COLUMNS).eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listTaskViewers failed — ${error.message}`)
  return (data ?? []) as unknown as TaskViewerRow[]
}

/** Add a person to the list; adding someone already on it is a no-op. */
export async function addTaskViewer(taskId: string, personId: string): Promise<void> {
  const { error } = await mos().from('task_viewers').insert({ task_id: taskId, person_id: personId })
  if (error && error.code !== UNIQUE_VIOLATION) throw new Error(`addTaskViewer failed — ${error.message}`)
}

/** Remove a person from the list. */
export async function removeTaskViewer(taskId: string, personId: string): Promise<void> {
  const { error } = await mos().from('task_viewers').delete().eq('task_id', taskId).eq('person_id', personId)
  if (error) throw new Error(`removeTaskViewer failed — ${error.message}`)
}

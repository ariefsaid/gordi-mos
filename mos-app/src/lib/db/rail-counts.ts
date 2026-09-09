import { supabase } from '@/lib/supabase'
import type { TaskDefaultView } from '@/lib/task-default-view'

const mos = () => supabase.schema('mos')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RailCounts = {
  /** Open tasks owned by the viewer (R or A), matching Home's My work predicate. */
  openTasks: number
}

async function headCount(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await build()
  if (error) throw new Error(`rail count failed — ${(error as { message?: string }).message ?? 'unknown'}`)
  return count ?? 0
}

/** Fetch viewer-owned rail counts. A missing or malformed person id cannot fall back to an org total. */
export async function getRailCounts(
  personId?: string,
  defaultView: TaskDefaultView = 'my-work',
  teamIds: readonly string[] = [],
): Promise<RailCounts | null> {
  if (!personId || !UUID.test(personId)) return null

  const openTasks = await headCount(() => {
    let query = mos()
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .neq('status', 'Done')
    if (defaultView === 'team-work') {
      // A Team scope is keyed only by canonical task.team_id. Empty membership must remain empty;
      // it must never widen to a BU/org count while the viewer's Team context is unresolved.
      if (teamIds.length > 0) query = query.or(`team_id.in.(${teamIds.join(',')})`)
      else query = query.in('id', [])
    } else if (defaultView === 'all') {
      // All is intentionally org-wide; RLS supplies the tenant boundary.
    } else {
      query = query.or(`responsible_person_id.eq.${personId},accountable_person_id.eq.${personId}`)
    }
    return query
  })
  return { openTasks }
}

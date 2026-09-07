import { supabase } from '@/lib/supabase'
import type { TaskDefaultView } from '@/lib/task-default-view'

const mos = () => supabase.schema('mos')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RailCounts = {
  /** Open tasks in the same role-default scope the Tasks collection opens on. */
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
  teamBusinessUnitIds: readonly string[] = [],
): Promise<RailCounts | null> {
  if (!personId || !UUID.test(personId)) return null

  const openTasks = await headCount(() => {
    let query = mos()
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .neq('status', 'Done')
    if (defaultView === 'my-work') {
      query = query.or(`responsible_person_id.eq.${personId},accountable_person_id.eq.${personId}`)
    } else if (defaultView === 'team-work') {
      if (teamIds.length === 0 && teamBusinessUnitIds.length === 0) {
        query = query.in('id', [])
      } else {
        const teamClause = teamIds.length > 0 ? `team_id.in.(${teamIds.join(',')})` : 'team_id.is.null'
        const buClause = teamBusinessUnitIds.length > 0
          ? `and(team_id.is.null,business_unit_id.in.(${teamBusinessUnitIds.join(',')}))`
          : 'team_id.is.null'
        query = query.or(`${teamClause},${buClause}`)
      }
    }
    return query
  })
  return { openTasks }
}

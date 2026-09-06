import { supabase } from '@/lib/supabase'

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
export async function getRailCounts(personId?: string): Promise<RailCounts | null> {
  if (!personId || !UUID.test(personId)) return null

  const openTasks = await headCount(() => {
    let query = mos()
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .is('archived_at', null)
      .neq('status', 'Done')
    query = query.or(`responsible_person_id.eq.${personId},accountable_person_id.eq.${personId}`)
    return query
  })
  return { openTasks }
}

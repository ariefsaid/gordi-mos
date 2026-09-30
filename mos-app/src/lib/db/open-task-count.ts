import { supabase } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The ONE open-task count: the viewer's own tasks (PIC or Supervisor), not Done, not archived
 * (lib/task-open's rule, counted server-side). The rail badge and Home both read it, so they
 * agree for every role. A missing or malformed person id cannot fall back to an org total.
 */
export async function getMyOpenTaskCount(personId?: string): Promise<number | null> {
  if (!personId || !UUID.test(personId)) return null
  const { count, error } = await supabase
    .schema('mos')
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .is('archived_at', null)
    .neq('status', 'Done')
    .or(`responsible_person_id.eq.${personId},accountable_person_id.eq.${personId}`)
  if (error) throw new Error(`open task count failed — ${(error as { message?: string }).message ?? 'unknown'}`)
  return count ?? 0
}

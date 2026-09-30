import { supabase } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The viewer's own open tasks (PIC or Supervisor, not Done, not archived): the one count the
// rail badge and Home share (see lib/open-task-count-store.ts).
export async function getMyOpenTaskCount(personId?: string): Promise<number | null> {
  if (!personId || !UUID.test(personId)) return null
  const { count, error } = await supabase
    .schema('mos')
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .is('archived_at', null)
    .neq('status', 'Done')
    .or(`responsible_person_id.eq.${personId},accountable_person_id.eq.${personId}`)
  if (error) throw new Error(`open task count failed — ${error.message}`)
  return count ?? 0
}

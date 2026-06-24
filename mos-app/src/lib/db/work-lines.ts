import { supabase } from '@/lib/supabase'

// Data layer for mos.work_lines (cascade first slice, Task B).
// Reads mos via supabase.schema('mos') — one auth session, RLS is the authority.
// Never sends org_id (DB stamps it via shared.current_org_id()). Throws on any
// non-null PostgREST error so the UI can surface failures.

const mos = () => supabase.schema('mos')

export interface WorkLineRow {
  id: string
  name: string
  type: 'project' | 'process'
}

/** List active (non-archived) work lines ordered by name (org-readable via RLS). */
export async function listWorkLines(): Promise<WorkLineRow[]> {
  const { data, error } = await mos()
    .from('work_lines')
    .select('id,name,type')
    .is('archived_at', null)
    .order('name')
  if (error) throw new Error(`listWorkLines failed — ${error.message}`)
  return (data ?? []) as unknown as WorkLineRow[]
}

import { supabase } from '@/lib/supabase'

// Data layer for mos.objectives (cascade first slice, Task B).
// Reads mos via supabase.schema('mos') — one auth session, RLS is the authority.
// Never sends org_id (DB stamps it via shared.current_org_id()). Throws on any
// non-null PostgREST error so the UI can surface failures.

const mos = () => supabase.schema('mos')

export interface ObjectiveRow {
  id: string
  name: string
}

/** List active (non-archived) objectives ordered by name (org-readable via RLS). */
export async function listObjectives(): Promise<ObjectiveRow[]> {
  const { data, error } = await mos()
    .from('objectives')
    .select('id,name')
    .is('archived_at', null)
    .order('name')
  if (error) throw new Error(`listObjectives failed — ${error.message}`)
  return (data ?? []) as unknown as ObjectiveRow[]
}

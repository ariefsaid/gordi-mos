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

// ── Management (catalog surface, OD-C-2; ops_lead/admin writes enforced by RLS) ─

export interface WorkLineAdminRow {
  id: string
  name: string
  type: 'project' | 'process'
  archived_at: string | null
}

/** List ALL work lines (active + archived) for the management surface — active first, then by name. */
export async function listWorkLinesAll(): Promise<WorkLineAdminRow[]> {
  const { data, error } = await mos()
    .from('work_lines')
    .select('id,name,type,archived_at')
    .order('archived_at', { nullsFirst: true })
    .order('name')
  if (error) throw new Error(`listWorkLinesAll failed — ${error.message}`)
  return (data ?? []) as unknown as WorkLineAdminRow[]
}

/** Create a work line (org_id stamped by the DB). Returns the new row. */
export async function createWorkLine(
  name: string,
  type: 'project' | 'process',
): Promise<WorkLineAdminRow> {
  const { data, error } = await mos()
    .from('work_lines')
    .insert({ name, type })
    .select('id,name,type,archived_at')
    .single()
  if (error) throw new Error(`createWorkLine failed — ${error.message}`)
  return data as unknown as WorkLineAdminRow
}

/** Rename a work line. (type is immutable after creation — FR-014.) */
export async function renameWorkLine(id: string, name: string): Promise<void> {
  const { error } = await mos().from('work_lines').update({ name }).eq('id', id)
  if (error) throw new Error(`renameWorkLine failed — ${error.message}`)
}

/** Archive / unarchive a work line (soft — toggles archived_at). */
export async function setWorkLineArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await mos()
    .from('work_lines')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`setWorkLineArchived failed — ${error.message}`)
}

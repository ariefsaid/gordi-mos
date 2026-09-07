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
  objective_id?: string | null
}

/** List active (non-archived) work lines ordered by name (org-readable via RLS). */
export async function listWorkLines(): Promise<WorkLineRow[]> {
  const { data, error } = await mos()
    .from('work_lines')
    .select('id,name,type,objective_id')
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
  objective_id?: string | null
  archived_at: string | null
  business_unit_id?: string | null
  accountable_person_id?: string | null
}

/** Ownership a Project/Process carries (#801): unit and Accountable person — each optional. */
export interface WorkLineOwnership {
  business_unit_id?: string | null
  accountable_person_id?: string | null
}

const ADMIN_COLUMNS = 'id,name,type,objective_id,archived_at,business_unit_id,accountable_person_id'

/** List ALL work lines (active + archived) for the management surface — active first, then by name. */
export async function listWorkLinesAll(): Promise<WorkLineAdminRow[]> {
  const { data, error } = await mos()
    .from('work_lines')
    .select(ADMIN_COLUMNS)
    .order('archived_at', { nullsFirst: true })
    .order('name')
  if (error) throw new Error(`listWorkLinesAll failed — ${error.message}`)
  return (data ?? []) as unknown as WorkLineAdminRow[]
}

/** Create a work line (org_id stamped by the DB; who may write in a unit is RLS's call). Returns the new row. */
export async function createWorkLine(
  name: string,
  type: 'project' | 'process',
  ownership: WorkLineOwnership = {},
): Promise<WorkLineAdminRow> {
  const { data, error } = await mos()
    .from('work_lines')
    .insert({ name, type, ...ownership })
    .select(ADMIN_COLUMNS)
    .single()
  if (error) throw new Error(`createWorkLine failed — ${error.message}`)
  return data as unknown as WorkLineAdminRow
}

/** Rename a work line. */
export async function renameWorkLine(id: string, name: string): Promise<void> {
  const { error } = await mos().from('work_lines').update({ name }).eq('id', id)
  if (error) throw new Error(`renameWorkLine failed — ${error.message}`)
}

/** Change a work line's type. The database refuses it once an occurrence exists (#801). */
export async function setWorkLineType(id: string, type: 'project' | 'process'): Promise<void> {
  const { error } = await mos().from('work_lines').update({ type }).eq('id', id)
  if (error) throw new Error(`setWorkLineType failed — ${error.message}`)
}

/** Archive / unarchive a work line (soft — toggles archived_at). */
export async function setWorkLineArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await mos()
    .from('work_lines')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`setWorkLineArchived failed — ${error.message}`)
}

// ── Record surface (ticket #806) ────────────────────────────────────────────────
//
// A Project/Process opens as a record (`/work/projects/:id`). `readWorkLine` fetches
// the columns the record header + Details tab renders — an unknown id resolves to
// null (the caller shows a not-found inside the record frame, per the ticket) rather
// than throwing. `updateWorkLine` patches only the fields the record edits —
// `business_unit_id`, `accountable_person_id`, `responsible_person_id`, `objective_id`,
// `name` — and lets the database's per-column checks (mos._guard_work_lines +
// `work_lines_update_can_manage_or_unit_lead`) decide who may write.

export interface WorkLineRecord {
  id: string
  name: string
  type: 'project' | 'process'
  objective_id: string | null
  business_unit_id: string | null
  accountable_person_id: string | null
  responsible_person_id: string | null
  archived_at: string | null
  updated_at: string
}

const RECORD_COLUMNS =
  'id,name,type,objective_id,business_unit_id,accountable_person_id,responsible_person_id,archived_at,updated_at'

/** Read one work_line by id. Returns null when no such row is visible (unknown id, or RLS hides it). */
export async function readWorkLine(id: string): Promise<WorkLineRecord | null> {
  const { data, error } = await mos()
    .from('work_lines')
    .select(RECORD_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`readWorkLine failed — ${error.message}`)
  return (data as unknown as WorkLineRecord | null) ?? null
}

/**
 * Fields the record allows a writer to patch — every arm optional so the caller can save
 * one field at a time (per-field Saving/Saved, per the record grammar). `name` is the
 * inline title edit; the rest are Details-tab fields.
 */
export interface WorkLinePatch {
  name?: string
  business_unit_id?: string | null
  accountable_person_id?: string | null
  responsible_person_id?: string | null
  objective_id?: string | null
}

/** Patch one or more fields on a work_line. Throws on PostgREST error (403 from RLS included). */
export async function updateWorkLine(id: string, patch: WorkLinePatch): Promise<void> {
  const { error } = await mos().from('work_lines').update(patch).eq('id', id)
  if (error) throw new Error(`updateWorkLine failed — ${error.message}`)
}

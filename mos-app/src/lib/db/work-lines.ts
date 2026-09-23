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
  business_unit_id?: string | null
  accountable_person_id?: string | null
  responsible_person_id?: string | null
}

/** Ownership and cascade links a Project/Process carries; all are existing nullable columns. */
export interface WorkLineOwnership {
  objective_id?: string | null
  business_unit_id?: string | null
  accountable_person_id?: string | null
  responsible_person_id?: string | null
}

const ACTIVE_COLUMNS =
  'id,name,type,objective_id,business_unit_id,accountable_person_id,responsible_person_id'
const ADMIN_COLUMNS =
  'id,name,type,objective_id,business_unit_id,accountable_person_id,responsible_person_id,archived_at'

/** List active (non-archived) work lines ordered by name (org-readable via RLS). */
export async function listWorkLines(): Promise<WorkLineRow[]> {
  const { data, error } = await mos()
    .from('work_lines')
    .select(ACTIVE_COLUMNS)
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
  responsible_person_id?: string | null
}

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

/** Create a work line (org_id stamped by the DB). Returns the new row. */
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

// ── Record surface ────────────────────────────────────────────────────────────

/** The existing columns rendered by a Project/Process record. */
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

/** Read one Project/Process; null means no visible row, not a transport error. */
export async function readWorkLine(id: string): Promise<WorkLineRecord | null> {
  const { data, error } = await mos()
    .from('work_lines')
    .select(RECORD_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`readWorkLine failed — ${error.message}`)
  return (data as unknown as WorkLineRecord | null) ?? null
}

/** Fields a Project/Process record may patch; RLS and the database guard remain authoritative. */
export interface WorkLinePatch {
  name?: string
  objective_id?: string | null
  business_unit_id?: string | null
  accountable_person_id?: string | null
  responsible_person_id?: string | null
}

export async function updateWorkLine(id: string, patch: WorkLinePatch): Promise<void> {
  const { error } = await mos().from('work_lines').update(patch).eq('id', id)
  if (error) throw new Error(`updateWorkLine failed — ${error.message}`)
}

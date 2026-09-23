import { supabase } from '@/lib/supabase'

// Data layer for mos.objectives (cascade first slice, Task B).
// Reads mos via supabase.schema('mos') — one auth session, RLS is the authority.
// Never sends org_id (DB stamps it via shared.current_org_id()). Throws on any
// non-null PostgREST error so the UI can surface failures.

const mos = () => supabase.schema('mos')

export interface ObjectiveRow {
  id: string
  name: string
  business_unit_id?: string | null
  accountable_person_id?: string | null
  period_year?: number | null
}

/** Ownership an Objective carries (#801): unit, owner, and year — each optional. */
export interface ObjectiveOwnership {
  business_unit_id?: string | null
  accountable_person_id?: string | null
  period_year?: number | null
}

const ACTIVE_COLUMNS = 'id,name,business_unit_id,accountable_person_id,period_year'
const ADMIN_COLUMNS = 'id,name,archived_at,business_unit_id,accountable_person_id,period_year'

/** List active (non-archived) objectives ordered by name (org-readable via RLS). */
export async function listObjectives(): Promise<ObjectiveRow[]> {
  const { data, error } = await mos()
    .from('objectives')
    .select(ACTIVE_COLUMNS)
    .is('archived_at', null)
    .order('name')
  if (error) throw new Error(`listObjectives failed — ${error.message}`)
  return (data ?? []) as unknown as ObjectiveRow[]
}

// ── Management (catalog surface, OD-C-2; admin-only writes enforced by RLS) ────

export interface ObjectiveAdminRow {
  id: string
  name: string
  archived_at: string | null
  business_unit_id?: string | null
  accountable_person_id?: string | null
  period_year?: number | null
}

/** List ALL objectives (active + archived) for the management surface — active first, then by name. */
export async function listObjectivesAll(): Promise<ObjectiveAdminRow[]> {
  const { data, error } = await mos()
    .from('objectives')
    .select(ADMIN_COLUMNS)
    .order('archived_at', { nullsFirst: true })
    .order('name')
  if (error) throw new Error(`listObjectivesAll failed — ${error.message}`)
  return (data ?? []) as unknown as ObjectiveAdminRow[]
}

/** Create an objective (org_id stamped by the DB). Returns the new row. */
export async function createObjective(
  name: string,
  ownership: ObjectiveOwnership = {},
): Promise<ObjectiveAdminRow> {
  const { data, error } = await mos()
    .from('objectives')
    .insert({ name, ...ownership })
    .select(ADMIN_COLUMNS)
    .single()
  if (error) throw new Error(`createObjective failed — ${error.message}`)
  return data as unknown as ObjectiveAdminRow
}

/** Rename an objective. */
export async function renameObjective(id: string, name: string): Promise<void> {
  const { error } = await mos().from('objectives').update({ name }).eq('id', id)
  if (error) throw new Error(`renameObjective failed — ${error.message}`)
}

/** Archive / unarchive an objective (soft — toggles archived_at). */
export async function setObjectiveArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await mos()
    .from('objectives')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`setObjectiveArchived failed — ${error.message}`)
}

// ── Record surface ────────────────────────────────────────────────────────────

/** The existing columns rendered by an Objective record. */
export interface ObjectiveRecord {
  id: string
  name: string
  archived_at: string | null
  business_unit_id: string | null
  accountable_person_id: string | null
  period_year: number | null
  updated_at: string
}

const RECORD_COLUMNS =
  'id,name,archived_at,business_unit_id,accountable_person_id,period_year,updated_at'

/** Read one Objective; null means no visible row, not a transport error. */
export async function readObjective(id: string): Promise<ObjectiveRecord | null> {
  const { data, error } = await mos()
    .from('objectives')
    .select(RECORD_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`readObjective failed — ${error.message}`)
  return (data as unknown as ObjectiveRecord | null) ?? null
}

/** Fields an Objective record may patch; RLS and the database guard remain authoritative. */
export interface ObjectivePatch {
  name?: string
  business_unit_id?: string | null
  accountable_person_id?: string | null
  period_year?: number | null
}

export async function updateObjective(id: string, patch: ObjectivePatch): Promise<void> {
  const { error } = await mos().from('objectives').update(patch).eq('id', id)
  if (error) throw new Error(`updateObjective failed — ${error.message}`)
}

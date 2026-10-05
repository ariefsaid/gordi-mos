import { supabase } from '@/lib/supabase'
import { containsPattern } from './like-pattern'
import { withReferenceCache, invalidateReferenceCache } from './reference-cache'

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

/**
 * Ownership an Objective carries: unit or Company-wide (never both), owner, year and quarter —
 * each optional. A quarter needs a year.
 */
export interface ObjectiveOwnership {
  business_unit_id?: string | null
  is_company_wide?: boolean
  accountable_person_id?: string | null
  period_year?: number | null
  period_quarter?: number | null
}

const ACTIVE_COLUMNS = 'id,name,business_unit_id,accountable_person_id,period_year'
const ADMIN_COLUMNS = 'id,name,archived_at,business_unit_id,is_company_wide,accountable_person_id,period_year,period_quarter'

/** List active (non-archived) objectives ordered by name (org-readable via RLS). SWR-cached —
 * the picker/palette re-read these on mount, a few times a day of change (#1359). */
export async function listObjectives(): Promise<ObjectiveRow[]> {
  return withReferenceCache('mos.objectives.active', async () => {
    const { data, error } = await mos()
      .from('objectives')
      .select(ACTIVE_COLUMNS)
      .is('archived_at', null)
      .order('name')
    if (error) throw new Error(`listObjectives failed — ${error.message}`)
    return (data ?? []) as unknown as ObjectiveRow[]
  })
}

/** Search active objectives by name for the ⌘K palette. RLS (org tenancy) is the read authority; org_id is never sent. */
export async function searchObjectivesByName(q: string, limit = 20): Promise<Array<{ id: string; name: string }>> {
  const term = q.trim()
  if (!term) return []
  const { data, error } = await mos()
    .from('objectives')
    .select('id,name')
    .ilike('name', containsPattern(term))
    .is('archived_at', null)
    .order('name')
    .limit(limit)
  if (error) throw new Error(`searchObjectivesByName failed — ${error.message}`)
  return (data ?? []) as unknown as Array<{ id: string; name: string }>
}

// ── Management (catalog surface, OD-C-2; admin-only writes enforced by RLS) ────

export interface ObjectiveAdminRow {
  id: string
  name: string
  archived_at: string | null
  business_unit_id?: string | null
  is_company_wide?: boolean
  accountable_person_id?: string | null
  period_year?: number | null
  period_quarter?: number | null
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
  invalidateReferenceCache('mos.objectives')
  return data as unknown as ObjectiveAdminRow
}

/** Rename an objective. */
export async function renameObjective(id: string, name: string): Promise<void> {
  const { error } = await mos().from('objectives').update({ name }).eq('id', id)
  if (error) throw new Error(`renameObjective failed — ${error.message}`)
  invalidateReferenceCache('mos.objectives')
}

/** Archive / unarchive an objective (soft — toggles archived_at). */
export async function setObjectiveArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await mos()
    .from('objectives')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`setObjectiveArchived failed — ${error.message}`)
  invalidateReferenceCache('mos.objectives')
}

// ── Record surface ────────────────────────────────────────────────────────────

/** The existing columns rendered by an Objective record. */
export interface ObjectiveRecord {
  id: string
  name: string
  archived_at: string | null
  business_unit_id: string | null
  is_company_wide: boolean
  accountable_person_id: string | null
  period_year: number | null
  period_quarter: number | null
  updated_at: string
}

const RECORD_COLUMNS =
  'id,name,archived_at,business_unit_id,is_company_wide,accountable_person_id,period_year,period_quarter,updated_at'

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
  is_company_wide?: boolean
  accountable_person_id?: string | null
  period_year?: number | null
  period_quarter?: number | null
}

export async function updateObjective(id: string, patch: ObjectivePatch): Promise<void> {
  const { error } = await mos().from('objectives').update(patch).eq('id', id)
  if (error) throw new Error(`updateObjective failed — ${error.message}`)
  invalidateReferenceCache('mos.objectives')
}

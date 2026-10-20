import { supabase } from '@/lib/supabase'
import { readAllCatalogPages } from './catalog-pages'
import { containsPattern } from './like-pattern'
import { withReferenceCache, invalidateReferenceCache } from './reference-cache'

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

const WORK_RECORDS_PAGE_SIZE = 50

export type WorkLineCatalogFilter = {
  view: 'active' | 'archived' | 'all'
  search: string
  type: 'all' | 'project' | 'process'
}

export type WorkLineCatalogPage = {
  rows: WorkLineAdminRow[]
  cursor: string | null
  hasMore: boolean
}

/** List active (non-archived) work lines ordered by name (org-readable via RLS). SWR-cached —
 * the picker/palette re-read these on mount, a few times a day of change (#1359). */
export async function listWorkLines(): Promise<WorkLineRow[]> {
  return withReferenceCache('mos.work_lines.active', async () => {
    const { data, error } = await mos()
      .from('work_lines')
      .select(ACTIVE_COLUMNS)
      .is('archived_at', null)
      .order('name')
    if (error) throw new Error(`listWorkLines failed — ${error.message}`)
    return (data ?? []) as unknown as WorkLineRow[]
  })
}

/** Search active Projects and Processes by name for the ⌘K palette. RLS (org tenancy) is the read authority; org_id is never sent. */
export async function searchWorkLinesByName(
  q: string,
  limit = 20,
): Promise<Array<{ id: string; name: string; type: WorkLineRow['type'] }>> {
  const term = q.trim()
  if (!term) return []
  const { data, error } = await mos()
    .from('work_lines')
    .select('id,name,type')
    .ilike('name', containsPattern(term))
    .is('archived_at', null)
    .order('name')
    .limit(limit)
  if (error) throw new Error(`searchWorkLinesByName failed — ${error.message}`)
  return (data ?? []) as unknown as Array<{ id: string; name: string; type: WorkLineRow['type'] }>
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

/** Read one ID-keyset page for the Projects & Processes catalog. */
export async function listWorkLinesCatalogPage(
  filter: WorkLineCatalogFilter,
  afterId?: string,
): Promise<WorkLineCatalogPage> {
  let query = mos().from('work_lines').select(ADMIN_COLUMNS)
  if (filter.view === 'active') query = query.is('archived_at', null)
  if (filter.view === 'archived') query = query.not('archived_at', 'is', null)
  if (filter.search.trim()) query = query.ilike('name', containsPattern(filter.search.trim()))
  if (filter.type !== 'all') query = query.eq('type', filter.type)
  if (afterId) query = query.gt('id', afterId)
  const { data, error } = await query.order('id', { ascending: true }).limit(WORK_RECORDS_PAGE_SIZE + 1)
  if (error) throw new Error(`listWorkLinesCatalogPage failed — ${error.message}`)
  const fetched = (data ?? []) as unknown as WorkLineAdminRow[]
  const hasMore = fetched.length > WORK_RECORDS_PAGE_SIZE
  const rows = fetched.slice(0, WORK_RECORDS_PAGE_SIZE)
  return { rows, hasMore, cursor: hasMore ? rows.at(-1)?.id ?? null : null }
}

/** List every work line for record-context lookups, using bounded catalog pages. */
export function listWorkLinesAll(): Promise<WorkLineAdminRow[]> {
  return readAllCatalogPages('listWorkLinesCatalogPage', 'listWorkLinesAll', (afterId) =>
    listWorkLinesCatalogPage({ view: 'all', search: '', type: 'all' }, afterId))
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
  invalidateReferenceCache('mos.work_lines')
  return data as unknown as WorkLineAdminRow
}

/** Rename a work line. (type is immutable after creation — FR-014.) */
export async function renameWorkLine(id: string, name: string): Promise<void> {
  const { error } = await mos().from('work_lines').update({ name }).eq('id', id)
  if (error) throw new Error(`renameWorkLine failed — ${error.message}`)
  invalidateReferenceCache('mos.work_lines')
}

/** Archive / unarchive a work line (soft — toggles archived_at). */
export async function setWorkLineArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await mos()
    .from('work_lines')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`setWorkLineArchived failed — ${error.message}`)
  invalidateReferenceCache('mos.work_lines')
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
  invalidateReferenceCache('mos.work_lines')
}

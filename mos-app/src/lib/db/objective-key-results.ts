import { supabase } from '@/lib/supabase'

// Data layer for mos.objective_key_results. RLS is the authority: insert/delete and every
// column except current_value are admin-only; current_value follows content authority.
// Never sends org_id (DB stamps it). Throws on any non-null PostgREST error.

const mos = () => supabase.schema('mos')

export interface KeyResultRow {
  id: string
  objective_id: string
  what: string
  target_value: number | null
  current_value: number | null
  unit: string | null
  due_date: string | null
  owner_person_id: string | null
}

export interface KeyResultTargetsPatch {
  what?: string
  target_value?: number | null
  unit?: string | null
  due_date?: string | null
  owner_person_id?: string | null
}

const COLUMNS = 'id,objective_id,what,target_value,current_value,unit,due_date,owner_person_id'

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toRow(raw: unknown): KeyResultRow {
  const r = raw as Record<string, unknown>
  return {
    id: String(r.id),
    objective_id: String(r.objective_id),
    what: String(r.what ?? ''),
    target_value: numberOrNull(r.target_value),
    current_value: numberOrNull(r.current_value),
    unit: (r.unit as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    owner_person_id: (r.owner_person_id as string | null) ?? null,
  }
}

function assertFinite(label: string, value: number | null | undefined) {
  if (value != null && !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
}

/** Key results of one Objective, in creation order (no position column). */
export async function listKeyResults(objectiveId: string): Promise<KeyResultRow[]> {
  const { data, error } = await mos()
    .from('objective_key_results')
    .select(COLUMNS)
    .eq('objective_id', objectiveId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`listKeyResults failed — ${error.message}`)
  return (data ?? []).map(toRow)
}

export async function createKeyResult(objectiveId: string, what: string): Promise<KeyResultRow> {
  const { data, error } = await mos()
    .from('objective_key_results')
    .insert({ objective_id: objectiveId, what })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`createKeyResult failed — ${error.message}`)
  return toRow(data)
}

/** Admin-only columns. */
export async function updateKeyResultTargets(id: string, patch: KeyResultTargetsPatch): Promise<KeyResultRow> {
  assertFinite('target_value', patch.target_value)
  const { data, error } = await mos()
    .from('objective_key_results')
    .update(patch)
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`updateKeyResultTargets failed — ${error.message}`)
  return toRow(data)
}

/** Content-tier column; null clears it. */
export async function updateKeyResultCurrentValue(id: string, currentValue: number | null): Promise<KeyResultRow> {
  assertFinite('current_value', currentValue)
  const { data, error } = await mos()
    .from('objective_key_results')
    .update({ current_value: currentValue })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`updateKeyResultCurrentValue failed — ${error.message}`)
  return toRow(data)
}

export async function deleteKeyResult(id: string): Promise<void> {
  const { error } = await mos().from('objective_key_results').delete().eq('id', id)
  if (error) throw new Error(`deleteKeyResult failed — ${error.message}`)
}

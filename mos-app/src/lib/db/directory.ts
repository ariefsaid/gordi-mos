// Client-side shared directory loader (Fix C1).
// Reads shared.business_units and shared.people via supabase.schema('shared').
// Both tables are org-readable per OD-P1-3 (RLS scopes to the caller's org).
// NEVER send org_id in a filter — DB default stamps it; RLS is the authority.
// Throws on any PostgREST error so callers can surface failures.

import { supabase } from '../supabase'

const shared = () => supabase.schema('shared')

export interface BusinessUnitOption {
  id: string
  name: string
}

export interface PersonOption {
  id: string
  full_name: string
}

/** Load all non-archived business units for the org (ordered by name). */
export async function getBusinessUnits(): Promise<BusinessUnitOption[]> {
  const { data, error } = await shared()
    .from('business_units')
    .select('id,name')
    .order('name', { ascending: true })
  if (error) throw new Error(`getBusinessUnits failed — ${error.message}`)
  return (data ?? []) as BusinessUnitOption[]
}

/** Load all active (non-archived) people for the org (ordered by full_name). */
export async function getPeople(): Promise<PersonOption[]> {
  const { data, error } = await shared()
    .from('people')
    .select('id,full_name')
    .is('archived_at', null)
    .order('full_name', { ascending: true })
  if (error) throw new Error(`getPeople failed — ${error.message}`)
  return (data ?? []) as PersonOption[]
}

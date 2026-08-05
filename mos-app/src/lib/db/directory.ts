// Client-side shared directory loader (Fix C1).
// Reads shared.business_units and shared.people via supabase.schema('shared').
// Both tables are org-readable per OD-P1-3 (RLS scopes to the caller's org).
// NEVER send org_id in a filter — DB default stamps it; RLS is the authority.
// Throws on any PostgREST error so callers can surface failures.

import { supabase } from '@/lib/supabase'

const shared = () => supabase.schema('shared')

export interface BusinessUnitOption {
  id: string
  name: string
  code?: string | null
}

export interface PersonOption {
  id: string
  full_name: string
}

export interface RoleScopeRow {
  id: string
  business_unit_id: string | null
  reports_to_role_id: string | null
}

/** Load all non-archived business units for the org (ordered by name). */
export async function getBusinessUnits(): Promise<BusinessUnitOption[]> {
  const { data, error } = await shared()
    .from('business_units')
    .select('id,name,code')
    .is('archived_at', null)
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

/** Load all org roles with their BU + reports-to seam (for Home role-scope detection, Issue E).
 *  Reads the role tree the stacked-union selector needs to test BU apex (parent's business_unit_id).
 *  Org-readable per OD-P1-3 (RLS scopes it). Never sends org_id. */
export async function getRoles(): Promise<RoleScopeRow[]> {
  const { data, error } = await shared()
    .from('roles')
    .select('id,business_unit_id,reports_to_role_id')
  if (error) throw new Error(`getRoles failed — ${error.message}`)
  return (data ?? []) as RoleScopeRow[]
}

export interface RoleOption {
  id: string
  name: string
}

/** Batched role-name lookup by id (design fix wave item 4 — Rule 11, mirrors team.ts's
 *  `.from('roles').select('id,name')` pattern). Backs the Occurrence group-by's "via <role name>"
 *  generated-ownership provenance line. Returns `[]` (no network call) for an empty id list. */
export async function listRoleNames(roleIds: string[]): Promise<RoleOption[]> {
  if (roleIds.length === 0) return []
  const { data, error } = await shared()
    .from('roles')
    .select('id,name')
    .in('id', roleIds)
  if (error) throw new Error(`listRoleNames failed — ${error.message}`)
  return (data ?? []) as RoleOption[]
}

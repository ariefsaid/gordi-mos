// Client-side shared directory loader (Fix C1).
// Reads shared.business_units and shared.people via supabase.schema('shared').
// Both tables are org-readable per OD-P1-3 (RLS scopes to the caller's org).
// NEVER send org_id in a filter — DB default stamps it; RLS is the authority.
// Throws on any PostgREST error so callers can surface failures.

import { supabase } from '@/lib/supabase'
import { filterEffectiveMemberships } from '@/lib/team-context/eligible-teams'
import type { EligibleTeam } from '@/lib/team-context/types'

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

/** A real, org-scoped Team choice. BU and Site are read-only derived attributes. */
export type TeamOption = EligibleTeam

const WIB_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })

function wibToday(now: Date = new Date()): string {
  return WIB_DATE.format(now)
}

type RawTeamRow = {
  id: string
  name: string
  business_unit_id: string
  site_id: string | null
  org_id: string
  archived_at: string | null
}

type RawMembershipRow = {
  team_id: string
  is_primary: boolean
  effective_from: string
  effective_to: string | null
}

function toTeamOption(row: RawTeamRow, isPrimary?: boolean): TeamOption {
  return {
    id: row.id,
    name: row.name,
    businessUnitId: row.business_unit_id,
    siteId: row.site_id,
    orgId: row.org_id,
    ...(isPrimary === undefined ? {} : { isPrimary }),
  }
}

/** Load the viewer's currently effective, non-archived Team memberships. */
export async function getPersonTeams(personId: string, today = wibToday()): Promise<TeamOption[]> {
  if (!personId) return []
  const { data: memberships, error: membershipError } = await shared()
    .from('team_memberships')
    .select('team_id,is_primary,effective_from,effective_to')
    .eq('person_id', personId)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
  if (membershipError) throw new Error(`getPersonTeams memberships failed — ${membershipError.message}`)

  // Keep the pure effective-window rule at the client boundary too. This makes the picker fail
  // closed if a stale/misconfigured PostgREST mock or replica returns rows outside the predicate.
  const effective = filterEffectiveMemberships((memberships ?? []) as RawMembershipRow[], today)
  const primaryByTeamId = new Map<string, boolean>()
  for (const membership of effective) {
    primaryByTeamId.set(membership.team_id, (primaryByTeamId.get(membership.team_id) ?? false) || membership.is_primary)
  }
  const teamIds = [...primaryByTeamId.keys()]
  if (teamIds.length === 0) return []

  const { data: teams, error: teamError } = await shared()
    .from('teams')
    .select('id,name,business_unit_id,site_id,org_id,archived_at')
    .in('id', teamIds)
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (teamError) throw new Error(`getPersonTeams teams failed — ${teamError.message}`)
  return ((teams ?? []) as RawTeamRow[]).map((team) => toTeamOption(team, primaryByTeamId.get(team.id) ?? false))
}

/** Load real Team identity for Task ownership/display. Empty input never performs a network read. */
export async function getTeamsByIds(teamIds: readonly string[]): Promise<TeamOption[]> {
  const ids = [...new Set(teamIds.filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await shared()
    .from('teams')
    .select('id,name,business_unit_id,site_id,org_id,archived_at')
    .in('id', ids)
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (error) throw new Error(`getTeamsByIds failed — ${error.message}`)
  return ((data ?? []) as RawTeamRow[]).map((team) => toTeamOption(team))
}

/** #742 AC-060: everyone the viewer manages, walked down the role tree (BFS over
 * reports_to_role_id) rather than the person graph — the client mirror of mos.can_edit_task's
 * shared.is_manager_of(), direction reversed. Feeds the composer's self+downline PIC picker;
 * the DB (mos._guard_tasks) is the actual authority on who may BE PIC. */
export async function getDownlinePersonIds(viewerId: string): Promise<string[]> {
  const [{ data: assignments, error: assignmentError }, { data: roles, error: roleError }] = await Promise.all([
    shared().from('person_roles').select('person_id,role_id'),
    shared().from('roles').select('id,reports_to_role_id'),
  ])
  if (assignmentError) throw new Error(`getDownlinePersonIds assignments failed — ${assignmentError.message}`)
  if (roleError) throw new Error(`getDownlinePersonIds roles failed — ${roleError.message}`)
  const roleRows = (roles ?? []) as Array<{ id: string; reports_to_role_id: string | null }>
  const ownedRoles = new Set((assignments ?? []).filter((a: { person_id: string }) => a.person_id === viewerId).map((a: { role_id: string }) => a.role_id))
  const children = new Map<string, string[]>()
  for (const role of roleRows) {
    if (!role.reports_to_role_id) continue
    children.set(role.reports_to_role_id, [...(children.get(role.reports_to_role_id) ?? []), role.id])
  }
  const downlineRoles = new Set<string>()
  const pending = [...ownedRoles]
  while (pending.length) {
    const roleId = pending.shift() as string
    for (const child of children.get(roleId) ?? []) {
      if (!downlineRoles.has(child)) { downlineRoles.add(child); pending.push(child) }
    }
  }
  return [...new Set((assignments ?? []).filter((a: { role_id: string }) => downlineRoles.has(a.role_id)).map((a: { person_id: string }) => a.person_id))]
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

/** Search active people by name for the ⌘K palette (org-scoped like getPeople; the LIKE wildcards % _ * are escaped). */
export async function searchPeopleByName(query: string): Promise<PersonOption[]> {
  const { data, error } = await shared()
    .from('people')
    .select('id,full_name')
    .is('archived_at', null)
    // Escape % _ * so a query of "50%", "a_b" or "a*b" matches literally, never as a LIKE
    // pattern — PostgREST treats all three as wildcards (`*` is its ilike alias for %).
    .ilike('full_name', `%${query.replace(/[%_*]/g, '\\$&')}%`)
    .order('full_name', { ascending: true })
    .limit(10)
  if (error) throw new Error(`searchPeopleByName failed — ${error.message}`)
  return (data ?? []) as PersonOption[]
}

/** Load all org roles with their BU + reports-to seam (for Home role-scope detection, Issue E).
 *  Reads the role tree the role-scope selector needs to test BU apex (parent's business_unit_id).
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

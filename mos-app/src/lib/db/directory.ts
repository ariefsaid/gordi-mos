// Client-side shared directory loader (Fix C1).
// Reads shared.business_units and shared.people via supabase.schema('shared').
// Both tables are org-readable per OD-P1-3 (RLS scopes to the caller's org).
// NEVER send org_id in a filter — DB default stamps it; RLS is the authority.
// Throws on any PostgREST error so callers can surface failures.

import { supabase } from '@/lib/supabase'
import { wibToday } from '@/lib/format/date'
import { containsPattern } from './like-pattern'
import { withReferenceCache } from './reference-cache'
import { filterEffectiveMemberships } from '@/lib/team-context/eligible-teams'
import type { EligibleTeam } from '@/lib/team-context/types'
import { getReadScope, sharePending } from '@/lib/scoped-reads'
import type { ReadLease, ReadKey } from '@/lib/scoped-reads'

const shared = () => supabase.schema('shared')

function readDirectory<T>(readLease: ReadLease | undefined, key: ReadKey, load: () => Promise<T>): Promise<T> {
  if (readLease) return readLease.read(key, load)
  const scope = getReadScope()
  return scope ? sharePending(scope, key, load) : load()
}

const PERSON_ROLE_ASSIGNMENTS_KEY = 'shared.person_roles:select(person_id,role_id)'
const ROLE_TREE_KEY = 'shared.roles:select(id,reports_to_role_id)'
const DIRECT_MANAGER_ROLE_KEY = 'shared.roles:select(id,business_unit_id,reports_to_role_id)'
const ROLE_BUSINESS_UNITS_KEY = 'shared.roles:select(id,business_unit_id)'

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

function readTeamRows(teamIds: readonly string[], readLease?: ReadLease): Promise<RawTeamRow[]> {
  const ids = [...new Set(teamIds.filter(Boolean))].sort()
  if (ids.length === 0) return Promise.resolve([])
  const key = `shared.teams:select(id,name,business_unit_id,site_id,org_id,archived_at):id.in=${JSON.stringify(ids)}:archived_at=null:order=name.asc`
  return readDirectory(readLease, key, async () => {
    const { data, error } = await shared()
      .from('teams')
      .select('id,name,business_unit_id,site_id,org_id,archived_at')
      .in('id', ids)
      .is('archived_at', null)
      .order('name', { ascending: true })
    if (error) throw new Error(`getTeamsByIds failed — ${error.message}`)
    return (data ?? []) as RawTeamRow[]
  })
}

/** Load the viewer's currently effective, non-archived Team memberships. */
export async function getPersonTeams(
  personId: string,
  today = wibToday(),
  readLease?: ReadLease,
): Promise<TeamOption[]> {
  if (!personId) return []
  const membershipKey = `shared.team_memberships:select(team_id,is_primary,effective_from,effective_to):person_id=${personId}:effective_from<=${today}:effective_to=null-or-gte-${today}`
  const memberships = await readDirectory(readLease, membershipKey, async () => {
    const { data, error } = await shared()
      .from('team_memberships')
      .select('team_id,is_primary,effective_from,effective_to')
      .eq('person_id', personId)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
    if (error) throw new Error(`getPersonTeams memberships failed — ${error.message}`)
    return (data ?? []) as RawMembershipRow[]
  })

  // Keep the pure effective-window rule at the client boundary too. This makes the picker fail
  // closed if a stale/misconfigured PostgREST mock or replica returns rows outside the predicate.
  const effective = filterEffectiveMemberships(memberships, today)
  const primaryByTeamId = new Map<string, boolean>()
  for (const membership of effective) {
    primaryByTeamId.set(membership.team_id, (primaryByTeamId.get(membership.team_id) ?? false) || membership.is_primary)
  }
  const teamIds = [...primaryByTeamId.keys()]
  if (teamIds.length === 0) return []

  const teams = await readTeamRows(teamIds, readLease)
  return teams.map((team) => toTeamOption(team, primaryByTeamId.get(team.id) ?? false))
}

export type TeamLeadRow = { team_id: string; lead_person_id: string | null }

// RLS limits this to the Teams the viewer is an active member of.
export async function getMyTeamLeads(): Promise<TeamLeadRow[]> {
  const { data, error } = await shared().from('team_lead_assignments').select('team_id,lead_person_id')
  if (error) throw new Error(`getMyTeamLeads failed — ${error.message}`)
  return (data ?? []) as TeamLeadRow[]
}

/** Load real Team identity for Task ownership/display. Empty input never performs a network read. */
export async function getTeamsByIds(teamIds: readonly string[], readLease?: ReadLease): Promise<TeamOption[]> {
  const teams = await readTeamRows(teamIds, readLease)
  return teams.map((team) => toTeamOption(team))
}

/** Resolve holders of direct parent roles only for the PIC role in the Task's BU. */
export async function getDirectManagerPersonIds(personId: string, businessUnitId: string, readLease?: ReadLease): Promise<string[]> {
  if (!personId || !businessUnitId) return []
  const [assignments, roles] = await Promise.all([
    readDirectory(readLease, PERSON_ROLE_ASSIGNMENTS_KEY, async () => {
      const { data, error } = await shared().from('person_roles').select('person_id,role_id')
      if (error) throw new Error(`getDirectManagerPersonIds assignments failed — ${error.message}`)
      return data ?? []
    }),
    readDirectory(readLease, DIRECT_MANAGER_ROLE_KEY, async () => {
      const { data, error } = await shared().from('roles').select('id,business_unit_id,reports_to_role_id')
      if (error) throw new Error(`getDirectManagerPersonIds roles failed — ${error.message}`)
      return data ?? []
    }),
  ])
  const roleRows = roles as Array<{ id: string; business_unit_id: string | null; reports_to_role_id: string | null }>
  const picRoleIds = new Set(roleRows
    .filter((role) => role.business_unit_id === businessUnitId && assignments.some((assignment: { person_id: string; role_id: string }) => assignment.person_id === personId && assignment.role_id === role.id))
    .map((role) => role.reports_to_role_id)
    .filter((roleId): roleId is string => roleId !== null))
  return [...new Set(assignments
    .filter((assignment: { person_id: string; role_id: string }) => assignment.person_id !== personId && picRoleIds.has(assignment.role_id))
    .map((assignment: { person_id: string }) => assignment.person_id))]
}

/** #742 AC-060: everyone the viewer manages, walked down the role tree (BFS over
 * reports_to_role_id) rather than the person graph — the client mirror of mos.can_edit_task's
 * shared.is_manager_of(), direction reversed. Feeds the composer's self+downline PIC picker;
 * the DB (mos._guard_tasks) is the actual authority on who may BE PIC. */
export async function getDownlinePersonIds(viewerId: string, readLease?: ReadLease): Promise<string[]> {
  const [assignments, roles] = await Promise.all([
    readDirectory(readLease, PERSON_ROLE_ASSIGNMENTS_KEY, async () => {
      const { data, error } = await shared().from('person_roles').select('person_id,role_id')
      if (error) throw new Error(`getDownlinePersonIds assignments failed — ${error.message}`)
      return data ?? []
    }),
    readDirectory(readLease, ROLE_TREE_KEY, async () => {
      const { data, error } = await shared().from('roles').select('id,reports_to_role_id')
      if (error) throw new Error(`getDownlinePersonIds roles failed — ${error.message}`)
      return data ?? []
    }),
  ])
  const roleRows = roles as Array<{ id: string; reports_to_role_id: string | null }>
  const ownedRoles = new Set(assignments.filter((a: { person_id: string }) => a.person_id === viewerId).map((a: { role_id: string }) => a.role_id))
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
  return [...new Set(assignments.filter((a: { role_id: string }) => downlineRoles.has(a.role_id)).map((a: { person_id: string }) => a.person_id))]
}

/** Business Units of the roles the person currently holds — the role half of OD-TASK-3's
 *  Relevant scope (a Team membership carries its own business_unit_id; a held role anchors its
 *  holder in a BU without one). Mirrors the getDownlinePersonIds reads: person_roles + roles,
 *  org-readable per OD-P1-3, never an org_id filter. Empty id resolves to [] like getPersonTeams. */
export async function getPersonBusinessUnitIds(personId: string, readLease?: ReadLease): Promise<string[]> {
  if (!personId) return []
  const [assignments, roles] = await Promise.all([
    readDirectory(readLease, PERSON_ROLE_ASSIGNMENTS_KEY, async () => {
      const { data, error } = await shared().from('person_roles').select('person_id,role_id')
      if (error) throw new Error(`getPersonBusinessUnitIds assignments failed — ${error.message}`)
      return data ?? []
    }),
    readDirectory(readLease, ROLE_BUSINESS_UNITS_KEY, async () => {
      const { data, error } = await shared().from('roles').select('id,business_unit_id')
      if (error) throw new Error(`getPersonBusinessUnitIds roles failed — ${error.message}`)
      return data ?? []
    }),
  ])
  const heldRoleIds = new Set(assignments.filter((a: { person_id: string }) => a.person_id === personId).map((a: { role_id: string }) => a.role_id))
  return [...new Set(roles.filter((r: { id: string; business_unit_id: string | null }) => heldRoleIds.has(r.id) && r.business_unit_id !== null).map((r: { business_unit_id: string | null }) => r.business_unit_id as string))]
}

/** Load all non-archived business units for the org (ordered by name). */
export async function getBusinessUnits(readLease?: ReadLease): Promise<BusinessUnitOption[]> {
  return readDirectory(readLease, 'shared.business_units:select(id,name,code):archived_at=null:order=name.asc', () =>
    // SWR-cached across mounts — reference data changes a few times a day (#1359). The lease/scope
    // checks stay outermost; this cache adds cross-mount persistence only.
    withReferenceCache('shared.business_units.active', async () => {
      const { data, error } = await shared()
        .from('business_units')
        .select('id,name,code')
        .is('archived_at', null)
        .order('name', { ascending: true })
      if (error) throw new Error(`getBusinessUnits failed — ${error.message}`)
      return (data ?? []) as BusinessUnitOption[]
    }),
  )
}

/** Load all active (non-archived) people for the org (ordered by full_name). */
export async function getPeople(readLease?: ReadLease): Promise<PersonOption[]> {
  return readDirectory(readLease, 'shared.people:select(id,full_name):archived_at=null:order=full_name.asc', () =>
    // SWR-cached across mounts — the picker re-reads people on every mount (#1359).
    withReferenceCache('shared.people.active', async () => {
      const { data, error } = await shared()
        .from('people')
        .select('id,full_name')
        .is('archived_at', null)
        .order('full_name', { ascending: true })
      if (error) throw new Error(`getPeople failed — ${error.message}`)
      return (data ?? []) as PersonOption[]
    }),
  )
}

/** Search active people by name for the ⌘K palette (org-scoped like getPeople; the LIKE wildcards % _ * are escaped). */
export async function searchPeopleByName(query: string): Promise<PersonOption[]> {
  const { data, error } = await shared()
    .from('people')
    .select('id,full_name')
    .is('archived_at', null)
    .ilike('full_name', containsPattern(query))
    .order('full_name', { ascending: true })
    .limit(10)
  if (error) throw new Error(`searchPeopleByName failed — ${error.message}`)
  return (data ?? []) as PersonOption[]
}

/** Load all org roles with their BU + reports-to seam (for Home role-scope detection, Issue E).
 *  Reads the role tree the role-scope selector needs to test BU apex (parent's business_unit_id).
 *  Org-readable per OD-P1-3 (RLS scopes it). Never sends org_id. */
export async function getRoles(readLease?: ReadLease): Promise<RoleScopeRow[]> {
  return readDirectory(readLease, 'shared.roles:select(id,business_unit_id,reports_to_role_id)', async () => {
    const { data, error } = await shared()
      .from('roles')
      .select('id,business_unit_id,reports_to_role_id')
    if (error) throw new Error(`getRoles failed — ${error.message}`)
    return (data ?? []) as RoleScopeRow[]
  })
}

export interface RoleOption {
  id: string
  name: string
}

/** Batched role-name lookup by id (design fix wave item 4 — Rule 11, mirrors team.ts's
 *  `.from('roles').select('id,name')` pattern). Backs the Occurrence group-by's "via <role name>"
 *  generated-ownership provenance line. Returns `[]` (no network call) for an empty id list. */
export async function listRoleNames(roleIds: string[], readLease?: ReadLease): Promise<RoleOption[]> {
  const ids = [...new Set(roleIds.filter(Boolean))].sort()
  if (ids.length === 0) return []
  const key = `shared.roles:select(id,name):id.in=${JSON.stringify(ids)}`
  return readDirectory(readLease, key, async () => {
    const { data, error } = await shared()
      .from('roles')
      .select('id,name')
      .in('id', ids)
    if (error) throw new Error(`listRoleNames failed — ${error.message}`)
    return (data ?? []) as RoleOption[]
  })
}

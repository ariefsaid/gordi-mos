import type { RolesRow, PeopleRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

// deriveIsManager: true iff any role the viewer holds is the reports_to_role_id of some role
// that is itself currently held (heldRoleIds). Union over all viewer roles.
// Mirrors shared.is_manager_of semantics: a held subordinate, not merely an existing subordinate role.
// FR-015, OD-P1-7.
export function deriveIsManager(input: {
  viewerRoleIds: string[]
  roles: Pick<RolesRow, 'id' | 'reports_to_role_id'>[]
  heldRoleIds: Set<string> // role_ids with ≥1 current holder
}): boolean {
  const { viewerRoleIds, roles, heldRoleIds } = input
  const viewerSet = new Set(viewerRoleIds)

  for (const role of roles) {
    // Is this role a subordinate of one of the viewer's roles?
    if (
      role.reports_to_role_id !== null &&
      viewerSet.has(role.reports_to_role_id) &&
      heldRoleIds.has(role.id)
    ) {
      return true
    }
  }
  return false
}

export interface ViewerResult {
  person: PeopleRow | null
  roles: RolesRow[]
  isManager: boolean
}

// resolveViewer: read the person by user_id, their held roles, and derive isManager.
// - Never sends org_id (RLS scopes it — §8, ADR-0002 D2).
// - Returns { person: null, roles: [], isManager: false } on orphan (no people row) — fail-closed, no throw.
// - Throws on unexpected (non-empty) error from roles/junction reads (§8 "throw on error").
// FR-014/016.
export async function resolveViewer(userId: string): Promise<ViewerResult> {
  // 1. Fetch the person row
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (personError || person === null) {
    // Warn on RLS/read error so misconfiguration doesn't silently masquerade as an orphan.
    if (personError) console.warn('viewer: person read failed', personError)
    // Orphan: no people row or read error → fail closed, no throw
    return { person: null, roles: [], isManager: false }
  }

  // 2. Fetch the person's held role_ids ordered by created_at asc (FR-007 — earliest-assigned first).
  const { data: personRoles, error: prError } = await supabase
    .from('person_roles')
    .select('role_id, created_at')
    .eq('person_id', person.id)
    .order('created_at', { ascending: true })

  if (prError) {
    throw new Error(`resolveViewer: person_roles read failed — ${prError.message}`)
  }

  // 3. Fetch all org roles (no org_id filter — RLS scopes it)
  const { data: allRoles, error: rolesError } = await supabase
    .from('roles')
    .select('*')

  if (rolesError) {
    throw new Error(`resolveViewer: roles read failed — ${rolesError.message}`)
  }

  // 4. Build the set of held role_ids (roles with ≥1 current holder) from person_roles.
  //    Known O(org) read — acceptable at ~15 people. P1-4+ optimization: push isManager
  //    derivation to a DB view/RPC to avoid reading the full junction table client-side.
  const { data: allPersonRoles, error: allPrError } = await supabase
    .from('person_roles')
    .select('role_id')

  if (allPrError) {
    throw new Error(`resolveViewer: all person_roles read failed — ${allPrError.message}`)
  }

  const viewerRoleIds = (personRoles ?? []).map((pr) => pr.role_id)
  const roles = allRoles ?? []
  const heldRoleIds = new Set((allPersonRoles ?? []).map((pr) => pr.role_id))

  // Sort viewer roles to match the created_at order from person_roles (FR-007).
  // Treat missing created_at as equal/stable (R1 defensive sort — existing mocks omit it).
  const viewerRoles = roles
    .filter((r) => viewerRoleIds.includes(r.id))
    .sort((a, b) => {
      const idxA = viewerRoleIds.indexOf(a.id)
      const idxB = viewerRoleIds.indexOf(b.id)
      // indexOf returns -1 if not found — treat as last (defensive)
      const safeA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA
      const safeB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB
      return safeA - safeB
    })

  return {
    person,
    roles: viewerRoles,
    isManager: deriveIsManager({ viewerRoleIds, roles, heldRoleIds }),
  }
}

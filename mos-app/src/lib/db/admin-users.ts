// Admin user management data layer — plan §3.3.
// Wraps the admin provisioning RPCs + direct RLS writes.
// NEVER send org_id — DB stamps it. NEVER send user_id — RPCs own it.
// Throws on any PostgREST/RPC error so callers can surface failures.

import { supabase } from '@/lib/supabase'
import type { AdminPersonRow, CreatePersonInput, LoginStatus } from './admin-users.types'

const shared = () => supabase.schema('shared')

// ── Email synthesis (FR-021) ──────────────────────────────────────────────────

/**
 * Derive a synthetic @ops.gordi.local email from a full name.
 * Slug: lowercase, spaces → dashes, strip non [a-z0-9-].
 * If the base is taken, appends -2, -3, … (FR-021 uniqueness).
 */
export function synthesizeEmail(fullName: string, taken?: Set<string>): string {
  const slug = fullName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  const base = `${slug}@ops.gordi.local`
  if (!taken || !taken.has(base)) return base

  let n = 2
  while (true) {
    const candidate = `${slug}-${n}@ops.gordi.local`
    if (!taken.has(candidate)) return candidate
    n++
  }
}

// ── People list (FR-010/011) ──────────────────────────────────────────────────

/**
 * Load all people for the org with login status + access roles merged in.
 * Joins: people + person_access_roles (non-revoked) + admin_list_login_status RPC.
 */
export async function listAdminPeople(): Promise<AdminPersonRow[]> {
  // 1. Fetch people
  const { data: people, error: peoplErr } = await shared()
    .from('people')
    .select('id,full_name,email,archived_at')
    .order('full_name', { ascending: true })
  if (peoplErr) throw new Error(`listAdminPeople (people) failed — ${peoplErr.message}`)

  // 2. Fetch non-revoked access roles
  const { data: roles, error: rolesErr } = await shared()
    .from('person_access_roles')
    .select('person_id,access_role,revoked_at')
    .is('revoked_at', null)
  if (rolesErr) throw new Error(`listAdminPeople (roles) failed — ${rolesErr.message}`)

  // 3. Fetch login status via admin RPC
  const { data: loginStatus, error: loginErr } = await shared().rpc('admin_list_login_status')
  if (loginErr) throw new Error(`listAdminPeople (login_status) failed — ${loginErr.message}`)

  // Build lookup maps
  const rolesByPerson: Record<string, string[]> = {}
  for (const row of (roles ?? []) as { person_id: string; access_role: string }[]) {
    if (!rolesByPerson[row.person_id]) rolesByPerson[row.person_id] = []
    rolesByPerson[row.person_id].push(row.access_role)
  }

  const loginMap: Record<string, { has_login: boolean; disabled: boolean }> = {}
  for (const row of (loginStatus ?? []) as { person_id: string; has_login: boolean; disabled: boolean }[]) {
    loginMap[row.person_id] = { has_login: row.has_login, disabled: row.disabled }
  }

  return ((people ?? []) as { id: string; full_name: string; email: string | null; archived_at: string | null }[]).map((p) => {
    const ls = loginMap[p.id]
    let login: LoginStatus = 'none'
    if (ls?.has_login) {
      login = ls.disabled ? 'disabled' : 'active'
    }
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      archived_at: p.archived_at,
      login,
      access_roles: rolesByPerson[p.id] ?? [],
    }
  })
}

// ── Create person (FR-020/021) ────────────────────────────────────────────────

/**
 * Insert a new person row + optional initial access roles.
 * Returns the new person's id.
 * Never sends org_id (DB stamps) or user_id (RPC-only).
 */
export async function createPerson(input: CreatePersonInput): Promise<string> {
  const { data, error } = await shared()
    .from('people')
    .insert({ full_name: input.full_name, email: input.email })
    .select('id')
    .single()
  if (error) throw new Error(`createPerson failed — ${error.message}`)

  const personId = (data as { id: string }).id

  // Grant initial roles (if any)
  for (const role of input.access_roles) {
    await grantRole(personId, role)
  }

  return personId
}

// ── Login RPCs (FR-022/030/040) ───────────────────────────────────────────────

/**
 * Create a login for a person (FR-022). Returns the temp password (shown once).
 */
export async function createLogin(personId: string): Promise<string> {
  const { data, error } = await shared().rpc('admin_create_login', { p_person: personId })
  if (error) throw new Error(`createLogin failed — ${error.message}`)
  return data as string
}

/**
 * Reset a login's password (FR-030). Returns the new temp password (shown once).
 */
export async function resetPassword(personId: string): Promise<string> {
  const { data, error } = await shared().rpc('admin_reset_password', { p_person: personId })
  if (error) throw new Error(`resetPassword failed — ${error.message}`)
  return data as string
}

/**
 * Disable (enabled=false) or re-enable (enabled=true) a login (FR-040).
 */
export async function setLoginEnabled(personId: string, enabled: boolean): Promise<void> {
  const { error } = await shared().rpc('admin_set_login_enabled', {
    p_person: personId,
    p_enabled: enabled,
  })
  if (error) throw new Error(`setLoginEnabled failed — ${error.message}`)
}

// ── Role grant/revoke (FR-050) ────────────────────────────────────────────────

/**
 * Grant an access role to a person (INSERT person_access_roles).
 */
export async function grantRole(personId: string, role: string): Promise<void> {
  const { error } = await shared()
    .from('person_access_roles')
    .insert({ person_id: personId, access_role: role })
  if (error) throw new Error(`grantRole failed — ${error.message}`)
}

/**
 * Revoke an access role from a person (soft revoke — sets revoked_at, never DELETE).
 */
export async function revokeRole(personId: string, role: string): Promise<void> {
  const { error } = await shared()
    .from('person_access_roles')
    .update({ revoked_at: new Date().toISOString() })
    .eq('person_id', personId)
    .eq('access_role', role)
    .is('revoked_at', null)
  if (error) throw new Error(`revokeRole failed — ${error.message}`)
}

// ── Archive / restore (FR-060) ────────────────────────────────────────────────

/**
 * Archive a person (soft — sets archived_at).
 */
export async function archivePerson(personId: string): Promise<void> {
  const { error } = await shared()
    .from('people')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', personId)
  if (error) throw new Error(`archivePerson failed — ${error.message}`)
}

/**
 * Restore an archived person (clears archived_at).
 */
export async function restorePerson(personId: string): Promise<void> {
  const { error } = await shared()
    .from('people')
    .update({ archived_at: null })
    .eq('id', personId)
  if (error) throw new Error(`restorePerson failed — ${error.message}`)
}

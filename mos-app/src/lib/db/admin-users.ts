// Admin user management data layer — plan §3.3.
// Wraps the admin provisioning RPCs + direct RLS writes.
// NEVER send org_id — DB stamps it. NEVER send user_id — RPCs own it.
// Throws on any PostgREST/RPC error so callers can surface failures.

import { supabase } from '@/lib/supabase'
import type { AdminPersonRow, CreatePersonInput, LoginStatus, RoleOption, RevenueScopeOption, TeamOption, TeamMembership } from './admin-users.types'

const shared = () => supabase.schema('shared')
const reporting = () => supabase.schema('reporting')

// Curated, org-agnostic messages our admin RPCs / RLS policies raise deliberately — safe to show the
// admin verbatim. ANY other DB error (raw RLS/constraint text, e.g. a cross-org unique-violation whose
// DETAIL would leak that an email exists in another org — D11 audit) is logged to the console only and
// surfaced as a generic message, so no Postgres internals ever reach the client.
const SAFE_RPC_MESSAGES = new Set<string>([
  'admin access role required',
  'person not found in your org',
  'person already has a login',
  'person has no email to provision a login for',
  'email already in use',
  'person has no login to reset',
  'person has no login',
  'cannot disable the last active admin login',
  'cannot revoke admin from the last active admin',
  'cannot archive the last active admin',
])
// NOTE: format-substituted PG messages (e.g. 'access role admin is never self-assignable', which the
// trigger raises via `%`) can never match this exact-string Set — they degrade to the generic message.
// That's leak-safe (they're org-agnostic) but means the Set is NOT exhaustive over all raises: for a
// helpful-and-specific UX on such a case, guard the action at the UI layer (e.g. grantRole callers
// disallow self-assigning admin) rather than adding an un-matchable `%`-form string here.

function surface(action: string, error: { message?: string } | null | undefined): Error {
  // Full raw error (code/details/hint) → console only; never the user-facing message. Intentional
  // structured logging (server/dev observability); the client gets only the sanitized return below.
  // (When the conventions' `no-console` rule is enabled, add an eslint-disable here — not before, or
  // the directive is flagged unused under --max-warnings=0.)
  console.error(`[admin-users] ${action} failed`, error)
  const msg = error?.message ?? ''
  return new Error(SAFE_RPC_MESSAGES.has(msg) ? msg : `Couldn't ${action}. Please try again.`)
}

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
  if (peoplErr) throw surface('load people', peoplErr)

  // 2. Fetch non-revoked access roles
  const { data: roles, error: rolesErr } = await shared()
    .from('person_access_roles')
    .select('person_id,access_role,revoked_at')
    .is('revoked_at', null)
  if (rolesErr) throw surface('load people', rolesErr)

  // 3. Fetch login status via admin RPC
  const { data: loginStatus, error: loginErr } = await shared().rpc('admin_list_login_status')
  if (loginErr) throw surface('load people', loginErr)

  // 4. Fetch Jabatan (person_roles joined to role names) — no cross-schema embed (PGRST200); two reads.
  const { data: prRows, error: prErr } = await shared().from('person_roles').select('person_id,role_id')
  if (prErr) throw surface('load people', prErr)
  const { data: roleRows, error: rErr } = await shared().from('roles').select('id,name')
  if (rErr) throw surface('load people', rErr)
  const roleNameById = new Map((roleRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]))
  const jabatanByPerson: Record<string, { role_id: string; role_name: string }[]> = {}
  for (const row of (prRows ?? []) as { person_id: string; role_id: string }[]) {
    if (!jabatanByPerson[row.person_id]) jabatanByPerson[row.person_id] = []
    jabatanByPerson[row.person_id].push({ role_id: row.role_id, role_name: roleNameById.get(row.role_id) ?? row.role_id })
  }

  // 5. Fetch supervisor revenue scope (admin reads all org rows via RLS).
  const { data: scopeRows, error: scopeErr } = await reporting()
    .from('supervisor_revenue_scope')
    .select('person_id,channel,branch_code')
  if (scopeErr) throw surface('load people', scopeErr)
  const scopeByPerson: Record<string, { channel: string; branch_code: string | null }[]> = {}
  for (const row of (scopeRows ?? []) as { person_id: string; channel: string; branch_code: string | null }[]) {
    ;(scopeByPerson[row.person_id] ??= []).push({ channel: row.channel, branch_code: row.branch_code })
  }

  // 6. LIVE team memberships. One read: the picker labels rows from listTeams(), so no team name
  //    is needed here — carrying one cost a second full read of shared.teams for nothing.
  //
  //    Liveness here is the END of the gates' definition (`effective_to is null or >= today`) and
  //    NOT their start clause. That asymmetry is deliberate: an admin screen must show a row it can
  //    act on, and a not-yet-started membership is a real row an admin may want to end. The gates
  //    ask "does this person have rights through this team today"; this asks "what is there to
  //    manage". The screen is deliberately WIDER, never narrower — narrower is what let it report
  //    someone removed while the gates still admitted them. The HOME question below is the one that
  //    must match exactly, and does.
  const today = new Date().toISOString().slice(0, 10)
  const { data: tmRows, error: tmErr } = await shared()
    .from('team_memberships')
    .select('person_id,team_id,is_primary,effective_from,effective_to')
    .or(`effective_to.is.null,effective_to.gte.${today}`)
  if (tmErr) throw surface('load people', tmErr)
  const teamsByPerson: Record<string, TeamMembership[]> = {}
  for (const row of (tmRows ?? []) as { person_id: string; team_id: string; is_primary: boolean; effective_from: string; effective_to: string | null }[]) {
    // MEMBERSHIP and HOME are different questions with different liveness rules, and conflating
    // them is how the screen ends up asserting something the database disagrees with. A row ending
    // today is still a membership to every gate — hence the `.or()` filter above. But
    // shared.default_stream() and ops.is_stream_reviewer both require `effective_to is null`
    // strictly, so a primary with ANY end date resolves neither a capture stream nor review
    // authority, and must not render as Home.
    ;(teamsByPerson[row.person_id] ??= []).push({
      team_id: row.team_id,
      // All three clauses both functions carry, `effective_from` included. Omitting the start date
      // made a future-dated membership render as Home while the gates resolved nothing.
      //
      // NOT an exact match, and the difference is worth naming: `today` is the BROWSER's UTC date
      // (line above), while the functions compare against the server's `current_date`. A skewed or
      // differently-zoned client errs toward not-Home, which is the safe direction, and the repo
      // already carries a scar from the other direction (Café plans seeding at the Jakarta date
      // rather than UTC). The authoritative cutoff stays server-side — see end_team_membership,
      // which exists for exactly that reason.
      is_primary: row.is_primary && row.effective_to === null && row.effective_from <= today,
    })
  }

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
      jabatan: jabatanByPerson[p.id] ?? [],
      revenue_scope: scopeByPerson[p.id] ?? [],
      teams: teamsByPerson[p.id] ?? [],
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
  if (error) throw surface('create person', error)

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
  if (error) throw surface('create login', error)
  return data as string
}

/**
 * Reset a login's password (FR-030). Returns the new temp password (shown once).
 */
export async function resetPassword(personId: string): Promise<string> {
  const { data, error } = await shared().rpc('admin_reset_password', { p_person: personId })
  if (error) throw surface('reset password', error)
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
  if (error) throw surface('update login', error)
}

// ── Role grant/revoke (FR-050) ────────────────────────────────────────────────

/**
 * Grant an access role to a person (INSERT person_access_roles).
 */
export async function grantRole(personId: string, role: string): Promise<void> {
  const { error } = await shared()
    .from('person_access_roles')
    .insert({ person_id: personId, access_role: role })
  if (error) throw surface('grant role', error)
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
  if (error) throw surface('revoke role', error)
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
  if (error) throw surface('archive person', error)
}

/**
 * Restore an archived person (clears archived_at).
 */
export async function restorePerson(personId: string): Promise<void> {
  const { error } = await shared()
    .from('people')
    .update({ archived_at: null })
    .eq('id', personId)
  if (error) throw surface('restore person', error)
}

// ── Jabatan (Position) — shared.person_roles admin writes (FR-201/202) ──────────

/** All org roles (Positions) for the picker, sorted by name. */
export async function listRoles(): Promise<RoleOption[]> {
  const { data, error } = await shared().from('roles').select('id,name').order('name', { ascending: true })
  if (error) throw surface('load positions', error)
  return (data ?? []) as RoleOption[]
}

/** Assign a Jabatan (Position) to a person. Never sends org_id (DB stamps it). */
export async function assignJabatan(personId: string, roleId: string): Promise<void> {
  const { error } = await shared().from('person_roles').insert({ person_id: personId, role_id: roleId })
  if (error) throw surface('assign position', error)
}

/** Remove a Jabatan (Position) from a person (hard delete). */
export async function removeJabatan(personId: string, roleId: string): Promise<void> {
  const { error } = await shared().from('person_roles').delete().eq('person_id', personId).eq('role_id', roleId)
  if (error) throw surface('remove position', error)
}

// ── Revenue scope (supervisor) — reporting.supervisor_revenue_scope admin writes (FR-323) ──────────

/** Distinct live (channel, branch) options for the Revenue-scope picker (NFR-303). */
export async function listRevenueScopeOptions(): Promise<RevenueScopeOption[]> {
  const { data, error } = await reporting().rpc('list_revenue_branches')
  if (error) throw surface('load revenue branches', error)
  return (data ?? []) as RevenueScopeOption[]
}

/** Grant a supervisor revenue scope. branchCode null = the whole channel. Never sends org_id (DB stamps). */
export async function assignRevenueScope(personId: string, channel: string, branchCode: string | null): Promise<void> {
  const { error } = await reporting()
    .from('supervisor_revenue_scope')
    .insert({ person_id: personId, channel, branch_code: branchCode })
  if (error) throw surface('assign revenue scope', error)
}

/** Remove a supervisor revenue-scope grant (hard delete; null-safe on branch_code). */
export async function removeRevenueScope(personId: string, channel: string, branchCode: string | null): Promise<void> {
  let q = reporting().from('supervisor_revenue_scope').delete().eq('person_id', personId).eq('channel', channel)
  q = branchCode === null ? q.is('branch_code', null) : q.eq('branch_code', branchCode)
  const { error } = await q
  if (error) throw surface('remove revenue scope', error)
}

// ── Teams (shared.team_memberships) ───────────────────────────────────────────
// Admin-only at the database (20260826000001): membership is an authorization input for the Signal
// read gate and the team post/start gates, so no other access role may write it. There is no DELETE
// grant — removal is a soft end, which also frees the one-live-primary slot without losing history.

/** Every live team, with the (branch, activity) pair spelled out for the stream ones. */
export async function listTeams(): Promise<TeamOption[]> {
  const { data, error } = await shared()
    .from('teams')
    .select('id,name,branch_id,activity,archived_at')
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (error) throw surface('load teams', error)
  const rows = (data ?? []) as { id: string; name: string; branch_id: string | null; activity: string | null }[]

  // Branch names only matter for the stream teams; skip the read entirely when there are none.
  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter((b): b is string => b !== null))]
  const branchNameById = new Map<string, string>()
  if (branchIds.length > 0) {
    const { data: branches, error: bErr } = await shared().from('branches').select('id,name').in('id', branchIds)
    if (bErr) throw surface('load teams', bErr)
    for (const b of (branches ?? []) as { id: string; name: string }[]) branchNameById.set(b.id, b.name)
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    branch_name: r.branch_id === null ? null : branchNameById.get(r.branch_id) ?? null,
    activity: r.activity,
  }))
}

/**
 * Put a person on a team.
 *
 * Never sends org_id — the column defaults to shared.current_org_id() and the policy re-checks it,
 * so a client-supplied org is refused rather than trusted. `is_primary` is passed through: the
 * caller decides, and the partial unique index refuses a second live primary, which is why
 * `setPrimaryTeam` below ends the old one first rather than racing it.
 */
export async function addTeamMembership(personId: string, teamId: string, isPrimary: boolean): Promise<void> {
  const { error } = await shared()
    .from('team_memberships')
    .insert({ person_id: personId, team_id: teamId, is_primary: isPrimary })
  if (error) throw surface('add to team', error)
}

/**
 * Take a person off a team — a soft end, not a delete. There is no DELETE grant to fall back on.
 *
 * Goes through `shared.end_team_membership` rather than writing a date from here. `effective_to` is
 * an INCLUSIVE last day, so `= today` leaves every authorization gate still admitting the person
 * until tomorrow while this screen reports them removed; the cutoff also has to be the DATABASE's
 * today, not a browser's. The function is SECURITY INVOKER, so the admin-only UPDATE policy is
 * still what admits the caller.
 */
export async function endTeamMembership(personId: string, teamId: string): Promise<void> {
  const { error } = await shared().rpc('end_team_membership', {
    p_person_id: personId,
    p_team_id: teamId,
  })
  if (error) throw surface('remove from team', error)
}

/**
 * Make one of a person's live teams their home team.
 *
 * Two writes, in this order: clear the old primary FIRST, then set the new one. The reverse order
 * hits `team_memberships_one_primary` (unique on person_id where is_primary and effective_to is
 * null) and fails, so the sequence is load-bearing, not stylistic. Not a transaction: PostgREST has
 * no client-side one, and a failure between the two leaves the person with NO home team, which the
 * picker renders honestly and the admin can fix with one more click — strictly better than the
 * alternative of a definer RPC whose only job is to hide a two-step from a screen that shows it.
 */
export async function setPrimaryTeam(personId: string, teamId: string): Promise<void> {
  const { error: clearErr } = await shared()
    .from('team_memberships')
    .update({ is_primary: false })
    .eq('person_id', personId)
    .is('effective_to', null)
    .eq('is_primary', true)
  if (clearErr) throw surface('set home team', clearErr)

  // `.select()` so a zero-row match is visible. The primary slot is defined by
  // `is_primary and effective_to is null` — that is what shared.default_stream() and
  // ops.is_stream_reviewer read — so a membership the picker shows as live but which carries a
  // future end date cannot become the home team. Without this the old primary is already cleared
  // and the toast says success, which is the silent-no-op shape this whole slice exists to kill.
  const { data, error } = await shared()
    .from('team_memberships')
    .update({ is_primary: true })
    .eq('person_id', personId)
    .eq('team_id', teamId)
    // The SAME three clauses the read uses and the two gate functions carry. Tightening the read
    // to three while leaving this at two is the inverted silent no-op: a not-yet-started row would
    // be set primary successfully and then render as no home team at all. Unreachable through this
    // UI — nothing sends effective_from — but a write guard looser than the read that judges it is
    // the asymmetry this whole slice exists to remove.
    .is('effective_to', null)
    .lte('effective_from', new Date().toISOString().slice(0, 10))
    .select('id')
  if (error) throw surface('set home team', error)
  if ((data ?? []).length === 0) {
    throw new Error(
      "Couldn't set home team: that membership is already ending, so it can't be the home team. Remove it and add the team again.",
    )
  }
}

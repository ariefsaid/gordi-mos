import type { MessageKey } from '@/i18n/messages'

// Admin user management types — plan §3.1.
// LoginStatus: none (no user_id) | active | disabled (banned_until > now).
// AdminPersonRow: the merged view the SPA list renders.
// ASSIGNABLE_ROLES: the roles an admin can grant, including 'manager' (ADR-0050 — company-wide
// financial view; distinct from the derived reporting-line "manager" which is never stored).

export type LoginStatus = 'none' | 'active' | 'disabled'

export interface AdminPersonRow {
  id: string
  full_name: string
  email: string | null
  archived_at: string | null
  login: LoginStatus
  access_roles: string[] // non-revoked
  jabatan: { role_id: string; role_name: string }[]
  revenue_scope: RevenueScopeGrant[]
  /** Live team memberships (effective_to is null). At most one is_primary — the DB index holds it. */
  teams: TeamMembership[]
}

export interface CreatePersonInput {
  full_name: string
  email: string | null // null when "no email" → caller passes synthetic (FR-021)
  access_roles: string[] // never 'manager'
}

export const ASSIGNABLE_ROLES = ['member', 'ops_lead', 'admin', 'finance', 'manager', 'supervisor'] as const

// ROLE_META — single source of truth for human-readable role labels + descriptions.
// The DB stores/sends the SLUG (member | ops_lead | admin | finance | manager); only the
// DISPLAY uses these. Use ROLE_META everywhere a role renders (create-dialog checkboxes,
// RoleEditor toggles, RoleChips/Tag in the table) so slugs never leak to the UI.
export const ROLE_META: Record<string, { label: string; description: string }> = {
  member: { label: 'Member', description: 'Submits logs and updates' },
  ops_lead: { label: 'Ops Lead', description: 'Plans and approves' },
  admin: { label: 'Admin', description: 'Manages users and settings' },
  finance: { label: 'Finance', description: 'Sees financial reports' },
  manager: { label: 'Manager', description: 'Company-wide revenue & margin' },
  supervisor: { label: 'Supervisor', description: 'Revenue view for assigned branches' },
}

/** Human label for a role slug; falls back to the slug itself for unknown roles. */
export function roleLabel(slug: string): string {
  return ROLE_META[slug]?.label ?? slug
}

/** Human description for a role slug, or empty string if unknown. */
export function roleDescription(slug: string): string {
  return ROLE_META[slug]?.description ?? ''
}

/**
 * Locale-facing role label + description (#201, the Admin surfaces' i18n pass).
 * Known slugs route through the `admin.role.*` catalog keys (both locales); unknown slugs
 * keep the raw-slug fallback so nothing ever renders blank. Type-only i18n import — this
 * stays a lib module at runtime.
 *
 * ROLE_META above is the slug REGISTRY (which roles exist); the catalog is the COPY. Both
 * carry every slug in ASSIGNABLE_ROLES, and `admin-users.types.test.ts` asserts they agree,
 * so adding a role to one without the other fails a test rather than rendering a bare slug.
 */
export function localizedRoleMeta(
  slug: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): { label: string; description: string } {
  if (!(slug in ROLE_META)) return { label: slug, description: '' }
  return {
    label: t(`admin.role.${slug}` as MessageKey),
    description: t(`admin.role.${slug}.desc` as MessageKey),
  }
}

// ── Jabatan (Position) ────────────────────────────────────────────────────────
// A Jabatan/Position (shared.roles row) is distinct from an access role: it's an org-defined
// title (e.g. "Barista") assigned via shared.person_roles, with no bearing on permissions.

/** A row from shared.roles, for the Jabatan (Position) assignment picker. */
export interface RoleOption {
  id: string
  name: string
}

// ── Revenue scope (supervisor) ────────────────────────────────────────────────
// A `supervisor` sees revenue only for their granted (channel, branch) set —
// reporting.supervisor_revenue_scope. branch_code null = the whole channel.

/** A distinct live (channel, branch) from reporting.list_revenue_branches() — for the scope picker. */
export interface RevenueScopeOption {
  channel: string
  branch_code: string | null
  branch_name: string | null
}

/** A supervisor's granted scope; branch_code null = the whole channel. */
export interface RevenueScopeGrant {
  channel: string
  branch_code: string | null
}

// ── Teams (shared.team_memberships) ───────────────────────────────────────────
// A Team is org structure — a group under one Business Unit. A Team that also carries
// (branch, activity) IS a production stream (OD-WAY-49), and a person's live PRIMARY team is what
// resolves their default capture stream (AC-001) — which is why "home team" is a real control here
// and not decoration.
//
// Membership is also an AUTHORIZATION INPUT: mos.can_read_signal's R1 arm and the team post/start
// gates read it. Only `admin` may write it (20260826000001) — the picker below is admin-only
// because the whole /admin/people route is.

/** A team a person can be put on, from listTeams(). */
export interface TeamOption {
  id: string
  name: string
  /** Set together on a production-stream team; both null on an ordinary org team. */
  branch_name: string | null
  activity: string | null
}

/** One of a person's LIVE team memberships. */
export interface TeamMembership {
  team_id: string
  team_name: string
  is_primary: boolean
}

/** True when this team is a (branch, activity) production stream rather than plain org structure. */
export function isStreamTeam(team: TeamOption): boolean {
  return team.branch_name !== null && team.activity !== null
}

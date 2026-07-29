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

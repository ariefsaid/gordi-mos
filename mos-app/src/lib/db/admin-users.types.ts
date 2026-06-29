// Admin user management types — plan §3.1.
// LoginStatus: none (no user_id) | active | disabled (banned_until > now).
// AdminPersonRow: the merged view the SPA list renders.
// ASSIGNABLE_ROLES: the four roles an admin can grant; 'manager' is NEVER in this list (derived).

export type LoginStatus = 'none' | 'active' | 'disabled'

export interface AdminPersonRow {
  id: string
  full_name: string
  email: string | null
  archived_at: string | null
  login: LoginStatus
  access_roles: string[] // non-revoked, excludes derived 'manager'
}

export interface CreatePersonInput {
  full_name: string
  email: string | null // null when "no email" → caller passes synthetic (FR-021)
  access_roles: string[] // never 'manager'
}

export const ASSIGNABLE_ROLES = ['member', 'ops_lead', 'admin', 'finance'] as const

// ROLE_META — single source of truth for human-readable role labels + descriptions.
// The DB stores/sends the SLUG (member | ops_lead | admin | finance | manager); only the
// DISPLAY uses these. Use ROLE_META everywhere a role renders (create-dialog checkboxes,
// RoleEditor toggles, RoleChips/Tag in the table) so slugs never leak to the UI.
// 'manager' is derived (never assignable) but may still render in chips, so it's included.
export const ROLE_META: Record<string, { label: string; description: string }> = {
  member: { label: 'Member', description: 'Submits logs and updates' },
  ops_lead: { label: 'Ops Lead', description: 'Plans and approves' },
  admin: { label: 'Admin', description: 'Manages users and settings' },
  finance: { label: 'Finance', description: 'Sees financial reports' },
  manager: { label: 'Manager', description: 'Derived from team ownership' },
}

/** Human label for a role slug; falls back to the slug itself for unknown roles. */
export function roleLabel(slug: string): string {
  return ROLE_META[slug]?.label ?? slug
}

/** Human description for a role slug, or empty string if unknown. */
export function roleDescription(slug: string): string {
  return ROLE_META[slug]?.description ?? ''
}

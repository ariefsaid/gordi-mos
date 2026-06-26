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

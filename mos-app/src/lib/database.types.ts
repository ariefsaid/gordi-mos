// Minimal handwritten types for the `shared` schema rows this app reads (P1-3). No codegen yet.
// Source of truth: supabase/migrations/20260611000002_shared_directory.sql. Keep in sync by hand.
export interface PeopleRow {
  id: string
  org_id: string
  user_id: string | null
  full_name: string
  email: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}
export interface RolesRow {
  id: string
  org_id: string
  business_unit_id: string | null
  name: string
  reports_to_role_id: string | null
  created_at: string
  updated_at: string
}
export interface PersonRolesRow {
  id: string
  org_id: string
  person_id: string
  role_id: string
  created_at: string
}

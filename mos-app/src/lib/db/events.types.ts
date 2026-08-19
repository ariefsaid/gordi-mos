export interface EventRow {
  id: string
  org_id: string
  title: string
  venue: string
  is_outbound: boolean
  starts_at: string
  ends_at: string
  note: string | null
  business_unit_id: string | null
  coordinator_person_id: string | null
  created_by: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface EventWindow { startISO: string; endISO: string }

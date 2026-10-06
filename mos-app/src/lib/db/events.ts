import { supabase } from '@/lib/supabase'
import type { EventRow, EventWindow } from './events.types'

const mos = () => supabase.schema('mos')

const EVENT_COLUMNS = 'id,org_id,title,venue,is_outbound,starts_at,ends_at,note,business_unit_id,coordinator_person_id,created_by,archived_at,created_at,updated_at'
export const EVENTS_WINDOW_MAX_ROWS = 1000

/** List active Events overlapping a WIB calendar month. Org scope is enforced by RLS. */
export async function listEventsOverlapping(window: EventWindow): Promise<EventRow[]> {
  const { data, error } = await mos()
    .from('events')
    .select(EVENT_COLUMNS)
    .is('archived_at', null)
    .lt('starts_at', window.endISO)
    .gt('ends_at', window.startISO)
    .order('starts_at', { ascending: true })
    .order('title', { ascending: true })
    .limit(EVENTS_WINDOW_MAX_ROWS)
  if (error) throw new Error(`listEventsOverlapping failed — ${error.message}`)
  if ((data ?? []).length === EVENTS_WINDOW_MAX_ROWS) {
    throw new Error('listEventsOverlapping exceeded the safe row limit for this month')
  }
  return (data ?? []) as unknown as EventRow[]
}

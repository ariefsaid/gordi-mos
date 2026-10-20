import { supabase } from '@/lib/supabase'
import { keysetAfterFilter, keysetPageFromProbe } from './keyset-filter'
import type { EventRow, EventWindow } from './events.types'

const mos = () => supabase.schema('mos')

const EVENT_COLUMNS = 'id,org_id,title,venue,is_outbound,starts_at,ends_at,note,business_unit_id,coordinator_person_id,created_by,archived_at,created_at,updated_at'
export const EVENTS_PAGE_SIZE = 50
export type EventCursor = Pick<EventRow, 'starts_at' | 'id'>

export interface EventWindowPage {
  rows: EventRow[]
  nextCursor: EventCursor | null
  hasMore: boolean
}

/** List one bounded page of active Events overlapping a WIB calendar month. */
export async function listEventsOverlapping(window: EventWindow, before?: EventCursor | null): Promise<EventWindowPage> {
  let query = mos()
    .from('events')
    .select(EVENT_COLUMNS)
    .is('archived_at', null)
    .lt('starts_at', window.endISO)
    .gt('ends_at', window.startISO)
  if (before) query = query.or(keysetAfterFilter('starts_at', before.starts_at, before.id))
  const { data, error } = await query.order('starts_at', { ascending: true })
    .order('id', { ascending: true }).limit(EVENTS_PAGE_SIZE + 1)
  if (error) throw new Error(`listEventsOverlapping failed — ${error.message}`)
  return keysetPageFromProbe((data ?? []) as unknown as EventRow[], EVENTS_PAGE_SIZE,
    (row) => ({ starts_at: row.starts_at, id: row.id }))
}

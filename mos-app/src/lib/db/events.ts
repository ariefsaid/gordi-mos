import { supabase } from '@/lib/supabase'
import type { EventRow, EventWindow } from './events.types'

const mos = () => supabase.schema('mos')

/** List active Events overlapping a WIB calendar month. Org scope is enforced by RLS. */
export async function listEventsOverlapping(window: EventWindow): Promise<EventRow[]> {
  const { data, error } = await mos()
    .from('events')
    .select('*')
    .is('archived_at', null)
    .lt('starts_at', window.endISO)
    .gt('ends_at', window.startISO)
    .order('starts_at', { ascending: true })
    .order('title', { ascending: true })
  if (error) throw new Error(`listEventsOverlapping failed — ${error.message}`)
  return (data ?? []) as unknown as EventRow[]
}

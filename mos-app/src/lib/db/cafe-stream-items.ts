import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'

export type AvailableCafeStreamItem = { id: string; name: string; hidden: boolean }

export async function listAvailableCafeStreamItems(stream: ProductionStream): Promise<AvailableCafeStreamItem[]> {
  const [catalog, memberships] = await Promise.all([
    supabase.schema('ops').from('wip_items').select('id,name')
      .eq('reference_source', 'erp_catalog').eq('flag_active', true)
      .ilike('category', stream.activity).order('name'),
    supabase.schema('ops').from('stream_items').select('wip_item_id,hidden_at,is_listed')
      .eq('branch_id', stream.branch.id).eq('activity', stream.activity),
  ])
  const error = catalog.error ?? memberships.error
  if (error) throw new Error(`listAvailableCafeStreamItems failed: ${error.message}`)
  const existing = new Map(((memberships.data ?? []) as { wip_item_id: string; hidden_at: string | null; is_listed: boolean }[])
    .map(row => [row.wip_item_id, row]))
  return ((catalog.data ?? []) as { id: string; name: string }[]).flatMap(item => {
    const membership = existing.get(item.id)
    return membership && membership.hidden_at === null && membership.is_listed
      ? [] : [{ ...item, hidden: membership?.hidden_at != null }]
  })
}

export async function setCafeStreamItem(stream: ProductionStream, itemId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.schema('ops').rpc('set_cafe_stream_item', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
    p_wip_item_id: itemId,
    p_hidden: hidden,
  })
  if (error) throw new Error(`setCafeStreamItem failed: ${error.message}`)
}

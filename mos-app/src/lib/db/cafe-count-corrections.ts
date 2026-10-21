import { supabase } from '@/lib/supabase'

export async function refreshCafeCountExpected(lineId: string): Promise<void> {
  const { error } = await supabase.schema('ops').rpc('refresh_cafe_count_expected', { p_line_id: lineId })
  if (error) throw new Error(`refreshCafeCountExpected failed: ${error.message}`)
}

export async function startCafeCountCorrection(lineId: string, quantity: string, clientKey: string): Promise<string> {
  const { data, error } = await supabase.schema('ops').rpc('start_cafe_count_correction', {
    p_line_id: lineId, p_quantity: quantity, p_client_key: clientKey,
  })
  if (error) throw new Error(`startCafeCountCorrection failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.line_id !== 'string') throw new Error('startCafeCountCorrection failed: invalid response')
  return row.line_id
}

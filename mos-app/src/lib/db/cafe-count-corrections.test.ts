import { beforeEach, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { refreshCafeCountExpected, startCafeCountCorrection } from './cafe-count-corrections'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

it('refreshes through the reviewer action and starts a linked observation with a stable retry key', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ data: { line_id: 'correction' }, error: null })
  vi.mocked(supabase.schema).mockReturnValue({ rpc } as never)
  await expect(refreshCafeCountExpected('original')).resolves.toBeUndefined()
  await expect(startCafeCountCorrection('original', '3.25', 'retry-key')).resolves.toBe('correction')
  expect(rpc.mock.calls).toEqual([
    ['refresh_cafe_count_expected', { p_line_id: 'original' }],
    ['start_cafe_count_correction', { p_line_id: 'original', p_quantity: '3.25', p_client_key: 'retry-key' }],
  ])
})

it('reports server refusals and never treats a malformed correction answer as saved', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ error: { message: 'refused' } })
    .mockResolvedValueOnce({ error: { message: 'frozen' } }).mockResolvedValueOnce({ data: {}, error: null })
  vi.mocked(supabase.schema).mockReturnValue({ rpc } as never)
  await expect(refreshCafeCountExpected('original')).rejects.toThrow('refused')
  await expect(startCafeCountCorrection('original', '3', 'key')).rejects.toThrow('frozen')
  await expect(startCafeCountCorrection('original', '3', 'key')).rejects.toThrow('invalid response')
})

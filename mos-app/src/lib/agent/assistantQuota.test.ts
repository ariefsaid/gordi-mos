import { describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src
import { quotaModelClient } from '../../../../supabase/functions/_shared/assistantQuota'

const params = { model: 'test', max_tokens: 2048, messages: [{ role: 'user' as const, content: 'hello' }] }

describe('assistant model usage', () => {
  it('reserves usage before every provider call and fails closed on denial or database failure', async () => {
    const create = vi.fn(async () => ({ finish_reason: 'stop', message: { role: 'assistant' as const, content: 'ok' }, model: 'test' }))
    const rpc = vi.fn().mockResolvedValueOnce({ data: 'reservation', error: null }).mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: null }).mockRejectedValueOnce(new Error('unavailable'))
    const client = quotaModelClient({ create }, { schema: () => ({ rpc }) }, 'org', 'person')
    await expect(client.create(params)).resolves.toMatchObject({ model: 'test' })
    await expect(client.create(params)).rejects.toThrow()
    await expect(client.create(params)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(4)
  })

  it('refuses oversized model input before reservation and provider calls', async () => {
    const create = vi.fn()
    const rpc = vi.fn()
    const client = quotaModelClient({ create }, { schema: () => ({ rpc }) }, 'org', 'person')
    await expect(client.create({ ...params, messages: [{ role: 'user', content: 'x'.repeat(131_073) }] })).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
  it('releases a reservation after provider failure even when release fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('provider failed'))
    const rpc = vi.fn().mockResolvedValueOnce({ data: 'reservation', error: null }).mockRejectedValueOnce(new Error('release failed'))
    const client = quotaModelClient({ create }, { schema: () => ({ rpc }) }, 'org', 'person')
    await expect(client.create(params)).rejects.toThrow('provider failed')
    expect(rpc).toHaveBeenLastCalledWith('finish_assistant_usage', { p_id: 'reservation' })
  })

})

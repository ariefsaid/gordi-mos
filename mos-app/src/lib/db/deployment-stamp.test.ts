import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
const mockSchema = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { schema: mockSchema } }))

function queryResult(data: unknown, error: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  mockFrom.mockReturnValue(query)
  mockSchema.mockReturnValue({ from: mockFrom })
  return query
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('deployment stamp read', () => {
  it('reads the global stamp once and returns its backend identity', async () => {
    const data = { backend_sha: 'a'.repeat(40), deployed_at: '2026-10-19T12:00:00Z' }
    const query = queryResult(data, null)
    const { readDeploymentStamp } = await import('./deployment-stamp')

    const [first, second] = await Promise.all([readDeploymentStamp(), readDeploymentStamp()])

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockSchema).toHaveBeenCalledWith('shared')
    expect(mockFrom).toHaveBeenCalledWith('deployment_stamp')
    expect(query.select).toHaveBeenCalledWith('backend_sha, deployed_at')
    expect(query.eq).toHaveBeenCalledWith('id', true)
    expect(first).toEqual({ backendSha: data.backend_sha, deployedAt: data.deployed_at })
    expect(second).toEqual(first)
  })

  it('returns no stamp for a failed query', async () => {
    queryResult(null, { message: 'unavailable' })
    const { readDeploymentStamp } = await import('./deployment-stamp')

    await expect(readDeploymentStamp()).resolves.toBeNull()
    queryResult({ backend_sha: 'b'.repeat(40), deployed_at: '2026-10-19T12:00:00Z' }, null)
    await expect(readDeploymentStamp()).resolves.toMatchObject({ backendSha: 'b'.repeat(40) })
  })

  it('returns no stamp when the query rejects', async () => {
    const query = queryResult(null, null)
    query.maybeSingle.mockRejectedValue(new Error('unavailable'))
    const { readDeploymentStamp } = await import('./deployment-stamp')

    await expect(readDeploymentStamp()).resolves.toBeNull()
  })
})

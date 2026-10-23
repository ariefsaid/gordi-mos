import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcCalls = vi.hoisted(() => ({ schema: vi.fn(), rpc: vi.fn(), ranges: [] as Array<[number, number]> }))

vi.mock('@/lib/supabase', () => ({ supabase: { schema: rpcCalls.schema } }))

import {
  createCafeTransferRoute, listCafeRouteEsbSwitches, listCafeTransferRoutes, removeCafeTransferRoute, setCafeRouteRecordInEsb, updateCafeTransferRoute,
} from './cafe-transfer-routes'

const route = {
  origin_branch_id: 'origin',
  origin_activity: 'kitchen' as const,
  destination_branch_id: 'destination',
}
const row = {
  ...route,
  row_version: 2,
  updated_at: '2026-10-10T00:00:00Z',
  updated_by: 'person',
  eligibility: 'eligible',
  reason: null,
}
const context = { client_request_id: 'request' }

function query(result: { data: unknown; error: { code: string; message: string } | null }) {
  const builder = {
    range: vi.fn((from: number, to: number) => {
      rpcCalls.ranges.push([from, to])
      return builder
    }),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
  rpcCalls.ranges = []
  rpcCalls.schema.mockReturnValue({ rpc: rpcCalls.rpc })
})

describe('Cafe transfer route RPC client', () => {
  it('drains every ordered route page and parses versioned rows', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ ...row, destination_branch_id: `destination-${i}` }))
    rpcCalls.rpc.mockReturnValueOnce(query({ data: firstPage, error: null }))
      .mockReturnValueOnce(query({ data: [row], error: null }))

    const routes = await listCafeTransferRoutes()

    expect(routes).toHaveLength(1001)
    expect(routes[1000]).toMatchObject({ ...row, row_version: 2 })
    expect(rpcCalls.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(rpcCalls.rpc).toHaveBeenCalledWith('list_cafe_transfer_routes')
  })

  it('creates a route with only route facts and the caller request identity', async () => {
    rpcCalls.rpc.mockReturnValue(query({ data: [row], error: null }))

    await expect(createCafeTransferRoute(route, context)).resolves.toEqual({ ...row, row_version: 2 })
    expect(rpcCalls.rpc).toHaveBeenCalledWith('create_cafe_transfer_route', {
      p_input: route,
      p_client_request_id: context.client_request_id,
    })
  })

  it('updates by key and expected version, returning the server-stamped version', async () => {
    rpcCalls.rpc.mockReturnValue(query({ data: [row], error: null }))

    await expect(updateCafeTransferRoute(route, 1, route, context)).resolves.toMatchObject({ row_version: 2 })
    expect(rpcCalls.rpc).toHaveBeenCalledWith('update_cafe_transfer_route', {
      p_key: route,
      p_expected_version: 1,
      p_input: route,
      p_client_request_id: context.client_request_id,
    })
  })

  it('disables a route through the versioned remove RPC', async () => {
    rpcCalls.rpc.mockReturnValue(query({ data: null, error: null }))

    await expect(removeCafeTransferRoute(route, 2, context)).resolves.toBeUndefined()
    expect(rpcCalls.rpc).toHaveBeenCalledWith('remove_cafe_transfer_route', {
      p_key: route,
      p_expected_version: 2,
      p_client_request_id: context.client_request_id,
    })
  })

  it.each([
    ['42501', 'FORBIDDEN'], ['P0002', 'NOT_FOUND'], ['40001', 'CONFLICT'], ['22023', 'INVALID'],
  ] as const)('maps database code %s to typed %s', async (sqlState, code) => {
    rpcCalls.rpc.mockReturnValue(query({ data: null, error: { code: sqlState, message: 'database detail' } }))

    await expect(createCafeTransferRoute(route, context)).rejects.toMatchObject({ code })
  })

  it('rejects malformed server rows instead of presenting an incomplete route', async () => {
    rpcCalls.rpc.mockReturnValue(query({ data: [{ ...row, row_version: Number.MAX_SAFE_INTEGER + 1 }], error: null }))

    await expect(createCafeTransferRoute(route, context)).rejects.toMatchObject({ code: 'INVALID' })
  })

  it('reads and sets the admin-only Record in ESB switch', async () => {
    rpcCalls.rpc.mockReturnValueOnce(query({ data: [{ ...route, record_in_esb: false }], error: null }))
    await expect(listCafeRouteEsbSwitches()).resolves.toEqual([{ ...route, record_in_esb: false }])
    rpcCalls.rpc.mockReturnValueOnce(query({ data: { record_in_esb: true, row_version: 3 }, error: null }))
    await expect(setCafeRouteRecordInEsb(route, true)).resolves.toBe(true)
    expect(rpcCalls.rpc).toHaveBeenLastCalledWith('set_cafe_route_record_in_esb', { p_key: route, p_enabled: true })
  })

  it('reports a non-admin refusal as forbidden', async () => {
    rpcCalls.rpc.mockReturnValueOnce(query({ data: null, error: { code: '42501', message: 'CAFE_ROUTE_ESB_ADMIN_ONLY' } }))
    await expect(setCafeRouteRecordInEsb(route, true)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

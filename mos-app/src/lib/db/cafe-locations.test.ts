import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ schema: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { schema: mocks.schema } }))

import {
  archiveCafeLocation, createCafeLocation, fetchCafeLocationBalances, listCafeDestinationLocations, listCafeLocations,
  listCafeLocationsByIds, listCafeRecordLocations, moveCafeStock, updateCafeLocation,
} from './cafe-locations'

const schema = vi.mocked(mocks.schema)
const rpc = vi.mocked(mocks.rpc)
const location = (id: string) => ({
  id, name: `Location ${id}`, use: 'storage', parent_id: null, branch_ids: ['branch-1'], archived_at: null,
  row_version: 1, updated_at: '2026-10-10T10:00:00Z', updated_by: 'person-1',
})
const context = { client_request_id: 'request-1' }

beforeEach(() => {
  vi.clearAllMocks()
  schema.mockReturnValue({ rpc } as never)
})

function listResponse(rows: unknown[]) {
  const calls: [number, number][] = []
  rpc.mockImplementation((_name, args: { p_filter?: { ids?: string[] } }) => {
    const requested = args.p_filter?.ids
    const pageRows = requested ? rows.filter((row) => typeof row === 'object' && row !== null && requested.includes(String((row as Record<string, unknown>).id))) : rows
    const range = vi.fn((start: number, end: number) => {
      calls.push([start, end])
      return Promise.resolve({ data: pageRows.slice(start, end + 1), error: null })
    })
    return Object.assign(Promise.resolve({ data: null, error: null }), { range }) as never
  })
  return calls
}

describe('Café Locations client: site, activities and destinations', () => {
  it('reads Site and Activities from the location list and defaults them when absent', async () => {
    listResponse([{ ...location('a'), site_id: 'site-1', activities: ['kitchen'] }, location('b')])
    const [withSite, without] = await listCafeLocations()
    expect(withSite).toMatchObject({ site_id: 'site-1', activities: ['kitchen'] })
    expect(without).toMatchObject({ site_id: null, activities: [] })
  })

  it('sends Site and Activities with a save', async () => {
    rpc.mockResolvedValue({ data: { ...location('a'), site_id: 'site-1', activities: ['bar'] }, error: null })
    await createCafeLocation({ name: 'GHQ Bar', use: 'both', parent_id: null, branch_ids: ['branch-1'], site_id: 'site-1', activities: ['bar'] }, context)
    expect(rpc).toHaveBeenCalledWith('create_cafe_location', expect.objectContaining({
      p_input: expect.objectContaining({ site_id: 'site-1', activities: ['bar'] }),
    }))
  })

  it('lists where a stream may send, own branch first', async () => {
    rpc.mockResolvedValue({ data: [{ location_id: 'out', name: 'RRS Outlet', branch_id: 'rrs', same_branch: true }], error: null })
    await expect(listCafeDestinationLocations('rrs', 'kitchen')).resolves.toEqual([
      { location_id: 'out', name: 'RRS Outlet', branch_id: 'rrs', same_branch: true },
    ])
    expect(rpc).toHaveBeenCalledWith('list_cafe_destination_locations', { p_branch_id: 'rrs', p_activity: 'kitchen' })
  })
})

describe('Café Locations client', () => {
  it('exhausts list pages and preserves the caller filter', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => location(`loc-${index}`))
    const range = listResponse(rows)
    const result = await listCafeLocations({ branch_id: 'branch-1', archived: false })
    expect(result).toHaveLength(201)
    expect(result[0].row_version).toBe(1)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('list_cafe_locations', { p_filter: { branch_id: 'branch-1', archived: false } })
    expect(range).toEqual([[0, 199], [200, 399]])
  })

  it('carries the designated own-output place from the location catalog', async () => {
    listResponse([{ ...location('central'), is_stream_output: true }])
    expect((await listCafeLocations())[0].is_stream_output).toBe(true)
  })

  it('looks up stored IDs in bounded batches without dropping archived identities', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({ ...location(`loc-${index}`), archived_at: '2026-10-01T00:00:00Z' }))
    const range = listResponse(rows)
    const result = await listCafeLocationsByIds(Array.from({ length: 201 }, (_, index) => `loc-${index}`))
    expect(result).toHaveLength(201)
    expect(result.every((row) => row.archived_at !== null)).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc.mock.calls[0]).toEqual(['list_cafe_locations', { p_filter: { ids: Array.from({ length: 200 }, (_, index) => `loc-${index}`) } }])
    expect(range).toEqual([[0, 199], [200, 399], [0, 199]])
  })

  it('maps catalog writes to versioned RPC arguments and parses returned identities', async () => {
    const saved = location('loc-1')
    rpc.mockResolvedValue({ data: saved, error: null } as never)
    const input = { name: 'Prep room', use: 'storage' as const, parent_id: null, branch_ids: ['branch-1'] }
    await expect(createCafeLocation(input, context)).resolves.toMatchObject({ id: 'loc-1', row_version: 1 })
    expect(rpc).toHaveBeenCalledWith('create_cafe_location', { p_input: input, p_client_request_id: 'request-1' })
    await updateCafeLocation('loc-1', 4, input, context)
    expect(rpc).toHaveBeenLastCalledWith('update_cafe_location', { p_id: 'loc-1', p_expected_version: 4, p_input: input, p_client_request_id: 'request-1' })
    await archiveCafeLocation('loc-1', 5, context)
    expect(rpc).toHaveBeenLastCalledWith('archive_cafe_location', { p_id: 'loc-1', p_expected_version: 5, p_client_request_id: 'request-1' })
  })

  it('returns decimal quantities as strings and preserves honest unallocated coverage', async () => {
    rpc.mockResolvedValue({ data: {
      rows: [{ location_id: null, item_id: 'item-1', item_unit_id: 'unit-1', usable_qty: '0.1000', available_qty: '0.0500' }],
      as_of: '2026-10-10T10:00:00Z', coverage: 'unallocated', reason: 'opening_allocation_required',
    }, error: null } as never)
    await expect(fetchCafeLocationBalances('2026-10-10', { branch_id: 'branch-1', activity: 'kitchen' })).resolves.toEqual({
      rows: [{ location_id: null, item_id: 'item-1', item_unit_id: 'unit-1', usable_qty: '0.1000', available_qty: '0.0500' }],
      as_of: '2026-10-10T10:00:00Z', coverage: 'unallocated', reason: 'opening_allocation_required',
    })
    expect(rpc).toHaveBeenCalledWith('cafe_location_balances', { p_as_of: '2026-10-10', p_branch_id: 'branch-1', p_activity: 'kitchen' })
  })

  it('keeps Move stock in its stream and sends the caller idempotency key', async () => {
    rpc.mockResolvedValue({ data: { movement_id: 'move-1', row_version: 1 }, error: null } as never)
    const input = {
      stream: { branch_id: 'branch-1', activity: 'bar' as const }, item_unit_id: 'unit-1', quantity: '1.2500',
      from_location_id: 'from-1', to_location_id: 'to-1', movement_date: '2026-10-10', note: null,
    }
    await expect(moveCafeStock(input, context)).resolves.toEqual({ movement_id: 'move-1', row_version: 1 })
    expect(rpc).toHaveBeenCalledWith('move_cafe_stock', { p_input: input, p_client_request_id: 'request-1' })
  })

  it('reads record locations in bounded calls and preserves null as unassigned', async () => {
    rpc.mockResolvedValue({ data: [{ record_id: 'log-1', production_location_id: null, from_storage_location_id: null, to_storage_location_id: null, storage_location_id: null }], error: null } as never)
    await expect(listCafeRecordLocations('log', ['log-1'])).resolves.toEqual([{
      record_id: 'log-1', source: 'log', production_location_id: null, from_storage_location_id: null,
      to_storage_location_id: null, storage_location_id: null,
    }])
    expect(rpc).toHaveBeenCalledWith('cafe_record_locations', { p_source: 'log', p_ids: ['log-1'] })
  })

  it('maps permission, conflict and in-use SQL failures to stable typed errors', async () => {
    const forbidden = { code: '42501', message: 'CAFE_LOCATION_FORBIDDEN' }
    rpc.mockImplementationOnce(() => Object.assign(Promise.resolve({ data: null, error: forbidden }), {
      range: () => Promise.resolve({ data: null, error: forbidden }),
    }) as never)
    await expect(listCafeLocations()).rejects.toMatchObject({ name: 'ContractError', code: 'FORBIDDEN' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'CAFE_LOCATION_DUPLICATE' } } as never)
    await expect(createCafeLocation({ name: 'x', use: 'both', parent_id: null, branch_ids: [] }, context))
      .rejects.toMatchObject({ name: 'ContractError', code: 'CONFLICT', message: 'CAFE_LOCATION_DUPLICATE' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'CAFE_LOCATION_IN_USE' } } as never)
    await expect(archiveCafeLocation('loc-1', 1, context)).rejects.toMatchObject({ name: 'ContractError', code: 'IN_USE' })
  })
})

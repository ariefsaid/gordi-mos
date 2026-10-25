import { supabase } from '@/lib/supabase'
import { ContractError, type Decimal, type UUID, type WriteContext } from './contract'

const PAGE_SIZE = 200
const ID_BATCH_SIZE = 200

export type LocationUse = 'production' | 'storage' | 'both'
export type CafeLocation = {
  id: UUID; name: string; use: LocationUse; parent_id: UUID | null
  branch_ids: UUID[]; archived_at: string | null; row_version: number
  updated_at: string; updated_by: UUID | null
  /** Physically at (a Site). */
  site_id: UUID | null
  /** Activities it works in; a production location has exactly one. */
  activities: string[]
}
/** `site_id` and `activities` left out keep the current values on an update. */
export type LocationInput = Pick<CafeLocation, 'name' | 'use' | 'parent_id' | 'branch_ids'>
  & Partial<Pick<CafeLocation, 'site_id' | 'activities'>>
export type LocationFilter = { branch_id?: UUID; use?: LocationUse; archived?: boolean }
export type StreamRef = { branch_id: UUID; activity: 'kitchen' | 'bar' }

type RpcError = { code?: string; message?: string }

function contractError(operation: string, error: RpcError): ContractError {
  const message = error.message ?? ''
  const token = message.match(/CAFE_LOCATION_[A-Z_]+/)?.[0] ?? ''
  const code = error.code === '42501' || token.endsWith('_FORBIDDEN') ? 'FORBIDDEN'
    : error.code === 'P0002' || token.endsWith('_NOT_FOUND') ? 'NOT_FOUND'
      : error.code === 'P0001' || token.endsWith('_IN_USE') ? 'IN_USE'
        : error.code === '23505' || error.code === '40001' || token.includes('CONFLICT') || token.endsWith('_DUPLICATE') ? 'CONFLICT'
          : 'INVALID'
  return new ContractError(code, token || `${operation} failed`)
}

function asObject(value: unknown, operation: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ContractError('INVALID', `${operation} returned invalid data`)
  return value as Record<string, unknown>
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ContractError('INVALID', `Invalid ${field} returned by Locations`)
  return value
}

function asNullableString(value: unknown, field: string): string | null {
  return value === null ? null : asString(value, field)
}

function asRowVersion(value: unknown): number {
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version < 1) throw new ContractError('INVALID', 'Invalid row version returned by Locations')
  return version
}

function parseLocation(value: unknown): CafeLocation {
  const row = asObject(value, 'Locations')
  if (!Array.isArray(row.branch_ids) || !row.branch_ids.every((id) => typeof id === 'string')) throw new ContractError('INVALID', 'Invalid branch availability returned by Locations')
  if (row.use !== 'production' && row.use !== 'storage' && row.use !== 'both') throw new ContractError('INVALID', 'Invalid location use returned by Locations')
  return {
    id: asString(row.id, 'location id'),
    name: asString(row.name, 'location name'),
    use: row.use,
    parent_id: asNullableString(row.parent_id, 'parent id'),
    branch_ids: row.branch_ids as UUID[],
    archived_at: asNullableString(row.archived_at, 'archive timestamp'),
    row_version: asRowVersion(row.row_version),
    updated_at: asString(row.updated_at, 'updated timestamp'),
    updated_by: asNullableString(row.updated_by, 'updated person'),
    site_id: row.site_id == null ? null : asString(row.site_id, 'site id'),
    activities: Array.isArray(row.activities) ? row.activities.map((code) => asString(code, 'activity')) : [],
  }
}

async function readLocationRows(filter: Record<string, unknown>): Promise<CafeLocation[]> {
  const rows: CafeLocation[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.schema('ops').rpc('list_cafe_locations', { p_filter: filter }).range(offset, offset + PAGE_SIZE - 1)
    if (error) throw contractError('listCafeLocations', error)
    const page = (data ?? []) as unknown[]
    rows.push(...page.map(parseLocation))
    if (page.length < PAGE_SIZE) return rows
  }
}

export async function listCafeLocations(filter: LocationFilter = {}): Promise<CafeLocation[]> {
  return readLocationRows(filter as Record<string, unknown>)
}

export async function listCafeLocationsByIds(ids: readonly UUID[]): Promise<CafeLocation[]> {
  const uniqueIds = [...new Set(ids)]
  const rows: CafeLocation[] = []
  for (let index = 0; index < uniqueIds.length; index += ID_BATCH_SIZE) {
    rows.push(...await readLocationRows({ ids: uniqueIds.slice(index, index + ID_BATCH_SIZE) }))
  }
  return rows
}

async function writeLocation(operation: string, rpc: string, args: Record<string, unknown>): Promise<CafeLocation> {
  const { data, error } = await supabase.schema('ops').rpc(rpc, args)
  if (error) throw contractError(operation, error)
  return parseLocation(data)
}

export async function createCafeLocation(input: LocationInput, ctx: WriteContext): Promise<CafeLocation> {
  return writeLocation('createCafeLocation', 'create_cafe_location', { p_input: input, p_client_request_id: ctx.client_request_id })
}

export async function updateCafeLocation(id: UUID, version: number, input: LocationInput, ctx: WriteContext): Promise<CafeLocation> {
  return writeLocation('updateCafeLocation', 'update_cafe_location', {
    p_id: id, p_expected_version: version, p_input: input, p_client_request_id: ctx.client_request_id,
  })
}

export async function archiveCafeLocation(id: UUID, version: number, ctx: WriteContext): Promise<CafeLocation> {
  return writeLocation('archiveCafeLocation', 'archive_cafe_location', {
    p_id: id, p_expected_version: version, p_client_request_id: ctx.client_request_id,
  })
}

type LocationBalance = {
  location_id: UUID | null; item_id: UUID; item_unit_id: UUID
  usable_qty: Decimal | null; available_qty: Decimal | null
}
export type LocationBalances = {
  rows: LocationBalance[]; as_of: string
  coverage: 'complete' | 'unallocated' | 'unavailable'; reason: string | null
}

export async function fetchCafeLocationBalances(asOf: string, stream: StreamRef): Promise<LocationBalances> {
  const { data, error } = await supabase.schema('ops').rpc('cafe_location_balances', {
    p_as_of: asOf, p_branch_id: stream.branch_id, p_activity: stream.activity,
  })
  if (error) throw contractError('fetchCafeLocationBalances', error)
  const result = asObject(data, 'fetchCafeLocationBalances')
  if (!Array.isArray(result.rows) || (result.coverage !== 'complete' && result.coverage !== 'unallocated' && result.coverage !== 'unavailable')) {
    throw new ContractError('INVALID', 'Invalid location balances returned')
  }
  const rows = result.rows.map((raw): LocationBalance => {
    const row = asObject(raw, 'location balance')
    return {
      location_id: asNullableString(row.location_id, 'location id'),
      item_id: asString(row.item_id, 'item id'),
      item_unit_id: asString(row.item_unit_id, 'item unit id'),
      usable_qty: row.usable_qty === null ? null : asString(row.usable_qty, 'usable quantity'),
      available_qty: row.available_qty === null ? null : asString(row.available_qty, 'available quantity'),
    }
  })
  return {
    rows,
    as_of: asString(result.as_of, 'balance timestamp'),
    coverage: result.coverage,
    reason: asNullableString(result.reason, 'balance reason'),
  }
}

export type MoveStockInput = {
  stream: StreamRef; item_unit_id: UUID; quantity: Decimal
  from_location_id: UUID; to_location_id: UUID; movement_date: string; note: string | null
}

export async function moveCafeStock(input: MoveStockInput, ctx: WriteContext): Promise<{ movement_id: UUID; row_version: number }> {
  const { data, error } = await supabase.schema('ops').rpc('move_cafe_stock', {
    p_input: input, p_client_request_id: ctx.client_request_id,
  })
  if (error) throw contractError('moveCafeStock', error)
  const result = asObject(data, 'moveCafeStock')
  return { movement_id: asString(result.movement_id, 'movement id'), row_version: asRowVersion(result.row_version) }
}

export type PlaceStockInput = {
  stream: StreamRef; to_location_id: UUID; as_of: string; item_unit_id?: UUID; quantity?: Decimal
}

/** Opening allocation: places unassigned stream stock at a place (ops lead or admin). */
export async function placeCafeUnassignedStock(input: PlaceStockInput, ctx: WriteContext): Promise<{ rows_written: number }> {
  const { data, error } = await supabase.schema('ops').rpc('place_cafe_unassigned_stock', {
    p_input: input, p_client_request_id: ctx.client_request_id,
  })
  if (error) throw contractError('placeCafeUnassignedStock', error)
  const result = asObject(data, 'placeCafeUnassignedStock')
  return { rows_written: Number(result.rows_written ?? 0) }
}

export type CaptureLocations = {
  production_location_id?: UUID | null
  from_storage_location_id?: UUID | null
  to_storage_location_id?: UUID | null
}
export type RecordLocations = CaptureLocations & {
  storage_location_id?: UUID | null; record_id: UUID; source: 'log' | 'count' | 'receipt' | 'move'
}

export async function listCafeRecordLocations(source: RecordLocations['source'], ids: readonly UUID[]): Promise<RecordLocations[]> {
  const uniqueIds = [...new Set(ids)]
  const records: RecordLocations[] = []
  for (let index = 0; index < uniqueIds.length; index += ID_BATCH_SIZE) {
    const { data, error } = await supabase.schema('ops').rpc('cafe_record_locations', {
      p_source: source, p_ids: uniqueIds.slice(index, index + ID_BATCH_SIZE),
    })
    if (error) throw contractError('listCafeRecordLocations', error)
    for (const raw of (data ?? []) as unknown[]) {
      const row = asObject(raw, 'listCafeRecordLocations')
      records.push({
        record_id: asString(row.record_id, 'record id'), source,
        production_location_id: asNullableString(row.production_location_id, 'production location'),
        from_storage_location_id: asNullableString(row.from_storage_location_id, 'source storage location'),
        to_storage_location_id: asNullableString(row.to_storage_location_id, 'destination storage location'),
        storage_location_id: asNullableString(row.storage_location_id, 'storage location'),
      })
    }
  }
  return records
}

export type CafeSite = { id: UUID; name: string }

/** Sites a Location can be physically at (read-only; Sites are org structure). */
export async function listCafeSites(): Promise<CafeSite[]> {
  const { data, error } = await supabase.schema('shared').from('sites').select('id,name').is('archived_at', null).order('name')
  if (error) throw contractError('listCafeSites', error)
  return ((data ?? []) as unknown[]).map((raw) => {
    const row = asObject(raw, 'listCafeSites')
    return { id: asString(row.id, 'site id'), name: asString(row.name, 'site name') }
  })
}

export type DestinationLocation = { location_id: UUID; name: string; branch_id: UUID; same_branch: boolean }

/**
 * Where a stream can send: its own branch's storage Locations, the Locations physically at the branch's
 * Site, then the Locations of routed branches.
 */
export async function listCafeDestinationLocations(branchId: UUID, activity: string): Promise<DestinationLocation[]> {
  const { data, error } = await supabase.schema('ops').rpc('list_cafe_destination_locations', {
    p_branch_id: branchId, p_activity: activity,
  })
  if (error) throw contractError('listCafeDestinationLocations', error)
  return ((data ?? []) as unknown[]).map((raw) => {
    const row = asObject(raw, 'listCafeDestinationLocations')
    return {
      location_id: asString(row.location_id, 'location id'),
      name: asString(row.name, 'location name'),
      branch_id: asString(row.branch_id, 'branch id'),
      same_branch: row.same_branch === true,
    }
  })
}

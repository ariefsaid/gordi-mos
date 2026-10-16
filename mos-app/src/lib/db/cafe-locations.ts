// Locations — typed client stubs for the proposed physical-place catalog, capture stamps, balances and Change location.
// DISCONNECTED: no location table, balance or ledger exists yet. Every function here throws a typed
// UNAVAILABLE error and must NOT be called while the backend is absent; the preview screens read real
// branches through the existing branch catalog and keep every edit in memory only.
// Contract: R/handover/locations.md. No schema, permission or write is added by this file.

/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters mirror the handover signatures; nothing is called until the backend is connected */
import { unavailable, type Decimal, type UUID, type WriteContext } from './contract'

// HANDOVER: R/handover/locations.md §TypeScript contracts — proposed src/lib/db/cafe-locations.ts
export type LocationUse = 'production' | 'storage' | 'both'
export type CafeLocation = {
  id: UUID; name: string; use: LocationUse; parent_id: UUID | null
  branch_ids: UUID[]; archived_at: string | null; row_version: number
  updated_at: string; updated_by: UUID | null
}
export type LocationInput = Pick<CafeLocation, 'name' | 'use' | 'parent_id' | 'branch_ids'>
export type LocationFilter = { branch_id?: UUID; use?: LocationUse; archived?: boolean }
export type StreamRef = { branch_id: UUID; activity: 'kitchen' | 'bar' }

// HANDOVER: R/handover/locations.md §TypeScript contracts — ops.list_cafe_locations(p_filter jsonb); exhausts pages, keeps archived identities
export async function listCafeLocations(_filter?: LocationFilter): Promise<CafeLocation[]> {
  return unavailable('listCafeLocations')
}

// HANDOVER: R/handover/locations.md §TypeScript contracts — historical lookup by stored IDs, no active filter
export async function listCafeLocationsByIds(_ids: readonly UUID[]): Promise<CafeLocation[]> {
  return unavailable('listCafeLocationsByIds')
}

// HANDOVER: R/handover/locations.md §Read/write and RLS — ops.create_cafe_location(p_input, p_client_request_id); admin only (cafe.locations.manage)
export async function createCafeLocation(_input: LocationInput, _ctx: WriteContext): Promise<CafeLocation> {
  return unavailable('createCafeLocation')
}

// HANDOVER: R/handover/locations.md §Read/write and RLS — ops.update_cafe_location(p_id, p_expected_version, p_input, p_client_request_id)
export async function updateCafeLocation(_id: UUID, _version: number, _input: LocationInput, _ctx: WriteContext): Promise<CafeLocation> {
  return unavailable('updateCafeLocation')
}

// HANDOVER: R/handover/locations.md §Tables / columns / constraints — ops.archive_cafe_location; blocked for nonzero balances, active children, pending references; never a hard delete
export async function archiveCafeLocation(_id: UUID, _version: number, _ctx: WriteContext): Promise<CafeLocation> {
  return unavailable('archiveCafeLocation')
}

// HANDOVER: R/handover/locations.md §TypeScript contracts — CaptureLocations stamped on each capture line; null = Unassigned / Not recorded
type CaptureLocations = {
  production_location_id?: UUID | null
  from_storage_location_id?: UUID | null
  to_storage_location_id?: UUID | null
}
type LocationBalance = {
  location_id: UUID | null; item_id: UUID; item_unit_id: UUID
  usable_qty: Decimal | null; available_qty: Decimal | null
}
export type LocationBalances = {
  rows: LocationBalance[]; as_of: string
  coverage: 'complete' | 'unallocated' | 'unavailable'; reason: string | null
}

// HANDOVER: R/handover/locations.md §Read/write and RLS — ops.cafe_location_balances(p_as_of, p_branch_id, p_activity); totals must tie to the stream balance, gaps stay unavailable
export async function fetchCafeLocationBalances(_asOf: string, _stream: StreamRef): Promise<LocationBalances> {
  return unavailable('fetchCafeLocationBalances')
}

export type MoveStockInput = {
  stream: StreamRef; item_unit_id: UUID; quantity: Decimal
  from_location_id: UUID; to_location_id: UUID; movement_date: string; note: string | null
}

// HANDOVER: R/handover/locations.md §Read/write and RLS — ops.move_cafe_stock(p_input, p_client_request_id); balanced, same stream, no ESB job
export async function moveCafeStock(_input: MoveStockInput, _ctx: WriteContext): Promise<{ movement_id: UUID; row_version: number }> {
  return unavailable('moveCafeStock')
}

export type RecordLocations = CaptureLocations & { record_id: UUID; source: 'log' | 'count' | 'receipt' | 'move' }

// HANDOVER: R/handover/locations.md §Read/write and RLS — ops.cafe_record_locations(p_source, p_ids); intersects parent read grants
export async function listCafeRecordLocations(_source: RecordLocations['source'], _ids: readonly UUID[]): Promise<RecordLocations[]> {
  return unavailable('listCafeRecordLocations')
}

// HANDOVER: R/handover/locations.md §Tables / columns / constraints — ops.get_cafe_stream_location_defaults / save_cafe_stream_location_defaults (a convenience, never authority)
export type StreamLocationDefaults = { production_location_id: UUID | null; storage_location_id: UUID | null; row_version: number }
export async function getCafeStreamLocationDefaults(_stream: StreamRef): Promise<StreamLocationDefaults | null> {
  return unavailable('getCafeStreamLocationDefaults')
}
export async function saveCafeStreamLocationDefaults(
  _stream: StreamRef, _defaults: { production_location_id: UUID | null; storage_location_id: UUID | null }, _version: number, _ctx: WriteContext,
): Promise<{ row_version: number }> {
  return unavailable('saveCafeStreamLocationDefaults')
}

import { supabase } from '@/lib/supabase'
import type { CafeDestination } from './kitchen-logs.types'
import { ContractError, type UUID, type WriteContext } from './contract'

export type TransferRouteKey = CafeDestination
export type TransferRoute = CafeDestination & {
  row_version: number
  updated_at: string
  updated_by: UUID | null
  eligibility: 'eligible' | 'needs_attention'
  reason: string | null
}
export type TransferRouteInput = CafeDestination

interface RpcError {
  code?: string
  message: string
}

interface RpcResult {
  data: unknown
  error: RpcError | null
}

interface RpcQuery extends PromiseLike<RpcResult> {
  range(from: number, to: number): RpcQuery
}

interface OpsClient {
  rpc(name: string, args?: Record<string, unknown>): RpcQuery
}

const ops = () => supabase.schema('ops') as unknown as OpsClient
const PAGE_SIZE = 1000

function contractError(name: string, error: RpcError): ContractError {
  const code = error.code === '42501' ? 'FORBIDDEN'
    : error.code === 'P0002' ? 'NOT_FOUND'
      : error.code === '40001' ? 'CONFLICT'
        : ['22023', '22P02', '23514', '23505'].includes(error.code ?? '') ? 'INVALID'
          : 'UNAVAILABLE'
  return new ContractError(code, `${name} failed`)
}

function parseRoute(value: unknown): TransferRoute {
  if (!value || typeof value !== 'object') throw new ContractError('INVALID', 'Transfer route response is invalid')
  const row = value as Record<string, unknown>
  const version = Number(row.row_version)
  if (typeof row.origin_branch_id !== 'string' || (row.origin_activity !== 'kitchen' && row.origin_activity !== 'bar') ||
      typeof row.destination_branch_id !== 'string' || !Number.isSafeInteger(version) || version < 1 ||
      typeof row.updated_at !== 'string' || (row.updated_by !== null && typeof row.updated_by !== 'string') ||
      (row.eligibility !== 'eligible' && row.eligibility !== 'needs_attention') ||
      (row.reason !== null && typeof row.reason !== 'string')) {
    throw new ContractError('INVALID', 'Transfer route response is invalid')
  }
  return {
    origin_branch_id: row.origin_branch_id,
    origin_activity: row.origin_activity,
    destination_branch_id: row.destination_branch_id,
    row_version: version,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    eligibility: row.eligibility,
    reason: row.reason,
  }
}

function routeFromMutation(name: string, result: RpcResult): TransferRoute {
  if (result.error) throw contractError(name, result.error)
  const value = Array.isArray(result.data) ? result.data[0] : result.data
  if (!value) throw new ContractError('INVALID', `${name} returned no transfer route`)
  return parseRoute(value)
}

export async function listCafeTransferRoutes(): Promise<TransferRoute[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await ops().rpc('list_cafe_transfer_routes').range(from, from + PAGE_SIZE - 1)
    if (error) throw contractError('listCafeTransferRoutes', error)
    if (!Array.isArray(data)) throw new ContractError('INVALID', 'listCafeTransferRoutes returned an invalid response')
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows.map(parseRoute)
  }
}

export async function createCafeTransferRoute(input: TransferRouteInput, ctx: WriteContext): Promise<TransferRoute> {
  return routeFromMutation('createCafeTransferRoute', await ops().rpc('create_cafe_transfer_route', {
    p_input: input,
    p_client_request_id: ctx.client_request_id,
  }))
}

export async function updateCafeTransferRoute(
  key: TransferRouteKey, expectedVersion: number, input: TransferRouteInput, ctx: WriteContext,
): Promise<TransferRoute> {
  return routeFromMutation('updateCafeTransferRoute', await ops().rpc('update_cafe_transfer_route', {
    p_key: key,
    p_expected_version: expectedVersion,
    p_input: input,
    p_client_request_id: ctx.client_request_id,
  }))
}

export async function removeCafeTransferRoute(
  key: TransferRouteKey, expectedVersion: number, ctx: WriteContext,
): Promise<void> {
  const { error } = await ops().rpc('remove_cafe_transfer_route', {
    p_key: key,
    p_expected_version: expectedVersion,
    p_client_request_id: ctx.client_request_id,
  })
  if (error) throw contractError('removeCafeTransferRoute', error)
}

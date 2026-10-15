// Transfer routes — typed client stubs for the proposed editable cross-branch allowlist.
// DISCONNECTED: the backend functions do not exist yet. Every function here throws a typed
// UNAVAILABLE error and must NOT be called while the backend is absent; the preview screen reads
// routes through the existing `listCafeDestinations()` and keeps edits in memory only.
// Contract: R/handover/transfer-routes.md. No schema, permission or write is added by this file.

import type { CafeDestination } from './kitchen-logs.types'
/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters mirror the handover signatures; nothing is called until the backend is connected */
import { unavailable, type UUID, type WriteContext } from './contract'

// HANDOVER: R/handover/transfer-routes.md §TypeScript contract — proposed src/lib/db/cafe-transfer-routes.ts
export type TransferRouteKey = CafeDestination
export type TransferRoute = CafeDestination & {
  row_version: number
  updated_at: string
  updated_by: UUID | null
  eligibility: 'eligible' | 'needs_attention'
  reason: string | null
}
export type TransferRouteInput = CafeDestination

// HANDOVER: R/handover/transfer-routes.md §Permission / writes — ops.list_cafe_transfer_routes()
export async function listCafeTransferRoutes(): Promise<TransferRoute[]> {
  return unavailable('listCafeTransferRoutes')
}

// HANDOVER: R/handover/transfer-routes.md §Permission / writes — ops.create_cafe_transfer_route
export async function createCafeTransferRoute(_input: TransferRouteInput, _ctx: WriteContext): Promise<TransferRoute> {
  return unavailable('createCafeTransferRoute')
}

// HANDOVER: R/handover/transfer-routes.md §Permission / writes — ops.update_cafe_transfer_route (expected version; key change is atomic)
export async function updateCafeTransferRoute(
  _key: TransferRouteKey, _expectedVersion: number, _input: TransferRouteInput, _ctx: WriteContext,
): Promise<TransferRoute> {
  return unavailable('updateCafeTransferRoute')
}

// HANDOVER: R/handover/transfer-routes.md §Permission / writes — ops.remove_cafe_transfer_route (blocks new submissions only)
export async function removeCafeTransferRoute(_key: TransferRouteKey, _expectedVersion: number, _ctx: WriteContext): Promise<void> {
  return unavailable('removeCafeTransferRoute')
}

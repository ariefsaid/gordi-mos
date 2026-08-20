// shared.default_stream() — the caller's default production stream (FR-001, AC-001).
//
// The RPC returns at most one row — the (branch_id, activity) of the caller's LIVE
// primary Team membership — with NULL halves when that team is not a stream team, and
// no row when no live primary membership exists. Both empty shapes mean the same thing
// here: no default (FR-002 — the surface must then choose explicitly).
//
// THE one person-scoped resolver (#234 consolidation): the capture page and the stock
// page both read it from here. A twin briefly lived in kitchen-logs.ts (#266's raw
// StreamPair shape, no payload validation); this shape-validated one won and the twin
// was deleted — two resolvers for the same fact is how they drift.

import { supabase } from '@/lib/supabase'
import type { BranchOption, ProductionActivity, ProductionStream } from './kitchen-logs.types'
import { PRODUCTION_ACTIVITIES } from './kitchen-logs.types'

interface DefaultStreamRow {
  branch_id: string | null
  activity: string | null
}

/**
 * Resolve the caller's default stream against an already-loaded branch catalog.
 * Null when the RPC yields no usable pair — no live primary membership, a non-stream
 * primary team (NULL halves), a branch missing from the active catalog (archived), or
 * an activity outside the production set — a set asserted equal to the shared.activities
 * catalog (production-activities-catalog-drift.test.ts, #392), so it cannot silently
 * go stale. Throws only on a transport/RPC error, so a
 * caller can distinguish "no default" (pick a fallback) from "could not ask".
 */
export async function fetchDefaultStream(
  branches: readonly BranchOption[],
): Promise<ProductionStream | null> {
  const { data, error } = await supabase.schema('shared').rpc('default_stream')
  if (error) throw new Error(`fetchDefaultStream failed — ${error.message}`)
  // Shape-validate before trusting the payload: anything that is not a rowset whose
  // first row carries string halves resolves as "no default", never a crash or a cast
  // of garbage into a stream.
  if (!Array.isArray(data)) return null
  const row = (data as DefaultStreamRow[])[0]
  if (typeof row?.branch_id !== 'string' || typeof row.activity !== 'string') return null
  const branch = branches.find(b => b.id === row.branch_id)
  if (!branch) return null
  if (!(PRODUCTION_ACTIVITIES as readonly string[]).includes(row.activity)) return null
  return { branch, activity: row.activity as ProductionActivity }
}

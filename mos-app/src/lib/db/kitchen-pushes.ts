// kitchen-pushes.ts — S5 ESB push outbox data module.
// Read-only: the SPA only reads integrations.esb_push rows; the outbox worker
// (FastAPI, ADR-0010) owns all writes. The app tier has SELECT-only RLS on this
// table (ops_lead/admin own-org, AC-007). No mutation paths live here — this is
// purely a monitoring read surface (design-plan §S5, FR-074).

import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Exact status values from integrations.esb_push (DB CHECK constraint). */
export type EsbPushStatus =
  | 'pending'
  | 'in_flight'
  | 'posted'
  | 'failed'
  | 'dead_letter'

/** Exact target_env values from integrations.esb_push (DB CHECK constraint). */
export type EsbTargetEnv = 'goo' | 'gkid' | 'dry_run'

/** Exact endpoint values written by the kitchen module. */
export type EsbEndpoint = 'assembly-actual' | 'simple-transfer' | 'noop'

/**
 * Display shape for one integrations.esb_push row.
 * Columns selected for the S5 Pushes view (design-plan §S5 column list).
 * Snake_case matches DB columns directly — no camelCase bridge (CLAUDE.md rule).
 */
export interface EsbPushRow {
  id: string
  source_module: string       // 'kitchen' | 'roastery' etc.
  source_ref: string          // batch_id (mono display)
  endpoint: EsbEndpoint
  target_env: EsbTargetEnv
  status: EsbPushStatus
  retry_count: number
  last_error: string | null
  esb_doc_num: string | null
  created_at: string
  posted_at: string | null
}

/** Optional filter for listEsbPushes — ops_lead may filter to a subset. */
export interface EsbPushFilter {
  status?: EsbPushStatus
  source_module?: string
}

// ── Data layer ────────────────────────────────────────────────────────────────

/**
 * Severity rank shared by the SQL read and the presentation sort (#402 / #416).
 *
 * dead_letter (retries exhausted — the row that wants a human) > failed (the machine is
 * still retrying) > in_flight/pending (queued — healthy) > posted (done).
 *
 * The five status strings happen to sort ALPHABETICALLY into exactly this order
 * (dead_letter < failed < in_flight < pending < posted), which is what lets the read
 * rank server-side with a plain `.order('status')` — see listEsbPushes. That agreement is
 * a coincidence of the vocabulary, so a test pins it: if a future status word breaks the
 * alphabetical rank, the test fails rather than the surface quietly mis-ranking.
 */
export const SEVERITY_RANK: Record<EsbPushStatus, number> = {
  dead_letter: 0,
  failed: 1,
  in_flight: 2,
  pending: 2,
  posted: 3,
}

/**
 * List ESB push rows, worst first (severity in SQL, newest-first within a tier).
 * Reads from `integrations.esb_push` using the `integrations` schema accessor
 * (mirrors the `ops` accessor pattern in kitchen-logs.ts). RLS limits to the
 * caller's org (ops_lead/admin — AC-007); a member would get zero rows, not an
 * error, but the UI gates access before calling (role-gate courtesy, §S5).
 *
 * @param filter  Optional status/module filter for narrowing the list.
 * @param limit   Max rows to return (default 100 — a monitoring surface).
 */
// #416: the ordering has to be a property of WHAT IS FETCHED, not of what happened to
// arrive. Ordering only by created_at and cutting at `limit` hides precisely the row this
// screen exists for — a batch that got stuck last week is, by virtue of being stuck, old:
// it sits below `limit` newer healthy pushes, never reaches the client, and no client-side
// sort can rescue a row that was never sent. Ranking by status first makes the DB truncate
// the HEALTHY tail instead: every dead_letter and failed row in the org is inside the
// window, and the remaining slots go to the newest queued/posted rows.
export async function listEsbPushes(
  filter?: EsbPushFilter,
  limit = 100,
): Promise<EsbPushRow[]> {
  const integrations = () => supabase.schema('integrations')

  let query = integrations()
    .from('esb_push')
    .select(
      'id,source_module,source_ref,endpoint,target_env,status,retry_count,last_error,esb_doc_num,created_at,posted_at',
    )
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filter?.status) {
    query = query.eq('status', filter.status)
  }
  if (filter?.source_module) {
    query = query.eq('source_module', filter.source_module)
  }

  const { data, error } = await query

  if (error) throw new Error(`listEsbPushes failed — ${error.message}`)
  return (data ?? []) as EsbPushRow[]
}

// ── Presentation ordering (#402 AC-3) ────────────────────────────────────────

/**
 * Severity-first ordering for the Pushes surface: rows needing attention sort
 * above healthy ones, newest first within a tier.
 *
 * dead_letter (retries exhausted — the row that wants a human) > failed (the
 * machine is still retrying) > in_flight/pending (queued — healthy) > posted
 * (done). Held rows are pending-noop and rank with the healthy tier: held is a
 * permanent, fine state (FR-052), not a stuck one.
 *
 * The RANKING ITSELF is the read's (listEsbPushes orders by status server-side, so the
 * attention tier is inside the window whatever its age — #416). This is the presentation
 * tie-break on top of it: it collapses in_flight/pending into one healthy tier, mutates
 * nothing, and breaks ties on id so the order is stable across renders.
 */
export function sortPushRows(rows: EsbPushRow[]): EsbPushRow[] {
  return [...rows].sort((a, b) => {
    const byRank = SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status]
    if (byRank !== 0) return byRank
    const byTime = Date.parse(b.created_at) - Date.parse(a.created_at)
    if (byTime !== 0) return byTime
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

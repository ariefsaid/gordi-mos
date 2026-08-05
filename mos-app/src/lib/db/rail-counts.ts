import { supabase } from '@/lib/supabase'

// The ONE cheap aggregate behind the rail's E7 count badges (Tasks · Signals). Two head-only
// PostgREST counts (`head: true` → no rows, just the exact count) over the viewer's RLS-readable
// scope — the same policies that govern listTasks / listReadableSignals. Fetched ONCE per shell
// mount (no polling). RLS is the authority: this layer never sends org_id.
//
// "Open task"        = not archived AND not Done (mirrors the workspace stats.overdue exclusions).
// "Attention signal" = not retracted AND attention ∈ {Needs attention, Urgent} (the E7 Needs-
//                      attention feed's own predicate — FYI is quiet by design).
//
// ⚠ ON THIS BRANCH THE BADGES DO NOT RENDER, AND THE REASON IS THE SCHEMA, NOT THIS CODE.
// `mos.signals` does not exist here yet — it arrives with the squashed migration baseline. The
// signals count therefore rejects, `Promise.all` rejects with it, `useRailCounts` catches and
// stays null, and the rail omits BOTH badges. That is a safe failure (E7's quiet rule: a count
// that is unavailable is not shown), but note the coupling: the open-task count is perfectly
// readable today and is suppressed only because it shares a `Promise.all` with a query that
// cannot succeed. Do not read the absent badges as a rail defect, and do not "fix" it by
// splitting the two counts before the schema lands — the split is a real decision about whether
// a half-populated rail is better than a quiet one, and it is tracked as its own ticket.

const mos = () => supabase.schema('mos')

export interface RailCounts {
  /** Open (non-archived, non-Done) tasks the viewer can read. */
  openTasks: number
  /** Non-retracted Needs-attention/Urgent signals the viewer can read. */
  attentionSignals: number
}

async function headCount(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await build()
  if (error) throw new Error(`rail count failed — ${(error as { message?: string }).message ?? 'unknown'}`)
  return count ?? 0
}

/** Fetch the rail badge counts in parallel. Throws on any error so the caller can drop the badges. */
export async function getRailCounts(): Promise<RailCounts> {
  const [openTasks, attentionSignals] = await Promise.all([
    headCount(() =>
      mos()
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .is('archived_at', null)
        .neq('status', 'Done'),
    ),
    headCount(() =>
      mos()
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .is('retracted_at', null)
        .in('attention', ['Needs attention', 'Urgent']),
    ),
  ])
  return { openTasks, attentionSignals }
}

// Kitchen plan data layer (S2) — ops.kitchen_plans.
// Two faces of one table:
//   • the daily plan EDITOR (one date)  → listKitchenPlans(date) + upsertKitchenPlan(cell)
//   • the read-only "pesanan" HORIZON   → listPesanan(from, days) (the forward 14-day read)
// The client NEVER sends org_id or plan_by — both are server-stamped (org_id default
// current_org_id(); plan_by from the session), mirroring kitchen-logs' NFR-003 posture.
// Snake_case DB columns consumed directly; the DB column is `date`, mapped at the boundary.
//
// UPSERT MECHANISM (see report): the unique index is (org_id, date, wip_item_id, action_type),
// but org_id is server-defaulted and never sent by the client. A bare PostgREST
// .upsert({ onConflict }) would force the client to send org_id into the conflict target.
// Rather than weaken the "client never sends org_id" guarantee, upsertKitchenPlan does a
// clean select-then-insert/update: probe for the existing row by (date, wip_item_id,
// action_type) — RLS scopes the probe to the caller's org — then UPDATE by id (replace,
// FR-031) or INSERT (org_id + plan_by server-stamped). This is the same idempotent
// replace semantics the spec requires, with no org_id ever leaving the client.

import { supabase } from '@/lib/supabase'
import type {
  KitchenActionType,
  PlanCell,
  PesananRow,
  UpsertKitchenPlanInput,
} from './kitchen-logs.types'

const ops = () => supabase.schema('ops')

// ── Editor: plans for one date ────────────────────────────────────────────────

/**
 * List the plan cells for a single date — the S2 editor's current state (FR-030).
 * Returns one PlanCell per existing ops.kitchen_plans row, carrying its `id` so a
 * subsequent edit UPDATEs the same row (the replace-by-id half of the upsert).
 * RLS scopes the read to the caller's org. Throws on PostgREST error.
 */
export async function listKitchenPlans(logDate: string): Promise<PlanCell[]> {
  const { data, error } = await ops()
    .from('kitchen_plans')
    .select('id,wip_item_id,action_type,qty_porsi')
    .eq('date', logDate)
  if (error) throw new Error(`listKitchenPlans failed — ${error.message}`)
  type Raw = { id: string; wip_item_id: string; action_type: KitchenActionType; qty_porsi: number }
  return ((data ?? []) as Raw[]).map(r => ({
    id: r.id,
    wip_item_id: r.wip_item_id,
    action_type: r.action_type,
    qty_porsi: r.qty_porsi,
  }))
}

// ── Pesanan: the 14-day forward read horizon (member read-only, AC-024) ───────

/** Add N days to a 'YYYY-MM-DD' date string in pure UTC arithmetic (no host-tz leak). */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000
  const dt = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/**
 * List the read-only forward "pesanan" horizon (FR-035, AC-024): every planned
 * (date, item, action, qty) from `from` through `from + days − 1` inclusive, with
 * the WIP item name embedded (same-schema ops.kitchen_plans → ops.wip_items).
 * Sorted by date then item name so the page can group-by-date in one pass. RLS
 * scopes to the org. Read-only — there is no logging/approve affordance (AC-024).
 */
export async function listPesanan(from: string, days: number): Promise<PesananRow[]> {
  const to = addDays(from, days - 1) // inclusive window: [from, from+days-1]
  const { data, error } = await ops()
    .from('kitchen_plans')
    .select('date,wip_item_id,action_type,qty_porsi,wip_items(name)')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
  if (error) throw new Error(`listPesanan failed — ${error.message}`)

  type Raw = {
    date: string
    wip_item_id: string
    action_type: KitchenActionType
    qty_porsi: number
    // PostgREST to-one embed: tolerate object | array | null.
    wip_items: { name: string } | { name: string }[] | null
  }
  return ((data ?? []) as unknown as Raw[]).map((r): PesananRow => {
    const embed = Array.isArray(r.wip_items) ? r.wip_items[0] : r.wip_items
    return {
      log_date: r.date,
      wip_item_id: r.wip_item_id,
      wip_item_name: embed?.name ?? '—',
      action_type: r.action_type,
      qty_porsi: r.qty_porsi,
    }
  })
}

// ── Editor write: replace/upsert one plan cell (FR-031) ───────────────────────

/**
 * Upsert ONE plan cell (FR-031 replace/upsert semantics). Probe-then-write so the
 * client never sends org_id (see the module header). qty_porsi ≥ 0 (kitchen_plans
 * allows 0 — distinct from logs' > 0; the editor can zero a line out). Returns the
 * row id (existing on update, minted on insert). Throws on a write/RLS error.
 */
export async function upsertKitchenPlan(input: UpsertKitchenPlanInput): Promise<string> {
  if (input.qty_porsi < 0) throw new Error('qty_porsi must be ≥ 0')

  // Probe for an existing row for this (date, item, action) — RLS scopes the org.
  const { data: existing, error: probeErr } = await ops()
    .from('kitchen_plans')
    .select('id')
    .eq('date', input.log_date)
    .eq('wip_item_id', input.wip_item_id)
    .eq('action_type', input.action_type)
    .maybeSingle()
  if (probeErr) throw new Error(`upsertKitchenPlan failed — ${probeErr.message}`)

  const existingId = (existing as { id: string } | null)?.id ?? null

  if (existingId) {
    // Replace (UPDATE by id) — org_id/plan_by are NOT touched (server-owned).
    const { data, error } = await ops()
      .from('kitchen_plans')
      .update({ qty_porsi: input.qty_porsi, notes: input.notes ?? null })
      .eq('id', existingId)
      .select('id')
      .single()
    if (error) throw new Error(`upsertKitchenPlan failed — ${error.message}`)
    return (data as { id: string }).id
  }

  // Insert a new key — org_id (default current_org_id()) + plan_by (session) server-stamped.
  const row: Record<string, unknown> = {
    date: input.log_date, // DB column is `date`
    wip_item_id: input.wip_item_id,
    action_type: input.action_type,
    qty_porsi: input.qty_porsi,
    notes: input.notes ?? null,
    // org_id NOT sent — server default. plan_by NOT sent — session-stamped.
  }
  const { data, error } = await ops()
    .from('kitchen_plans')
    .insert(row)
    .select('id')
    .single()
  if (error) throw new Error(`upsertKitchenPlan failed — ${error.message}`)
  return (data as { id: string }).id
}

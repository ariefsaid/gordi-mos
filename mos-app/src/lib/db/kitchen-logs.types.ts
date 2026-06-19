// Kitchen module types — ops.kitchen_logs, ops.wip_items, shared.business_units.
// Snake_case matches DB columns directly (no camelCase bridge).
// DB stamped: org_id, submitted_by (on insert), reviewed_by/reviewed_at (on approve).
// The client NEVER sends org_id, submitted_by, reviewed_by — NFR-003.

export type KitchenActionType =
  | 'Production'
  | 'Transfer to Bungur'
  | 'Transfer to Radiant'

export type KitchenLogStatus = 'Submitted' | 'Approved' | 'Rejected'

// ── ops.wip_items (active items listed for logging) ──────────────────────────
export interface WipItemRow {
  id: string
  org_id: string
  name: string
  category: string | null
  flag_active: boolean
  esb_bom_id: string | null
  esb_product_detail_id_porsi: string | null
  esb_product_id: string | null
  created_at: string
  updated_at: string
}

// Lean display shape for the capture form (only what the UI needs)
export interface WipItemOption {
  id: string
  name: string
  category: string | null
}

// ── ops.kitchen_plans (plan qty per date/item/action) ────────────────────────
export interface KitchenPlanRow {
  id: string
  org_id: string
  date: string // 'YYYY-MM-DD' WIB
  wip_item_id: string
  action_type: KitchenActionType
  qty_porsi: number
  notes: string | null
  plan_by: string | null
  updated_at: string
}

// Plan qty keyed by (wip_item_id, action_type) for fast lookup in the form.
// Partial<Record<...>> so partial test fixtures type-check (most items won't have all 3 action types).
export type PlanMap = Record<string, Partial<Record<KitchenActionType, number>>>

// ── ops.kitchen_logs (insert payload) ────────────────────────────────────────
// Only what the client sends — DB stamps org_id + submitted_by.
// status defaults to 'Submitted' at the DB; never sent by the client.
export interface CreateKitchenLogInput {
  business_unit_id: string
  log_date: string // 'YYYY-MM-DD' WIB
  action_type: KitchenActionType
  wip_item_id: string
  qty_porsi: number // > 0 (client + DB CHECK)
  notes?: string | null
}

// Full row shape (returned by selects, used by review surfaces)
export interface KitchenLogRow {
  id: string
  org_id: string
  business_unit_id: string
  log_date: string
  action_type: KitchenActionType
  wip_item_id: string
  qty_porsi: number
  notes: string | null
  status: KitchenLogStatus
  submitted_by: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  batch_id: string | null
  posted_to_esb: boolean
  esb_doc_num: string | null
  posted_at: string | null
  created_at: string
  updated_at: string
}

// ── Per-line form state (one stepper row per WIP item) ───────────────────────
export interface KitchenLogLine {
  wip_item_id: string
  qty_porsi: number
  notes: string
  /** plan qty for the current action_type (0 if no plan row) */
  plan_qty: number
  /** true when qty > 0 (line has been touched / is staged for submit) */
  dirty: boolean
  /** validation error: e.g. 'note required' */
  error: string
}

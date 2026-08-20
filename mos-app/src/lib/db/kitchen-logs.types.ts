// Kitchen module types — ops.kitchen_logs, ops.wip_items, shared.business_units.
// Snake_case matches DB columns directly (no camelCase bridge).
// DB stamped: org_id, submitted_by (on insert), reviewed_by/reviewed_at (on approve).
// The client NEVER sends org_id, submitted_by, reviewed_by — NFR-003.

// ── The (branch, activity) production stream (OD-WAY-28) ─────────────────────
// Every log, plan and stock row is born inside a stream. There is ONE physical kitchen and
// it is a constant, not a dimension; what varies is whose books the raw comes from and the
// output goes to (the branch) and which activity produced it.

/**
 * The Activity vocabulary the client knows — the fourth copy of `shared.activities`
 * (#392). Deliberately a compile-time literal: the vocabulary changes by migration,
 * never by session (20260814000001 grants no write path). What makes this copy honest
 * is the guard: production-activities-catalog-drift.test.ts asserts this array equals
 * the catalog the migrations define, so drift is a CI red, never a silently dropped
 * default stream. ONE literal feeds the union, the array, and every picker — edit one
 * line to add an activity, and the guard forces exactly that edit.
 */
export const PRODUCTION_ACTIVITIES = ['kitchen', 'bar'] as const

/** The activity half of a production stream (`ops.kitchen_logs.activity`). */
export type ProductionActivity = (typeof PRODUCTION_ACTIVITIES)[number]

/** A row of the canonical branch catalog (`shared.branches`, OD-WAY-39). */
export interface BranchOption {
  id: string
  /** MOS's own stable snake_case identifier — deliberately NOT an ERP branch code. */
  code: string
  name: string
}

/** The origin half plus the activity: the stream a captured row belongs to. */
export interface ProductionStream {
  branch: BranchOption
  activity: ProductionActivity
}

/**
 * A raw (branch_id, activity) pair as the stream substrate stores it — the shape
 * `shared.default_stream()` returns (FR-001) and the six stream Teams carry (FR-005).
 * Resolved against the branch catalog into a display-ready ProductionStream by
 * `streamCatalogFrom` / the capture page.
 */
export interface StreamPair {
  branch_id: string
  activity: ProductionActivity
}

/** What happened, in the stored vocabulary (`ops.kitchen_logs.action`). */
export type KitchenAction = 'produce' | 'transfer'

/**
 * A movement within a stream. `destinationBranchId` is null for a produce and required for
 * a transfer — the same shape as the `kitchen_logs_destination_matches_action` CHECK. A
 * transfer whose destination equals its origin is a within-books move: it still leaves the
 * kitchen's hands (so it consumes stock) but the ERP already books that branch as holding
 * it, so it has no ERP counterpart.
 */
export interface KitchenMovement {
  action: KitchenAction
  destinationBranchId: string | null
}

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

// ── Item units on the capture form (#234, FR-020/021/032) ────────────────────

/**
 * One OFFERED unit of a capture-form item, read from ops.capture_form_items. `id` is the
 * ops.item_units row — the ERP coordinate identity (FR-022): binding a capture row to a
 * unit means binding it to this id, never to a name string.
 */
export interface ItemUnitOption {
  id: string
  /** display label beside the qty input ('porsi', 'botol', …) — display only (FR-022). */
  name: string
  /** the item's fixed default unit (FR-020) — shown as master data, first in the list. */
  is_default: boolean
}

/**
 * A capture-form item with its offered units: the confirmed default first, then confirmed
 * TRANSFERABLE alternates (FR-032/AC-015 — a non-transferable synced variant is never
 * offered). `units.length > 1` is what earns a row the "change unit" affordance (FR-021,
 * AC-005); exactly one means the unit renders as fixed text and nothing else.
 */
export interface CaptureFormItem extends WipItemOption {
  units: ItemUnitOption[]
}

// ── ops.kitchen_plans (plan qty per date/item/action) ────────────────────────
export interface KitchenPlanRow {
  id: string
  org_id: string
  date: string // 'YYYY-MM-DD' WIB
  /** origin half of the (branch, activity) stream — NOT NULL at the DB (OD-WAY-28) */
  branch_id: string
  activity: ProductionActivity
  wip_item_id: string
  /** the movement (DD-WAY-13) — there is no stored action_type */
  action: KitchenAction
  /** null for produce, required for transfer (kitchen_plans_destination_matches_action) */
  destination_branch_id: string | null
  qty_porsi: number
  notes: string | null
  plan_by: string | null
  updated_at: string
}

/**
 * A movement's stable lookup key — `'produce'` or `'transfer:<destination branch id>'`.
 * Used to index the plan map, which the DB keys on (item, stream, action, destination).
 * It is a client-side index only; nothing stores it.
 */
export type MovementKey = string

// Plan qty keyed by (wip_item_id, movement key) for fast lookup in the form.
// Partial so partial test fixtures type-check (most items won't have every movement).
export type PlanMap = Record<string, Partial<Record<MovementKey, number>>>

// Today's already-logged actuals (Σ qty_porsi of the stream/date's non-Rejected logs),
// keyed like PlanMap — the "already logged N" idiom (FR-014, AC-006). Stream-scoped:
// the same dish has different actuals in another stream's books.
export type ActualsMap = Record<string, Partial<Record<MovementKey, number>>>

// ── ops.kitchen_stock availability (FR-022/023) ──────────────────────────────
// Per WIP item: `stok` = on-hand usable stock (the start-of-day net of approved
// logs), `tersedia` = available for transfer (FR-023). Stepper shows plan·stok·tersedia.
export interface ItemStock {
  /** on-hand usable stock for the date (start-of-day net of approved logs) */
  stok: number
  /** available for a transfer right now (FR-023 tersedia) */
  tersedia: number
}

// Stock keyed by wip_item_id for O(1) lookup in the capture form.
export type StockMap = Record<string, ItemStock>

// ── Stock view (S4) — one display row per active WIP item ─────────────────────
// The read-only Stock view (FR-060/061) lists every active WIP item with its two
// cuts for the selected date: `stok` (usable_qty) and `tersedia` (available_qty).
// Negative balances are preserved (they surface real data issues — FR-061/AC-032).
export interface KitchenStockRow {
  wip_item_id: string
  /** WIP item display name (from ops.wip_items). */
  wip_item_name: string
  /** optional category display label from ops.wip_items (read-only UI sugar). */
  category?: string | null
  /** usable_qty — the net of approved logs for the date (FR-060). */
  stok: number
  /** available_qty — usable net of transfers already committed (FR-061). */
  tersedia: number
}

// ── ops.kitchen_logs (insert payload) ────────────────────────────────────────
// Only what the client sends — DB stamps org_id + submitted_by.
// status defaults to 'Submitted' at the DB; never sent by the client.
export interface CreateKitchenLogInput {
  business_unit_id: string
  log_date: string // 'YYYY-MM-DD' WIB
  /** origin half of the (branch, activity) stream — NOT NULL at the DB (AC-007) */
  branch_id: string
  activity: ProductionActivity
  /** the movement (DD-WAY-13) — there is no stored action_type */
  action: KitchenAction
  /** null for produce, required for transfer (kitchen_logs_destination_matches_action) */
  destination_branch_id: string | null
  wip_item_id: string
  /**
   * the item-unit the quantity was captured in (#234, FR-022). null → the server binds the
   * item's DEFAULT unit (FR-020 — the common path enters no unit); an explicit id is the
   * "change unit" path (FR-021) and must reference a unit of this wip item.
   */
  item_unit_id?: string | null
  qty_porsi: number // > 0 (client + DB CHECK)
  notes?: string | null
}

// Full row shape (returned by selects, used by review surfaces)
export interface KitchenLogRow {
  id: string
  org_id: string
  business_unit_id: string
  log_date: string
  branch_id: string
  activity: ProductionActivity
  action: KitchenAction
  destination_branch_id: string | null
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

// ── Review queue (S3) — Submitted log + display fields ───────────────────────
// One row in the ops_lead review queue. Joins the WIP item name (same-schema
// embed: ops.kitchen_logs → ops.wip_items, FR-040). The plan baseline (plan-vs-
// logged) is merged in at the page from fetchPlanMap, and the submitter's display
// name is resolved client-side from the shared.people directory (cross-schema
// embed is impossible under the ops PostgREST profile — PGRST200), mirroring
// tasks.ts. This keeps the data fn a single ops-schema read.
export interface ReviewLogRow {
  id: string
  log_date: string
  /**
   * The DERIVED action label, read from the database's own `ops.action_label` virtual
   * column (DD-WAY-13). A plain string, not a three-literal union: the same derivation
   * names the four streams that reach the ERP by hand today.
   */
  action_type: string
  /** the stored movement (DD-WAY-13) — what the label above is derived FROM. Predicates
   *  ("is this a transfer?") and plan lookups key off these, never off the label. */
  action: KitchenAction
  destination_branch_id: string | null
  /**
   * the (branch, activity) production stream this log belongs to (OD-WAY-28, #197). The
   * plan baseline it is compared against must be read from THIS stream — a queue that can
   * span more than one stream and looks up variance against a single hardcoded stream
   * would silently compare a row to the wrong plan the moment a second stream is captured.
   */
  branch_id: string
  activity: ProductionActivity
  wip_item_id: string
  /** WIP item display name (embedded from ops.wip_items). */
  wip_item_name: string
  qty_porsi: number
  notes: string | null
  status: KitchenLogStatus
  /** submitter person id (display name resolved client-side via directory). */
  submitted_by: string | null
  business_unit_id: string
  created_at: string
}

/** Result of an approve RPC — the minted batch_id (FR-050). */
export interface ApproveResult {
  batch_id: string
}

// ── Daily Plan editor + pesanan horizon (S2 — FR-030/031/035, AC-024) ─────────

/** The forward "pesanan" horizon length in days (FR-035, [oracle] PESANAN_HORIZON_DAYS). */
export const PESANAN_HORIZON_DAYS = 14

// One editable plan cell in the S2 editor: the qty_porsi for an (item, movement) on the
// selected date WITHIN one (branch, activity) stream (OD-WAY-28) — the stream is chosen
// once for the whole editor session, not carried per cell (mirrors the capture surface).
// `id` is the existing ops.kitchen_plans row id when a plan already exists for that key
// (drives the select-then-update upsert path), else null.
export interface PlanCell {
  wip_item_id: string
  /** the movement (DD-WAY-13) — there is no stored action_type */
  movement: KitchenMovement
  /** planned porsi (≥ 0 — note: kitchen_plans allows 0, unlike logs' > 0) */
  qty_porsi: number
  /** existing row id (null = no plan row yet for this key) */
  id: string | null
}

// What the client sends to upsert ONE plan cell. The client NEVER sends org_id or
// plan_by — both are server-stamped (org_id default current_org_id(); plan_by from
// the session). Mirrors the kitchen-logs insert posture (NFR-003).
export interface UpsertKitchenPlanInput {
  log_date: string // 'YYYY-MM-DD' WIB → DB column `date`
  wip_item_id: string
  /** origin half of the (branch, activity) stream this plan row belongs to (OD-WAY-28) */
  branch_id: string
  activity: ProductionActivity
  /** the movement (DD-WAY-13) — there is no stored action_type */
  action: KitchenAction
  /** null for produce, required for transfer (kitchen_plans_destination_matches_action) */
  destination_branch_id: string | null
  qty_porsi: number // ≥ 0
  notes?: string | null
}

// One row in the read-only pesanan (14-day forward horizon) view (FR-035, AC-024).
// A flat display shape: date + item + movement + planned qty, scoped to ONE stream (the
// query that produces this is stream-filtered — OD-WAY-28). The WIP item name is
// embedded same-schema (ops.kitchen_plans → ops.wip_items); RLS scopes to the org.
export interface PesananRow {
  log_date: string // 'YYYY-MM-DD' WIB
  wip_item_id: string
  wip_item_name: string
  /** optional category display label from ops.wip_items (read-only UI sugar). */
  category?: string | null
  /** the movement (DD-WAY-13) — there is no stored action_type */
  movement: KitchenMovement
  qty_porsi: number
}

// ── Per-line form state (one stepper row per WIP item) ───────────────────────
export interface KitchenLogLine {
  wip_item_id: string
  /**
   * the item-unit this line is bound to (#234, FR-021/022) — the item's default at rest,
   * re-bound when an alternate is chosen via "change unit". null only for an item whose
   * offered-unit list is somehow empty (never for view-sourced items).
   */
  item_unit_id: string | null
  qty_porsi: number
  notes: string
  /** plan qty for the current action_type (0 if no plan row) */
  plan_qty: number
  /** on-hand usable stock for the item (FR-022 effective-target basis) */
  stok: number
  /** available stock for a transfer (FR-023 cap basis) */
  tersedia: number
  /** true when qty > 0 (line has been touched / is staged for submit) */
  dirty: boolean
  /** variance-note validation error: e.g. 'note required' (FR-022, AC-020/021) */
  error: string
  /** transfer-availability cap cue (FR-023, AC-022): "Stok kurang — produksi dulu" */
  capError: string
}

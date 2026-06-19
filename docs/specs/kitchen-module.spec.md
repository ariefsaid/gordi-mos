# Spec — Kitchen ops Module (full-parity port of the Teable kitchen app onto MOS/Supabase)

- Feature: the **Kitchen ops Module** end-to-end on MOS — a typed `ops.*` kitchen domain
  (`ops.wip_items` · `ops.kitchen_logs` · `ops.kitchen_plans` · `ops.kitchen_stock`) + per-person
  Supabase Auth + RLS, replicating the **entire** current Teable kitchen workflow: production/transfer
  **logging** (increment semantics; Transfer-to-Bungur is an ESB no-op), the **daily plan editor**
  (replace/upsert semantics), the ops-lead **review/approve queue** (Submitted→Approved, notes-required
  on variance, the GIGO gate), **kitchen_stock auto-compute** (net of approved logs), **batch_id minted
  at approval**, and an ESB push pipeline rebuilt on the **Module-agnostic `integrations.esb_push`
  outbox** (one row per batch, central `dedup_key`, retry, staging-vs-prod target) driven by a thin
  FastAPI **outbox worker**. On approval the Module also writes a **summary `ops.log_entries`** row
  (`origin = 'kitchen'`) so the kitchen happening surfaces in the **Daily Log** mirror.
- Status: **Draft for owner sign-off.** First cut = **full parity** (OD-K-1); Teable/old app is **NOT
  retired** until this Module is fully tested (parallel-run → use → flip, OD-K-2).
- Authority: this spec **conforms** to — it does not re-decide —
  - **ADR-0012** (ESB outbox + `integrations` schema): kitchen data → typed RLS'd `ops.*`; ESB push →
    Module-agnostic `integrations.esb_push` outbox (one row/batch, central `dedup_key`); on approval
    write a summary `ops.log_entries` (`origin = 'kitchen'`) Daily Log mirror; staging-first ESB;
    migration preserves `posted_to_esb` / `esb_doc_num` history (ADR-0012 D4) so nothing re-posts.
  - **ADR-0011** (auth model / RBAC access roles): Supabase Auth + RLS; access roles
    `admin` / `ops_lead` / `finance` / `member` (+ derived `manager`); kitchen loggers = `member`
    (insert own **Submitted** logs), `ops_lead` approves (Submitted→Approved RLS gate); synthetic
    emails for staff without email; personal-phone PWA, 30-day session.
  - **ADR-0010** (platform topology / hosting / operations): thin FastAPI backend hosts the outbox
    worker; PWA installable + responsive + **online-only writes**; security hardening + gating
    `security-auditor` review.
  - **CONTEXT.md** canonical vocabulary (Module · Access role · Daily Log / Log entry · Business Unit ·
    Task). **Kitchen logs are DISTINCT from `ops.log_entries`** — the latter has no owner/RACI/status
    and is the cross-Module Daily Log; a kitchen log is a typed, reviewable, quantity-bearing kitchen
    record. The summary mirror is the one bridge between them.
- Behavior oracle (the **running** kitchen app, separate repo `gordi-kitchen-app/`): `app/teable.py`,
  `app/esb_poller.py`, `app/esb_client.py`, `app/main.py`, `app/auth.py`, `app/templates/`. This spec
  captures that real behavior; where the oracle's mechanics are owner-locked they are cited as
  **[oracle]** with the file. Differences from the oracle that this Module deliberately changes
  (per-person auth replacing CF-Access ops-lead allowlist; outbox replacing the in-process poller;
  Supabase RLS replacing Teable's open API) are flagged in §1 and §11.
- Format: matches `docs/specs/ops-log.spec.md` and `docs/specs/tasks-dbview.spec.md` (house structure;
  IDs `FR-###` / `NFR-###` / `AC-###`; EARS for functional requirements; Given/When/Then for ACs; each
  AC tagged with its owning **test layer** so `grep -r AC-### ` finds the proof).

> **Owner-decision shorthand.** The owner's 2026-06-19 scoping decisions are referenced inline as
> **OD-K-1..4** (1 = full parity; 2 = parallel-run → use → flip; 3 = GOO staging is FUNCTIONAL parity
> with TEST DATA only; 4 = the no-double-post-to-GKID safety constraint). These are recorded here for
> traceability; the canonical home is `docs/decisions.md` (eng-planner/grill to ratify the OD ids).

---

## Out of scope (explicit non-goals)

- **Retiring Teable / the old app in this slice.** The old Teable kitchen app **keeps running** as the
  live system of record until this Module passes full testing (OD-K-1/2). This spec defines the Module's
  behavior **and** the parallel-run + atomic-flip mechanics, but the flip itself is an owner-gated
  operational action, not code that auto-fires.
- **The new worker writing to production GKID before the flip.** Until the atomic flip, the
  `integrations.esb_push` worker targets **GOO staging or dry-run ONLY** — never production GKID
  (OD-K-4, NFR-001). This is a hard safety constraint, not a tunable default.
- **Re-deciding the ESB call shapes / IDs / costing model.** The assembly-actual body (per-detail
  `simpleManufacturingMaterials` from the BOM, actual-costing — GKID's standard-costing `/assembly`
  route is not deployed), the simple-transfer body, the branch/location IDs (Bungur branch 8 / loc 15;
  Radiant branch 4 / loc 7), and the doc-number parse (`simpleManufacturingNum` / `simpleTransferNum`)
  are **locked by the oracle** (`esb_client.py`, `esb_poller.py`) and reproduced, not redesigned.
- **The MOS app shell, Tasks, Weekly Updates, the manual Daily Log feed** — unchanged. The Module adds
  the `origin = 'kitchen'` summary-mirror write into the existing `ops.log_entries`; it does not reshape
  that table or its feed.
- **Roastery / other ops apps.** The outbox is Module-agnostic by design (ADR-0012), but only the
  Kitchen producer is built here. `origin = 'roastery_app'` etc. remain future, no schema change.
- **Receiving / GR (goods-receipt), opname adjustments, ESB inventory reconciliation read-back.** The
  oracle's stock view shows an ESB-inventory comparison column as a placeholder (`—`); a writable
  opname / reconciliation flow is **deferred** (see §10 open questions). This Module computes stock from
  approved logs only.
- **Hard delete of any kitchen row.** Removal is soft-archive / status only; no DELETE grant
  (mirrors the `ops.log_entries` posture).
- **Offline write queueing.** The PWA is **online-only for writes** (ADR-0010); offline shows a graceful
  error, not a local queue (§7).

---

## 1. Overview & user value

The Kitchen ops Module is the **first ops Module ported off Teable** onto the shared MOS/Supabase
stack. It reproduces, with per-person identity and database-enforced RLS, the daily loop the Bungur
central-kitchen team already runs:

- **Kitchen staff (access role `member`)**, on **personal phones** (installable PWA, 30-day session,
  online-only writes — ADR-0010/0011), **log production and transfers** against today's plan. A log is
  **incremented** into today's running total, never replaced (a second submit of the same item adds to
  it — [oracle] `teable.submit_kitchen_log_rows` always writes a *new* row; `sum_actuals_for_date`
  sums them). Each log lands as **Submitted** and is invisible to ESB and to stock until approved.
- **Ops leads (access role `ops_lead`)** edit the **daily plan** (the per-(date, item, action_type)
  planned quantity — replace/upsert semantics, [oracle] `upsert_plan_rows`) and work the **review/approve
  queue**: each Submitted log is **Approved** or **Rejected**; a **note is required** when the approved
  quantity deviates from plan or when rejecting ([oracle] note-required gates in `kitchen_submit` and
  `review_decide`). Approval is the **GIGO gate** — only Approved logs count toward stock and ESB
  ([oracle] `list_stock_for_date` filters `status == "Approved"`).
- On **approval**, the system **mints a `batch_id`** (`<PREFIX>-YYYYMMDD-NNN`, daily counter per
  (prefix, date); PR/TR/TB by action_type — [oracle] `mint_batch_id`), recomputes **kitchen_stock**
  (the running net of approved Production − Transfers — [oracle] `recompute_stock_for_items` /
  `list_stock_for_date`), enqueues an **`integrations.esb_push` outbox row for the batch**, and writes a
  **summary `ops.log_entries`** row (`origin = 'kitchen'`) so the kitchen happening appears in the
  **Daily Log** (ADR-0012).
- A thin FastAPI **outbox worker** (ADR-0010) drains `integrations.esb_push`: **one ESB call per batch**
  — Production → `/production/simple-manufacturing/assembly-actual` (BOM-composed materials,
  `esb_bom_id` + `esb_product_detail_id_porsi` + `qty_porsi`); Transfer-to-Radiant → `/simple-transfer`;
  Transfer-to-Bungur → **no ESB call** (same-location allocation marker; closed with a sentinel doc num
  — [oracle] `_process_transfer_bungur_batch`). It is **idempotent** (central `dedup_key`), **retries**
  with `retry_count` / `MAX_RETRY`, and dead-letters on exhaustion.
- **Managers** see the kitchen happening in the existing **Daily Log** via the summary mirror — no new
  surface for them.

**Why a port, why now, why careful.** The Teable app works but is single-identity (one CF-Access
ops-lead allowlist, no per-person attribution), its API is open, and its ESB push is an in-process
poller. MOS gives per-person auth + RLS + a Module-agnostic outbox. But ESB writes hit **production
GKID inventory** — double-posting would corrupt real stock. So the rollout is **parallel-run → use →
flip** (OD-K-2): the Module runs alongside live Teable, the team uses it to build confidence while its
worker targets **GOO staging / dry-run only** (OD-K-3/4), and a **single atomic flip** later switches
the worker's target to GKID and stops the Teable poller — the one and only moment production writes
move (NFR-001).

**Deliberate differences from the oracle** (not parity gaps — improvements the port adopts):
per-person Supabase Auth + RLS replaces the shared CF-Access ops-lead allowlist and free-text
`submitted_by` / `reviewed_by` (now real `shared.people` FKs); the durable `integrations.esb_push`
outbox + worker replaces the in-process `esb_poller`; and the GIGO/notes/batch/stock rules are preserved
exactly.

---

## 2. Domain model & vocabulary (CONTEXT.md + ADR-0012 — used exactly)

| Term | Meaning in this spec |
|---|---|
| **Module** | A MOS app surface sharing the stack via schema separation (CONTEXT.md). The **Kitchen ops Module** owns the typed `ops.wip_items` / `ops.kitchen_logs` / `ops.kitchen_plans` / `ops.kitchen_stock` tables and produces `integrations.esb_push` rows. |
| **WIP item** | `ops.wip_items` — a work-in-progress kitchen product (a portionable prep). Carries the ESB identity needed to post: `esb_bom_id`, `esb_product_detail_id_porsi`, `esb_product_id`, plus `flag_active`, `name`, `category` ([oracle] `list_active_wip_items` / `list_approved_unposted`). |
| **action_type** | The kitchen action a log/plan row records — exactly one of **`Production`** · **`Transfer to Bungur`** · **`Transfer to Radiant`** (canonical). Production adds stock; transfers subtract it; Transfer-to-Bungur is an **ESB no-op** (same-location). Legacy Teable spellings "Transfer to RRS"→Bungur, "Transfer to GGS"→Radiant are normalized at migration ([oracle] `normalize_action_type`). |
| **Kitchen log** | `ops.kitchen_logs` — one logged occurrence of an action_type for a WIP item on a date, with `qty_porsi` (portions), `status` (Submitted/Approved/Rejected), `submitted_by` (a person), review fields, and (post-approval) `batch_id` + ESB-posting history. **Increment, not replace** — multiple logs for the same (date, item, action) sum. **Distinct from a `Log entry`** (CONTEXT.md). |
| **Daily plan** | `ops.kitchen_plans` — the planned `qty_porsi` for a (date, WIP item, action_type), set by ops-leads, **replace/upsert** semantics (re-saving the same key PATCHes it). The target the logging gate and review variance check compare against. |
| **kitchen_stock** | `ops.kitchen_stock` — usable inventory per (date, WIP item), **auto-computed** as the running net of **Approved** logs: `Σ Production − Σ Transfer(Bungur+Radiant)`. Start-of-day cut (`log_date < D`) for the logging availability gate; end-of-day cut (`log_date ≤ D`) for the stored balance. Negative balances are preserved (they surface data issues) ([oracle] `list_stock_for_date` / `recompute_stock_for_items`). |
| **status** (kitchen log) | `Submitted` (default on insert) → `Approved` or `Rejected`. **Approved** is the GIGO gate: only Approved logs count toward stock and ESB. Reversible only via re-review (not modelled as hard delete). |
| **batch_id** | `<PREFIX>-YYYYMMDD-NNN` minted **at approval** (PR=Production, TR=Transfer to Radiant, TB=Transfer to Bungur; daily counter per (prefix, date)). Groups Approved logs into **one ESB call per batch** ([oracle] `mint_batch_id`, `poll_once` grouping). |
| **ESB push (outbox row)** | `integrations.esb_push` — one durable, Module-agnostic row **per batch**, carrying the target endpoint + composed payload + `dedup_key` + `target_env` (`goo` / `gkid` / `dry_run`) + `status` + `retry_count` + `esb_doc_num`. Central dedup prevents double-post (ADR-0012). |
| **target_env** | The ESB destination for a push row: **`gkid`** (production, real inventory), **`goo`** (`stg-erp.esb.co.id` staging — functional parity, TEST DATA only — OD-K-3), or **`dry_run`** (no call, sentinel doc). **Before the flip the worker emits only `goo` / `dry_run`** (OD-K-4, NFR-001). |
| **Daily Log summary mirror** | The `ops.log_entries` row (`origin = 'kitchen'`, `event_type = 'production'`, business unit = Kitchen and Bar) written on approval so the kitchen happening appears in the cross-Module **Daily Log** (ADR-0012, CONTEXT.md "Log entry"). It has **no** owner/RACI/status — it is a one-line floor record, distinct from the kitchen log it summarizes. |
| **Access role** | `admin` / `ops_lead` / `finance` / `member` (+ derived `manager`) per ADR-0011. Kitchen loggers = `member`; approvers = `ops_lead`. |
| **The flip** | The single atomic operational cutover (OD-K-2): worker target switches `goo`→`gkid` **and** the Teable poller stops — the one moment production ESB writes move to the new Module. Owner-gated. |
| **Bungur / Radiant** | Bungur = the central kitchen (ESB branch 8 "RRS", location 15); Radiant = the destination outlet (ESB branch 4 "GGS", location 7). Canonical UI names are Bungur/Radiant; ESB codes live only in the push payload ([oracle] `esb_poller` constants). |

---

## 3. Data model

> The full column lists, indexes, RLS policy SQL, and the `integrations.esb_push` outbox shape are owned
> by **eng-planner + ADR-0012** at plan/migration time. This section fixes the **behaviorally-load-bearing**
> shape the ACs assert against; it follows the existing `ops.log_entries` conventions (schema-qualified,
> `org_id` default `shared.current_org_id()`, `set_updated_at` trigger, enable+FORCE RLS, no DELETE
> grant, SECURITY INVOKER gate functions).

### 3.1 `ops.wip_items`
Active-flagged kitchen products. Behaviorally required columns: `id`, `org_id` (server-stamped),
`name` (non-blank), `category`, `flag_active` (boolean), and the ESB identity
`esb_bom_id`, `esb_product_detail_id_porsi`, `esb_product_id`. **Org-readable**; write restricted to
`ops_lead`/`admin` (master data). The logging/plan/review UIs list **active** items sorted by name
([oracle] `list_active_wip_items`).

### 3.2 `ops.kitchen_plans`
Per (`org_id`, `date`, `wip_item_id`, `action_type`) planned `qty_porsi`, with `notes`, `plan_by`
(person FK), `updated_at`. **Unique** on (`org_id`, `date`, `wip_item_id`, `action_type`) — re-saving
the same key **upserts** (replace semantics, [oracle] `upsert_plan_rows`). `action_type` is
text + CHECK over the three canonical values. Plan rows are the variance baseline; they never post to
ESB.

### 3.3 `ops.kitchen_logs`
The core fact table. Behaviorally-load-bearing columns:
`id`, `org_id`, `business_unit_id` (Kitchen and Bar), `date` (the WIB log date),
`action_type` (text + CHECK over the three canonical values), `wip_item_id` (FK → `ops.wip_items`),
`qty_porsi` (numeric > 0), `notes`, `status` (text + CHECK `Submitted`/`Approved`/`Rejected`, default
`Submitted`), `submitted_by` (FK → `shared.people`, server-stamped from session), `review_note`,
`reviewed_by` (FK → `shared.people`), `reviewed_at`, `batch_id` (nullable; set at approval),
and the **ESB-posting history** mirrored from the outbox for audit: `posted_to_esb` (boolean),
`esb_doc_num`, `posted_at`. **Increment semantics**: each submit inserts a new row; there is no
update-in-place of an existing same-key log ([oracle] `submit_kitchen_log_rows`). Indexes at least on
(`org_id`, `date`), (`org_id`, `status`), (`batch_id`).

### 3.4 `ops.kitchen_stock`
Per (`org_id`, `date`, `wip_item_id`) `usable_qty`, with `notes`, `updated_at`. **Auto-computed**, not
manually entered (owner 2026-05-11, [oracle] `list_stock_for_date` docstring) — the running net of
Approved logs. Stored as an end-of-day projection (`recompute_stock_for_items`, `log_date ≤ D`) for an
auditable trail; the logging-availability gate uses the start-of-day cut (`log_date < D`). Unique on
(`org_id`, `date`, `wip_item_id`). **Whether kitchen_stock is a stored projection or a pure
on-the-fly computed read is an open question — §10.**

### 3.5 `integrations.esb_push` (ADR-0012 — Module-agnostic outbox)
One row **per batch**. Behaviorally-load-bearing columns:
`id`, `org_id`, `source_module` (`'kitchen'`), `source_ref` (the `batch_id`),
`endpoint` (e.g. `assembly-actual` / `simple-transfer` / `noop`), `payload` (jsonb — the fully-composed
ESB body), `target_env` (`goo`/`gkid`/`dry_run`, CHECK), `dedup_key` (**unique** — the central
double-post guard; derived from (`source_module`, `source_ref`, `target_env`)), `status`
(`pending`/`in_flight`/`posted`/`failed`/`dead_letter`), `retry_count`, `last_error`, `esb_doc_num`,
`created_at`, `posted_at`. **No DELETE grant.** RLS: app tier (`ops_lead`) may read its org's rows;
**only the worker (service role) inserts/updates** posting state (the app enqueues via a SECURITY-DEFINER
RPC or the approval trigger — eng-planner decides the exact write path).

### 3.6 `ops.log_entries` — kitchen summary mirror (existing table, reused)
On approval the Module inserts one **summary** `ops.log_entries` row per approved batch (or per approved
log — eng-planner picks the grain; the AC asserts at least one appears): `origin = 'kitchen'`,
`event_type = 'production'`, `business_unit_id` = Kitchen and Bar, `title` = a one-line human summary
(e.g. "Production: 12 portions Nasi Goreng approved"), `detail` carrying batch_id / quantities,
`occurred_at` = the approval instant. **No owner/RACI/status** (it is a Daily Log row, CONTEXT.md). The
existing `ops.log_entries` schema already admits `origin = 'kitchen'`? — **NO**: today its CHECK is
`('manual','kitchen_app','roastery_app')`. **This Module must widen that CHECK to include `'kitchen'`**
(or write `'kitchen_app'` to match the existing CHECK) — eng-planner reconciles the origin token with
ADR-0012's stated `origin = 'kitchen'`; the migration is the seam (FR-095).

---

## 4. Functional requirements (EARS)

### Auth / identity / access (ADR-0011)
- **FR-001** The system shall authenticate each kitchen user as an individual `shared.people` identity
  via Supabase Auth (per-person), replacing the oracle's shared CF-Access ops-lead allowlist.
- **FR-002** Where a kitchen staff member has no real email, the system shall provision a **synthetic
  email** identity (ADR-0011) so every logger is a distinct person with attributable writes.
- **FR-003** The system shall grant **logging (insert own Submitted kitchen logs)** to any
  authenticated `member`, and **approval / plan editing / review** to `ops_lead` (and `admin`), enforced
  by RLS — not by UI gating alone (ADR-0011).
- **FR-004** The system shall present the Kitchen Module as an **installable PWA**, responsive on a
  personal phone, with a **30-day session** (ADR-0010/0011).
- **FR-005** The system shall treat writes as **online-only**: when offline, a write shall fail with a
  graceful, explicit error and shall **not** be silently queued or lost (ADR-0010, §7).

### WIP items (master data)
- **FR-010** The system shall persist WIP items as `ops.wip_items` rows carrying the ESB identity
  (`esb_bom_id`, `esb_product_detail_id_porsi`, `esb_product_id`), `flag_active`, `name`, `category`.
- **FR-011** The system shall list, in the logging / plan / review surfaces, only **active**
  (`flag_active = true`) WIP items, sorted by name ([oracle] `list_active_wip_items`).

### Logging — production & transfer (members)
- **FR-020** The system shall let a `member` log one or more (WIP item, `qty_porsi`) lines for a chosen
  **action_type** (`Production` / `Transfer to Bungur` / `Transfer to Radiant`) on **today** (WIB),
  each line inserting a `ops.kitchen_logs` row with `status = 'Submitted'` and `submitted_by` stamped
  from the session ([oracle] `submit_kitchen_log_rows`).
- **FR-021** The system shall apply **increment semantics**: a new log for an existing (date, item,
  action_type) is **added** to that day's running total, never overwriting a prior log; the day's actual
  for an (item, action) is the **sum** of its non-Rejected logs ([oracle] `sum_actuals_for_date`).
- **FR-022** When a logged `qty_porsi` **deviates** from the effective plan target for that (item,
  action) — including any off-plan "extra" with no plan row — the system shall **require a note** on
  that line before accepting the submit ([oracle] note-required gate in `kitchen_submit`). The effective
  target for stock-consuming actions accounts for current stock (`max(plan − stock, 0)`).
- **FR-023** When a **transfer** line's `qty_porsi` exceeds **available** stock
  (`tersedia = prior-day stock + today's approved/loggable Production − today's transfers already
  logged`), the system shall **reject the submit** with a clear "produce first" message ([oracle]
  Bug-#2 hard stop in `kitchen_submit`). Multi-line submits of the same item must not bypass the cap.
- **FR-024** The system shall keep a Submitted log **invisible to ESB and to stock** until it is
  Approved (the GIGO gate, FR-040/FR-050).

### Daily plan editor (ops-leads)
- **FR-030** The system shall let an `ops_lead` set the planned `qty_porsi` per (date, WIP item,
  action_type) in a plan editor, defaulting the date to today (WIB) and allowing any date.
- **FR-031** The system shall apply **replace/upsert** semantics on save: a plan line for an existing
  (date, item, action_type) **PATCHes** that row; a new key **inserts** ([oracle] `upsert_plan_rows`).
  `plan_by` is stamped from the saving person's session.
- **FR-032** The system shall make the saved plan the **baseline** for the logging variance gate
  (FR-022) and the review variance display (FR-041).

### Review / approve queue (ops-leads) — the GIGO gate
- **FR-040** The system shall present a review queue of **Submitted** kitchen logs for a chosen date,
  grouped by action_type, each showing planned vs logged `qty_porsi`, the WIP item, the submitter, and
  the submit note ([oracle] `review_page`).
- **FR-041** The system shall let an `ops_lead` **Approve** or **Reject** a Submitted log, and shall
  **require a review note** when (a) **rejecting**, or (b) the approved quantity **deviates from plan**
  ([oracle] note-required gates in `review_decide`).
- **FR-042** The system shall enforce the **production-first** gate: a **Transfer** approval (single or
  bulk) is **blocked** while any **Production** log for the same date is still Submitted; **Reject is
  always allowed** ([oracle] `_production_pending_for_date`).
- **FR-043** The system shall support **bulk approve** of all Submitted logs in one action_type section,
  subject to the same production-first gate ([oracle] `review_bulk`).
- **FR-044** The system shall gate Approve/Reject to `ops_lead`/`admin` at the **RLS** layer
  (Submitted→Approved is an RLS-permitted transition only for these roles), and stamp `reviewed_by`
  (session person) + `reviewed_at` + `review_note`.

### batch_id minting (at approval)
- **FR-050** When a log is **Approved**, the system shall **mint a `batch_id`** of the form
  `<PREFIX>-YYYYMMDD-NNN` where PREFIX ∈ {PR=Production, TR=Transfer to Radiant, TB=Transfer to Bungur},
  `YYYYMMDD` is the log date, and `NNN` is a **daily counter scoped per (prefix, date)**, incrementing
  from the current max ([oracle] `mint_batch_id`). Minting shall be **collision-safe** under concurrent
  approvals (FR-051).
- **FR-051** The system shall mint `batch_id` values without duplication under concurrent approve
  actions (the oracle's process-local lock is replaced by a **DB-level** guarantee — a unique constraint
  or `SELECT … FOR UPDATE` / sequence per (prefix, date); eng-planner picks the mechanism). A Rejected
  log shall **not** receive a `batch_id`.

### kitchen_stock auto-compute
- **FR-060** The system shall compute `kitchen_stock.usable_qty` as the **net of Approved logs**:
  `+qty_porsi` for `Production`, `−qty_porsi` for `Transfer to Bungur` and `Transfer to Radiant`;
  **Submitted/Rejected logs do not count** ([oracle] `list_stock_for_date` / `list_current_stock`).
- **FR-061** The system shall offer two cuts of the net: **start-of-day** (`log_date < D`, the logging
  availability basis, FR-023) and **end-of-day** (`log_date ≤ D`, the stored/auditable balance), and
  shall **preserve negative balances** (they surface real data issues — do not clamp to zero) ([oracle]).
- **FR-062** When a log is Approved (or un-approved via re-review), the system shall **recompute** the
  affected (date, item) stock so the balance stays consistent with approved activity ([oracle]
  `recompute_stock_for_items` fired on approve).

### ESB outbox + worker (ADR-0010/0012) — one call per batch, idempotent, staging-vs-prod
- **FR-070** When a batch is minted at approval, the system shall **enqueue exactly one
  `integrations.esb_push` row for that batch**, carrying the endpoint, the fully-composed payload, the
  `target_env`, and a **unique `dedup_key`** derived from (`source_module`, `source_ref`/batch_id,
  `target_env`) (ADR-0012).
- **FR-071** The system's **outbox worker** shall drain `pending` push rows and dispatch **exactly one
  ESB call per row/batch** by endpoint: **Production → `/production/simple-manufacturing/assembly-actual`**
  (actual-costing: BOM-composed `simpleManufacturingMaterials` per detail from `esb_bom_id`, with
  `productDetailID = esb_product_detail_id_porsi`, `manufacturingQty = qty_porsi`; Bungur branch 8 /
  origin = dest = loc 15); **Transfer to Radiant → `/simple-transfer`** (origin loc 15 → dest loc 7,
  `productDetailID = esb_product_detail_id_porsi`, `qty = qty_porsi`); **Transfer to Bungur → NO ESB
  call** — close with the sentinel doc num `N/A (ESB no-op)` and the skip note ([oracle] `esb_poller`).
- **FR-072** The worker shall be **idempotent**: a push row already `posted` (or whose `dedup_key`
  already resolved to an ESB doc) shall **never** be re-posted; a retry after a worker crash or a
  duplicate enqueue shall produce **at most one** ESB document per batch (ADR-0012, OD-K-4).
- **FR-073** On ESB success the worker shall record `esb_doc_num` + `posted_at` + `status = 'posted'` on
  the push row and mirror `posted_to_esb` / `esb_doc_num` / `posted_at` onto the batch's
  `ops.kitchen_logs` rows for audit ([oracle] `mark_log_posted`).
- **FR-074** On ESB failure the worker shall **increment `retry_count`**, store `last_error`, and leave
  the row retryable until `retry_count ≥ MAX_RETRY`, after which it transitions to **`dead_letter`** and
  stops auto-retrying (manual intervention; surfaced to ops-leads) ([oracle] `mark_log_post_failed`,
  `MAX_RETRY`).
- **FR-075** The worker shall handle ESB **auth** internally (login, refresh-once-on-401, re-login on
  refresh failure) so the push pipeline never surfaces auth to the caller ([oracle]
  `esb_client._TokenManager`).
- **FR-076** The worker shall parse the ESB doc number from the success envelope
  (`simpleManufacturingNum` / `simpleTransferNum`, with the legacy `# <num>` string fallback) ([oracle]
  `_parse_doc_num_from_dict`).
- **FR-077** The worker shall provide a **primary event-fire path** (push fires promptly after approval)
  **and** a **safety-net periodic sweep** of `pending`/retryable rows, serialized so the two paths
  cannot double-post the same batch ([oracle] `kick()` + `poller_loop` + `_poll_lock`; the DB
  `dedup_key` is the durable cross-process guarantee the oracle's in-process lock could not give).

### target environment + the no-double-post safety constraint (OD-K-3/4)
- **FR-080** The system shall stamp each push row's `target_env` and the worker shall route the call to
  that environment: **`goo`** → `stg-erp.esb.co.id` (functional parity, TEST DATA only — OD-K-3);
  **`gkid`** → production `services.esb.co.id/core`; **`dry_run`** → no call, sentinel doc.
- **FR-081** **Before the flip**, the system shall emit push rows with `target_env ∈ {goo, dry_run}`
  **only** — **never `gkid`** — so the new worker performs **zero** production GKID writes during the
  parallel run (OD-K-4, NFR-001). The pre-flip target is a **deployment-enforced** constraint (config
  the worker reads), not a per-request option the UI can override to `gkid`.
- **FR-082** The **flip** (OD-K-2) shall be a single owner-gated cutover that (a) switches the emitted
  `target_env` to `gkid` and (b) stops the Teable poller — the **one** moment production ESB writes move
  to the new Module. Before the flip the **Teable poller remains the SOLE writer to production GKID**.
- **FR-083** GOO validates **ESB call mechanics** (request shape, auth, response parsing) but holds
  **only test data, not GKID's real product/BOM IDs** (OD-K-3); therefore real-data/real-ID validation
  shall be done by a **single-WIP proof-push on GKID at flip** (one minimal real batch, verified end to
  end), recorded as the flip's acceptance step (FR-082, AC-094).

### Daily Log summary mirror (ADR-0012)
- **FR-090** When a kitchen batch is Approved, the system shall write a **summary `ops.log_entries`**
  row (`origin = 'kitchen'`, `event_type = 'production'`, business unit = Kitchen and Bar,
  `occurred_at` = approval time, `title` = a human one-line summary, `detail` = batch/quantity context)
  so the kitchen happening appears in the cross-Module **Daily Log** (ADR-0012).
- **FR-091** The summary mirror row shall carry **no owner/RACI/status** and shall be a faithful Daily
  Log entry (CONTEXT.md) — managers see it in `/ops`; it does **not** duplicate the kitchen log's
  reviewable lifecycle.
- **FR-092** The summary-mirror write shall be **idempotent per batch** — re-running the approval/enqueue
  path for an already-mirrored batch shall **not** create a duplicate Daily Log row.

### Migration & history preservation (ADR-0012 D4)
- **FR-095** The migration shall create the typed `ops.*` kitchen tables and **widen / reconcile** the
  `ops.log_entries.origin` CHECK to admit the kitchen summary token (`'kitchen'` per ADR-0012, or map to
  the existing `'kitchen_app'`), reversibly.
- **FR-096** When kitchen history is migrated from Teable, the system shall **preserve each row's
  `posted_to_esb` / `esb_doc_num` / `posted_at`** so that **already-posted** rows are imported as
  already-posted and the worker **never re-posts** them (ADR-0012 D4, OD-K-4). Migrated already-posted
  batches shall carry a resolved `dedup_key` (or be excluded from the `pending` set) so the worker skips
  them.

### Parallel-run / shadow & flip (OD-K-2)
- **FR-100** Until a **manual owner switch**, the MOS Kitchen Module is **never in production**: it is
  exercised by **manual testing only** (the team/owner trial it directly), while the **live Teable app
  remains the sole production system of record** and its poller the sole GKID writer. There is **NO
  shadow ingestion and NO dual-entry** — the two apps do not share a data flow; the MOS worker emits
  **GOO/dry-run only** (OD-K-2/4, FR-081). The two apps are distinguished by a **different UI** so
  testers never confuse them. **In-person training + onboarding precede the switch.**
- **FR-101** The MOS worker shall be gated by a **deploy/runtime push-enable flag** mirroring the
  existing app's proven **`ESB_PUSH_ENABLED`** guardrail (default = **off** → GOO/dry-run, with a
  sentinel doc on dry-run). The flag is flipped to GKID **only by a manual owner action** (the flip,
  FR-082) — paired with stopping the Teable poller and the single-WIP GKID proof-push (FR-083). **No
  automated or scheduled switch exists.**

---

## 5. Non-functional requirements

- **NFR-001 (Safety — NO double-posting to production GKID — HARD).** Until the atomic flip, the
  `integrations.esb_push` worker shall make **zero** writes to production GKID: it targets **GOO
  (staging) or dry-run ONLY** (OD-K-4). The Teable poller is the **sole** GKID writer pre-flip. After
  the flip the new worker is the sole GKID writer and the Teable poller is stopped. There is **no window**
  in which both write to GKID. Combined with the central **`dedup_key`** (FR-072) and the
  history-preserving migration (FR-096), the system guarantees **at most one** ESB document per batch
  across retries, crashes, both push paths, and the migration. Proven by **pgTAP** (dedup/no-DELETE/role
  gates) + **integration tests** of the worker against a stubbed ESB asserting target routing and
  idempotency.
- **NFR-002 (Security — per-person RLS on every kitchen table).** `ops.wip_items`, `ops.kitchen_logs`,
  `ops.kitchen_plans`, `ops.kitchen_stock`, and `integrations.esb_push` shall each have RLS **enabled
  and FORCED**, org-scoped, with the access-role gates of ADR-0011: members insert own Submitted logs;
  ops_leads/admins approve, plan, and read the outbox; the Submitted→Approved transition is **not**
  available to a `member`. No DELETE grant on any of them. Proven in **pgTAP**.
- **NFR-003 (Security — unspoofable provenance).** `org_id`, `submitted_by` (on insert), and
  `reviewed_by` (on approve) shall be **server-stamped** from the session (`current_org_id()` /
  `current_person_id()`), client-unspoofable — a member cannot forge another person as submitter, nor a
  reviewer as someone else. Proven in **pgTAP**.
- **NFR-004 (Staging-first ESB).** ESB call mechanics shall be validated against **GOO staging** before
  any GKID write; GKID is reached only post-flip and is first exercised by the **single-WIP proof-push**
  (OD-K-3, FR-083). The worker's default/unset target shall be the **safe** one (`goo`/`dry_run`), never
  `gkid` — fail safe, not fail open (Gordi standing directive: ESB tests hit GOO first).
- **NFR-005 (Secrets).** All ESB and Supabase credentials shall be supplied via the platform secret
  store (never committed, never in client code); the worker holds the ESB service credentials, the PWA
  never does (ADR-0010, standing safety directive).
- **NFR-006 (Latency parity).** On the **post-flip production path**, an approval shall produce an ESB
  document within **~1–2s** typical (the oracle's event-fire `kick()` latency), with the safety-net
  sweep as backstop ([oracle] esb_poller docstring "ESB doc lands 1–2s after approval").
- **NFR-007 (Time correctness — WIB).** All "today" / log-date / batch-date computations shall use
  Asia/Jakarta (WIB, UTC+7, no DST), reusing the MOS `week.ts` fixed-offset arithmetic — no
  host-timezone leak (mirrors `ops-log.spec.md` NFR-005; [oracle] `iso_to_jakarta_date`).
- **NFR-008 (PWA online-only writes).** Writes require connectivity; offline shall present a graceful
  explicit error and block the write (no silent loss, no optimistic local mutation that can desync from
  the GIGO gate) (ADR-0010, FR-005).
- **NFR-009 (Reversibility & convention).** Migrations shall be reversible and follow MOS conventions:
  schema-qualified, `set search_path = ''` on functions, enable+FORCE RLS, **no DELETE grant**,
  SECURITY INVOKER gate functions where possible (matching `ops.can_edit_log_entry`); any
  SECURITY DEFINER enqueue RPC must revoke PUBLIC execute (integration-CI lint).
- **NFR-010 (Worker resilience).** The worker shall survive ESB outages and restarts without losing or
  double-sending work: durable `pending` rows, serialized push paths, bounded retry → dead-letter, and
  restart-safe token handling ([oracle] poller resilience, hardened by the durable outbox).
- **NFR-011 (Security hardening + gating audit).** The Module's auth, RLS, the org_id tenancy seam, the
  ESB credential handling, and the enqueue/worker write path shall pass a gating **`security-auditor`**
  (OWASP/STRIDE) review before the flip (ADR-0010, CLAUDE.md gate, standing directive that security is
  gating).
- **NFR-012 (i18n posture).** EN chrome / ID content, matching MOS (the oracle's Indonesian operator
  copy — "Catatan wajib…", "Stok kurang…" — is content, surfaced as-is or localized at UI build).
- **NFR-013 (Coverage / gates).** Changed code shall meet the binding gates: ≥80% lines, `npm run
  typecheck` clean, ESLint `--max-warnings=0`, worker code typechecked/linted to its stack's equivalent;
  each `AC-###` proven at its lowest sufficient layer.

---

## 6. Acceptance criteria (Given/When/Then) — each tagged with its owning test layer

> **Test-pyramid rule (CLAUDE.md).** Each AC is owned by **one** test at the **lowest sufficient layer**.
> RLS / role gates / unspoofable stamps / no-DELETE / dedup-uniqueness / CHECK constraints → **pgTAP**.
> batch_id minting, stock net math, variance/availability gates, worker dispatch + idempotency + target
> routing (against a **stubbed ESB**) → **Unit / integration (Vitest or the worker stack's test
> runner)**. Real cross-stack journeys (log → review → approve → outbox → Daily Log mirror) → **E2E
> (Playwright)**, curated. The AC id is tagged in the owning test's title so `grep -r AC-###` finds it.

### Auth / access / RLS → **pgTAP**
- **AC-001 [pgTAP]** Given an authenticated `member`, When they INSERT a kitchen log with a valid active
  WIP item, action_type, and `qty_porsi > 0`, Then it succeeds with `status = 'Submitted'`, `org_id` and
  `submitted_by` stamped to the member's session — FR-003, FR-020, NFR-002/003.
- **AC-002 [pgTAP]** Given a `member`, When they attempt to INSERT a kitchen log with `submitted_by` set
  to **another person** or `org_id` set to a **foreign org**, Then the stamp is constrained to the
  session person/org (forged provenance not persisted) — FR-001, NFR-003.
- **AC-003 [pgTAP]** Given a Submitted kitchen log, When a **`member`** attempts to UPDATE its `status`
  to `Approved`, Then it is **denied** (approval is `ops_lead`/`admin` only) — FR-044, NFR-002.
- **AC-004 [pgTAP]** Given a Submitted kitchen log in org A, When an `ops_lead` of org A sets
  `status = 'Approved'` with `reviewed_by` stamped, Then it succeeds; When an ops_lead of **org B**
  reads or updates it, Then **zero rows** (org isolation) — FR-044, NFR-002.
- **AC-005 [pgTAP]** Given any kitchen table or the outbox, When an authenticated user issues a
  **DELETE**, Then it is denied (no DELETE grant on any of `ops.wip_items` / `ops.kitchen_logs` /
  `ops.kitchen_plans` / `ops.kitchen_stock` / `integrations.esb_push`) — NFR-002, FR-095.
- **AC-006 [pgTAP]** Given `ops.wip_items` (master data), When a `member` attempts to INSERT/UPDATE a
  WIP item, Then it is denied; an `ops_lead`/`admin` may — FR-010, NFR-002.
- **AC-007 [pgTAP]** Given `integrations.esb_push`, When the app tier (non-worker role) attempts to set
  a row `posted`/`esb_doc_num`, Then it is denied (only the worker/service role writes posting state);
  an `ops_lead` may READ its org's push rows — FR-070/073, NFR-002.
- **AC-008 [pgTAP]** Given an enqueued `integrations.esb_push` row, When a second enqueue with the same
  (`source_module`, `source_ref`, `target_env`) is attempted, Then the **unique `dedup_key`** rejects
  the duplicate — FR-070/072, NFR-001.

### batch_id minting → **Unit**
- **AC-010 [unit]** Given two existing Approved Production logs on 2026-06-19 with batch_ids
  `PR-20260619-001` and `PR-20260619-002`, When a third Production log is approved that date, Then it
  mints `PR-20260619-003` (daily counter per (prefix, date)) — FR-050.
- **AC-011 [unit]** Given concurrent approvals of two Production logs on the same date, When both mint a
  batch_id, Then they receive **distinct** ids (no collision) — FR-051, NFR-001.
- **AC-012 [unit]** Given a log being **Rejected**, When the decision is recorded, Then **no batch_id**
  is minted and the log never enters the outbox — FR-051, FR-024.
- **AC-013 [unit]** Given approvals of a Transfer-to-Radiant and a Transfer-to-Bungur log, Then they
  mint `TR-…` and `TB-…` prefixes respectively — FR-050.

### Logging gates — variance note + availability → **Unit**
- **AC-020 [unit]** Given a plan target of 10 for an item/action and a logged qty of 10, When submitted
  without a note, Then it is accepted; Given a logged qty of 7 (deviates) **without a note**, Then the
  submit is **rejected with a note-required cue**; with a note, accepted — FR-022.
- **AC-021 [unit]** Given an item with **no plan row** ("+ extra"), When any qty is logged without a
  note, Then a note is required — FR-022.
- **AC-022 [unit]** Given current available stock of 8 for an item, When a Transfer line of 10 is
  submitted, Then it is **rejected** ("produce first"); a Transfer of ≤ 8 is accepted; two transfer
  lines of 5+5 for the same item in one submit are capped at the 8 available — FR-023.

### Increment semantics + stock net math → **Unit**
- **AC-030 [unit]** Given an existing Submitted Production log of 5 for an item today, When a member logs
  another 3 for the same item/action, Then a **new** row is inserted and the day's actual for that
  (item, action) is **8** (sum), not 3 (no overwrite) — FR-021.
- **AC-031 [unit]** Given Approved logs: Production +12, Transfer to Radiant −4, Transfer to Bungur −3
  for an item, When stock is computed, Then `usable_qty = 5`; a **Submitted** Production of +9 on the
  same item **does not** change the computed stock (GIGO gate) — FR-060, FR-024.
- **AC-032 [unit]** Given Approved Transfers exceeding Approved Production for an item, When stock is
  computed, Then the **negative** balance is preserved (not clamped to 0) — FR-061.
- **AC-033 [unit]** Given the start-of-day cut (`log_date < D`) vs end-of-day cut (`log_date ≤ D`), When
  both are computed for a date with same-day approved activity, Then the end-of-day value includes that
  day's activity and the start-of-day value excludes it — FR-061.
- **AC-034 [unit]** Given a log is Approved for (date, item), When the approval path runs, Then
  `kitchen_stock` for that (date, item) is recomputed to match the new approved net — FR-062.

### Review / approve gates → **Unit + pgTAP**
- **AC-040 [unit]** Given a Submitted log whose approved qty equals plan, When approved without a note,
  Then accepted; Given an approved qty that deviates from plan **without a review note**, Then
  **rejected (note required)**; with a note, accepted — FR-041.
- **AC-041 [unit]** Given a **Reject** decision **without** a review note, Then it is rejected
  (note required); with a note, the log is Rejected — FR-041.
- **AC-042 [unit]** Given a date with a still-**Submitted Production** log, When an ops_lead tries to
  approve a **Transfer** log (single or bulk) for that date, Then it is **blocked** ("finish Production
  first"); a **Reject** of the transfer is still allowed — FR-042, FR-043.
- **AC-043 [pgTAP]** Given the Submitted→Approved transition, When attempted by a `member`, Then denied;
  by an `ops_lead`, Then allowed with `reviewed_by`/`reviewed_at` stamped — FR-044 (RLS authority).

### ESB worker — dispatch, no-op, idempotency, retry, target routing → **integration (stubbed ESB)**
- **AC-050 [integration]** Given an enqueued **Production** push row, When the worker runs against a
  stubbed ESB, Then it makes **one** POST to `/production/simple-manufacturing/assembly-actual` with
  BOM-composed `simpleManufacturingMaterials`, `productDetailID = esb_product_detail_id_porsi`,
  `manufacturingQty = qty_porsi`, branch 8 / origin = dest = loc 15, and records the returned
  `simpleManufacturingNum` — FR-071, FR-076.
- **AC-051 [integration]** Given an enqueued **Transfer-to-Radiant** push row, When the worker runs,
  Then it makes **one** POST to `/simple-transfer` (origin loc 15 → dest loc 7, `qty = qty_porsi`) and
  records the `simpleTransferNum` — FR-071.
- **AC-052 [integration]** Given an enqueued **Transfer-to-Bungur** push row, When the worker runs, Then
  it makes **NO ESB call**, closes the row with the sentinel `N/A (ESB no-op)` + skip note, and marks the
  batch posted — FR-071.
- **AC-053 [integration]** Given a push row already `posted`, When the worker runs again (safety-net
  sweep, duplicate enqueue, or post-crash replay), Then it makes **no** further ESB call for that batch
  (idempotent — at most one doc per batch) — FR-072, FR-077, NFR-001.
- **AC-054 [integration]** Given the ESB returns an error, When the worker processes the row, Then
  `retry_count` increments and `last_error` is stored with the row left retryable; after `MAX_RETRY`
  the row becomes **`dead_letter`** and is no longer auto-retried — FR-074, NFR-010.
- **AC-055 [integration]** Given an ESB **401** on a call, When the worker processes, Then it refreshes
  the token once and retries the same call once; refresh failure falls back to re-login — FR-075.
- **AC-056 [integration]** Given the deployment is in **pre-flip** mode, When any push row is processed,
  Then the worker routes to **GOO / dry-run** and makes **zero** GKID calls; Given the (test) flip
  config, the same row routes to **GKID** — FR-080/081/082, NFR-001/004.

### Daily Log summary mirror → **Unit + E2E**
- **AC-060 [unit]** Given a kitchen batch is Approved, When the mirror write runs, Then exactly **one**
  `ops.log_entries` row with `origin = 'kitchen'`, `event_type = 'production'`, Kitchen-and-Bar business
  unit, a human `title`, and `occurred_at` = approval time is created; re-running the path for the same
  batch creates **no duplicate** — FR-090, FR-092.
- **AC-061 [unit]** Given the mirror row, When inspected, Then it carries **no** R/A/status fields (a
  faithful Daily Log entry, distinct from the kitchen log) — FR-091.

### Migration / history preservation → **pgTAP**
- **AC-070 [pgTAP]** Given migrated kitchen history where some rows were already `posted_to_esb = true`
  with an `esb_doc_num`, When the data lands in `ops.kitchen_logs`, Then those rows import as
  already-posted and are **excluded from the worker's `pending`/retry set** (or carry a resolved
  `dedup_key`), so the worker **never re-posts** them — FR-096, NFR-001.
- **AC-071 [pgTAP]** Given the migration, When applied, Then `ops.log_entries.origin` admits the kitchen
  summary token and the change is reversible — FR-095.

### Curated end-to-end journeys → **E2E (Playwright)**
- **AC-090 [e2e]** **Member logs → ops_lead approves → outbox + Daily Log.** Given a `member` on the
  Kitchen Module logs a Production line for an active WIP item (with a note where required), Then it
  appears as **Submitted** in the ops_lead review queue; When an `ops_lead` approves it, Then a
  `batch_id` is minted, an `integrations.esb_push` row is enqueued (`target_env` = the pre-flip safe
  target), `kitchen_stock` reflects the approved qty, and a **Daily Log** (`origin = 'kitchen'`) summary
  appears in `/ops` — FR-020/040/041/050/060/070/090.
- **AC-091 [e2e]** **Variance + production-first gates.** Given a member logs a Production qty that
  deviates from plan **without a note**, Then the submit is blocked until a note is added; Given a still-
  Submitted Production log for the date, When the ops_lead tries to approve a Transfer, Then it is
  blocked until Production is approved — FR-022, FR-042.
- **AC-092 [e2e]** **Transfer-to-Bungur is an ESB no-op end-to-end.** Given an approved Transfer-to-Bungur
  batch, When the worker drains the outbox (pre-flip target), Then **no** ESB call is made, the row
  closes with the sentinel doc, and the kitchen logs show posted with the skip note — FR-071, AC-052.
- **AC-093 [e2e]** **No double-post across the two push paths.** Given an approval fires the event-path
  push and the safety-net sweep also runs for the same batch, Then the batch yields **exactly one** ESB
  document (stubbed ESB asserts a single call) — FR-072/077, NFR-001.
- **AC-094 [e2e/operational]** **Flip proof-push (single-WIP on GKID).** Given the flip is executed
  (target → `gkid`, Teable poller stopped), When a **single minimal real WIP batch** is approved, Then
  exactly one real ESB document is created on GKID, verified end to end, and no Teable-side post occurs
  for the same activity — FR-082/083, NFR-001/004. *(Operational acceptance at flip; automated portion
  asserts target routing + single-call against the GKID-shaped stub — the real GKID post is the owner-
  gated manual proof step.)*

---

## 7. Error handling

| Condition | Layer | Behaviour |
|---|---|---|
| Offline / no connectivity on a write | PWA / UI | Graceful explicit error; write blocked, **not** queued or silently lost (FR-005, NFR-008). |
| Member forges `submitted_by` / `org_id` on insert | RLS WITH CHECK / default | Constrained to session person/org; forged provenance not persisted (AC-002, NFR-003). |
| Member attempts Submitted→Approved | RLS | Denied — approval is `ops_lead`/`admin` only (AC-003/043, FR-044). |
| Cross-org read/write of any kitchen row | RLS USING | Zero rows / denied (org isolation) (AC-004, NFR-002). |
| Log qty deviates from plan with no note | UI + server backstop | Submit rejected with note-required cue (FR-022, AC-020/021). |
| Transfer qty exceeds available stock | UI + server backstop | Submit rejected, "produce first" message (FR-023, AC-022). |
| Transfer approval while Production still Submitted | App + RLS-aware gate | Blocked; Reject still allowed (FR-042, AC-042). |
| Reject without a review note | UI + server backstop | Rejected (note required) (FR-041, AC-041). |
| Duplicate enqueue for a batch (same dedup_key) | DB unique (`dedup_key`) | Rejected — at most one push row per (batch, target) (FR-070/072, AC-008). |
| ESB down / timeout on a push | Worker | `retry_count++`, `last_error` stored, row stays retryable; row remains durable in the outbox (FR-074, NFR-010, AC-054). |
| ESB retry exhaustion (`retry_count ≥ MAX_RETRY`) | Worker | Row → **`dead_letter`**; auto-retry stops; surfaced to ops-leads for manual intervention (FR-074, AC-054). |
| ESB 401 (expired token) on a call | Worker / esb client | Refresh-once then retry the call; refresh-fail → re-login; never surfaced to caller (FR-075, AC-055). |
| Worker crash mid-push / restart | Worker + DB | On restart, durable `pending`/`in_flight` reconciled; idempotency via `dedup_key` + `posted` state prevents re-post (FR-072/077, NFR-010, AC-053). |
| Both push paths fire for one batch | DB dedup + serialized paths | Exactly one ESB doc (no double-post) (FR-077, NFR-001, AC-093). |
| Worker target unset / misconfigured | Worker (fail-safe) | Defaults to the **safe** target (`goo`/`dry_run`), never `gkid` (NFR-004, FR-081). |
| Migrated already-posted row | Migration + worker | Imported as posted; excluded from `pending` so it never re-posts (FR-096, AC-070, NFR-001). |
| Concurrent approvals minting batch_id | DB-level mint guarantee | Distinct ids, no collision (FR-051, AC-011). |
| Approve session / auth expiry mid-review | Supabase Auth | Re-auth required; the approval transaction is atomic — a half-applied approve (status set but no batch/enqueue) must not occur (FR-044/050/070). |

---

## 8. Implementation TODO checklist (high-level — for eng-planner to expand)

**Schema / DB (pgTAP red first):**
- [ ] Migrations for `ops.wip_items`, `ops.kitchen_plans`, `ops.kitchen_logs`, `ops.kitchen_stock`
      (§3.1–3.4): columns, CHECKs (action_type, status, qty > 0), uniques (plan key; stock key),
      indexes, `set_updated_at` triggers, reversible.
- [ ] `integrations.esb_push` outbox table (§3.5): payload jsonb, `target_env` CHECK, **unique
      `dedup_key`**, status/retry/error/doc columns, no DELETE grant, RLS (worker writes posting state;
      ops_lead reads).
- [ ] Widen/reconcile `ops.log_entries.origin` CHECK for the kitchen summary token (FR-095), reversible.
- [ ] RLS for every kitchen table + outbox per ADR-0011 (member insert-own-Submitted; ops_lead approve/
      plan/read-outbox; Submitted→Approved gate; org-scope; unspoofable stamps; no DELETE).
- [ ] batch_id mint mechanism — DB-level collision-safe per (prefix, date) (FR-050/051).
- [ ] Approval write path: status→Approved + mint batch_id + recompute stock + enqueue push row +
      write summary mirror, **atomic** (FR-044/050/062/070/090) — likely a SECURITY DEFINER RPC (revoke
      PUBLIC execute, NFR-009) or trigger.
- [ ] pgTAP suite (numbered after existing `…_ops_log_*`): role/RLS gates, unspoofable stamps,
      no-DELETE, dedup uniqueness, migration history preservation (AC-001..008, 043, 070/071).

**Worker / FastAPI backend (ADR-0010):**
- [ ] ESB client port: assembly-actual (BOM-composed materials), simple-transfer, doc-num parse, token
      mgr (login/refresh/relogin), **target routing** GOO/GKID/dry-run (FR-071/075/076/080).
- [ ] Outbox worker: drain `pending`, one-call-per-batch dispatch by endpoint, Transfer-to-Bungur no-op,
      idempotency via `dedup_key` + `posted` state, retry → dead_letter, mirror posting history onto
      logs (FR-071..077).
- [ ] Event-fire path + safety-net sweep, serialized; **pre-flip target = goo/dry_run only**, flip
      switches to gkid + stops Teable poller (FR-077/081/082, NFR-001).
- [ ] Worker integration tests against a stubbed ESB (AC-050..056, 093).

**UI (PWA — Kitchen Module surfaces, to DESIGN.md tokens):**
- [ ] Logging surface (member): action_type tabs, active WIP item list, qty + note inputs, variance
      note-required gate, transfer availability gate, increment submit (FR-020..024).
- [ ] Plan editor (ops_lead): per-(date, item, action) qty, upsert save (FR-030..032).
- [ ] Review queue (ops_lead): grouped Submitted logs, plan-vs-logged, approve/reject + note,
      production-first gate, bulk approve (FR-040..044).
- [ ] Stock view (read-only, auto-computed) (FR-060..062).
- [ ] PWA install + online-only-write error handling (FR-004/005, NFR-008).

**Migration / rollout (OD-K-2):**
- [ ] Teable→Supabase data migration (master WIP items + plans + logs), preserving posting history
      (FR-096) — timing per §10 open question.
- [ ] Parallel-run readiness (worker → GOO/dry-run; confidence-building state) (FR-100/101).
- [ ] Flip runbook: target→gkid, stop Teable poller, single-WIP GKID proof-push (FR-082/083, AC-094).

**E2E (Playwright — curated):**
- [ ] AC-090 log→approve→outbox+DailyLog; AC-091 variance+production-first gates; AC-092 Bungur no-op;
      AC-093 no-double-post.

**Security (gating before flip):**
- [ ] `security-auditor` OWASP/STRIDE on auth + RLS + org_id seam + ESB credential path + enqueue/worker
      write path (NFR-011).

---

## 9. Owner-decision flags

The four owner scoping decisions of 2026-06-19 are **encoded** above (OD-K-1 full parity; OD-K-2
parallel-run → use → flip; OD-K-3 GOO = functional parity / test data only; OD-K-4 no-double-post-to-GKID
hard constraint). The architecture (typed `ops.*`, `integrations.esb_push` outbox, summary mirror,
auth/RBAC, hosting) is fixed by **ADR-0010/0011/0012** and is conformed-to, not reopened. No new
`[OWNER-DECISION]` is requested in this spec — the items below are recorded as **open questions**, not
decisions blocking sign-off.

---

## 10. Open questions (recorded, not answered)

1. **Shadow-ingestion during parallel run — RESOLVED 2026-06-19 (owner).** There is **no parallel/dual
   entry** to ESB or to the app, and **no Teable→Supabase shadow mirror**. The MOS Kitchen Module is
   **manual-testing-only** until a manual owner switch; **in-person training + onboarding precede the
   switch**; Teable stays the sole live system until then. The worker is gated by an `ESB_PUSH_ENABLED`-
   style flag, default-safe (FR-100/101, FR-081, NFR-001). *(No longer open.)*
2. **Kitchen data-migration timing (FR-096).** Migrate **master data (WIP items + ESB IDs) up front**
   and only logs/plans/stock at flip, or **everything at the flip**? Affects how long the parallel run
   can be meaningful and how stale migrated state can get.
3. **Exact session length (ADR-0011 says ~30 days).** The precise session minutes / refresh policy for
   the kitchen PWA on personal phones.
4. **Outbox retry / backoff / dead-letter specifics.** `MAX_RETRY` value, backoff schedule (the oracle
   uses a flat 30-min safety-net cadence + immediate kick), dead-letter surfacing/alerting and the manual
   reset path for ops-leads.
5. **kitchen_stock: auto-computed-on-read vs stored projection (§3.4).** Keep stock as a pure computed
   read (always derive from approved logs, the oracle's `list_current_stock` style) or maintain a stored
   `ops.kitchen_stock` projection recomputed on approval (the oracle's `recompute_stock_for_items`
   style)? Trade-off: stored is queryable/auditable and faster to read but needs consistent recompute;
   computed-on-read is always correct but heavier per query.

# ADR-0012 — The ESB-outbox pattern (the `integrations` schema's first tenant)

- Status: **Proposed** (2026-06-19; awaiting owner spec sign-off — the specs that consume this ADR
  follow later)
- Deciders: Owner (Arief) + Director, in grill-with-docs session (2026-06-19)
- Related:
  - **OD-DIR-3** (one Supabase, schema-separated — `integrations` is one of the four canonical
    schemas, reserved since P1-2 for exactly this) · **OD-DIR-6** (kitchen-stays-put — **superseded**
    by the migrate-kitchen-into-MOS sequencing, `docs/decisions.md` OD-P4-1) ·
    **OD-P2-15..19** (the Daily Log / `ops.log_entries` model — distinct from kitchen logs, see D3) ·
    **OD-P2-16** (a Log entry has no owner/RACI/status — the reason kitchen logs cannot *be*
    `log_entries`) · **OD-P2-17** (the `origin` marker — the Module seam D3 writes a summary row into) ·
    **OD-P4-6** (staging-first ESB — the D5 decision recorded in `docs/decisions.md`)
  - **ADR-0010** (the thin FastAPI backend that hosts the outbox worker, ADR-0010 D6; the three-layer
    model that keeps this OLTP write-out off the OLAP warehouse; ADR-0010 D1's immutable system of
    record — the reason D5 forbids validating against prod) · **ADR-0011** (the `member`-insert /
    `ops_lead`-approve RLS gate that fires the outbox; the auth model behind `submitted_by` /
    `reviewed_by`) · **ADR-0006** (the `ops` PostgREST exposure + enable+FORCE-RLS discipline every new
    `ops.*` table in D3 inherits) · **ADR-0001** (the `org_id` seam every new table carries)
  - `CONTEXT.md` (vocabulary — **Module** is canonical; "kitchen app" / "roastery app" are legacy, see
    the `docs/decisions.md` "legacy naming to reconcile" note) · `docs/project-brief.md` (the
    kitchen/roastery "ops apps" framing is legacy)
  - `supabase/migrations/20260611000001_schemas.sql` (`integrations` created empty — "Inbound mirrors
    from ops apps (kitchen, …) — tables land later") · `supabase/migrations/20260612000004_ops_log_entries.sql`
    (`ops.log_entries` shape + its `origin` CHECK `manual|kitchen_app|roastery_app` — the legacy enum
    flagged for reconciliation)
- Scope note: **This ADR records the outbox pattern, the schema homes for kitchen data, and the
  migration shape.** It authorizes no migration or worker code by itself — the specs and plans that
  consume it follow. The one-time Teable → Postgres data move is sequenced by ADR-0010 D10.

## Context

Kitchen's ESB write-back (Phase 4, live since 2026-05-18) currently lives **inside the kitchen App**: a
FastAPI poller reads Teable `kitchen_log` rows where `status = Approved AND posted_to_esb = False AND
batch_id IS NOT NULL`, groups them by `batch_id`, and makes **one ESB call per batch** —
`/assembly-actual` for **Production** (using `esb_bom_id` + `esb_product_detail_id_porsi` +
`qty_porsi`) and `/simple-transfer` for **transfers** — then writes back `esb_doc_num` / `posted_to_esb`
on success or `retry_count` + `error` on failure. Two facts shape the redesign:

- **(a) The push fields are denormalized onto every `kitchen_log` row.** A 13-WIP batch copies the same
  `esb_doc_num` across 13 rows. This was a **Teable-era choice** forced by Teable's weak joins — **the
  constraint vanishes in Postgres.**
- **(b) The ESB has no idempotency support** (no `X-Idempotency-Key`, no client-ref). The application
  must dedup, or a retry double-posts to the system of record.

The owner's framing: **ESB push will be numerous and cross-Module** — kitchen is "the first of many"
(roastery next). "App" is the wrong word: there is **one App (MOS)**; kitchen / roastery are **Modules**
(`CONTEXT.md`). The `integrations` schema was reserved at P1-2 for precisely this ("inbound mirrors from
ops apps … idempotency keys, pipeline state") and is still empty — this slice is its first tenant.

## Decision

### D1 — A transactional outbox in `integrations`

Create **`integrations.esb_push`** — **App / Module-agnostic** from day one. Columns (shape, not final
DDL — that lands in the spec/migration):

- `source_module` — `kitchen` | `roastery` | … (the producing Module; **Module-named**, not
  app-named — contrast the legacy `ops.log_entries.origin` enum flagged below)
- `source_ref` — the originating row/batch reference (for kitchen, the `batch_id`)
- `endpoint` — the ESB endpoint (`/assembly-actual`, `/simple-transfer`, …)
- `payload` — the **derived** ESB request body
- `dedup_key` — the idempotency key (D2)
- `status` — pending / in-flight / posted / failed
- `esb_doc_num` — the ESB document number on success
- `attempts`, `error` — retry bookkeeping
- `posted_at` — success timestamp

**One row per batch** — the push fact is stored **once, normalized out of the operational rows**;
operational rows reference it by `batch_id` (fact (a) reversed: no more 13-copy denormalization). This
finally **populates the `integrations` schema** for the purpose it was reserved.

### D2 — One idempotent worker, central dedup

The **thin backend** (ADR-0010 D6) drains the outbox and pushes to the ESB. **`dedup_key` lives in one
place** — solving the ESB's no-idempotency problem (fact (b)) **once for all Modules** rather than
re-implementing dedup per Module. The worker:

- **Ports the proven kitchen poller logic** (event-fire on approval + a ~30-min safety-net poll),
  **repointed Teable → Supabase**.
- **Carries an explicit ESB-target setting (staging vs production)** — the seam D5 leans on; non-prod
  environments default to staging.
- Kitchen is the **first producer**. The table is Module-agnostic from day 1, but the **worker grows a
  handler per Module as each arrives** (YAGNI — the worker stays **kitchen-only now**; roastery adds a
  handler when roastery ships, with no schema change).

### D3 — Kitchen operational data lives in `ops.*` (typed, RLS'd)

Port the Teable kitchen model to typed, RLS-governed tables in `ops` (each ships enable + FORCE RLS in
its creating migration, per the ADR-0006 discipline; each carries `org_id`, per ADR-0001):

- **`ops.wip_items`** — `name`, `category`, `flag_active`, `esb_product_id`,
  `esb_product_detail_id_porsi`, `esb_bom_id`.
- **`ops.kitchen_logs`** — `date`, `action_type` ∈ {Production, **Transfer to Bungur** (ESB no-op),
  **Transfer to Radiant**}, `wip_item`, `qty_porsi`, `status` (Submitted → Approved), `submitted_by`,
  `reviewed_by`, `notes`, `review_note`, timestamps, **`batch_id`**.
- **`ops.kitchen_plans`**, **`ops.kitchen_stock`**.

These are **distinct from `ops.log_entries`** (the lightweight Daily Log — deliberately **no
owner/RACI/status** per OD-P2-16). Kitchen logs carry **status + qty + owner** (`submitted_by` /
`reviewed_by`), so they **cannot be `log_entries`** — they are a richer, reviewable operational record.

**The Daily Log mirror seam is preserved without duplicating the rich data:** on **approval**
(`Submitted → Approved`, the `ops_lead`-gated transition of ADR-0011 D1), write a **summary
`ops.log_entries` row** with `origin` = the kitchen Module. The Daily Log keeps showing "kitchen
produced X today" (OD-P2-17's `origin` marker, originally designed for exactly this mirror) while the
authoritative, rich kitchen data stays in `ops.kitchen_logs`.

> **Legacy-naming note:** `ops.log_entries.origin`'s current CHECK is
> `manual | kitchen_app | roastery_app` (the migration above). The Module-canonical values are
> `kitchen` / `roastery` (no `_app` suffix — `CONTEXT.md`). The enum is **not churned now**; it is
> reconciled on the next `ops` migration (recorded in `docs/decisions.md` "legacy naming to reconcile").

### D4 — A one-time migration, history-preserving

Migrate Teable `wip_items` / `kitchen_log` / `kitchen_plan` / `kitchen_stock` → the new `ops.*` tables,
**preserving `batch_id`, `esb_doc_num`, `posted_to_esb` / posted history, and the WIP ESB ids**
(`esb_product_id` / `esb_product_detail_id_porsi` / `esb_bom_id`). This keeps the **audit trail** and
the **idempotency state** intact across the cutover — a row already posted to the ESB must not re-post
after migration. The cutover is sequenced by **ADR-0010 D10** (migrate kitchen → retire Teable → bring
the warehouse online), and the transition-window Teable data is backed up per ADR-0010 D8. **The
`posted_to_esb`-survival proof — the migration must demonstrate that no already-posted row re-posts — is
run against the ESB Staging Sandbox first (D5); production GKID is only cut over after that staging proof
passes** (a botched cutover that re-posts must surface against `GOO`, never against the live ERP).

### D5 — Staging-first ESB: all write logic validated against the ESB Staging Sandbox, never prod

**All ESB write logic is validated against the ESB Staging Sandbox first — the production ERP is never
the validation target.** The ESB is the immutable system of record (ADR-0010 D1); a logic bug, a smoke
test, or a botched migration must **never mutate production ERP data**. The live-probe-vs-prod pain of
the kitchen project's Phase-4 follow-up is exactly what this decision prevents.

- **The staging sandbox is real:** ESB branch **`GOO`**, base URL **`stg-erp.esb.co.id`** (per the
  kitchen project's Phase-4 follow-up). Production is **GKID**, served at **`services.esb.co.id`**.
- **The outbox worker (D2) carries an explicit ESB-target setting** — *staging* vs *production*.
  **Non-prod / dev / test environments default to staging (`GOO` / `stg-erp.esb.co.id`)**; only the
  production deployment may set the target to production, and only after the proof-push gate below.
- **What runs against staging first:** all logic validation, all smoke tests, and the one-time
  migration's **`posted_to_esb`-survival proof (D4)**. The denormalized→normalized push shape, the
  `dedup_key` central-dedup behaviour (D2), and the per-batch `/assembly-actual` + `/simple-transfer`
  derivation are all exercised against `GOO` before any production push.
- **The production cutover gate = the proven single-WIP proof-push (the Phase-4 discipline):** after
  staging is verified, production GKID is enabled via **dry-run → independent verify → one real push of a
  single WIP → batch-enable**. The first production write is one deliberately-chosen row, independently
  reconciled in the live ERP, *before* the worker is allowed to drain the full backlog.

## Alternatives considered

- **Keep push-state denormalized on each Module's operational rows** (the Teable-era shape). Rejected —
  it would be **re-implemented per Module**, there is **no single "what's pending / failed across all
  ESB writes" view**, and it carries the 13-copy-per-batch denormalization that only existed to work
  around Teable's joins (fact (a)).
- **Supabase Edge Functions + `pg_cron` for the worker.** Rejected — would **rewrite the Python / BOM
  logic in TypeScript**, is awkward for the external ESB API + cold starts on heavy compute, and
  duplicates logic the kitchen poller already proves. (Same rejection as ADR-0010 D6.)
- **GitHub Actions cron for the push.** Rejected — **can't do event-fire-on-approval latency** (a poll
  granularity of minutes is wrong for "approve → posts to ERP"). GitHub Actions is kept for the
  **warehouse sync only** (ADR-0010 D3).
- **A separate push table per Module** (`integrations.kitchen_push`, `integrations.roastery_push`, …).
  Rejected — **N copies of one concern**: N dedup implementations, N "what's failing" views, N worker
  bootstraps. One Module-agnostic table with a `source_module` discriminator (D1) is the normalization.
- **Validate ESB write logic / the migration directly against production** (the Phase-4 anti-pattern).
  Rejected (D5) — the ESB is the immutable system of record; a logic bug or smoke test that touches prod
  mutates the ledger irreversibly. Staging (`GOO`) is the validation target; prod is touched only via the
  single-WIP proof-push gate.

## Consequences

- **Positive — one normalized record of every ESB write, across all Modules.** A single
  `integrations.esb_push` answers "what is pending / in-flight / failed" for kitchen today and roastery
  tomorrow; dedup is solved **once** (D2), not per Module.
- **Positive — the ESB's missing idempotency is handled in exactly one place.** `dedup_key` in the
  outbox + the single worker means a retry can never double-post to the system of record (ADR-0010 D1's
  "system of record is immutable" depends on this).
- **Positive — kitchen data gets real types + RLS** (D3), replacing Teable's weak-typed model; the
  Daily Log mirror is preserved cheaply via a summary row, without duplicating the rich data.
- **Positive — the `integrations` schema is finally used for its reserved purpose** (P1-2's comment),
  validating the four-schema canon (OD-DIR-3).
- **Positive — production ERP data is structurally protected (D5).** Every line of write logic and the
  high-stakes migration prove themselves against `GOO` before a single byte reaches GKID; the only
  production write before batch-enable is one independently-verified proof-push.
- **Negative / accepted — the worker is a stateful moving part on the thin backend.** It needs the
  Healthchecks dead-man's-switch + monitoring of ADR-0010 D7 (a stuck outbox = un-posted ERP writes).
- **Negative / accepted — the one-time migration is high-stakes** (it carries live idempotency state).
  Mitigated by D4's history preservation + ADR-0010 D8's transition-window backup + **D5's staging-first
  `posted_to_esb`-survival proof**; a botched cutover could re-post to the ESB, so the migration spec
  must prove `posted_to_esb` survives — **against `GOO` first**, then via the single-WIP proof-push on
  GKID.
- **Negative / accepted — the worker stays kitchen-only until roastery ships** (D2 YAGNI). The
  Module-agnostic table means roastery is *additive* (a handler + a `source_module` value), but the
  generality is unexercised until then — accepted as cheap insurance against the rejected per-Module
  fan-out.
- **Negative / accepted — a two-target worker is a configuration seam that must not be mis-set (D5).**
  An environment pointed at the wrong target could write to prod from a test run; mitigated by
  **defaulting non-prod to staging** and treating "set target = production" as a deliberate,
  deploy-gated, security-reviewed (ADR-0010 D11) act — never the default.

## Reversibility

- **The outbox is additive** — a new table in the (empty) `integrations` schema + a worker on the
  existing thin-backend deploy path; removable by dropping the table and the handler.
- **The denormalized → normalized change is a one-time data move** (D4), reversible only in the sense
  that the *source* Teable data is backed up during the window (ADR-0010 D8) — once Teable retires
  (ADR-0010 D10) the normalized shape is the system of record for kitchen.
- **The Teable → Postgres migration preserves history** (D4), so the cutover is *forward-safe*: the
  audit trail and idempotency state survive, which is what makes retiring Teable reversible-enough (the
  data isn't lost, it's moved + backed up).
- **The ESB-target setting (D5) is pure configuration** — a deploy can be repointed staging↔production
  without a code change; staging validation is repeatable at zero risk to prod.
- **The `origin` enum reconciliation is deferred and additive** (D3 legacy note) — the next `ops`
  migration widens the CHECK to the Module-canonical values; the legacy values stay readable until then.

## Open questions (recorded, not resolved here)

1. **Outbox retry / backoff policy** — max attempts, backoff curve, and the dead-letter state for a
   push the ESB keeps rejecting. Lean: cap attempts, then flag `failed` for `ops_lead` review (mirrors
   the kitchen poller's `retry_count` + `error` today); *confirm at spec*.
2. **Event-fire vs poll boundary** — the exact trigger mechanism for "approval fires the worker" on
   Supabase (a `NOTIFY`/webhook vs the safety-net poll only). Lean: safety-net poll is the floor,
   event-fire is the latency optimization; *confirm at the worker spec*.
3. **`source_ref` shape** — text vs a typed FK back into `ops.*` (a cross-schema FK from
   `integrations` → `ops` is possible but couples the schemas). Lean: opaque text (the `batch_id`),
   resolved by the worker; *confirm at spec*.
4. **Staging sandbox availability / parity (D5).** Is `GOO` / `stg-erp.esb.co.id` currently up,
   credentialed for the MOS worker, and a faithful enough mirror of GKID's `/assembly-actual` +
   `/simple-transfer` contracts (endpoints, BOM/product-detail ids, doc-num format) to make a staging
   pass meaningful? *Confirm before the worker spec relies on it*; if parity is partial, the proof-push
   gate (the single real GKID write) carries more weight and the migration spec must say so.

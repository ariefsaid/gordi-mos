# Implementation Plan — Kitchen ops Module · DB substrate (P4 / ADR-0012)

> **For agentic workers:** this plan is the no-placeholder, exact-path/exact-SQL/exact-verify
> substrate for the **first** kitchen slice (the typed `ops.*` + `integrations.esb_push` tables +
> RLS + the atomic approval RPC). The worker (FastAPI), the PWA UI, and the Teable data migration
> are **separate later plans** — see §1 sub-plan split. Steps use `- [ ]` tracking; TDD red→green
> per behavior task.

**Goal:** land the kitchen Module's DB substrate — five tables, their RLS, the collision-safe
`batch_id` mint, and the atomic approval RPC — fully proven by pgTAP, so the worker + UI + migration
plans build on a green, reviewed foundation.

**Architecture:** schema-qualified DDL in `ops` (4 tables) + `integrations` (the outbox), mirroring
the `ops.log_entries` conventions verbatim (`org_id` default `shared.current_org_id()` + WITH CHECK,
`set_updated_at` trigger, enable+FORCE RLS, **no DELETE grant**, `SECURITY INVOKER` guard with a
same-org FK seam closure mirroring `ops._guard_log_entry`). The approval write path is one
`SECURITY DEFINER` RPC (`ops.approve_kitchen_log`) that atomically mints the `batch_id`, recomputes
`kitchen_stock`, enqueues the `integrations.esb_push` row, and writes the Daily Log summary mirror —
the single audited multi-write point (FR-044/050/062/070/090). It stacks on the access-role layer
(`shared.has_access_role`, PR #41) for the member/ops_lead RLS gates.

**Tech stack:** PostgreSQL 15 (self-hosted Supabase) · pgTAP (`supabase test db`) · `SECURITY DEFINER`
PL/pgSQL. No app/worker code in this plan.

---

## 0. Authority + dependency map (read first)

- **Spec:** `docs/specs/kitchen-module.spec.md` (FR-001..101, AC-001..094). The DB-relevant ACs this
  plan **owns and proves now** are **AC-001..008, AC-031, AC-032, AC-034, AC-043, AC-060, AC-061,
  AC-071** — all pgTAP/data-shape, plus the same-org FK guard (see I2 → AC-002 extension). **AC-070
  (history-migration / no-re-post) is NOT owned here** — it needs migrated data and is deferred to
  slice k4 (§1, §4). Spec status: Draft; the load-bearing owner scoping decisions **OD-K-1..4 are
  ratified** (`docs/decisions.md`) and the architecture is fixed by ADR-0010/0011/0012, so this plan
  conforms, it does not reopen.
- **ADRs conformed-to (not re-decided):**
  - **ADR-0012** (ESB outbox + `integrations` schema) — the `ops.*` homes, the `integrations.esb_push`
    shape, the summary-mirror seam, migration history preservation (D4).
  - **ADR-0011** (auth/RBAC) — `member` inserts own Submitted; `ops_lead`/`admin` approve/plan; the
    `access_roles` JWT claim + `shared.has_access_role()` are the RLS authority.
  - **ADR-0010** (platform topology) — staging-first ESB; the worker lives in the FastAPI backend
    (not this plan); `target_env ∈ {goo, dry_run}` pre-flip is a **deployment-enforced** constraint
    (FR-081), so this substrate stamps `target_env` from a config function, never from a client value.
  - **ADR-0001** (org seam) + **ADR-0006** (`ops` exposure + enable+FORCE-RLS discipline).
- **Stacked on PR #41 — access-roles DB substrate (HARD prerequisite; must merge first).**
  This plan's branch (`feat/kitchen-db-substrate`) is based on `feat/access-roles` (PR #41), so PR-a's
  substrate **is present in this worktree**. Concretely, kitchen depends on:
  - `supabase/migrations/20260619000001_shared_person_access_roles.sql` — defines the table AND the
    read helpers `shared._claim_text_array(text)`, `shared.current_access_roles()`, and
    **`shared.has_access_role(text)`**, which every kitchen RLS policy + the RPC + the guard call.
    **NOTE: the helpers live in `…000001`, NOT `…000002`** — they were moved into the table migration
    during PR-a review because `CREATE POLICY` resolves the referenced function eagerly (at policy
    creation), so the helper must exist in the same migration that first creates a policy on it.
    Kitchen's policies likewise resolve `shared.has_access_role` at `CREATE POLICY` time, which is
    safe because `…000001` (which defines it) sorts before all `20260620*` kitchen migrations.
  - `supabase/migrations/20260619000003_access_roles_test_seed.sql` — defines
    **`mos._test_seed_access_roles()`** (grants on the WU-A tree: GrandMgr `…0d3`→admin live;
    Author `…0d1`→member+finance live, ops_lead revoked; links Author to auth user `…aa01`). The
    kitchen seed (T-090) is called **after** this. (The kitchen pgTAP files set the `access_roles`
    JWT claim **directly** per assertion, so the gate proven is the claim-driven `has_access_role`
    path; the seeded grants only need to exist for the hook's own suite, not for kitchen's claims.)
  - `mos._test_seed_role_tree()` from `supabase/migrations/20260612000003_mos_test_seed.sql` — seeds
    orgs (`…0a1` WU-A, `…0b1` WU-B), business_units, the role tree, people (`…0d1` Author, `…0d3`
    GrandMgr, `…0b4` ForeignMgr in org `…0b1`). **`…0b1` is Org WU-B's id** (also the foreign-org JWT
    claim used in cross-org tests) — it is **never** a `business_unit_id` (see I1: the Kitchen-and-Bar
    BU gets its own id `…00000000bb01` under org `…0a1`).
- **Also stacks on** the committed `supabase/migrations/20260612000004_ops_log_entries.sql`
  (`ops.log_entries`, whose `origin` CHECK this plan widens — FR-095/AC-071) and
  `…000006_ops_log_guard.sql` (the `ops._guard_log_entry` same-org seam this plan mirrors, and which
  the summary-mirror insert must satisfy — see I4).

## 0.1 — The spec's open questions, resolved for THIS plan (the implementation face of an ADR rule)

The spec §10 carries open questions. Each is resolved below the ADR threshold (no new ADR); if the
owner changes one at spec sign-off, only the named task changes.

- **KQ-1 — `kitchen_stock`: stored projection (§3.4).** Decision: **stored end-of-day projection**,
  recomputed by the approval RPC (FR-062). The start-of-day cut (FR-023 availability gate) is a
  **read-time computation** (a `SECURITY INVOKER STABLE` helper `ops.stock_available_for_date()`),
  not a stored row — the start-of-day value shifts as the day's logs land. This matches the oracle's
  `recompute_stock_for_items` (stored) + `list_stock_for_date` (read) split. Resolves spec §10.5.
- **KQ-2 — `origin` token for the summary mirror (FR-095).** Decision: **widen the `ops.log_entries`
  CHECK to admit `'kitchen'`** (ADR-0012's stated token), keeping the legacy `'kitchen_app'` for
  back-compat. The migration appends `'kitchen'` to the existing `IN (...)` list (reversible). Resolves
  the §3.6 reconciliation note.
- **KQ-3 — Summary mirror grain (§3.6).** Decision: **one summary row per approved batch**
  (not per log). A batch is the unit the manager cares about ("Production: 12 portions approved").
  The mirror write is idempotent per batch via a `unique (origin, detail->>'batch_id')` partial index
  (FR-092). Resolves §3.6 "eng-planner picks the grain".
- **KQ-4 — Outbox enqueue write path (§3.5).** Decision: the **approval RPC** inserts the
  `integrations.esb_push` row (SECURITY DEFINER, runs as the approver's transaction) — **not** a
  trigger, **not** an app-tier insert. Rationale: the enqueue must be atomic with the status flip +
  batch mint + stock recompute (FR-044/062/070), and only the worker/service role may touch posting
  state (AC-007) — the RPC writes a `pending` row (enqueue), posting state stays worker-only.
- **KQ-5 — `batch_id` collision-safety mechanism (FR-051).** Decision: **a per-(prefix, date)
  counter table `ops.kitchen_batch_seq` + an `INSERT … ON CONFLICT DO UPDATE … RETURNING last_n`
  inside the RPC.** The upsert atomically locks the `(org, prefix, log_date)` row, increments
  `last_n`, and returns the new value; the unique constraint on `ops.kitchen_logs.batch_id` is the
  backstop. (Sequences can't encode the `<PREFIX>-YYYYMMDD-NNN` format; a gapless-in-rollback sequence
  would over-allocate. The conflict-upsert holds the row lock for the sub-millisecond mint, so
  contention is negligible at kitchen's throughput.)
- **KQ-6 — `target_env` stamping (FR-080/081).** Decision: a `SECURITY INVOKER STABLE` helper
  `integrations.current_esb_target_env()` reads the **GUC `app.esb_target_env`** (via
  `current_setting('app.esb_target_env', true)`); **default `'dry_run'`**, and the pre-flip deployment
  sets it to `'goo'` with `set [local] app.esb_target_env = 'goo'`. The RPC stamps
  `target_env := integrations.current_esb_target_env()` on enqueue — the app tier **cannot** pass
  `'gkid'` (NFR-001). **Mechanism is a GUC, not a JWT claim** (M1): tests set it with
  `set local app.esb_target_env = 'goo'`, never as a JWT-claims key (`current_setting('app.esb_target_env')`
  does not read inside `request.jwt.claims`). The flip (OD-K-2) is a deployment-config change, not
  code (FR-082).

## 0.2 — Migration sequence numbers

This plan is **stacked on PR #41** (`feat/access-roles`), whose migrations are `20260619000001..03`
and whose pgTAP files are `29..35`. Kitchen therefore takes the **next free day**, **2026-06-20**,
with a per-day counter from `01`, and pgTAP files **`36..48`** (continuing after PR-a's
`35_access_role_seed.sql`). This numbering is correct *relative to PR #41* and must not be reused if
PR #41's numbering changes before merge.

- `20260620000001_ops_wip_items.sql` — master data table + indexes + RLS + grants.
- `20260620000002_ops_kitchen_plans.sql` — plan table + unique key + RLS.
- `20260620000003_ops_kitchen_logs.sql` — fact table + CHECKs + indexes (no RLS yet — T-040).
- `20260620000004_ops_kitchen_stock.sql` — stock projection table + unique key + RLS.
- `20260620000005_ops_kitchen_batch_seq.sql` — the per-(prefix, date) counter table (KQ-5).
- `20260620000006_integrations_esb_push.sql` — outbox table + unique `dedup_key` + RLS + **config.toml
  exposure of `integrations`** (T-005).
- `20260620000007_ops_kitchen_helpers.sql` — `ops.stock_available_for_date()` (KQ-1) +
  `integrations.current_esb_target_env()` (KQ-6).
- `20260620000008_ops_kitchen_logs_rls.sql` — kitchen_logs enable+FORCE RLS + policies + the
  `_guard_kitchen_log` trigger (status-transition immutability + same-org FK seam, I2/I3).
- `20260620000009_ops_approve_kitchen_log_rpc.sql` — the atomic approval `SECURITY DEFINER` RPC.
- `20260620000010_ops_log_entries_origin_kitchen.sql` — widen the `origin` CHECK (KQ-2, FR-095).
- `20260620000011_ops_kitchen_test_seed.sql` — `mos._test_seed_kitchen()` fixture.

pgTAP files numbered **`36..48`**:

- `36_wip_items.sql` · `37_kitchen_plans.sql` · `38_kitchen_logs_assign.sql` ·
  `39_kitchen_logs_provenance.sql` · `40_kitchen_logs_rls_gates.sql` · `41_kitchen_logs_no_delete.sql` ·
  `42_kitchen_stock_recompute.sql` · `43_esb_push_enqueue_dedup.sql` · `44_esb_push_posting_gate.sql` ·
  `45_batch_id_mint.sql` · `46_approve_rpc_atomicity.sql` · `47_log_entries_origin_kitchen.sql` ·
  `48_kitchen_logs_same_org_guard.sql` (the I2 same-org FK seam).

Each migration carries a `-- DOWN:` block (reversible).

### 0.3 — Test fixture UUIDs (all valid hex; non-colliding with the seed scheme)

The existing seed scheme uses `…0d*` people, `…0f*` roles, `…0a*`/`…0b*` orgs+units, `…aa01` auth
user. Kitchen allocates a **disjoint** hex range — **every literal below is valid hex** (no `w`/`k`
letters, which are not hex and raise `22P02` on cast):

| Entity | UUID | Notes |
|---|---|---|
| Org WU-A | `00000000-0000-0000-0000-0000000000a1` | from PR-a seed (read) |
| Org WU-B | `00000000-0000-0000-0000-0000000000b1` | from PR-a seed; **org only — never a BU id** |
| Person Author (member) | `00000000-0000-0000-0000-0000000000d1` | org A |
| Person GrandMgr | `00000000-0000-0000-0000-0000000000d3` | org A (tests claim `ops_lead`) |
| Person ForeignMgr | `00000000-0000-0000-0000-0000000000b4` | **org B** (cross-org tests) |
| BU "Kitchen and Bar" | `00000000-0000-0000-0000-00000000bb01` | org A — fresh hex (was wrongly `…0b1`) |
| WIP item 1 (Nasi Goreng) | `00000000-0000-0000-0000-00000000ab01` | was `…w001` |
| WIP item 2 (Ayam Bakar) | `00000000-0000-0000-0000-00000000ab02` | was `…w002` |
| WIP item 3 (Es Teh) | `00000000-0000-0000-0000-00000000ab03` | was `…w003` |
| kitchen_log 1 (PR 12) | `00000000-0000-0000-0000-00000000ac01` | was `…k1` |
| kitchen_log 2 (PR 8) | `00000000-0000-0000-0000-00000000ac02` | was `…k2` |
| kitchen_log 3 (PR 5) | `00000000-0000-0000-0000-00000000ac03` | was `…k3` |
| kitchen_log 4 (TR 4) | `00000000-0000-0000-0000-00000000ac04` | was `…k4` |
| kitchen_log 5 (TB 3) | `00000000-0000-0000-0000-00000000ac05` | was `…k5` |
| kitchen_log 6 (PR 2, rejected) | `00000000-0000-0000-0000-00000000ac06` | was `…k6` |

> **Hex invariant (verify):** `grep -nE "[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}" docs/plans/2026-06-19-kitchen-db-substrate.md`
> finds every UUID literal; **zero** of them may contain a `g`-`z` character in a UUID position.
> `grep -nE "0000000000(w|k)[0-9]" docs/plans/2026-06-19-kitchen-db-substrate.md` must return **nothing**.

---

## 1. Sub-PR split recommendation

This whole plan is **PR-k1 (DB substrate)** — one PR, the security-core gate. It is large but
cohesive (the RPC ties the tables together; splitting the RPC from its tables leaves the tables
unprovable end-to-end). Suggested **internal** commit grouping (still one PR):

1. **k1-a tables** — wip_items, kitchen_plans, kitchen_logs, kitchen_stock, batch_seq (T-010..T-042).
2. **k1-b outbox + helpers** — esb_push + config exposure + the two helpers (T-005, T-050..T-053).
3. **k1-c kitchen_logs RLS + guard** — the member/ops_lead gate + status-transition immutability +
   same-org FK seam (T-040, T-041, T-041-test-guard).
4. **k1-d the approval RPC** — batch mint + stock recompute + enqueue + mirror, atomic (T-060..T-064).
5. **k1-e origin widening + seed + gate** — AC-071, the fixture, the full `supabase test db` (T-070..T-090).

**Later plans (NOT this one):** PR-k2 FastAPI outbox worker (AC-050..056); PR-k3 PWA UI surfaces
(AC-020..034, AC-090..094); PR-k4 Teable data migration + flip runbook (**AC-070**). Each is its own
spec-sign-off-gated slice. This plan's RPC + outbox enqueue are the worker's **producer**; the worker
(plan k2) is the **consumer** — the seam between them is the `integrations.esb_push` row shape pinned
in T-050.

---

## 2. Tasks — PR-k1 (DB substrate)

> **Decimal task convention:** each behavior is "write the pgTAP test (red) → migration (green)".
> pgTAP files wrap in `begin; ... rollback;` and call `select mos._test_seed_role_tree(); select
> mos._test_seed_access_roles(); select mos._test_seed_kitchen();` (the last lands in T-090). JWT
> claims set via `set local request.jwt.claims`; the ESB target env set via `set local
> app.esb_target_env = '…'` (a GUC, NOT a JWT-claims key — KQ-6/M1). **FIXED UUIDs** throughout per
> §0.3 (`…0d0N`-style people, `…00000000bb01` Kitchen-and-Bar BU, `…00000000ab0N` WIP items,
> `…00000000ac0N` kitchen_logs).

### T-005 — [infra] Expose the `integrations` schema to PostgREST
- File: `supabase/config.toml` (modify the `db_schemas`/`schemas` line).
- The ops worker and the ops_lead read of `integrations.esb_push` need `integrations` in the
  PostgREST exposed-schemas list. Today it is **absent** (`schemas = ["public","graphql_public",
  "shared","mos","ops"]`). Change to:
  ```toml
  schemas = ["public", "graphql_public", "shared", "mos", "ops", "integrations"]
  ```
- Verify (after T-050 lands): `supabase db reset && supabase status` → a `curl` to the PostgREST root
  lists `integrations`; the SPA's `supabase.from('esb_push')` resolves (covered functionally by the
  worker plan's read test; here it is a config prerequisite, no pgTAP).
- **DOWN:** revert the `schemas` line (remove `"integrations"`).

### T-010 — [green] `ops.wip_items` table + indexes + base grants (FR-010)
- File: `supabase/migrations/20260620000001_ops_wip_items.sql`.
- Write the header + DDL (mirrors `ops.log_entries` org-stamp + `set_updated_at`; ESB identity columns
  are nullable — master data may be imported before ESB IDs are known, but a logged row's WIP item
  resolves them at log time):
  ```sql
  -- P4 Kitchen Module — master data (ADR-0012, FR-010). Active-flagged kitchen products with their
  -- ESB identity (the BOM/product-detail IDs the worker composes the assembly-actual body from).
  -- org-readable; write restricted to ops_lead/admin (RLS in T-011). No DELETE grant (NFR-002).
  create table ops.wip_items (
    id                            uuid primary key default gen_random_uuid(),
    org_id                        uuid not null references shared.orgs(id) on delete cascade
                                    default shared.current_org_id(),
    name                          text not null check (btrim(name) <> ''),
    category                      text,
    flag_active                   boolean not null default true,
    esb_bom_id                    text,
    esb_product_detail_id_porsi   text,
    esb_product_id                text,
    created_at                    timestamptz not null default now(),
    updated_at                    timestamptz not null default now()
  );
  comment on table ops.wip_items is
    'Kitchen master data (FR-010). Active-flagged products carrying the ESB identity the worker uses to compose the assembly-actual body.';

  create index wip_items_org_active_idx on ops.wip_items (org_id, name) where flag_active;
  create index wip_items_org_idx        on ops.wip_items (org_id);

  create trigger wip_items_set_updated_at
    before update on ops.wip_items
    for each row execute function shared.set_updated_at();

  -- Base privileges. SELECT to authenticated (RLS filters to own org); INSERT/UPDATE to authenticated
  -- (RLS in T-011 restricts write to ops_lead/admin). NO DELETE grant (NFR-002/FR-095).
  grant select, insert, update on ops.wip_items to authenticated;
  ```
- **DOWN:** `drop table ops.wip_items cascade;`
- Verify: `supabase db reset` parses; table proven by T-011.

### T-011 — [green] enable+FORCE RLS + policies on `ops.wip_items` (FR-010, AC-006)
- File: `supabase/migrations/20260620000001_ops_wip_items.sql` (append).
  ```sql
  alter table ops.wip_items enable row level security;
  alter table ops.wip_items force row level security;

  -- Org-readable: any member sees active items to log against (FR-011).
  create policy wip_items_select_org on ops.wip_items
    for select to authenticated
    using (org_id = shared.current_org_id());

  -- Master data write is ops_lead/admin only (FR-010, AC-006).
  create policy wip_items_insert_ops on ops.wip_items
    for insert to authenticated
    with check (org_id = shared.current_org_id()
                and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
  create policy wip_items_update_ops on ops.wip_items
    for update to authenticated
    using (org_id = shared.current_org_id()
           and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
    with check (org_id = shared.current_org_id()
                and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
  ```
- **DOWN:** drop policies; (table dropped by the T-010 DOWN).
- Verify: covered by T-020 (the pgTAP AC-006 assertion in `36_wip_items.sql`).

### T-020 — [red] pgTAP: wip_items RLS — member read ok / member write denied / ops_lead write ok (AC-006)
- File (new): `supabase/tests/36_wip_items.sql`.
- `plan(5)`. Seed `mos._test_seed_role_tree()` + `mos._test_seed_access_roles()` + `mos._test_seed_kitchen()`
  (the last inserts an active WIP item for org A via service_role). Then:
  ```sql
  -- AC-006: member can READ active items, cannot INSERT/UPDATE; ops_lead can.
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  select is((select count(*)::int from ops.wip_items where flag_active and org_id = '00000000-0000-0000-0000-0000000000a1'),
            3, 'AC-006: member reads the seeded active WIP items');
  select throws_ok($$
    insert into ops.wip_items (org_id, name) values ('00000000-0000-0000-0000-0000000000a1','Test')
  $$, '42501', null, 'AC-006: member INSERT denied (master data)');
  -- ops_lead claim (the JWT access_roles claim is what shared.has_access_role reads — independent of
  -- the seeded grant; …0d3 is an org-A person used as the ops_lead session here).
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select lives_ok($$
    insert into ops.wip_items (org_id, name, esb_bom_id, esb_product_detail_id_porsi)
    values ('00000000-0000-0000-0000-0000000000a1','Soto Ayam','BOM-099','PD-PORSI-099')
  $$, 'AC-006: ops_lead INSERT ok');
  -- cross-org isolation: a foreign-org member reads zero rows.
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
  select is((select count(*)::int from ops.wip_items), 0, 'AC-006: foreign-org member reads 0');
  select is((select count(*)::int from ops.wip_items where org_id='00000000-0000-0000-0000-0000000000a1'), 0,
    'AC-006: foreign-org member cannot read org-A items (org isolation)');
  ```
- Verify: `supabase test db` → file 36 FAILS until T-010/T-011 + the fixture (T-090) land; then green.

### T-030 — [green] `ops.kitchen_plans` table + unique key + RLS (FR-030..032)
- File: `supabase/migrations/20260620000002_ops_kitchen_plans.sql`.
  ```sql
  -- P4 Kitchen Module — daily plan (ADR-0012, FR-030..032). Per (org, date, item, action_type)
  -- planned qty_porsi; replace/upsert semantics enforced by the unique key. Plan rows are the
  -- variance baseline; they never post to ESB. ops_lead/admin write; org-readable.
  create table ops.kitchen_plans (
    id            uuid primary key default gen_random_uuid(),
    org_id        uuid not null references shared.orgs(id) on delete cascade
                    default shared.current_org_id(),
    log_date      date not null,
    wip_item_id   uuid not null references ops.wip_items(id) on delete cascade,
    action_type   text not null check (action_type in ('Production','Transfer to Bungur','Transfer to Radiant')),
    qty_porsi     numeric(12,2) not null check (qty_porsi >= 0),
    notes         text,
    plan_by       uuid references shared.people(id) on delete set null
                    default shared.current_person_id(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (org_id, log_date, wip_item_id, action_type)
  );
  comment on table ops.kitchen_plans is
    'Daily plan (FR-030). Unique on (org, date, item, action_type) → re-save upserts (FR-031). The variance baseline (FR-032).';

  create index kitchen_plans_org_date_idx on ops.kitchen_plans (org_id, log_date);
  create index kitchen_plans_org_item_idx  on ops.kitchen_plans (org_id, wip_item_id);

  create trigger kitchen_plans_set_updated_at
    before update on ops.kitchen_plans
    for each row execute function shared.set_updated_at();

  grant select, insert, update on ops.kitchen_plans to authenticated;

  alter table ops.kitchen_plans enable row level security;
  alter table ops.kitchen_plans force row level security;
  create policy kitchen_plans_select_org on ops.kitchen_plans
    for select to authenticated using (org_id = shared.current_org_id());
  create policy kitchen_plans_upsert_ops on ops.kitchen_plans
    for insert to authenticated
    with check (org_id = shared.current_org_id()
                and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
  create policy kitchen_plans_update_ops on ops.kitchen_plans
    for update to authenticated
    using (org_id = shared.current_org_id()
           and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
    with check (org_id = shared.current_org_id()
                and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
  ```
- **DOWN:** `drop table ops.kitchen_plans cascade;`
- Verify: AC coverage in `37_kitchen_plans.sql` (T-030-test).

> **plan_by FK note (vs T-040 submitted_by).** `plan_by` is nullable + `on delete set null` (a plan is
> org-owned data that survives the planner leaving). `kitchen_logs.submitted_by` is `not null` (a fact
> must always name its submitter) — see T-040. The default `shared.current_person_id()` is NULL under
> service_role, which is fine for the seed path (plans are seeded only via fixtures here).

### T-030-test — [red→green] pgTAP: plan upsert key + ops_lead-only write (FR-031, AC-006-shape)
- File (new): `supabase/tests/37_kitchen_plans.sql`.
- `plan(4)`. Seed. As ops_lead, insert a plan row for (org A, 2026-06-20, WIP-1, Production) qty 10;
  re-insert the same key qty 12 → `throws_ok('23505')` (the unique key forces the UPDATE path, FR-031);
  UPDATE the existing row to qty 12 → `lives_ok`. As member, INSERT → `throws_ok('42501')`.
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select lives_ok($$
    insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi)
    values ('00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','Production',10)
  $$, 'FR-031: ops_lead inserts a plan row');
  select throws_ok($$
    insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi)
    values ('00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','Production',12)
  $$, '23505', null, 'FR-031: duplicate key forces the UPDATE path (no second row)');
  select lives_ok($$
    update ops.kitchen_plans set qty_porsi = 12
     where org_id='00000000-0000-0000-0000-0000000000a1' and log_date='2026-06-20'
       and wip_item_id='00000000-0000-0000-0000-00000000ab01' and action_type='Production'
  $$, 'FR-031: ops_lead patches the plan qty (upsert UPDATE)');
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  select throws_ok($$
    insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi)
    values ('00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','Production',5)
  $$, '42501', null, 'AC-006-shape: member cannot write plans');
  ```
- Verify: `supabase test db` → file 37 red until T-030; then green.

### T-040 — [green] `ops.kitchen_logs` table + CHECKs + indexes (FR-020..024)
- File: `supabase/migrations/20260620000003_ops_kitchen_logs.sql`.
  ```sql
  -- P4 Kitchen Module — the core fact table (ADR-0012, FR-020..024). One row per submitted line;
  -- increment semantics (FR-021) — a new log inserts a new row, never overwrites. status transitions
  -- Submitted→Approved/Rejected are RLS+guard-gated (T-041). batch_id set at approval (FR-050).
  -- ESB-posting history mirrored from the outbox for audit (posted_to_esb/esb_doc_num/posted_at).
  create table ops.kitchen_logs (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references shared.orgs(id) on delete cascade
                      default shared.current_org_id(),
    business_unit_id uuid not null references shared.business_units(id),
    log_date        date not null,
    action_type     text not null check (action_type in ('Production','Transfer to Bungur','Transfer to Radiant')),
    wip_item_id     uuid not null references ops.wip_items(id) on delete restrict,
    qty_porsi       numeric(12,2) not null check (qty_porsi > 0),
    notes           text,
    status          text not null default 'Submitted'
                      check (status in ('Submitted','Approved','Rejected')),
    submitted_by    uuid not null references shared.people(id) on delete set null
                      default shared.current_person_id(),
    review_note     text,
    reviewed_by     uuid references shared.people(id) on delete set null,
    reviewed_at     timestamptz,
    batch_id        text unique,
    posted_to_esb   boolean not null default false,
    esb_doc_num     text,
    posted_at       timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
  );
  comment on table ops.kitchen_logs is
    'Kitchen fact table (FR-020). Increment semantics (FR-021). Submitted until RLS-gated approval (FR-024/044).';

  create index kitchen_logs_org_date_idx   on ops.kitchen_logs (org_id, log_date);
  create index kitchen_logs_org_status_idx on ops.kitchen_logs (org_id, status);
  create index kitchen_logs_item_date_idx  on ops.kitchen_logs (org_id, wip_item_id, log_date);

  create trigger kitchen_logs_set_updated_at
    before update on ops.kitchen_logs
    for each row execute function shared.set_updated_at();

  -- Base privileges: SELECT to authenticated (RLS filters org); INSERT to authenticated (member inserts
  -- own Submitted); UPDATE to authenticated (RLS in T-041 gates the status transition). NO DELETE (NFR-002).
  grant select, insert, update on ops.kitchen_logs to authenticated;
  ```
- **DOWN:** `drop table ops.kitchen_logs cascade;`
- Verify: table + CHECKs proven by `38_kitchen_logs_assign.sql` (T-041-test-a).
- **Note:** the `batch_id text unique` column constraint is the mint-collision backstop (KQ-5); the
  `where batch_id is not null` partial index from the prior draft is unnecessary (a UNIQUE constraint
  already permits multiple NULLs in PostgreSQL).

### T-041 — [green] enable+FORCE RLS + policies + status-transition + same-org guard on `ops.kitchen_logs` (FR-044, AC-001..004, AC-043)
- File: `supabase/migrations/20260620000008_ops_kitchen_logs_rls.sql`.
  ```sql
  -- RLS: any org member reads the org's logs (the review queue + pesanan are org-scoped);
  -- any member INSERTs own Submitted (submitted_by server-stamped); the Submitted→Approved/Rejected
  -- transition is ops_lead/admin only (FR-044). org_id is server-stamped (AC-002).
  alter table ops.kitchen_logs enable row level security;
  alter table ops.kitchen_logs force row level security;

  create policy kitchen_logs_select_org on ops.kitchen_logs
    for select to authenticated using (org_id = shared.current_org_id());

  create policy kitchen_logs_insert_member on ops.kitchen_logs
    for insert to authenticated
    with check (org_id = shared.current_org_id()
                and submitted_by = shared.current_person_id()
                and status = 'Submitted');

  create policy kitchen_logs_update_reviewer on ops.kitchen_logs
    for update to authenticated
    using (org_id = shared.current_org_id())
    with check (org_id = shared.current_org_id());

  -- Guard: the status transition is the GIGO gate, PLUS the cross-org FK seam the ops.log_entries
  -- audit closed (mirrors ops._guard_log_entry). A member may NOT flip status out of Submitted; only
  -- ops_lead/admin may transition to Approved/Rejected. SECURITY INVOKER (reads only current_person_id
  -- + has_access_role claim helpers AND the org-readable shared.business_units / ops.wip_items rows;
  -- nothing to revoke — definer-revoke lint stays clean), mirroring ops._guard_log_entry.
  create or replace function ops._guard_kitchen_log()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
  as $$
  declare
    v_bu_org   uuid;
    v_wip_org  uuid;
  begin
    -- submitted_by is immutable post-insert (a log can't be re-attributed).
    if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
      raise exception 'submitted_by is immutable' using errcode = '42501';
    end if;
    -- org_id is immutable post-insert (mirrors ops.log_entries; prevents cross-org re-homing on UPDATE).
    if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
    end if;
    -- status transitions: leaving Submitted (to Approved/Rejected) requires ops_lead/admin.
    if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status <> 'Submitted' then
      if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
        raise exception 'only ops_lead/admin may approve or reject a kitchen log' using errcode = '42501';
      end if;
    end if;
    -- a Submitted→Submitted UPDATE that flips action_type/wip_item_id/log_date is a re-target
    -- (forbidden — it would alter the day's actuals silently).
    if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
      if new.action_type is distinct from old.action_type
         or new.wip_item_id is distinct from old.wip_item_id
         or new.log_date is distinct from old.log_date then
        raise exception 'action_type/wip_item/log_date are immutable on a Submitted log' using errcode = '42501';
      end if;
    end if;
    -- SAME-ORG FK seam (mirrors ops._guard_log_entry): business_unit_id and wip_item_id are plain
    -- existence-only FKs (FK lookups bypass RLS), so a member could reference a foreign-org BU or WIP
    -- item. Under INVOKER RLS a same-org reference is visible (org_id matches) and a cross-org one is
    -- invisible → the lookup returns NULL → distinct from new.org_id → raise 23514. Runs on INSERT and
    -- UPDATE (NOT NULL columns, so a NULL never reaches here — the column constraint fires 23502 first).
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
    return new;
  end;
  $$;
  comment on function ops._guard_kitchen_log() is
    'Guard (FR-044 + audit-parity): Submitted→Approved/Rejected is ops_lead/admin only; submitted_by + org_id + Submitted-key immutable (42501); business_unit_id/wip_item_id must be same-org as the log (23514, mirrors ops._guard_log_entry). SECURITY INVOKER.';

  create trigger kitchen_logs_guard
    before insert or update on ops.kitchen_logs
    for each row execute function ops._guard_kitchen_log();
  ```
- **DOWN:** drop trigger `kitchen_logs_guard`; drop function `ops._guard_kitchen_log()`; drop policies
  `kitchen_logs_select_org`/`kitchen_logs_insert_member`/`kitchen_logs_update_reviewer`;
  (table dropped by T-040 DOWN).
- Verify: AC-001..004, AC-043 green in `40_kitchen_logs_rls_gates.sql`; the same-org seam in
  `48_kitchen_logs_same_org_guard.sql`.

### T-041-test-a — [red] pgTAP: member inserts own Submitted, status + org server-stamped (AC-001)
- File (new): `supabase/tests/38_kitchen_logs_assign.sql`.
- `plan(3)`. Seed. As member `…0d1` (org A, BU Kitchen-and-Bar `…00000000bb01`):
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  -- AC-001: member inserts a Submitted log; org_id + submitted_by server-stamped.
  select lives_ok($$
    insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
    values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',12)
  $$, 'AC-001: member inserts own Submitted log');
  select is((select status from ops.kitchen_logs where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20' and submitted_by='00000000-0000-0000-0000-0000000000d1' and qty_porsi=12),
            'Submitted', 'AC-001: default status Submitted');
  select is((select org_id from ops.kitchen_logs where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20' and submitted_by='00000000-0000-0000-0000-0000000000d1' and qty_porsi=12),
            '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-001: org_id server-stamped');
  ```
- Verify: `supabase test db` → file 38 red until T-040/T-041 + fixture; then green.

### T-041-test-prov — [red] pgTAP: forged provenance rejected (submitted_by / org_id unspoofable) (AC-002)
- File (new): `supabase/tests/39_kitchen_logs_provenance.sql`.
- `plan(2)`. Seed. As member `…0d1`:
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  -- AC-002: forging submitted_by to another person is rejected (the WITH CHECK forces session person).
  select throws_ok($$
    insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi, submitted_by)
    values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5,'00000000-0000-0000-0000-0000000000d2')
  $$, '42501', null, 'AC-002: forged submitted_by rejected');
  -- AC-002: foreign org_id rejected (unspoofable org).
  select throws_ok($$
    insert into ops.kitchen_logs (org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
    values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5)
  $$, '42501', null, 'AC-002: foreign org_id rejected');
  ```
- Verify: `supabase test db` → file 39 red until T-041; then green.

### T-041-test-b — [red] pgTAP: member cannot approve; ops_lead can; cross-org zero rows (AC-003, AC-004, AC-043)
- File (new): `supabase/tests/40_kitchen_logs_rls_gates.sql`.
- `plan(3)`. Seed (the fixture inserts Submitted log `…ac01` for `…0d1` on 2026-06-20). Then:
  ```sql
  -- AC-003/AC-043: member cannot flip status to Approved.
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  select throws_ok($$
    update ops.kitchen_logs set status='Approved', reviewed_by='00000000-0000-0000-0000-0000000000d1', reviewed_at=now()
     where id='00000000-0000-0000-0000-00000000ac01'
  $$, '42501', null, 'AC-003: member approve denied (guard)');
  -- AC-043: ops_lead approves directly; reviewed_by stamped. (The real approve path is the RPC in
  --  T-060; here we prove the guard ALLOWS the direct transition for ops_lead so the RLS authority is
  --  independent of the RPC.)
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select lives_ok($$
    update ops.kitchen_logs set status='Approved', reviewed_by='00000000-0000-0000-0000-0000000000d3', reviewed_at=now()
     where id='00000000-0000-0000-0000-00000000ac01'
  $$, 'AC-043: ops_lead approve allowed (guard); reviewed_by stamped');
  -- AC-004: org-B ops_lead sees zero org-A rows.
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["ops_lead"]}';
  select is((select count(*)::int from ops.kitchen_logs where log_date='2026-06-20'), 0,
    'AC-004: org-B ops_lead reads 0 org-A logs (org isolation)');
  ```
- Verify: `supabase test db` → file 40 red until T-041; then green.

### T-041-test-c — [red] pgTAP: no DELETE on any kitchen table (AC-005)
- File (new): `supabase/tests/41_kitchen_logs_no_delete.sql`.
- `plan(5)`. Seed. As ops_lead, attempt DELETE on each table → `throws_ok('42501')` (no DELETE grant).
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select throws_ok($$ delete from ops.wip_items where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on wip_items');
  select throws_ok($$ delete from ops.kitchen_plans where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on kitchen_plans');
  select throws_ok($$ delete from ops.kitchen_logs where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on kitchen_logs');
  select throws_ok($$ delete from ops.kitchen_stock where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on kitchen_stock');
  select throws_ok($$ delete from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on esb_push');
  ```
- Verify: `supabase test db` → file 41 red until the outbox lands (T-050); then green.

### T-041-test-guard — [red] pgTAP: same-org FK seam — foreign-org BU / WIP item rejected (AC-002 extension, I2)
- File (new): `supabase/tests/48_kitchen_logs_same_org_guard.sql`.
- `plan(2)`. The fixture seeds a foreign-org BU `…00000000bb09` under org WU-B (`…0b1`) and a
  foreign-org WIP item `…00000000ab09` under org WU-B (added to T-090). As an **org-A member** the
  session org is `…0a1`, so a log that references the org-B BU or org-B WIP item must raise `23514`
  (the cross-org reference is invisible under INVOKER RLS → lookup NULL → distinct from new.org_id).
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  -- I2: a foreign-org business_unit_id is rejected by the same-org guard (23514).
  select throws_ok($$
    insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
    values ('00000000-0000-0000-0000-00000000bb09','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5)
  $$, '23514', null, 'I2/AC-002: foreign-org business_unit_id rejected (same-org FK seam)');
  -- I2: a foreign-org wip_item_id is rejected by the same-org guard (23514).
  select throws_ok($$
    insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
    values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab09',5)
  $$, '23514', null, 'I2/AC-002: foreign-org wip_item_id rejected (same-org FK seam)');
  ```
- Verify: `supabase test db` → file 48 red until T-041 (the same-org seam) + the foreign-org fixture
  rows in T-090; then green.

### T-042 — [green] `ops.kitchen_stock` table + unique key + RLS (FR-060..062)
- File: `supabase/migrations/20260620000004_ops_kitchen_stock.sql`.
  ```sql
  -- P4 Kitchen Module — stock projection (ADR-0012, FR-060..062). Stored END-OF-DAY balance per
  -- (org, date, item), recomputed by the approval RPC (FR-062). Negative balances preserved (FR-061).
  -- The start-of-day cut is a read-time computation (ops.stock_available_for_date, T-053). org-readable;
  -- write is RPC-only (SECURITY DEFINER) — no direct app INSERT/UPDATE grant beyond what RLS allows
  -- (the RPC runs as the approver; a direct member write is denied by the absence of a write policy).
  create table ops.kitchen_stock (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid not null references shared.orgs(id) on delete cascade
                  default shared.current_org_id(),
    log_date    date not null,
    wip_item_id uuid not null references ops.wip_items(id) on delete cascade,
    usable_qty  numeric(12,2) not null,
    notes       text,
    updated_at  timestamptz not null default now(),
    unique (org_id, log_date, wip_item_id)
  );
  comment on table ops.kitchen_stock is
    'Stored end-of-day stock projection (FR-060/062). Net of Approved logs. Negative preserved (FR-061). Start-of-day is a read (T-053).';

  create index kitchen_stock_org_item_idx on ops.kitchen_stock (org_id, wip_item_id, log_date);

  create trigger kitchen_stock_set_updated_at
    before update on ops.kitchen_stock
    for each row execute function shared.set_updated_at();

  grant select on ops.kitchen_stock to authenticated;
  -- NOTE: no insert/update grant to authenticated — only the SECURITY DEFINER RPC (T-060) writes stock.
  -- (service_role / postgres bypass RLS and are used by the RPC's internal writes.)

  alter table ops.kitchen_stock enable row level security;
  alter table ops.kitchen_stock force row level security;
  create policy kitchen_stock_select_org on ops.kitchen_stock
    for select to authenticated using (org_id = shared.current_org_id());
  ```
- **DOWN:** `drop table ops.kitchen_stock cascade;`
- Verify: AC coverage in `42_kitchen_stock_recompute.sql` (T-062-test, after the RPC lands).

### T-043 — [green] `ops.kitchen_batch_seq` counter table (KQ-5, FR-050/051)
- File: `supabase/migrations/20260620000005_ops_kitchen_batch_seq.sql`.
  ```sql
  -- P4 Kitchen Module — the per-(prefix, date) batch_id counter (KQ-5, FR-051). The approval RPC
  -- INSERTs … ON CONFLICT (org, prefix, log_date) DO UPDATE SET last_n = last_n + 1 RETURNING last_n,
  -- which atomically locks + increments + returns; it mints '<PREFIX>-YYYYMMDD-NNN'. The lock is held
  -- for the sub-ms mint; the unique(batch_id) on kitchen_logs is the collision backstop.
  create table ops.kitchen_batch_seq (
    org_id    uuid not null references shared.orgs(id) on delete cascade,
    prefix    text not null check (prefix in ('PR','TR','TB')),
    log_date  date not null,
    last_n    integer not null default 0,
    primary key (org_id, prefix, log_date)
  );
  comment on table ops.kitchen_batch_seq is
    'Per-(org, prefix, date) batch_id counter (FR-051). RPC upserts (locks + increments + returns), mints. Collision-safe.';

  -- RLS enabled + FORCED with NO authenticated policy: only the SECURITY DEFINER approval RPC (which
  -- runs as postgres, bypassing RLS) reads/writes the counter. The app tier has no grant and no
  -- policy → cannot read or mint directly (the counter is an RPC-internal mechanism).
  alter table ops.kitchen_batch_seq enable row level security;
  alter table ops.kitchen_batch_seq force row level security;
  ```
- **DOWN:** `drop table ops.kitchen_batch_seq;`
- Verify: mint proven by `45_batch_id_mint.sql` (T-060-test-a, after the RPC).

### T-050 — [green] `integrations.esb_push` outbox table + unique dedup_key + RLS (FR-070/072, AC-007/008)
- File: `supabase/migrations/20260620000006_integrations_esb_push.sql`.
  ```sql
  -- P4 Kitchen Module — Module-agnostic ESB outbox (ADR-0012 D1, FR-070/072). One row per batch;
  -- unique dedup_key is the central double-post guard (AC-008). App tier (ops_lead) may READ its
  -- org's rows; ONLY the worker/service role writes posting state (AC-007). The RPC (T-060) enqueues
  -- (inserts a 'pending' row); the worker (a later plan) transitions pending→posted/failed and stamps
  -- posted_at — so the worker MUTATES this row, hence updated_at + the set_updated_at trigger (C3).
  create table integrations.esb_push (
    id             uuid primary key default gen_random_uuid(),
    org_id         uuid not null references shared.orgs(id) on delete cascade
                     default shared.current_org_id(),
    source_module  text not null default 'kitchen'
                     check (source_module in ('kitchen','roastery')),
    source_ref     text not null,
    endpoint       text not null check (endpoint in ('assembly-actual','simple-transfer','noop')),
    payload        jsonb not null default '{}'::jsonb,
    target_env     text not null default 'dry_run'
                     check (target_env in ('goo','gkid','dry_run')),
    dedup_key      text not null,
    status         text not null default 'pending'
                     check (status in ('pending','in_flight','posted','failed','dead_letter')),
    retry_count    integer not null default 0,
    last_error     text,
    esb_doc_num    text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    posted_at      timestamptz,
    unique (dedup_key)
  );
  comment on table integrations.esb_push is
    'Module-agnostic ESB outbox (ADR-0012, FR-070). One row/batch. Unique dedup_key = (source_module, source_ref, target_env) — the double-post guard (AC-008). The worker mutates status/posted_at → has updated_at + set_updated_at trigger.';

  create index esb_push_pending_idx on integrations.esb_push (status, created_at) where status in ('pending','failed');
  create index esb_push_org_idx     on integrations.esb_push (org_id, created_at desc);

  -- The worker flips status/posted_at on this row, so it carries updated_at and the standard trigger
  -- (C3: shared.set_updated_at() writes new.updated_at — the column must exist or every UPDATE raises
  -- "record new has no field updated_at"; the pending→posted flip is exactly such an UPDATE).
  create trigger esb_push_set_updated_at
    before update on integrations.esb_push
    for each row execute function shared.set_updated_at();

  -- Base privileges. SELECT to authenticated (RLS: ops_lead/admin read own org). The RPC enqueues via
  -- SECURITY DEFINER (runs as postgres internally). NO insert/update to authenticated for posting
  -- state (AC-007: only the worker/service role flips posted/esb_doc_num).
  grant select on integrations.esb_push to authenticated;

  alter table integrations.esb_push enable row level security;
  alter table integrations.esb_push force row level security;
  -- AC-007: ops_lead/admin READ their org's push rows; nobody else.
  create policy esb_push_select_ops on integrations.esb_push
    for select to authenticated
    using (org_id = shared.current_org_id()
           and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
  -- (No INSERT/UPDATE policy for authenticated → the app tier cannot write posting state. The RPC's
  --  enqueue and the worker's status flips run as service_role/postgres, bypassing RLS. AC-007.)
  ```
- **DOWN:** drop policy `esb_push_select_ops`; `drop table integrations.esb_push cascade;`
- Verify: AC-007/008 green in `43_esb_push_enqueue_dedup.sql` + `44_esb_push_posting_gate.sql`.

### T-050-test-a — [red] pgTAP: enqueue dedup (unique dedup_key) (AC-008, FR-070/072)
- File (new): `supabase/tests/43_esb_push_enqueue_dedup.sql`.
- `plan(2)`. As service_role (the enqueue path the RPC uses), insert two rows with the same
  `(source_module, source_ref, target_env)` → second `throws_ok('23505')` (unique dedup_key).
  ```sql
  select lives_ok($$
    insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, target_env, dedup_key)
    values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260620-001','assembly-actual','goo','kitchen|PR-20260620-001|goo')
  $$, 'AC-008: first enqueue ok');
  select throws_ok($$
    insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, target_env, dedup_key)
    values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260620-001','assembly-actual','goo','kitchen|PR-20260620-001|goo')
  $$, '23505', null, 'AC-008: duplicate (same module/ref/env) rejected by dedup_key');
  ```
- Verify: `supabase test db` → file 43 red until T-050; then green.

### T-050-test-b — [red] pgTAP: posting state is worker-only (AC-007, FR-070/073)
- File (new): `supabase/tests/44_esb_push_posting_gate.sql`.
- `plan(3)`. Seed a row as service_role. As ops_lead: SELECT ok (1 row); as member: SELECT 0 rows;
  attempt to UPDATE `status='posted'` as ops_lead → `throws_ok('42501')` (no UPDATE policy/grant).
  ```sql
  -- enqueue one row as service_role (the RPC's path) before switching to authenticated.
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, target_env, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260620-001','assembly-actual','goo','kitchen|PR-20260620-001|goo');
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select is((select count(*)::int from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1'), 1,
    'AC-007: ops_lead reads the org push row');
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
  select is((select count(*)::int from integrations.esb_push), 0, 'AC-007: member reads 0 push rows');
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select throws_ok($$
    update integrations.esb_push set status='posted', esb_doc_num='X1' where dedup_key='kitchen|PR-20260620-001|goo'
  $$, '42501', null, 'AC-007: app tier cannot write posting state (worker/service only)');
  ```
- Verify: `supabase test db` → file 44 red until T-050; then green.

### T-053 — [green] `ops.stock_available_for_date()` read helper + `integrations.current_esb_target_env()` (KQ-1/KQ-6, FR-023/061/080/081)
- File: `supabase/migrations/20260620000007_ops_kitchen_helpers.sql`.
- The start-of-day cut (the logging availability basis). `SECURITY INVOKER STABLE` (reads only
  `ops.kitchen_logs`; RLS scopes it to the caller's org). Production adds, Transfers subtract; only
  Approved; `log_date < D` (start-of-day, FR-061).
  ```sql
  -- Start-of-day available stock for (wip_item_id, as_of_date): the net of Approved logs strictly
  -- before as_of_date (FR-023 availability basis; FR-061 start-of-day cut). SECURITY INVOKER STABLE.
  create or replace function ops.stock_available_for_date(p_wip_item_id uuid, p_as_of date)
  returns numeric(12,2)
  language sql
  stable
  security invoker
  set search_path = ''
  as $$
    select coalesce(sum(
      case
        when action_type = 'Production'                 then qty_porsi
        when action_type in ('Transfer to Bungur','Transfer to Radiant') then -qty_porsi
      end
    ), 0)::numeric(12,2)
    from ops.kitchen_logs
    where wip_item_id = p_wip_item_id
      and status = 'Approved'
      and log_date < p_as_of
  $$;
  comment on function ops.stock_available_for_date(uuid, date) is
    'Start-of-day available stock (FR-023/061). Net of Approved logs strictly before the date. SECURITY INVOKER.';

  -- The ESB target_env the RPC stamps at enqueue (KQ-6, FR-080/081). Default 'dry_run'; a pre-flip
  -- deployment sets the 'goo' GUC (set [local] app.esb_target_env = 'goo'); 'gkid' is reached ONLY at
  -- the owner-gated flip (FR-082). MECHANISM IS A GUC, not a JWT claim (M1) — current_setting reads the
  -- GUC, never a key inside request.jwt.claims.
  create or replace function integrations.current_esb_target_env()
  returns text
  language sql
  stable
  security invoker
  set search_path = ''
  as $$
    select coalesce(
      nullif(current_setting('app.esb_target_env', true), ''),
      'dry_run'
    )
  $$;
  comment on function integrations.current_esb_target_env() is
    'ESB target env stamped at enqueue (FR-080/081). Reads GUC app.esb_target_env (NOT a JWT claim). Default dry_run; deployment sets goo; gkid only at the flip. SECURITY INVOKER.';
  ```
- **DOWN:** drop both functions (`ops.stock_available_for_date(uuid, date)`,
  `integrations.current_esb_target_env()`).
- Verify: used by the RPC (T-060) + proven by `42_kitchen_stock_recompute.sql` (the availability read).

### T-060 — [green] the atomic approval RPC `ops.approve_kitchen_log` (FR-044/050/062/070/090, AC-010, AC-012, AC-013, AC-034, AC-060)
- File: `supabase/migrations/20260620000009_ops_approve_kitchen_log_rpc.sql`.
- One `SECURITY DEFINER` (revoke PUBLIC/anon/authenticated execute — NFR-009; grant to `authenticated`
  so an ops_lead session can call it; the guard inside enforces the role gate). It: (1) loads the log
  FOR UPDATE; (2) asserts caller is ops_lead/admin (defense-in-depth; RLS already gates, but the RPC
  is the single audited write point); (3) mints `batch_id` via the seq upsert (KQ-5); (4) flips status
  Approved + stamps reviewed_by/at; (5) recomputes kitchen_stock for (date, item) end-of-day; (6)
  enqueues the esb_push row (target_env from the helper); (7) writes the summary mirror into
  ops.log_entries (idempotent per batch via the partial unique index from T-070). All in one tx.
  **The mirror insert (step 7) must satisfy `ops.log_entries`'s live `log_entries_guard`** (I4): it
  looks up the Kitchen-and-Bar BU under `v_log.org_id` and raises if absent (so a NULL/foreign-org
  `business_unit_id` can never reach the guard and abort the tx).
  ```sql
  create or replace function ops.approve_kitchen_log(p_log_id uuid, p_review_note text)
  returns text  -- the minted batch_id
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_log        ops.kitchen_logs;
    v_prefix     text;
    v_next_n     integer;
    v_batch_id   text;
    v_endpoint   text;
    v_payload    jsonb;
    v_target     text;
    v_dedup      text;
    v_stock_qty  numeric(12,2);
    v_wip        ops.wip_items;
    v_bu_kitchen uuid;
  begin
    -- (1) load + lock the log row.
    select * into v_log from ops.kitchen_logs where id = p_log_id for update;

    if v_log.id is null then
      raise exception 'kitchen log not found' using errcode = 'P0002';
    end if;

    if v_log.status <> 'Submitted' then
      raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
    end if;

    -- (2) defense-in-depth role gate (RLS already enforces; the RPC is the single audited point).
    if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
      raise exception 'only ops_lead/admin may approve' using errcode = '42501';
    end if;

    -- (3) mint batch_id (KQ-5). prefix by action_type (FR-050).
    v_prefix := case v_log.action_type
      when 'Production'           then 'PR'
      when 'Transfer to Radiant'  then 'TR'
      when 'Transfer to Bungur'   then 'TB' end;

    insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
    values (v_log.org_id, v_prefix, v_log.log_date, 1)
    on conflict (org_id, prefix, log_date) do update
      set last_n = ops.kitchen_batch_seq.last_n + 1
    returning last_n into v_next_n;

    v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-' || lpad(v_next_n::text, 3, '0');

    -- (4) flip Approved + stamps.
    update ops.kitchen_logs
       set status = 'Approved',
           reviewed_by = shared.current_person_id(),
           reviewed_at = now(),
           review_note = p_review_note,
           batch_id = v_batch_id
     where id = p_log_id;

    -- (5) recompute kitchen_stock end-of-day for (date, item) — net of ALL approved logs that day (FR-062).
    select coalesce(sum(
      case when action_type = 'Production' then qty_porsi else -qty_porsi end
    ), 0)::numeric(12,2)
      into v_stock_qty
      from ops.kitchen_logs
     where org_id = v_log.org_id and wip_item_id = v_log.wip_item_id
       and log_date = v_log.log_date and status = 'Approved';

    insert into ops.kitchen_stock (org_id, log_date, wip_item_id, usable_qty)
    values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_stock_qty)
    on conflict (org_id, log_date, wip_item_id) do update
      set usable_qty = excluded.usable_qty, updated_at = now();

    -- (6) enqueue the outbox row (FR-070). endpoint + payload by action_type (FR-071); Bungur = noop.
    select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
    v_endpoint := case v_log.action_type
      when 'Production'           then 'assembly-actual'
      when 'Transfer to Radiant'  then 'simple-transfer'
      when 'Transfer to Bungur'   then 'noop' end;
    v_payload := jsonb_build_object(
      'batch_id', v_batch_id,
      'wip_item_id', v_log.wip_item_id,
      'esb_bom_id', v_wip.esb_bom_id,
      'esb_product_detail_id_porsi', v_wip.esb_product_detail_id_porsi,
      'qty_porsi', v_log.qty_porsi,
      'action_type', v_log.action_type,
      'log_date', v_log.log_date);
    v_target := integrations.current_esb_target_env();
    v_dedup  := 'kitchen|' || v_batch_id || '|' || v_target;

    insert into integrations.esb_push
      (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
    values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
    on conflict (dedup_key) do nothing;  -- idempotent enqueue (FR-092-shape for the push row)

    -- (7) summary mirror into ops.log_entries (FR-090/092). Idempotent per batch (partial unique idx,
    --  T-070). The mirror carries NO owner/RACI/status fields (FR-091/AC-061) — only org, BU, origin,
    --  event_type, title, detail, occurred_at. business_unit_id is the Kitchen-and-Bar BU resolved
    --  under v_log.org_id; if absent, raise (I4) — never insert a NULL/foreign-org BU that would trip
    --  the live ops.log_entries log_entries_guard (23514/23502) and abort this atomic tx.
    select id into v_bu_kitchen from shared.business_units
     where org_id = v_log.org_id and name = 'Kitchen and Bar' limit 1;
    if v_bu_kitchen is null then
      raise exception 'Kitchen and Bar business unit not found for org % — cannot mirror to Daily Log', v_log.org_id
        using errcode = 'P0004';
    end if;

    insert into ops.log_entries
      (org_id, business_unit_id, origin, event_type, title, detail, occurred_at)
    values (v_log.org_id, v_bu_kitchen, 'kitchen', 'production',
      'Production: ' || v_log.qty_porsi || ' portions approved (' || v_batch_id || ')',
      jsonb_build_object('batch_id', v_batch_id, 'wip_item_id', v_log.wip_item_id,
                         'qty_porsi', v_log.qty_porsi, 'action_type', v_log.action_type)::text,
      now())
    on conflict (org_id, (detail->>'batch_id')) where origin = 'kitchen' do nothing;

    return v_batch_id;
  end;
  $$;
  comment on function ops.approve_kitchen_log(uuid, text) is
    'Atomic approval (FR-044/050/062/070/090): mints batch_id, recomputes stock, enqueues outbox, writes Daily Log mirror (no R/A/status — FR-091). SECURITY DEFINER.';

  revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
  grant execute on function ops.approve_kitchen_log(uuid, text) to authenticated;
  ```
- **DOWN:** revoke grant; `drop function ops.approve_kitchen_log(uuid, text);`
- Verify: AC-010/012/013/034/060/061 green in `45_batch_id_mint.sql` + `46_approve_rpc_atomicity.sql`.

### T-060-test-a — [red] pgTAP: batch_id mint per (prefix, date), distinct, no mint on reject (AC-010, AC-012, AC-013)
- File (new): `supabase/tests/45_batch_id_mint.sql`.
- `plan(6)`. Seed (the fixture inserts on 2026-06-20: `…ac01..03` Production, `…ac04` TR, `…ac05` TB,
  `…ac06` Production-to-reject — all status Submitted). Approve in order via the RPC as ops_lead;
  assert the minted ids: `PR-20260620-001`, `…002`, `…003`, `TR-…001`, `TB-…001`. Reject `…ac06`
  (direct UPDATE status='Rejected' as ops_lead, allowed by the guard) → assert its `batch_id is null`.
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null), 'PR-20260620-001', 'AC-010: first PR → 001');
  select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac02'::uuid, null), 'PR-20260620-002', 'AC-010: second PR → 002');
  select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac03'::uuid, null), 'PR-20260620-003', 'AC-010: third PR → 003');
  select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac04'::uuid, null), 'TR-20260620-001', 'AC-013: first TR → TR-001');
  select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac05'::uuid, null), 'TB-20260620-001', 'AC-013: first TB → TB-001');
  -- AC-012: reject does NOT mint.
  update ops.kitchen_logs set status='Rejected', reviewed_by='00000000-0000-0000-0000-0000000000d3', reviewed_at=now()
   where id='00000000-0000-0000-0000-00000000ac06'::uuid;
  select is((select batch_id from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac06'::uuid), null,
    'AC-012: rejected log has no batch_id');
  ```
- Verify: `supabase test db` → file 45 red until T-060; then green. (AC-011 concurrency is proven at
  the worker/integration layer in plan k2 — the conflict-upsert on the seq row is the mechanism; here
  we prove the sequential minting is correct. Noted in §4.)

### T-060-test-b — [red] pgTAP: approval atomicity — stock + enqueue + mirror in one call; mirror passes log_entries_guard + carries no R/A/status (AC-034, AC-060, AC-061, I4)
- File (new): `supabase/tests/46_approve_rpc_atomicity.sql`.
- `plan(7)`. Seed one Submitted Production log `…ac01` qty 12. Set the ESB target via the **GUC**
  (`set local app.esb_target_env = 'goo'`, NOT a JWT-claims key — M1). Approve via RPC. Assert:
  (a) the log is Approved with batch_id + reviewed_by; (b) kitchen_stock for (date, item) = 12; (c) an
  esb_push row exists for the batch (status pending, target_env 'goo'); (d) one ops.log_entries row
  origin='kitchen' (I4: the mirror insert passed `log_entries_guard` — a same-org Kitchen-and-Bar BU,
  proving the BU was seeded before approval); (e) that mirror row's business_unit_id is the
  Kitchen-and-Bar BU and its detail carries NO owner/RACI/status keys (AC-061 — pure data shape);
  (f) re-calling the RPC for the same log raises (status no longer Submitted) — idempotency is on the
  *batch*, not the *log* (FR-092).
  ```sql
  set local role authenticated;
  set local app.esb_target_env = 'goo';  -- GUC, not a JWT claim (M1/KQ-6)
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null);
  select is((select status from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac01'::uuid),
            'Approved', 'AC-034: log Approved');
  select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20'),
            12::numeric, 'AC-034: stock recomputed to the approved net');
  select is((select count(*)::int from integrations.esb_push where source_ref like 'PR-20260620-%' and status='pending' and target_env='goo'),
            1, 'AC-060: outbox row enqueued (pending, target_env from GUC)');
  select is((select count(*)::int from ops.log_entries where origin='kitchen'),
            1, 'AC-060/I4: one Daily Log mirror row (the insert passed log_entries_guard)');
  -- AC-061: the mirror is a faithful Daily Log entry — Kitchen-and-Bar BU, NO owner/RACI/status fields.
  select is((select business_unit_id from ops.log_entries where origin='kitchen'),
            (select id from shared.business_units where org_id='00000000-0000-0000-0000-0000000000a1' and name='Kitchen and Bar'),
            'AC-061: mirror carries the Kitchen-and-Bar BU');
  select ok(
    (select (detail::jsonb) ?| array['owner','responsible','accountable','status','reviewed_by'] = false
       from ops.log_entries where origin='kitchen'),
    'AC-061: mirror detail carries NO owner/RACI/status fields (faithful Daily Log entry)');
  select throws_ok($$ select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null) $$,
    'P0003', null, 'FR-092: re-approve same log raises (idempotency is per-batch, not per-log)');
  ```
- Verify: `supabase test db` → file 46 red until T-060 + T-070 (origin) + T-090 (fixture, with the
  Kitchen-and-Bar BU seeded BEFORE approval — I4); then green.

### T-062-test — [red] pgTAP: stock net math + negative preserved + recompute on approve (AC-031, AC-032, AC-034)
- File (new): `supabase/tests/42_kitchen_stock_recompute.sql`.
- `plan(4)`. The fixture seeds, on item `…ab02` / 2026-06-21: Submitted PR 12, TR 4, TB 3, and a
  further Submitted PR 9; and on item `…ab03` / 2026-06-22: Submitted TB 100 (with zero production).
  As ops_lead, approve via the RPC and assert the running net.
  ```sql
  set local role authenticated;
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
  -- approve PR+12, TR-4, TB-3 for item …ab02 on 2026-06-21 (fixture ids …ad01..03) → net 5.
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad01'::uuid, null);  -- PR 12
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad02'::uuid, null);  -- TR 4
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad03'::uuid, null);  -- TB 3
  select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab02' and log_date='2026-06-21'),
            5::numeric, 'AC-031: stock = +12 -4 -3 = 5 (net of approved)');
  -- AC-031: a still-Submitted log (…ad04 PR 9) does not count yet.
  select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab02' and log_date='2026-06-21'),
            5::numeric, 'AC-031: a pending Submitted log does not change stock (GIGO gate)');
  -- approve the 4th (PR 9) → 5 + 9 = 14.
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad04'::uuid, null);  -- PR 9
  select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab02' and log_date='2026-06-21'),
            14::numeric, 'AC-034: stock recomputed after the 4th approval (5 + 9)');
  -- AC-032: negative preserved (approve TB 100 for item …ab03 with 0 production).
  perform ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad05'::uuid, null);  -- TB 100
  select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab03' and log_date='2026-06-22'),
            -100::numeric, 'AC-032: negative balance preserved (not clamped)');
  ```
- Verify: `supabase test db` → file 42 red until T-060; then green.
- **Note:** uses `perform` (PL/pgSQL) — wrap these approval calls in a `do $$ begin … end $$;` block,
  or use `select` discarding the return; the assertions are the `select is(...)` lines. (The fixture
  ids `…ad01..05` are the day-21/22 logs added to T-090.)

### T-070 — [green] widen `ops.log_entries.origin` for the kitchen token + idempotency index (KQ-2, FR-095/092, AC-071)
- File: `supabase/migrations/20260620000010_ops_log_entries_origin_kitchen.sql`.
  ```sql
  -- Widen the ops.log_entries.origin CHECK to admit 'kitchen' (ADR-0012 token, FR-095). Reversible:
  -- the legacy 'kitchen_app' is retained for back-compat. A partial unique index makes the summary
  -- mirror idempotent per batch (FR-092): at most one kitchen-origin row per batch_id.
  alter table ops.log_entries drop constraint if exists log_entries_origin_check;
  alter table ops.log_entries add constraint log_entries_origin_check
    check (origin in ('manual','kitchen_app','roastery_app','kitchen'));

  create unique index if not exists log_entries_kitchen_batch_uidx
    on ops.log_entries (org_id, (detail->>'batch_id'))
    where origin = 'kitchen';
  ```
- **DOWN:** `drop index if exists log_entries_kitchen_batch_uidx;` then
  `alter table ops.log_entries drop constraint if exists log_entries_origin_check;` then re-add the
  original `check (origin in ('manual','kitchen_app','roastery_app'));`
- Verify: AC-071 in `47_log_entries_origin_kitchen.sql` (T-071-test).
- **Confirm against the real tree:** `20260612000004_ops_log_entries.sql` defines the CHECK constraint
  named `log_entries_origin_check` with set `('manual','kitchen_app','roastery_app')`. If the live
  constraint name differs, this DROP/ADD must use the actual name (the implementer verifies via
  `\d+ ops.log_entries` after `supabase db reset`).

### T-071-test — [red] pgTAP: origin admits 'kitchen' + reversible (AC-071)
- File (new): `supabase/tests/47_log_entries_origin_kitchen.sql`.
- `plan(3)`. Insert a `log_entries` row with `origin='kitchen'` → lives_ok; assert the CHECK admits
  it. Insert `origin='bogus'` → `throws_ok('23514')`. Assert the legacy `kitchen_app` still accepted.
  All as service_role (origin widening is a CHECK, independent of RLS; the BU is the same-org seeded
  Kitchen-and-Bar to satisfy `log_entries_guard`).
  ```sql
  select lives_ok($$
    insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, occurred_at)
    values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','kitchen','production','t',now())
  $$, 'AC-071: origin=kitchen accepted');
  select throws_ok($$
    insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, occurred_at)
    values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','bogus','production','t',now())
  $$, '23514', null, 'AC-071: out-of-set origin still rejected');
  select lives_ok($$
    insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, occurred_at)
    values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','kitchen_app','production','t',now())
  $$, 'AC-071: legacy kitchen_app still accepted (back-compat)');
  ```
- Verify: `supabase test db` → file 47 red until T-070; then green.

### T-090 — [green] `mos._test_seed_kitchen()` fixture (SECURITY DEFINER, service-role only)
- File: `supabase/migrations/20260620000011_ops_kitchen_test_seed.sql`.
- Seeds the Kitchen-and-Bar BU + WIP items + Submitted logs the pgTAP files reference. Fixed UUIDs per
  §0.3 (`…00000000bb01` Kitchen-and-Bar BU, `…00000000ab01..03` WIP items, `…00000000ac01..06` +
  `…00000000ad01..05` kitchen_logs), plus the **foreign-org** rows for the I2 same-org guard test
  (`…00000000bb09` BU + `…00000000ab09` WIP item, both under org WU-B `…0b1`). Inserts via the function
  owner (postgres / service_role context — bypasses RLS + guard). Mirrors `mos._test_seed_access_roles()`
  (PR #41). **The Kitchen-and-Bar BU is seeded here so the approval RPC's mirror insert (I4) finds it
  before any approval test runs.**
  ```sql
  create or replace function mos._test_seed_kitchen()
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    -- Kitchen and Bar BU for org A (fresh hex id; NOT org WU-B's …0b1). Required by the mirror (I4).
    insert into shared.business_units (id, org_id, name)
    values ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar')
    on conflict (id) do nothing;
    -- A foreign-org (WU-B) BU + WIP item, for the same-org FK guard test (I2 / T-041-test-guard).
    insert into shared.business_units (id, org_id, name)
    values ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen')
    on conflict (id) do nothing;

    -- Active WIP items (org A).
    insert into ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi)
    values
      ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001'),
      ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002'),
      ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003')
    on conflict (id) do nothing;
    -- A foreign-org (WU-B) WIP item, for the same-org FK guard test (I2).
    insert into ops.wip_items (id, org_id, name, flag_active)
    values ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true)
    on conflict (id) do nothing;

    -- Submitted kitchen logs (org A, BU Kitchen-and-Bar …bb01).
    -- 2026-06-20 mint suite: ac01..03 Production (qty 12/8/5), ac04 TR 4, ac05 TB 3, ac06 PR 2 (reject).
    insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, status, submitted_by)
    values
      ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Transfer to Radiant','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Transfer to Bungur','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
    on conflict (id) do nothing;
    -- 2026-06-21 stock suite (item ab02): ad01 PR 12, ad02 TR 4, ad03 TB 3, ad04 PR 9.
    -- 2026-06-22 negative suite (item ab03): ad05 TB 100 (zero production that day).
    insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, status, submitted_by)
    values
      ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Production','00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Transfer to Radiant','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Transfer to Bungur','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Production','00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
      ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','Transfer to Bungur','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
    on conflict (id) do nothing;
  end;
  $$;
  comment on function mos._test_seed_kitchen() is
    'TEST-ONLY fixture (SECURITY DEFINER): Kitchen-and-Bar BU + WIP items + Submitted logs on the WU-A tree, plus foreign-org rows for the same-org guard test. Call after _test_seed_role_tree() + _test_seed_access_roles().';
  revoke execute on function mos._test_seed_kitchen() from public, anon, authenticated;
  ```
- **DOWN:** `drop function mos._test_seed_kitchen();` (The seeded rows live inside the pgTAP
  `begin;…rollback;` — no cleanup needed.)
- Verify: every pgTAP file (36..48) calls `select mos._test_seed_kitchen();` after the two prior seeds.

### T-099 — Full DB gate: reset + pgTAP suite green
- Verify (exact): from the worktree root,
  ```
  supabase db reset && supabase test db
  ```
  Expect all files `00..48` green (the new `36..48` plus the unchanged prior suite + the access-roles
  `29..35`, **which is present in this stacked branch** — see §0). Confirm no regression in
  `23..28_ops_log_*` (the origin widening must not break the existing log tests) and
  `08_claim_parsing` / `09_claim_consistency` (the access-roles hook — unchanged by kitchen).
- (No AC — the suite-green gate for PR-k1.)

---

## 3. Definition of Done (binding — `docs/product-expectations.md`)

- **PR-k1:** `supabase db reset && supabase test db` → all pgTAP files `00..48` green (new `36..48`
  prove AC-001..008, AC-031/032/034, AC-043, AC-060, AC-061, AC-071, and the I2 same-org FK seam).
  Migrations reversible (every new migration carries a `-- DOWN:` block). `config.toml` exposes
  `integrations` (T-005).
- **No new `SECURITY DEFINER` left un-revoked** — the two helpers (`stock_available_for_date`,
  `current_esb_target_env`) are INVOKER; the one DEFINER (`approve_kitchen_log`) has `revoke … from
  public, anon, authenticated` + a targeted grant to `authenticated` (NFR-009). The `_guard_kitchen_log`
  trigger is INVOKER (lint clean). `_test_seed_kitchen` is DEFINER + revoked (test-only).
- **Gating security review (NFR-011, ADR-0010 D11) — pre-merge, before any exposure/rollout.** The
  `security-auditor` must cover, with the pgTAP proofs as evidence: (1) the member→ops_lead approval
  gate — can any path self-approve or approve a foreign-org log? (AC-003/004/043 + the guard + RPC
  role check); (2) the `target_env` stamp — can the app tier force `gkid` before the flip?
  (`current_esb_target_env` reads the deployment **GUC** `app.esb_target_env`, never a client value —
  FR-081/NFR-001); (3) the RPC's widened DEFINER write across `kitchen_logs`/`kitchen_stock`/`esb_push`/
  `log_entries` (all org-scoped by the loaded `v_log.org_id`, never a client-supplied org); (4) the
  dedup uniqueness + idempotent enqueue/mirror (AC-008, FR-092); (5) the no-DELETE posture (AC-005);
  (6) **the same-org FK seam on kitchen_logs** (I2) — a member cannot reference a foreign-org BU or
  WIP item (23514, mirroring `ops._guard_log_entry`). **No production exposure until this passes + the
  owner flips the deploy flag.**
- **AC → task coverage map** (every DB-layer AC owned by exactly one task):

  | AC | Layer | Task(s) |
  |---|---|---|
  | AC-001 | pgTAP | T-041 / T-041-test-a |
  | AC-002 | pgTAP | T-041 / T-041-test-prov + T-041-test-guard (same-org FK seam, I2) |
  | AC-003 | pgTAP | T-041 / T-041-test-b |
  | AC-004 | pgTAP | T-041 / T-041-test-b |
  | AC-005 | pgTAP | T-011/T-030/T-041/T-042/T-050 / T-041-test-c |
  | AC-006 | pgTAP | T-011 / T-020 |
  | AC-007 | pgTAP | T-050 / T-050-test-b |
  | AC-008 | pgTAP | T-050 / T-050-test-a |
  | AC-010 | pgTAP | T-060 / T-060-test-a |
  | AC-012 | pgTAP | T-060 / T-060-test-a |
  | AC-013 | pgTAP | T-060 / T-060-test-a |
  | AC-031 | pgTAP | T-060 / T-062-test |
  | AC-032 | pgTAP | T-060 / T-062-test |
  | AC-034 | pgTAP | T-060 / T-062-test / T-060-test-b |
  | AC-043 | pgTAP | T-041 / T-041-test-b |
  | AC-060 | pgTAP | T-060 / T-060-test-b |
  | AC-061 | pgTAP | T-060 / T-060-test-b (mirror data shape — provable now) |
  | AC-071 | pgTAP | T-070 / T-071-test |

  **Deferred to later plans (NOT this one):** AC-011 (concurrency — worker plan k2), AC-020..024
  (logging gates — UI plan k3), AC-030 (increment semantics — UI plan k3), AC-033 (start-vs-end cuts
  — UI plan k3), AC-040..042 (review gates — UI plan k3), AC-041 (reject note — UI plan k3),
  AC-050..056 (worker — plan k2), **AC-070 (history migration / no-re-post — plan k4; there is no
  data to migrate yet, so it is deferred — this is the single owner of AC-070's deferral; §0 agrees)**,
  AC-090..094 (e2e — plan k3/k4).

---

## 4. Deviations + open items for the Director / owner / auditor

1. **AC-011 (concurrent batch_id mint) is deferred to plan k2.** The mechanism (the
   `INSERT … ON CONFLICT DO UPDATE … RETURNING` row lock on the seq, T-043/T-060) is built here, but a
   genuine concurrency proof needs two simultaneous sessions, which `supabase test db` (serial pgTAP)
   cannot express. Plan k2's worker integration tests prove it. Flagged so the AC-map is honest.
2. **AC-070 (history-migration / no-re-post) is deferred to plan k4.** There is no Teable data to
   migrate in this slice, so the import-as-already-posted behavior has nothing to assert. §0 and the
   AC-map both reflect this (the prior draft's §0 claim that this plan "owns AC-070" was the
   contradiction; it is resolved in favor of deferral).
3. **The approval RPC is the single audited write point — deliberate concentration of DEFINER.** It
   writes four tables in one tx. The alternative (4 triggers) scatters the atomicity and is harder to
   audit. The auditor should confirm every write is org-scoped from the loaded `v_log` (never a client
   org) and the role gate is checked inside (defense-in-depth). If the auditor objects to the
   concentration, the fallback is an enqueue-trigger + a stock-trigger off the status flip — but that
   loses the single-point auditability ADR-0012 D5 argues for.
4. **`target_env` is a GUC (`app.esb_target_env`), NOT a JWT claim (M1).** The substrate reads it via
   `current_setting('app.esb_target_env', true)` with a `dry_run` default — fail-safe. The deployment
   sets it with `set app.esb_target_env = 'goo'` (session/role default) pre-flip; tests set it with
   `set local app.esb_target_env = '…'`. The exact deploy mechanism (per-role `ALTER ROLE … SET` vs a
   connection-string option) is a deploy-time concern (plan k2 + the deploy plan). If the deploy uses
   a different GUC name, T-053's function is the one line to change.
5. **Spec §10 open questions carried forward (not closed by this plan):** Q2 (migration timing — plan
   k4), Q3 (exact session length — auth/deploy plan), Q4 (retry/backoff/dead-letter specifics — plan
   k2). Q5 (stored vs computed stock) is **resolved here** as stored-end-of-day + read-time
   start-of-day (KQ-1).
6. **`ops.log_entries` partial-unique-index idempotency uses `detail->>'batch_id'`.** The RPC writes
   `detail` as `jsonb::text`. The index expression `(detail->>'batch_id')` requires `detail` to hold
   valid JSON; the RPC's `jsonb_build_object(...)::text` guarantees that. If a future writer stores
   non-JSON `detail` for a kitchen-origin row, the index expression would error on insert — the CHECK
   on `origin` + the partial index (`where origin='kitchen'`) confines the risk to kitchen rows only.
7. **I4 — the mirror insert must satisfy the live `log_entries_guard`.** The RPC resolves the
   Kitchen-and-Bar BU under `v_log.org_id` and raises `P0004` if absent, so the mirror never inserts a
   NULL/foreign-org `business_unit_id` that would trip `log_entries_guard` (23514/23502) and abort the
   atomic approval tx. T-090 seeds that BU; T-060-test-b asserts the mirror row's BU + that it passed
   the guard. **Open question for the Director:** in production, who guarantees a "Kitchen and Bar" BU
   exists per org before the first approval? Either (a) the kitchen data-migration (plan k4) seeds it,
   or (b) the RPC should match the BU by a stable key (a `business_units.code`/slug) rather than the
   display name `'Kitchen and Bar'` (a renamed BU would break the mirror). Recommend (b) long-term;
   for this slice the name match is acceptable since the BU is fixture-seeded.

---

## 5. Spec ↔ schema reconciliations found (for the Director)

- **`integrations` schema is NOT exposed in `config.toml` today** (T-005). Unlike `ops` (exposed at
  P2-3), `integrations` was created empty at P1-2 and never added to the PostgREST `schemas` list.
  This plan adds it (the worker + ops_lead read need it). No RLS relaxation — exposure + RLS, as always.
- **`ops.log_entries.origin` does not admit `'kitchen'`** (FR-095). Today's CHECK is
  `('manual','kitchen_app','roastery_app')`. T-070 widens it (KQ-2) — reversible. The spec §3.6 flagged
  this; the plan resolves it to the ADR-0012 token `'kitchen'`.
- **`ops.wip_items` ESB-identity columns are nullable** (master data may predate known ESB IDs).
  The spec §3.1 lists them as "behaviorally required" — for a *logged* row they are (the worker reads
  them off the joined WIP item), but the WIP row itself may carry NULLs until a BOM/product detail is
  assigned. The RPC's payload builder coalesces them; the worker (plan k2) must treat a NULL ESB ID as
  a hard error (a WIP item cannot be pushed without its BOM). Noted for plan k2.
- **`integrations.esb_push` carries `updated_at`** (C3 fix). `shared.set_updated_at()` writes
  `new.updated_at`; the worker UPDATEs this row (pending→posted, retry bumps), so the column must
  exist or every UPDATE raises `record "new" has no field "updated_at"`. The column + the standard
  trigger are kept (the row is genuinely mutable). Mirrors every other `ops`/`shared` business table.
- **`ops.kitchen_logs.business_unit_id` referenced a fresh hex BU id, not org WU-B's id** (I1 fix).
  The fixture seeds Kitchen-and-Bar as `…00000000bb01` under org `…0a1`; org WU-B's `…0b1` is used
  exclusively as an org id / foreign-org JWT claim, never a BU id.

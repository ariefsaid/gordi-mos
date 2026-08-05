-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 1 of 4 for `ops`: structure (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Tables, columns, constraints, indexes and updated_at triggers for `ops`. Behaviour (predicates,
-- guards, grants, RLS, policies) lands in ...0010; derivations and read helpers in ...0011; pgTAP
-- fixtures in ...0012.
--
-- `ops` is the one schema in this squash whose SHAPE genuinely changes rather than being re-expressed
-- (DD-WAY-11). Three rulings drive that, and each is a one-way door or close to one:
--
--   OD-WAY-28  The (branch, activity) PRODUCTION STREAM lands on logs, plans AND stock. The
--              incumbent's 'Production' literal encodes no branch, so adding the dimension after real
--              rows exist makes every historical row's stream a permanent guess. Zero production rows
--              exist here, so every row is born with a true stream.
--   DD-WAY-13  The three-literal action_type is NOT ported. It folded destination into action because
--              Teable had one flat field and there was one production branch. The ERP was always
--              parameterised — the incumbent's ESB client holds zero branch constants; every id is a
--              caller argument. Stored model: `action ∈ {produce, transfer}` + origin + destination.
--              Today's three labels are DERIVED (...0011), so OD-K-1 parity — which is behavioural —
--              is preserved while the stored model stops lying.
--   OD-WAY-38  The flip imports Teable's history into these LIVE tables, not an archive, so a COGS
--              series has no seam at the flip date. That needs a `source` marker and a conditionally
--              nullable submitted_by, both of which are cheap here and expensive later.
--
-- ── The domain model, stated once so it is not re-derived wrongly (OD-WAY-26) ─────────────────
-- There is ONE physical kitchen. It is a CONSTANT, not a dimension, and is not modelled anywhere in
-- this file. What varies is which branch's books the raw comes from and the output goes to. Combined
-- with the activity that gives the real axis: a production record belongs to a (branch, activity)
-- stream. A Branch is an accounting context (shared.branches, the canonical catalog from OD-WAY-39);
-- it is NOT shared.sites, which is org structure for Teams.
--
-- Four traps this file is written against, all of which have already misled a session:
--   1. `Transfer to Bungur` posts nothing to the ERP NOT because "it stayed in the same place" but
--      because the ERP already books the originating branch as having produced it — the physical
--      movement has no counterpart in books that never recorded it leaving. The incumbent app's own
--      module docstring states the wrong reason; its behaviour is right. Here the rule is STRUCTURAL:
--      a transfer whose destination branch is its origin branch has no ERP counterpart (...0011).
--   2. "Stok HQ" in the incumbent means THE CENTRAL KITCHEN, which books to Rumah Rames — not to the
--      branch whose ERP code is GHQ. No column, comment or seed in this baseline carries that label.
--   3. WIP → finished goods is NOT an app event. The ERP's bill of materials consumes WIP at point of
--      sale. There is no table, column or status for it here.
--   4. 'Bungur' is the incumbent's UI label for Rumah Rames, not a fifth branch. It appears in this
--      baseline in exactly one place — the label derivation in ...0011 — and nowhere in stored data.
--
-- DOWN: drop schema ops cascade;
--       drop table integrations.esb_push cascade;   -- the landing zone authored in this pass, below
--
-- (`create schema if not exists ops` / `integrations` both live in ...0001 with the rest.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. ops.log_entries — the Daily Log
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The chronological floor record (OD-P2-15..19, ADR-0006): past-tense and factual, no owner/RACI/
-- status. Deliberately carries NO production stream: it is a narrative record of what happened on the
-- floor, not a production fact, and OD-WAY-28's dimension is scoped to logs/plans/stock — the three
-- tables that feed COGS. The user-facing name is "Daily Log"; the schema seam stays `ops` (OD-DIR-3).
create table ops.log_entries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade,
  business_unit_id uuid not null references shared.business_units(id),
  -- CARRIED from 20260612000004 + 20260620000010 (which widened the CHECK to admit 'kitchen').
  -- 'kitchen' is retained rather than reverted: 20260620000014 deferred the kitchen→Daily-Log mirror
  -- that was its only writer, and the widened token is harmless dead surface that keeps re-adding the
  -- mirror a one-migration change. Reverting it could fail against any row that used it.
  origin           text not null default 'manual'
                     check (origin in ('manual','kitchen_app','roastery_app','kitchen')),
  event_type       text not null default 'other'
                     check (event_type in ('production','receiving','qc','follow_up','other')),
  title            text not null check (btrim(title) <> ''),
  detail           text,
  occurred_at      timestamptz not null default now(),
  needs_attention  boolean not null default false,
  linked_task_id   uuid references mos.tasks(id) on delete set null,
  archived_at      timestamptz,
  created_by       uuid not null references shared.people(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table ops.log_entries is
  'Past-tense floor record; no owner/RACI/status (OD-P2-16). org-readable, author-or-manager write (OD-P2-19). User-facing name: Daily Log. Carries no production stream — it is a narrative record, not a production fact.';

create index log_entries_org_occurred_idx  on ops.log_entries (org_id, occurred_at desc);
create index log_entries_active_org_idx    on ops.log_entries (org_id, occurred_at desc)
  where archived_at is null;
create index log_entries_business_unit_idx on ops.log_entries (org_id, business_unit_id);
create index log_entries_event_type_idx    on ops.log_entries (org_id, event_type);
create index log_entries_needs_attn_idx    on ops.log_entries (org_id, needs_attention)
  where needs_attention and archived_at is null;
create index log_entries_linked_task_idx   on ops.log_entries (linked_task_id)
  where linked_task_id is not null;

-- CARRIED from 20260620000010: at most one kitchen-origin entry per batch, so the mirror is
-- idempotent per batch if and when it is re-added (FR-092). ops.log_entries.detail is TEXT and the
-- mirror wrote it as jsonb_build_object()::text, so the index casts before extracting — any future
-- ON CONFLICT target must use the IDENTICAL expression to match this index.
create unique index log_entries_kitchen_batch_uidx
  on ops.log_entries (org_id, ((detail::jsonb)->>'batch_id'))
  where origin = 'kitchen';

create trigger log_entries_set_updated_at
  before update on ops.log_entries
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. ops.wip_items — kitchen/bar master data
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Active-flagged products with the ESB identity the outbox worker composes an assembly body from
-- (ADR-0012, FR-010). CARRIED unchanged in shape.
--
-- NOT given a stream or an activity, deliberately. OD-WAY-26 says a stream "selects the item list",
-- but it does not say an item belongs to one stream — Rumah Rames and Radiant share a menu, so the
-- relation is many-to-many at best, and nothing rules its shape. It is also NOT a one-way door:
-- master data is a handful of hand-maintained rows that can be reclassified at any time, unlike the
-- fact rows below where a missing dimension becomes an unrecoverable guess. Left for the ticket that
-- builds the bar capture surface and knows what the filter actually needs.
create table ops.wip_items (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references shared.orgs(id) on delete cascade,
  name                        text not null check (btrim(name) <> ''),
  category                    text,
  flag_active                 boolean not null default true,
  esb_bom_id                  text,
  esb_product_detail_id_porsi text,
  esb_product_id              text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
comment on table ops.wip_items is
  'Kitchen/bar master data (FR-010). Active-flagged products carrying the ESB identity the outbox worker uses to compose the assembly body. Not stream-scoped — see the migration header.';

create index wip_items_org_active_idx on ops.wip_items (org_id, name) where flag_active;
create index wip_items_org_idx        on ops.wip_items (org_id);

create trigger wip_items_set_updated_at
  before update on ops.wip_items
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. ops.kitchen_plans — the daily plan, the variance baseline
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Per (org, date, item, stream, movement) planned qty_porsi (FR-030..032). Plan rows never post to
-- the ERP; they are what actuals are measured against.
--
-- THE UNIQUE KEY IS `nulls not distinct` AND THAT IS LOAD-BEARING. The incumbent's key was
-- (org, date, item, action_type) and re-saving a plan upserted it (FR-031). Splitting action_type
-- into `action` + `destination_branch_id` puts a NULL in the key for every produce row, and under
-- Postgres's default NULL semantics two produce rows for the same item and stream would BOTH be
-- accepted — silently turning an upsert into an append and doubling the day's plan. `nulls not
-- distinct` (PG15+, and this stack is 17) restores the incumbent's behaviour exactly.
create table ops.kitchen_plans (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  log_date    date not null,
  wip_item_id uuid not null references ops.wip_items(id) on delete cascade,

  -- ── the production stream this plan belongs to (OD-WAY-28) ──────────────────────────────────
  branch_id   uuid not null references shared.branches(id),
  activity    text not null check (activity in ('kitchen','bar')),

  -- ── the movement (DD-WAY-13) ────────────────────────────────────────────────────────────────
  action                text not null check (action in ('produce','transfer')),
  destination_branch_id uuid references shared.branches(id),

  qty_porsi   numeric(12,2) not null check (qty_porsi >= 0),
  notes       text,
  -- OD-WAY-38: the flip imports Teable's plan history into this live table.
  source      text not null default 'mos' check (source in ('mos','teable_import')),
  plan_by     uuid references shared.people(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint kitchen_plans_destination_matches_action check (
    (action = 'produce'  and destination_branch_id is null) or
    (action = 'transfer' and destination_branch_id is not null)),

  unique nulls not distinct
    (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id)
);
comment on table ops.kitchen_plans is
  'Daily plan (FR-030) and the variance baseline (FR-032). Keyed on (org, date, item, production stream, movement) so re-saving upserts (FR-031). Never posts to the ERP.';
comment on column ops.kitchen_plans.branch_id is
  'Origin half of the (branch, activity) production stream (OD-WAY-28) — whose books the raw comes from. Links to the canonical branch catalog (OD-WAY-39). NOT a place: there is one physical kitchen and it is a constant.';
comment on column ops.kitchen_plans.activity is
  'Activity half of the production stream — kitchen or bar, the two WIP-producing activities the Cafe Module serves (OD-WAY-26).';
comment on column ops.kitchen_plans.destination_branch_id is
  'Whose books the output goes to, for a transfer. NULL for produce. A destination is a BRANCH and carries no activity of its own (DD-WAY-26): a selling branch has no production activity, and the ERP''s BOM consumes the WIP at point of sale. Equal to branch_id means the movement has no ERP counterpart.';
comment on column ops.kitchen_plans.source is
  'mos = authored in MOS; teable_import = a historical row imported at the flip into this live table rather than an archive (OD-WAY-38), so a COGS series has no seam at the flip date.';

create index kitchen_plans_org_date_idx   on ops.kitchen_plans (org_id, log_date);
create index kitchen_plans_org_item_idx   on ops.kitchen_plans (org_id, wip_item_id);
create index kitchen_plans_org_stream_idx on ops.kitchen_plans (org_id, branch_id, activity, log_date);

create trigger kitchen_plans_set_updated_at
  before update on ops.kitchen_plans
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. ops.kitchen_logs — the production fact table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One row per submitted line, increment semantics — a new log inserts a new row, never overwrites
-- (FR-020/021). Submitted→Approved/Rejected is RLS + guard gated (...0010). batch_id is minted at
-- approval (FR-050). The ERP-posting history is mirrored here for audit.
--
-- THIS IS THE TABLE THE CASH CASE RUNS THROUGH (OD-WAY-27). There are FIVE distinct
-- (branch, activity) production streams and exactly ONE is captured today (DD-WAY-25 — the earlier
-- "six, two captured" counts an action type as a stream, and the ruling's own table gives it away).
-- The other four reach the ERP on a paper form that a supervisor retypes; that transcription step is
-- what blew up July's COGS. Every column below that carries the stream exists so those four can be
-- captured typed, against a fixed item list, with no human retyping anything.
create table ops.kitchen_logs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade,
  business_unit_id uuid not null references shared.business_units(id),
  log_date         date not null,

  -- ── the production stream this record belongs to (OD-WAY-28) ────────────────────────────────
  -- NOT NULL is the whole point of landing this now rather than later: a log cannot be written
  -- without saying whose books it moves (AC-007).
  branch_id        uuid not null references shared.branches(id),
  activity         text not null check (activity in ('kitchen','bar')),

  -- ── the movement (DD-WAY-13) ────────────────────────────────────────────────────────────────
  -- There is no stored action_type. `action` says what happened; `destination_branch_id` says where
  -- it went. The incumbent's three labels are DERIVED from this pair in ...0011.
  action                text not null check (action in ('produce','transfer')),
  destination_branch_id uuid references shared.branches(id),

  wip_item_id      uuid not null references ops.wip_items(id) on delete restrict,
  qty_porsi        numeric(12,2) not null check (qty_porsi > 0),
  notes            text,
  status           text not null default 'Submitted'
                     check (status in ('Submitted','Approved','Rejected')),

  -- ── import columns (OD-WAY-38) ──────────────────────────────────────────────────────────────
  source           text not null default 'mos' check (source in ('mos','teable_import')),
  -- submitted_by is CONDITIONALLY nullable. It was `not null references shared.people(id) on delete
  -- set null` on both prior chains, which is a latent contradiction on its own — the delete action
  -- cannot fire without violating the column. Teable's history will not all name a MOS person, and
  -- OD-WAY-38 puts that history in this live table, so the requirement is expressed per-source
  -- below rather than as a blanket NOT NULL. `on delete set null` becomes coherent as a result.
  submitted_by     uuid references shared.people(id) on delete set null,

  review_note      text,
  reviewed_by      uuid references shared.people(id) on delete set null,
  reviewed_at      timestamptz,
  -- Minted at approval. Its uniqueness is scoped to the org, below, matching the counter that mints
  -- it — ops.kitchen_batch_seq is keyed (org_id, prefix, log_date) — and matching how the same
  -- identifier is already scoped on ops.log_entries. Note that log_entries has NO batch_id column:
  -- it carries the value inside `detail` and its partial unique index is over the JSON expression
  -- (org_id, detail::jsonb ->> 'batch_id') where origin = 'kitchen'. Same scope, different storage,
  -- and a reader sent looking for a column there finds nothing.
  -- One tenant's batch ids are its own namespace, exactly as its counter is.
  batch_id         text,

  -- ── ERP posting history (OD-K-4) ────────────────────────────────────────────────────────────
  -- posted_to_esb was an audit mirror on both prior chains: DD-WAY-20 verified that NO predicate
  -- anywhere consulted it. It becomes LOAD-BEARING in this baseline — the enqueue refusal in ...0010
  -- reads it, so stamping it on an imported row now actually guarantees something.
  posted_to_esb    boolean not null default false,
  esb_doc_num      text,
  posted_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint kitchen_logs_destination_matches_action check (
    (action = 'produce'  and destination_branch_id is null) or
    (action = 'transfer' and destination_branch_id is not null)),

  -- AC-011: a MOS-authored row must name its submitter; an imported row need not (OD-WAY-38).
  constraint kitchen_logs_submitter_required_for_mos check (
    source <> 'mos' or submitted_by is not null),

  -- The batch identifier is unique WITHIN an org, which is the scope its counter works in. NULLs are
  -- distinct under the default semantics, so the many rows awaiting approval are unaffected.
  constraint kitchen_logs_batch_id_org_key unique (org_id, batch_id)
);
comment on table ops.kitchen_logs is
  'Production fact table (FR-020), increment semantics (FR-021). Scoped by the (branch, activity) production stream (OD-WAY-28). Submitted until a gated approval (FR-024/044). Carries Teable history imported at the flip alongside MOS-authored rows (OD-WAY-38).';
comment on column ops.kitchen_logs.branch_id is
  'Origin half of the (branch, activity) production stream (OD-WAY-28) — whose books the raw comes from and the output is credited to. Links to the canonical branch catalog (OD-WAY-39). There is one physical kitchen; it is a constant and is not modelled.';
comment on column ops.kitchen_logs.activity is
  'Activity half of the production stream — kitchen or bar (OD-WAY-26). There are five distinct (branch, activity) streams and ONE is captured today; the other four reach the ERP by hand (DD-WAY-25).';
comment on column ops.kitchen_logs.action is
  'produce or transfer (DD-WAY-13). Replaces the three-literal action_type, which folded destination into action because Teable had one flat field. The ERP was always parameterised.';
comment on column ops.kitchen_logs.destination_branch_id is
  'Whose books the output goes to, for a transfer; NULL for produce. A destination is a BRANCH and carries no activity of its own (DD-WAY-26) — a selling branch receives WIP, it does not produce. Equal to branch_id means the ERP already books the origin branch as holding it, so the movement has NO ERP counterpart — this is what makes the incumbent''s "Transfer to Bungur" a no-op, and the reason is accounting, not location.';
comment on column ops.kitchen_logs.source is
  'mos = captured in MOS; teable_import = imported from Teable at the flip into this live table rather than an archive (OD-WAY-38). A COGS series with a seam at the flip date is the exact shape of problem that let July''s blow-up hide.';
comment on column ops.kitchen_logs.submitted_by is
  'Required for source = mos, nullable for an imported row (AC-011, OD-WAY-38) — Teable history will not all name a MOS person.';
comment on column ops.kitchen_logs.posted_to_esb is
  'True once the ERP holds a document for this batch. LOAD-BEARING in this baseline, unlike both prior chains where nothing read it (DD-WAY-20): the enqueue refusal on integrations.esb_push consults it.';

create index kitchen_logs_org_date_idx    on ops.kitchen_logs (org_id, log_date);
create index kitchen_logs_org_status_idx  on ops.kitchen_logs (org_id, status);
create index kitchen_logs_item_date_idx   on ops.kitchen_logs (org_id, wip_item_id, log_date);
create index kitchen_logs_org_stream_idx  on ops.kitchen_logs (org_id, branch_id, activity, log_date);
-- The enqueue refusal looks a log up by (org_id, batch_id). No separate index for it: the
-- kitchen_logs_batch_id_org_key constraint above already indexes exactly those two columns in that
-- order, so a second one would be write cost for no read.

create trigger kitchen_logs_set_updated_at
  before update on ops.kitchen_logs
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. ops.kitchen_stock — the stored end-of-day projection
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- End-of-day balance per (org, date, item, stream), recomputed at approval (FR-060/062). Negative
-- balances are preserved rather than clamped (FR-061) — a negative is a real signal that more was
-- moved than was made. The start-of-day cut is a read-time computation (...0011), never stored.
--
-- OD-WAY-28 puts the stream here too, and the label trap bites hardest at this table: the incumbent's
-- stock tab reads "Stok HQ", where HQ means THE CENTRAL KITCHEN — which books to Rumah Rames, not to
-- the branch whose ERP code is GHQ. With a real stream column the balance says which books it is in
-- and no label has to carry that meaning.
create table ops.kitchen_stock (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  log_date    date not null,
  wip_item_id uuid not null references ops.wip_items(id) on delete cascade,
  branch_id   uuid not null references shared.branches(id),
  activity    text not null check (activity in ('kitchen','bar')),
  usable_qty  numeric(12,2) not null,
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (org_id, log_date, wip_item_id, branch_id, activity)
);
comment on table ops.kitchen_stock is
  'Stored end-of-day stock projection per (org, date, item, production stream) (FR-060/062, OD-WAY-28). Net of Approved logs. Negative preserved (FR-061). Start-of-day is a read, not a row.';
comment on column ops.kitchen_stock.branch_id is
  'Whose books this balance sits in. The reason the incumbent''s "Stok HQ" label is not ported: HQ there means the central kitchen, which books to Rumah Rames.';

create index kitchen_stock_org_item_idx   on ops.kitchen_stock (org_id, wip_item_id, log_date);
create index kitchen_stock_org_stream_idx on ops.kitchen_stock (org_id, branch_id, activity, log_date);

create trigger kitchen_stock_set_updated_at
  before update on ops.kitchen_stock
  for each row execute function shared.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. ops.kitchen_batch_seq — the batch_id counter
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Per (org, prefix, date) counter (KQ-5, FR-051). The approval path upserts with
-- ON CONFLICT ... DO UPDATE SET last_n = last_n + 1 RETURNING last_n, which atomically locks,
-- increments and returns; the lock is held for a sub-millisecond mint and the
-- unique (org_id, batch_id) on kitchen_logs is the backstop — the same two columns this counter is
-- keyed on, so the backstop covers exactly the namespace the counter counts in.
--
-- CARRIED unchanged, including the three prefixes — and they are NOT the three literals DD-WAY-13
-- bans. PR/TR/TB is a counter NAMESPACE, derived from (action, origin branch, destination branch) at
-- mint time by ops.kitchen_batch_prefix (...0011), and it is stored on no fact row. The distinction
-- that matters is where a value is stored, not where it is spelled.
create table ops.kitchen_batch_seq (
  org_id   uuid not null references shared.orgs(id) on delete cascade,
  prefix   text not null check (prefix in ('PR','TR','TB')),
  log_date date not null,
  last_n   integer not null default 0,
  primary key (org_id, prefix, log_date)
);
comment on table ops.kitchen_batch_seq is
  'Per-(org, prefix, date) batch_id counter (FR-051). RPC-internal: RLS is enabled and FORCED with no policy and no app-tier grant. The prefix is a derived counter namespace, not a stored action_type (DD-WAY-13).';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. integrations.esb_push — the ERP outbox landing zone
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ THIS IS AN `integrations` TABLE IN THE `ops` PASS, AND IT IS DELIBERATE. #184 MUST NOT RE-CREATE
-- IT — it should verify this shape and author the dispatch path on top.
--
-- The reason is the same class as the one that put reporting.esb_ar_reduction in the `mos` pass:
-- Postgres validates a dependency at creation time, so the object a later pass owns has to exist by
-- the time an earlier pass references it. Here #183's AC-012 is the dependency — the enqueue refusal
-- (DD-WAY-20) is a TRIGGER, and a trigger cannot be created on a table that does not exist. The
-- refusal is also cheap only during this squash, which is precisely why the ruling puts it here.
--
-- What lands in this pass: the table, its indexes, its updated_at trigger, its RLS posture, its one
-- policy, its grants, and the enqueue refusal (...0010). What does NOT: the dispatch path, the
-- approval function that is the sole legitimate creator of a row here, and the target-env helper —
-- all #184's, all re-authored against `ops`'s new shape and re-proven there.
--
-- One row per batch. The unique dedup_key is the central double-post guard, and note its precise
-- limit (DD-WAY-14): the key embeds target_env, so the guarantee is at most one post per batch PER
-- ENVIRONMENT. That is correct by design — a dry-run post is not a real one — but it means the flip's
-- safety comes from stopping the other writer, not from dedup.
create table integrations.esb_push (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  source_module text not null default 'kitchen'
                  check (source_module in ('kitchen','roastery')),
  source_ref    text not null,
  endpoint      text not null check (endpoint in ('assembly-actual','simple-transfer','noop')),
  payload       jsonb not null default '{}'::jsonb,
  target_env    text not null default 'dry_run'
                  check (target_env in ('goo','gkid','dry_run')),
  dedup_key     text not null,
  status        text not null default 'pending'
                  check (status in ('pending','in_flight','posted','failed','dead_letter')),
  retry_count   integer not null default 0,
  last_error    text,
  esb_doc_num   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  posted_at     timestamptz,
  unique (dedup_key)
);
comment on table integrations.esb_push is
  'Module-agnostic ERP outbox (ADR-0012, FR-070). One row per batch; unique dedup_key is the double-post guard, scoped per target environment (DD-WAY-14). AUTHORED IN THE ops PASS because AC-012''s enqueue refusal is a trigger on this table and a trigger needs its table — #184 owns the dispatch path and must not re-create this.';

create index esb_push_pending_idx on integrations.esb_push (status, created_at)
  where status in ('pending','failed');
create index esb_push_org_idx     on integrations.esb_push (org_id, created_at desc);

-- The worker flips status/posted_at on this row, so it carries updated_at and the standard trigger.
-- shared.set_updated_at() writes new.updated_at — the column must exist or every UPDATE raises
-- "record new has no field updated_at", and the pending→posted flip is exactly such an UPDATE.
create trigger esb_push_set_updated_at
  before update on integrations.esb_push
  for each row execute function shared.set_updated_at();

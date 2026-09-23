-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 3 of 4 for `ops`: derivations and read helpers (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This file is where DD-WAY-13 is actually paid for. The three-literal action_type is gone from
-- storage; everything that used to read it reads a derivation here instead.
--
-- The incumbent's three labels — 'Production', 'Transfer to Bungur', 'Transfer to Radiant' — were a
-- Teable flat-field workaround: one column had to carry both what happened and where it went, because
-- there was one production branch and one field to put it in. They were never domain truth. The ERP
-- was always parameterised: the incumbent's ESB client holds ZERO branch constants — every id is a
-- caller-supplied argument — and the hardcoding lives entirely in its dispatch table.
--
-- So the stored model is `action` + origin stream + destination branch, and the three labels become
-- presentation, derived. OD-K-1 parity is BEHAVIOURAL — same tabs, same labels, same flow — and
-- deriving delivers it exactly, while the stored model stops describing every production stream
-- through the one destination the incumbent happened to name.
--
-- All four derivations agree on one structural rule, and it is the correction OD-WAY-26 makes to the
-- incumbent's own stated reasoning:
--
--     a transfer whose destination branch IS its origin branch has no ERP counterpart.
--
-- Not "it stayed in the same place". The ERP already books the origin branch as having produced it,
-- so a movement that never left those books has nothing to record. The incumbent's module docstring
-- gives the location explanation; its behaviour is right and its explanation is wrong, and anyone
-- porting from the comments inherits the error. Expressed structurally here, the rule generalises to
-- every stream and every branch, including ones the incumbent never had a case for, instead of
-- naming one destination.
--
-- ── One helper deliberately NOT carried here, named so it is not lost ────────────────────────
-- integrations.current_esb_target_env() — the GUC read that stamps target_env at enqueue — belongs
-- with the dispatch path in #184, along with the approval function that is the sole legitimate
-- creator of an outbox row. Nothing in this pass depends on it: integrations.esb_push.target_env
-- defaults to the literal 'dry_run', exactly as it did on both prior chains, so the outbox table
-- authored in ...0009 is complete without it.
--
-- DOWN: drop function ops.kitchen_stock_for_date(date, uuid, text);
--       drop function ops.action_label(ops.kitchen_plans);
--       drop function ops.action_label(ops.kitchen_logs);
--       drop function ops.stock_available_for_date(uuid, date, uuid, text);
--       drop function ops.esb_endpoint_for(text, uuid, uuid);
--       drop function ops.kitchen_batch_prefix(text, uuid, uuid);
--       drop function ops.kitchen_action_label(text, uuid);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The label — today's three strings, derived
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE ONE PLACE IN THIS BASELINE WHERE THE NAME 'Bungur' APPEARS, and that containment is the point.
-- 'Bungur' is the incumbent's UI label for the Rumah Rames branch — its own poller records that
-- movement under branch code RRS, and its Teable read boundary normalises the legacy string
-- 'Transfer to RRS' to 'Transfer to Bungur'. It is NOT a fifth branch, which is why the canonical
-- catalog deliberately does not seed it: seeding it would re-create the collision the catalog exists
-- to end. Here it is a display alias on one row of one CASE, applied to no stored value.
--
-- Everything else is generic: 'Transfer to ' plus the destination branch's own name. That is what
-- makes this work for the four streams the incumbent never covered — the ones that reach the ERP
-- today on a paper form a supervisor retypes, which is what blew up July's COGS (OD-WAY-27).
--
-- SECURITY INVOKER: shared.branches is org-readable, so a member resolves their own org's names and
-- nothing else. A destination the caller cannot see yields the generic fallback rather than leaking a
-- name, and no caller can construct such a row anyway — the guard on kitchen_logs refuses a
-- cross-org destination_branch_id outright.
create or replace function ops.kitchen_action_label(p_action text, p_destination_branch_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce' then 'Production'
    when p_action = 'transfer' then
      'Transfer to ' || coalesce(
        (select case when b.code = 'rumah_rames' then 'Bungur' else b.name end
           from shared.branches b where b.id = p_destination_branch_id),
        'another branch')
  end
$$;
comment on function ops.kitchen_action_label(text, uuid) is
  'Derives the capture surface''s action label from action + destination branch (DD-WAY-13). Reproduces the incumbent''s three strings exactly, so OD-K-1''s behavioural parity holds, without storing any of them. ''Bungur'' is the incumbent''s UI label for Rumah Rames and appears here only — it is not a branch and is not in the catalog.';

-- Computed columns, so the label is read the same way everywhere and the mapping is not re-derived
-- per surface. PostgREST exposes a single-argument function over a table's composite type as a
-- virtual column, which is what keeps 26 app files from each owning their own copy of the CASE.
create or replace function ops.action_label(ops.kitchen_logs)
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select ops.kitchen_action_label($1.action, $1.destination_branch_id) $$;
comment on function ops.action_label(ops.kitchen_logs) is
  'Virtual column: the derived action label for a kitchen log (DD-WAY-13). There is no stored action_type.';

create or replace function ops.action_label(ops.kitchen_plans)
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select ops.kitchen_action_label($1.action, $1.destination_branch_id) $$;
comment on function ops.action_label(ops.kitchen_plans) is
  'Virtual column: the derived action label for a kitchen plan (DD-WAY-13). There is no stored action_type.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The batch_id prefix — derived, not stored
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PR / TR / TB were the incumbent's prefixes and they are kept, so an operator reading a batch id
-- sees what they have always seen (FR-051). They are derived here from the same three inputs as the
-- label, which is what makes ops.kitchen_batch_seq's CHECK a counter namespace rather than a second
-- home for the banned literals: no fact row stores a prefix.
create or replace function ops.kitchen_batch_prefix(
  p_action text, p_branch_id uuid, p_destination_branch_id uuid)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce'                        then 'PR'
    when p_destination_branch_id = p_branch_id       then 'TB'
    when p_action = 'transfer'                       then 'TR'
  end
$$;
comment on function ops.kitchen_batch_prefix(text, uuid, uuid) is
  'Derives the batch_id prefix (FR-051): PR = produce, TB = a transfer within one branch''s books, TR = a transfer between branches. Carried from the incumbent as presentation; stored on no fact row.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The ERP endpoint — the structural expression of the no-op
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The dispatch path itself is #184's. This is the domain half of it: which ERP operation a movement
-- corresponds to is a fact about branches and books, not about a worker, and it belongs beside the
-- model it reads. Two ERP operations cover every stream, including the four the incumbent never
-- reached — with different ids, which is exactly what the ESB client's caller-supplied arguments
-- were always able to accept.
--
-- The 'noop' arm is the one that has misled sessions: it is not "same location", it is "these books
-- never recorded it leaving".
--
-- AND THERE IS NO FOURTH ARM TO ADD (FR-053, #235, corrected in place 2026-08-12 alongside
-- 20260812000001). The noop arm is the PERMANENT treatment of an intra-branch movement, not a
-- placeholder for a posting arm somebody still owes: the production master-data lookup (2026-08-05,
-- #227 addendum) found no kitchen/bar location distinction, and production-type locations are not
-- valid transfer endpoints, so there is no ERP counterpart to post to as the master data is
-- configured. Bar capture (#235) makes the surface able to produce these rows from both activity
-- surfaces — bar → own branch's kitchen and kitchen → own branch's bar — so the arm now carries
-- real traffic, and the temptation to "finish" it grows with the volume. Revisit only if the ERP's
-- master data grows per-activity locations. The comparison stays branches-only; no
-- destination-activity dimension (FR-051, OD-WAY-44).
create or replace function ops.esb_endpoint_for(
  p_action text, p_branch_id uuid, p_destination_branch_id uuid)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce'                  then 'assembly-actual'
    when p_destination_branch_id = p_branch_id then 'noop'
    when p_action = 'transfer'                 then 'simple-transfer'
  end
$$;
comment on function ops.esb_endpoint_for(text, uuid, uuid) is
  'Derives the ERP operation for a movement (FR-071). produce posts an assembly; a transfer '
  'between branches posts a simple transfer; a transfer WITHIN one branch''s books posts '
  'nothing, because the ERP already books that branch as holding it (OD-WAY-26) — not because '
  'it stayed in the same place, which is what the incumbent''s own comments say. The noop arm '
  'is the PERMANENT model for intra-branch movements, not a placeholder (FR-053, #235): the '
  'production master-data lookup found no per-activity locations and production-type locations '
  'are invalid transfer endpoints, so no ERP counterpart exists to post to as configured. Do '
  'not add a posting arm here; revisit only if that master data grows per-activity locations. '
  'The comparison is branches only — no destination-activity dimension (FR-051, OD-WAY-44).';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Start-of-day available stock
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The net of Approved logs strictly before the date (FR-023 availability basis, FR-061 start-of-day
-- cut). Stored stock is the end-of-day balance; this is the read-time cut, and it is never a row.
--
-- Sign convention, unchanged from the incumbent and now expressed on the stored model: a produce adds
-- to the stream's on-hand and a transfer subtracts from it, whatever its destination. A transfer
-- within one branch's books still subtracts — no ERP document is produced, but the WIP has left the
-- kitchen's hands, and that is the number the floor is asking for.
--
-- SCOPED TO A PRODUCTION STREAM (OD-WAY-28), where the prior signature had no stream at all and so
-- could only ever describe one. It is also explicitly org-scoped rather than relying on the caller's
-- RLS context, so the same call returns the same answer from a definer path as from a member session.
create or replace function ops.stock_available_for_date(
  p_wip_item_id uuid, p_as_of date, p_branch_id uuid, p_activity text)
returns numeric(12,2)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case when l.action = 'produce' then l.qty_porsi else -l.qty_porsi end
  ), 0)::numeric(12,2)
  from ops.kitchen_logs l
  where l.org_id = shared.current_org_id()
    and l.wip_item_id = p_wip_item_id
    and l.branch_id = p_branch_id
    and l.activity = p_activity
    and l.status = 'Approved'
    and l.log_date < p_as_of
$$;
comment on function ops.stock_available_for_date(uuid, date, uuid, text) is
  'Start-of-day available stock for one wip item in one (branch, activity) production stream (FR-023/061): the net of Approved logs strictly before the date, produce positive and transfer negative. SECURITY INVOKER and explicitly org-scoped.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Per-date stock for every active item, in one round trip
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260620000013. The capture surface needs usable AND available per item for a given
-- date without one call per item (FR-022/023), so this returns a row per active item: the stored
-- end-of-day balance (0 where no row exists that day) beside the start-of-day cut.
--
-- SCOPED TO A PRODUCTION STREAM, like everything else that touches stock (OD-WAY-28). The prior
-- signature took only a date, which was sufficient while there was one implicit stream and is a
-- silent cross-stream sum the moment there is more than one — it would have added Gordi HQ's balance
-- to Rumah Rames's and reported the total as either.
--
-- SECURITY INVOKER: RLS on ops.wip_items and ops.kitchen_stock scopes the result to the caller's org,
-- and the scalar it reuses is org-scoped in its own right. No DEFINER, so nothing to revoke.
create or replace function ops.kitchen_stock_for_date(
  p_as_of date, p_branch_id uuid, p_activity text)
returns table(wip_item_id uuid, usable_qty numeric(12,2), available_qty numeric(12,2))
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    coalesce(s.usable_qty, 0)::numeric(12,2),
    av.available_qty
  from ops.wip_items w
  left join ops.kitchen_stock s
    on s.wip_item_id = w.id
   and s.log_date  = p_as_of
   and s.branch_id = p_branch_id
   and s.activity  = p_activity
  cross join lateral (
    select ops.stock_available_for_date(w.id, p_as_of, p_branch_id, p_activity) as available_qty
  ) av
  where w.flag_active
$$;
comment on function ops.kitchen_stock_for_date(date, uuid, text) is
  'Per-date stock for every active item in ONE production stream (FR-022/023): the stored end-of-day usable_qty (0 where absent) beside the start-of-day available cut. Stream-scoped (OD-WAY-28) — the prior date-only signature would silently sum two branches'' balances into one. SECURITY INVOKER; RLS scopes the org.';

grant execute on function ops.kitchen_stock_for_date(date, uuid, text) to authenticated;

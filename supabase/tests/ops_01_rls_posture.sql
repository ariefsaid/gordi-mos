-- ops, squashed baseline — the RLS posture of the whole schema, plus the privilege posture that
-- three tables depend on more than they depend on policy.
--
-- AC-005: RLS is enabled on every table in `ops`. Asserted as a CATCH-ALL over the catalog rather
-- than against a list of table names, so a table added by a later ticket without RLS fails THIS file
-- instead of quietly sitting outside its plan. FORCE is asserted the same way and for the same
-- reason: without it the table owner is exempt from its own policies, and the approval path runs as
-- the owner, so enabled-but-not-forced is a silent hole rather than a cosmetic omission.
--
-- The outbox landing zone is an `integrations` table authored in this pass (its trigger is AC-012's
-- refusal and a trigger needs its table), so its posture is asserted here with the rest of it rather
-- than being left to the integrations pass.
--
-- Three of the assertions below are about PRIVILEGE, not policy, and that is the point: for
-- kitchen_stock, kitchen_batch_seq and the outbox, the control is the absence of a grant. A missing
-- grant fails closed with nothing to widen, whereas a missing policy is one CREATE POLICY away from
-- being no control at all. Asserting the grant directly tests the thing that actually holds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- AC-005 — no table in `ops` may lack RLS. Zero, not "all the ones we remembered".
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::name[],
  'AC-005: every table in ops has row-level security ENABLED (empty = none missing)');

select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and c.relkind = 'r' and not c.relforcerowsecurity),
  '{}'::name[],
  'AC-005: every table in ops has row-level security FORCED — the owner is not exempt');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'integrations' and c.relname = 'esb_push'),
  'AC-005: integrations.esb_push — the outbox landing zone authored in this pass — has RLS enabled AND forced');

-- ── The org seam exists on every table before anything asks whether it holds ──────────────────
-- mos_02/ops_02 prove the seam is enforced. This proves there is a seam to enforce: a table without
-- org_id cannot be org-scoped by any policy, however well written.
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and c.relkind = 'r'
      and not exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0 and not a.attisdropped)),
  '{}'::name[],
  'org seam: every table in ops carries org_id');

-- ── No hard delete anywhere in ops (NFR-002/004, FR-095) ─────────────────────────────────────
-- Unlike `mos`, ops has NO exception. Removal on the Daily Log is an archive timestamp and on a
-- kitchen log is a status transition; a production fact is never destroyed, because the ERP holds a
-- document that corresponds to it.
select is(
  (select coalesce(array_agg(c.relname order by c.relname), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'DELETE')),
  '{}'::name[],
  'NFR-002: authenticated holds DELETE on NO ops table — there is no exception in this schema');

select ok(not has_table_privilege('authenticated','integrations.esb_push','DELETE'),
  'NFR-002: authenticated cannot delete an outbox row either — a posting record is evidence');

-- ── Privilege, where privilege is the control ────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated','ops.kitchen_stock','INSERT')
      and not has_table_privilege('authenticated','ops.kitchen_stock','UPDATE'),
  'kitchen_stock is read-only to the app tier by PRIVILEGE: stock is recomputed at approval, never written directly');

select ok(has_table_privilege('authenticated','ops.kitchen_stock','SELECT'),
  '...and it IS readable, so the assertion above is isolation and not an unreachable table');

select ok(not has_table_privilege('authenticated','ops.kitchen_batch_seq','SELECT')
      and not has_table_privilege('authenticated','ops.kitchen_batch_seq','INSERT')
      and not has_table_privilege('authenticated','ops.kitchen_batch_seq','UPDATE'),
  'kitchen_batch_seq is invisible to the app tier: no grant at all, so the counter cannot be read or minted from directly');

select ok(not has_table_privilege('authenticated','integrations.esb_push','INSERT')
      and not has_table_privilege('authenticated','integrations.esb_push','UPDATE'),
  'the app tier cannot write posting state: enqueue is the approval path''s and status flips are the worker''s');

-- ── The three literals are not stored anywhere in this schema (DD-WAY-13) ────────────────────
-- Asserted over the catalog rather than against one table name, because the failure this guards
-- against is somebody re-introducing the column somewhere else "for parity".
select is(
  (select coalesce(array_agg(c.relname || '.' || a.attname order by c.relname), '{}')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'ops' and c.relkind = 'r' and a.attname = 'action_type'),
  '{}'::text[],
  'DD-WAY-13: no table in ops stores an action_type column — the labels are derived, never persisted');

select * from finish();
rollback;

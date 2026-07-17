-- AC-401 (FR-401/NFR-401): the Signal substrate exists with RLS enabled+forced on every new business
-- table, the one-target mention CHECK holds, and the documented UNIQUE constraints exist.
-- Fixture tree documented in 20260716000006_mos_signal_test_seed.sql (+ 20260612000003 role tree).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select mos._test_seed_signal_tree();

-- A same-org Signal owned by OwnTeam (seeded as postgres → RLS bypassed) so the mention CHECK below has
-- a real parent to reference. Author ...0d1 authors it.
insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'substrate probe');

-- RLS enabled AND forced on every new business table (NFR-401).
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='signals'),
  'AC-401: mos.signals has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='signal_mentions'),
  'AC-401: mos.signal_mentions has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='signal_acknowledgements'),
  'AC-401: mos.signal_acknowledgements has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='signal_revisions'),
  'AC-401: mos.signal_revisions has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='signal_tasks'),
  'AC-401: mos.signal_tasks has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='shared' and c.relname='teams'),
  'AC-401: shared.teams has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='shared' and c.relname='sites'),
  'AC-401: shared.sites has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='shared' and c.relname='team_memberships'),
  'AC-401: shared.team_memberships has RLS enabled and forced');

-- One-target CHECK: a mention that names two targets is rejected (23514). Run as postgres so only the
-- table CHECK fires (RLS bypassed) — isolates the constraint under test.
select throws_ok($$
  insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id, target_team_id)
  values ('00000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001',
          'person','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01')
$$, '23514', null, 'AC-401: signal_mentions one-target CHECK rejects a two-target row');

-- Documented UNIQUE constraints (column-robust, not name-coupled).
select ok((select count(*) > 0 from pg_indexes
   where schemaname='mos' and tablename='signal_acknowledgements'
     and indexdef ilike '%unique%' and indexdef ilike '%(signal_id, person_id)%'),
  'AC-401: signal_acknowledgements has a UNIQUE(signal_id, person_id) index');
select ok((select count(*) > 0 from pg_indexes
   where schemaname='shared' and tablename='teams'
     and indexdef ilike '%unique%' and indexdef ilike '%(org_id, code)%'),
  'AC-401: shared.teams has a UNIQUE(org_id, code) index');

select * from finish();
rollback;

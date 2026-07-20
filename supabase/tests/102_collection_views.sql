-- V3 Issue 6 (DB half) — persisted typed Work collection views on mos.user_views (migration
-- 20260721000001). Proves NFR-V3-008 against the one local Supabase: the normalized metadata columns
-- + partial live indexes exist without rewriting legacy CompositionSpec rows; the kind/context/
-- lifecycle/spec checks reject invalid rows; owner isolation, managed-report shared visibility, and
-- cross-org denial hold on the existing fail-closed RLS; and a persisted collection row keeps its org,
-- owner, kind, and context pinned on UPDATE. Mirrors the TS contract in
-- mos-app/src/lib/record-collection/collection-view-spec.ts.
--
-- Uses the WU-A/WU-B role tree (mos._test_seed_role_tree): DirectMgr ...0d2 owns the views; Author
-- ...0d1 is DirectMgr's managed report; Lead2Holder ...0d7 is a peer who is NOT managed by DirectMgr;
-- ForeignMgr ...0b4 is cross-org. Business Units in the fixtures are illustrative only — no Task Team
-- field is introduced (that is Issue 8).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select mos._test_seed_role_tree();

-- ── NFR-V3-008: collection metadata columns and live indexes exist without rewriting legacy rows ──
select ok(
  (select count(*) = 3 from information_schema.columns
    where table_schema = 'mos' and table_name = 'user_views'
      and column_name in ('kind','context','lifecycle') and is_nullable = 'YES'),
  'NFR-V3-008: nullable kind/context/lifecycle metadata columns exist on mos.user_views');
select ok(
  (select true from pg_indexes
    where schemaname = 'mos' and indexname = 'mos_user_views_collection_live_idx'),
  'NFR-V3-008: partial live collection index (org_id/context) exists');
select ok(
  (select true from pg_indexes
    where schemaname = 'mos' and indexname = 'mos_user_views_collection_owner_idx'),
  'NFR-V3-008: partial owner collection index exists');

set local role authenticated;

-- ── NFR-V3-008: legacy CompositionSpec row remains readable with null collection metadata ─────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  insert into mos.user_views (name, spec, scope)
  values ('Legacy home view', '{"version":1,"panels":[]}'::jsonb, 'private')
$$, 'NFR-V3-008: a legacy CompositionSpec row inserts with the all-null metadata tuple');
select ok(
  (select kind is null and context is null and lifecycle is null
     from mos.user_views where name = 'Legacy home view'),
  'NFR-V3-008: the legacy row is readable and its collection metadata is null (not rewritten)');

-- ── NFR-V3-008: collection kind/context/lifecycle/spec checks reject invalid rows ─────────────────
-- A collection row must be Work-context.
select throws_ok($$
  insert into mos.user_views (name, spec, scope, kind, context, lifecycle)
  values ('bad-context',
    '{"kind":"collection","version":1,"collectionId":"tasks"}'::jsonb,
    'private','collection','home','active')
$$, '23514', null,
  'NFR-V3-008: a collection row with context<>work is rejected by the metadata check');
-- A collection spec must carry a known collectionId.
select throws_ok($$
  insert into mos.user_views (name, spec, scope, kind, context, lifecycle)
  values ('bad-collection',
    '{"kind":"collection","version":1,"collectionId":"bogus"}'::jsonb,
    'private','collection','work','active')
$$, '23514', null,
  'NFR-V3-008: a collection row with an unknown spec.collectionId is rejected');
-- A non-null kind requires the full metadata tuple.
select throws_ok($$
  insert into mos.user_views (name, spec, scope, kind, context, lifecycle)
  values ('partial-metadata',
    '{"kind":"collection","version":1,"collectionId":"tasks"}'::jsonb,
    'private','collection','work',null)
$$, '23514', null,
  'NFR-V3-008: a non-null kind with a null lifecycle is rejected');

-- ── NFR-V3-008: owner sees a private collection row; a same-org non-owner sees zero ───────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  insert into mos.user_views (name, spec, scope, kind, context, lifecycle)
  values ('D2 private task view',
    '{"kind":"collection","version":1,"collectionId":"tasks","domain":"tasks","presentation":"table","visibleFields":["title","status","pic","supervisor"],"query":{"view":"all"},"sort":{"field":"due","direction":"ascending"},"grouping":null,"layout":{"density":"compact"}}'::jsonb,
    'private','collection','work','active')
$$, 'NFR-V3-008: a valid private collection view inserts (org/owner stamped from JWT)');
select is(
  (select count(*)::int from mos.user_views where name = 'D2 private task view'),
  1, 'NFR-V3-008: the owner sees their own private collection view');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'D2 private task view'),
  0, 'NFR-V3-008: a same-org non-owner sees zero of a private collection view');

-- ── NFR-V3-008: shared collection view is visible to the managed report only ──────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  insert into mos.user_views (name, spec, scope, kind, context, lifecycle)
  values ('D2 shared signal view',
    '{"kind":"collection","version":1,"collectionId":"signals","domain":"signals","presentation":"feed","visibleFields":["message","author"],"query":{"view":"all"},"sort":{"field":"occurredAt","direction":"descending"},"grouping":null,"layout":{"density":"comfortable"}}'::jsonb,
    'shared_team','collection','work','active')
$$, 'NFR-V3-008: a shared_team collection view inserts');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'D2 shared signal view'),
  1, 'NFR-V3-008: D2''s managed report (Author) sees the shared collection view');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'D2 shared signal view'),
  0, 'NFR-V3-008: a peer not managed by D2 (Lead2Holder) sees zero');

-- ── NFR-V3-008: cross-org collection view is denied even when scope is shared_team ────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.user_views where name = 'D2 shared signal view'),
  0, 'NFR-V3-008: a cross-org person sees zero even of a shared_team collection view');

-- ── NFR-V3-008: collection update keeps org, owner, kind, and context pinned ──────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
-- context is immutable once set (BEFORE UPDATE pin trigger).
select throws_ok($$
  update mos.user_views set context = 'home' where name = 'D2 private task view'
$$, '42501', null,
  'NFR-V3-008: changing a persisted collection row''s context is rejected (context pinned)');
-- kind is immutable once set.
select throws_ok($$
  update mos.user_views set kind = 'composition' where name = 'D2 private task view'
$$, '42501', null,
  'NFR-V3-008: changing a persisted collection row''s kind is rejected (kind pinned)');
-- owner cannot be reassigned (existing RLS post-image pin).
select throws_ok($$
  update mos.user_views set owner_id = '00000000-0000-0000-0000-0000000000d1'
   where name = 'D2 private task view'
$$, '42501', null,
  'NFR-V3-008: reassigning owner_id on a collection row is rejected (owner pinned)');

reset role;

select * from finish();
rollback;

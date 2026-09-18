-- mos — ticket 867 migration invariants: the audience discriminator, its coupling to the owning
-- Team, its immutability, and the org-wide signal.tag authority rollout.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

-- ── audience CHECK: bad values are rejected ──────────────────────────────────────────────────
select throws_ok($$
  insert into mos.signals (org_id, author_id, audience, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'public', now(), 'Bad audience')
$$, '23514', null, 'a non-org/non-team audience value is rejected by the CHECK');

-- ── audience ↔ owning_team coupling (derive null-team validity from the explicit state) ───────
select throws_ok($$
  insert into mos.signals (org_id, author_id, audience, owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'org','00000000-0000-0000-0000-000000005b01', now(), 'Org row with a Team')
$$, '23514', null, 'an org-audience row cannot carry an owning Team (coupling CHECK)');
select throws_ok($$
  insert into mos.signals (org_id, author_id, audience, owning_team_id, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'team', null, now(), 'Team row without a Team')
$$, '23514', null, 'a team-audience row cannot omit its owning Team (coupling CHECK)');

-- ── owner/team columns: owning_team_id nullable for org rows; audience always present ────────
select is((select is_nullable from information_schema.columns
            where table_schema='mos' and table_name='signals' and column_name='owning_team_id'),
  'YES', 'owning_team_id is nullable so All Teams rows can omit it');
select is((select is_nullable from information_schema.columns
            where table_schema='mos' and table_name='signals' and column_name='audience'),
  'NO', 'audience is NOT NULL — a Signal always has an explicit audience discriminator');

-- ── signal.tag authority: org for ALL eight roles as durable configuration (AC-6) ────────────
select is((select count(*)::int
             from shared._role_authority_defaults()
            where action = 'signal.tag' and default_scope = 'org'),
  8, 'signal.tag defaults to org for all eight role categories');
select set_eq($$
  select role from shared._role_authority_defaults()
   where action = 'signal.tag' and default_scope = 'org'
$$, $$
  values ('member'),('team_lead'),('bu_head'),('ops_lead'),('admin'),
         ('finance'),('manager'),('supervisor')
$$, 'every defined category resolves org for signal.tag');
-- The defaults are durable configuration, so an ordinary org member resolves tag authority at the
-- runtime seam without any signal-specific access role.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select can_tag from mos.get_signal_post_authority()), true,
  'an ordinary org member resolves signal.tag at the composer authority seam');

-- ── audience is immutable after post, even for the author ────────────────────────────────────
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body)
values ('00000000-0000-0000-0000-000000007101','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1', 'org', now(), 'Immutable audience signal');
select throws_ok($$
  update mos.signals set audience = 'team'
  where id = '00000000-0000-0000-0000-000000007101'
$$, '42501', null, 'audience cannot be changed after post — it joins the immutable-after-post set');

select * from finish();
rollback;
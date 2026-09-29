-- #1010: the Signal retraction trigger authorizes through the tenant's CONFIGURED per-role scopes
-- (mos.can_retract_signal / shared.role_authority), not the separate capability table shared.can()
-- reads — and mos.work_lines.code is a stable, server-assigned state once a row exists.
--
-- mos.can_retract_signal itself (every role x scope combination, both audiences) is already
-- exhaustively covered by mos_18_authority_contract.sql and is unchanged by this migration. The
-- UPDATE policy's USING clause already calls that same predicate, so an unauthorized non-owner
-- (member/finance/manager/a lead outside their own team or unit) is filtered before the row is even
-- matched — a zero-row UPDATE, not a raised exception, both before and after this fix. Those cases
-- below assert zero rows changed, as a defense-in-depth confirmation, not as the regression proof.
--
-- The actual regression is a false DENIAL: a scope the RLS policy (correctly, via
-- mos.can_retract_signal) already admits was then rejected inside the trigger, which read the
-- separate, non-configurable shared.role_capabilities table instead. The admin-override case below
-- (grant "manager" an org retraction scope, then have a manager retract) proves it directly — RLS
-- admits the row, and only the trigger's authority check decides whether the UPDATE actually lives.
-- Restore-refused and reason-immutable are enforced once, by the untouched
-- mos._guard_signal_retraction_attribution trigger; the two assertions here are an integration
-- sanity check on the new code path, not a re-proof of that trigger's own suite.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

-- Designate d2 (DirectMgr) as the lead of OwnTeam (...5b01) AND, via a root-in-BU role, the head of
-- Unit-1 (...0a2) — the same combined persona mos_18_authority_contract.sql uses, so a successful
-- retraction on a Unit-1 row exercises whichever scope actually carries it without a second fixture.
reset role;
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id)
values ('00000000-0000-0000-0000-0000000000f7',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a2',
        'Unit-1 Head', null);
insert into shared.person_roles (org_id, person_id, role_id)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000f7');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000005b01', false);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_team_lead_assignment('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000d2');
set local request.jwt.claims = '{}';
reset role;

-- A third Team, on Unit-2 (...0a3, a different BU from OwnTeam/SiblingTeam's Unit-1), isolates the
-- own_bu reach: d2 heads Unit-1 only, so a row owned here must be denied by both scopes.
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b04',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3',
        'Unit-2 Team', 'unit2_team');

-- A fourth Team, "LedOnly", also in Unit-1 (...0a2) but led by d7 (Lead2Holder) instead of d2. d7's
-- own root-in-BU role is Lead 2, rooted in Unit-2 (...0a3) — shared.is_business_unit_head(a2, d7) is
-- false — so d7 carries own_team for LedOnly and NO own_bu anywhere in Unit-1. d2 is deliberately
-- both team lead and BU head at once (mirrors mos_18's fixture); d7 isolates the team_lead branch
-- with no BU-head grant standing behind it.
reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b05',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a2',
        'LedOnly Team', 'led_only_team');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d7',
        '00000000-0000-0000-0000-000000005b05', false);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_team_lead_assignment('00000000-0000-0000-0000-000000005b05','00000000-0000-0000-0000-0000000000d7');
set local request.jwt.claims = '{}';
reset role;

create temp table t1010 (
  target_signal      uuid,
  self_signal        uuid,
  ops_lead_signal    uuid,
  admin_signal       uuid,
  live_signal        uuid,
  tab_reason_signal  uuid,
  newline_reason_signal uuid,
  v_reason_signal    uuid,
  team_own           uuid,
  team_same_bu       uuid,
  team_other_bu      uuid,
  team_led_only_own    uuid,
  team_led_only_denied uuid
) on commit drop;
insert into t1010 default values;
grant select, update on t1010 to authenticated;

-- ── All Teams (org) rows: the regression + the admin-override integration ───────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update t1010 set target_signal = mos.create_signal_with_mentions(
  'Authority target', now(), '[]'::jsonb);
update t1010 set self_signal = mos.create_signal_with_mentions(
  'Self retraction target', now(), '[]'::jsonb);
update t1010 set ops_lead_signal = mos.create_signal_with_mentions(
  'Ops lead target', now(), '[]'::jsonb);
update t1010 set admin_signal = mos.create_signal_with_mentions(
  'Admin target', now(), '[]'::jsonb);
update t1010 set live_signal = mos.create_signal_with_mentions(
  'Reason-required target', now(), '[]'::jsonb);
update t1010 set tab_reason_signal = mos.create_signal_with_mentions(
  'Tab-reason target', now(), '[]'::jsonb);
update t1010 set newline_reason_signal = mos.create_signal_with_mentions(
  'Newline-reason target', now(), '[]'::jsonb);
update t1010 set v_reason_signal = mos.create_signal_with_mentions(
  'V-reason target', now(), '[]'::jsonb);

-- A same-org member with no special access role cannot retract another author's Signal: RLS admits
-- zero rows, so the UPDATE lives but changes nothing.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update mos.signals set retracted_at = now(), retract_reason = 'Peer attempt'
 where id = (select target_signal from t1010);
select is((select retracted_at from mos.signals where id = (select target_signal from t1010)),
  null::timestamptz,
  'a same-org member cannot retract another author''s Signal (RLS admits zero rows)');

-- finance is configured 'none' in shared.role_authority (role_capabilities separately still grants
-- it, but the UPDATE policy's USING clause already gates on mos.can_retract_signal, so that table
-- never even gets consulted for this attempt).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["finance"]}';
update mos.signals set retracted_at = now(), retract_reason = 'Finance attempt'
 where id = (select target_signal from t1010);
select is((select retracted_at from mos.signals where id = (select target_signal from t1010)),
  null::timestamptz,
  'finance cannot retract another author''s Signal under the default configuration');

-- manager is also configured 'none' by default.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["manager"]}';
update mos.signals set retracted_at = now(), retract_reason = 'Manager attempt'
 where id = (select target_signal from t1010);
select is((select retracted_at from mos.signals where id = (select target_signal from t1010)),
  null::timestamptz,
  'manager cannot retract another author''s Signal under the default configuration');

-- An admin override changes the outcome: the tenant grants manager an org-wide retraction scope.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"signal.retract","role":"manager","scope":"org"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["manager"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = '  Duplicate report, superseded  '
   where id = (select target_signal from t1010)
$$, 'the admin-saved manager org override changes the retraction outcome for the same manager and Signal');
select is((select retracted_at is not null from mos.signals
            where id = (select target_signal from t1010)), true,
  'the override-authorized retraction actually tombstones the row');
select is((select retract_reason from mos.signals
            where id = (select target_signal from t1010)), 'Duplicate report, superseded',
  'the stored reason is trimmed of surrounding whitespace');
reset role;
select is((select count(*)::int from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d1'
              and metadata->>'source' = 'signal_retraction'
              and metadata->'entity'->>'id' = (select target_signal::text from t1010)), 1,
  'the author is notified when someone else retracts their Signal');
select is((select metadata->'actor'->>'id' from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d1'
              and metadata->>'source' = 'signal_retraction'
              and metadata->'entity'->>'id' = (select target_signal::text from t1010)),
  '00000000-0000-0000-0000-0000000000d6',
  'the notification names the actual retracting actor');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"signal.retract","role":"manager","scope":"none"}]'::jsonb);

-- ops_lead and admin retain their configured org scope through the actual UPDATE path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Ops lead retraction'
   where id = (select ops_lead_signal from t1010)
$$, 'an ops lead can retract another author''s org Signal through the actual UPDATE path');
select is((select retracted_at is not null from mos.signals
            where id = (select ops_lead_signal from t1010)), true,
  'the ops lead retraction actually tombstoned the row, not a zero-row RLS pass-through');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Admin retraction'
   where id = (select admin_signal from t1010)
$$, 'an admin can retract another author''s org Signal through the actual UPDATE path');
select is((select retracted_at is not null from mos.signals
            where id = (select admin_signal from t1010)), true,
  'the admin retraction actually tombstoned the row, not a zero-row RLS pass-through');

-- Self-retraction: author-own succeeds and draws no notification (the actor already knows).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Withdrawn by author'
   where id = (select self_signal from t1010)
$$, 'the author retracts their own Signal without any special access role');
select is((select retracted_at is not null from mos.signals
            where id = (select self_signal from t1010)), true,
  'the self-retraction actually tombstoned the row, not a zero-row RLS pass-through');
reset role;
select is((select count(*)::int from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d1'
              and metadata->>'source' = 'signal_retraction'
              and metadata->'entity'->>'id' = (select self_signal::text from t1010)), 0,
  'a self-retraction draws no notification');
set local role authenticated;

-- Reason required, and required after trimming (whitespace-only is empty).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = null
   where id = (select live_signal from t1010)
$$, '23514', null, 'retraction requires a reason');
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = '   '
   where id = (select live_signal from t1010)
$$, '23514', null, 'a whitespace-only reason does not satisfy the reason requirement');
-- btrim(text) with no character-set argument strips spaces only, so a tab- or newline-only reason
-- must be checked with the same character class the storage trim uses, not the space-only default.
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = E'\t\t'
   where id = (select tab_reason_signal from t1010)
$$, '23514', null, 'a tab-only reason does not satisfy the reason requirement');
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = E'\n\n'
   where id = (select newline_reason_signal from t1010)
$$, '23514', null, 'a newline-only reason does not satisfy the reason requirement');
-- E'' string literals do not recognise \v as an escape — it becomes the literal letter v — so a
-- character-set argument spelled with \v would strip that LETTER off a reason's ends. Neither
-- boundary here is whitespace, so the stored value must come back byte-identical.
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'v Correction of a vendor note v'
   where id = (select v_reason_signal from t1010)
$$, 'a reason starting and ending with the letter v retracts successfully');
select is((select retract_reason from mos.signals where id = (select v_reason_signal from t1010)),
  'v Correction of a vendor note v',
  'a reason starting and ending with the letter v is stored byte-identical, not stripped as whitespace');

-- Restore-refused and reason-immutable are the unchanged mos._guard_signal_retraction_attribution
-- trigger (20260909000008), which runs before this guard — confirmed here only as an integration
-- check on a row retracted through the new authority path, not a re-proof of that trigger's suite.
select throws_ok($$
  update mos.signals set retracted_at = null
   where id = (select target_signal from t1010)
$$, '42501', null, 'a retracted Signal cannot be restored');
select throws_ok($$
  update mos.signals set retract_reason = 'Rewritten after the fact'
   where id = (select target_signal from t1010)
$$, '42501', null, 'a stored retraction reason cannot be rewritten after the first retraction');

-- ── Historical team-audience rows: own_team vs own_bu precision through the actual UPDATE path ──
reset role;
update t1010 set team_own = '00000000-0000-0000-0000-000000009101'::uuid;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009101','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','team','00000000-0000-0000-0000-000000005b01',
        now(), 'OwnTeam historical signal');
update t1010 set team_same_bu = '00000000-0000-0000-0000-000000009102'::uuid;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009102','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d4','team','00000000-0000-0000-0000-000000005b02',
        now(), 'SiblingTeam historical signal');
update t1010 set team_other_bu = '00000000-0000-0000-0000-000000009103'::uuid;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009103','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d4','team','00000000-0000-0000-0000-000000005b04',
        now(), 'Unit-2 historical signal');
update t1010 set team_led_only_own = '00000000-0000-0000-0000-000000009105'::uuid;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009105','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d4','team','00000000-0000-0000-0000-000000005b05',
        now(), 'LedOnly historical signal');
update t1010 set team_led_only_denied = '00000000-0000-0000-0000-000000009106'::uuid;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009106','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d4','team','00000000-0000-0000-0000-000000005b02',
        now(), 'SiblingTeam historical signal (second row, for the team-lead-only denial)');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Team lead retraction'
   where id = (select team_own from t1010)
$$, 'the designated Team lead retracts a historical row owned by their own Team');
select is((select retracted_at is not null from mos.signals
            where id = (select team_own from t1010)), true,
  'the Team-lead retraction actually tombstoned the row, not a zero-row RLS pass-through');
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'BU head retraction'
   where id = (select team_same_bu from t1010)
$$, 'the BU head retracts a historical row owned by a DIFFERENT Team in the same headed unit');
select is((select retracted_at is not null from mos.signals
            where id = (select team_same_bu from t1010)), true,
  'the BU-head retraction actually tombstoned the row, not a zero-row RLS pass-through');
update mos.signals set retracted_at = now(), retract_reason = 'Cross-BU attempt'
 where id = (select team_other_bu from t1010);
select is((select retracted_at from mos.signals where id = (select team_other_bu from t1010)),
  null::timestamptz,
  'neither the own-Team nor the own-BU scope reaches a historical row owned by a different unit');

-- d7 is team lead of LedOnly ONLY — not a BU head anywhere in Unit-1 — so these two isolate the
-- own_team branch on its own, unlike the d2 case above where own_team and own_bu both hold.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Team-lead-only retraction'
   where id = (select team_led_only_own from t1010)
$$, 'a team lead with no BU-head grant retracts a historical row owned by their own Team (own_team alone)');
select is((select retracted_at is not null from mos.signals
            where id = (select team_led_only_own from t1010)), true,
  'the team-lead-only retraction actually tombstoned the row, not a zero-row RLS pass-through');
update mos.signals set retracted_at = now(), retract_reason = 'Team-lead-only cross-team attempt'
 where id = (select team_led_only_denied from t1010);
select is((select retracted_at from mos.signals where id = (select team_led_only_denied from t1010)),
  null::timestamptz,
  'the same team lead, with no BU-head grant, cannot retract a historical row owned by a different Team in the same BU');

-- ── mos.work_lines.code: stable, server-assigned state (#1010) ───────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select code from mos.work_lines
            where id = '00000000-0000-0000-0000-00000000c001'), 'standard',
  'the seeded Café Opening process definition-work row created without a code defaults to standard');
select lives_ok($$
  insert into mos.work_lines (name, type, business_unit_id)
  values ('Ordinary project', 'project', '00000000-0000-0000-0000-0000000000a2')
$$, 'a client insert with no code specified succeeds and takes the default');
select is((select code from mos.work_lines where name = 'Ordinary project'), 'standard',
  'the default-code insert actually stored standard');
select throws_ok($$
  insert into mos.work_lines (name, type, business_unit_id, code)
  values ('Forged cafe opening', 'project', '00000000-0000-0000-0000-0000000000a2', 'cafe_opening')
$$, '42501', null, 'a client insert may not claim a non-default code');
select throws_ok($$
  update mos.work_lines set code = 'cafe_opening'
   where id = '00000000-0000-0000-0000-00000000c001'
$$, '42501', null, 'an admin cannot change code on an existing Project/Process definition-work row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select throws_ok($$
  update mos.work_lines set code = 'cafe_opening'
   where id = '00000000-0000-0000-0000-00000000c001'
$$, '42501', null, 'an ops lead cannot change code on an existing Project/Process definition-work row either');

select * from finish();
rollback;

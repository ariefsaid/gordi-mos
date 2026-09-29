-- #1010: the Signal retraction trigger authorizes through the tenant's CONFIGURED per-role scopes
-- (mos.can_retract_signal / shared.role_authority), not the separate capability table shared.can()
-- reads — and mos.work_lines.code is a stable, server-assigned state once a row exists.
--
-- mos.can_retract_signal itself (every role x scope combination, both audiences) is covered by
-- mos_18_authority_contract.sql. The UPDATE policy's USING clause calls the same predicate, so an
-- unauthorized non-owner is filtered before the row matches (a zero-row UPDATE); those cases assert
-- zero rows changed. The trigger's own authority check is what decides the cases RLS admits: an
-- admin override (a manager granted an org retraction scope) and an author whose own scope is set to
-- none. Reason rules (only written by the retracting UPDATE, blank incl. Unicode spaces refused, never
-- rewritten afterwards) are enforced once, in mos._guard_signal_retraction_attribution.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

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
  revoked_self_signal   uuid,
  preset_author_signal  uuid,
  preset_ops_signal     uuid,
  unicode_signal        uuid,
  padded_signal         uuid,
  inner_signal          uuid,
  team_own           uuid,
  team_same_bu       uuid,
  team_other_bu      uuid,
  team_led_only_own    uuid,
  team_led_only_denied uuid
) on commit drop;
insert into t1010 default values;
grant select, update on t1010 to authenticated;

-- ── All Teams (org) rows: configured scopes + the admin-override integration ───────────────────────
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
update t1010 set revoked_self_signal = mos.create_signal_with_mentions(
  'Revoked self-scope target', now(), '[]'::jsonb);
update t1010 set preset_author_signal = mos.create_signal_with_mentions(
  'Author pre-set reason target', now(), '[]'::jsonb);
update t1010 set preset_ops_signal = mos.create_signal_with_mentions(
  'Ops lead pre-set reason target', now(), '[]'::jsonb);
update t1010 set unicode_signal = mos.create_signal_with_mentions(
  'Unicode-blank reason target', now(), '[]'::jsonb);
update t1010 set padded_signal = mos.create_signal_with_mentions(
  'Unicode-padded reason target', now(), '[]'::jsonb);
update t1010 set inner_signal = mos.create_signal_with_mentions(
  'Inner-spaces reason target', now(), '[]'::jsonb);

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
-- A reason whose ends are the ordinary letter v (not whitespace) must come back byte-identical:
-- the trim removes whitespace only, never letters.
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'v Correction of a vendor note v'
   where id = (select v_reason_signal from t1010)
$$, 'a reason starting and ending with the letter v retracts successfully');
select is((select retract_reason from mos.signals where id = (select v_reason_signal from t1010)),
  'v Correction of a vendor note v',
  'a reason starting and ending with the letter v is stored byte-identical, not stripped as whitespace');

-- Unicode space characters are blank too: NBSP, zero-width space, ideographic space, line/paragraph
-- separators and vertical tab alone never satisfy the reason requirement; the same normalisation
-- is what gets stored.
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = E'  '
   where id = (select unicode_signal from t1010)
$$, '23514', null, 'an NBSP-only reason does not satisfy the reason requirement');
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = E'​​'
   where id = (select unicode_signal from t1010)
$$, '23514', null, 'a zero-width-space-only reason does not satisfy the reason requirement');
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = E'　　'
   where id = (select unicode_signal from t1010)
$$, '23514', null, 'an ideographic-space-only reason does not satisfy the reason requirement');
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = E'  '
   where id = (select unicode_signal from t1010)
$$, '23514', null, 'a line/paragraph-separator-only reason does not satisfy the reason requirement');
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = chr(11) || chr(11)
   where id = (select unicode_signal from t1010)
$$, '23514', null, 'a vertical-tab-only reason does not satisfy the reason requirement');
select throws_ok($$
  update mos.signals set retracted_at = now(),
         retract_reason = ' ' || E' ​　\t' || chr(11)
   where id = (select unicode_signal from t1010)
$$, '23514', null, 'a reason mixing ASCII and Unicode space characters only is refused');
select lives_ok($$
  update mos.signals set retracted_at = now(),
         retract_reason = E' 　 Padded reason ​ '
   where id = (select padded_signal from t1010)
$$, 'a reason padded with Unicode spaces retracts successfully');
select is((select retract_reason from mos.signals where id = (select padded_signal from t1010)),
  'Padded reason',
  'the stored reason is trimmed of the Unicode padding');
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Reason with  inner   spaces'
   where id = (select inner_signal from t1010)
$$, 'a reason with inner spaces retracts successfully');
select is((select retract_reason from mos.signals where id = (select inner_signal from t1010)),
  'Reason with  inner   spaces',
  'inner spaces are stored unchanged');

-- The retraction authority is decided by the configured scope: once an admin sets the member
-- scope to none, even the author can no longer retract their own Signal (RLS still admits the
-- author's row; only the trigger's authority check refuses).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"signal.retract","role":"member","scope":"none"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Author after scope revoked'
   where id = (select revoked_self_signal from t1010)
$$, '42501', null, 'an author whose retraction scope is configured to none cannot retract their own Signal');
select is((select retracted_at from mos.signals where id = (select revoked_self_signal from t1010)),
  null::timestamptz,
  'the author''s Signal stays live when their retraction scope is none');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"signal.retract","role":"member","scope":"own"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Author after scope restored'
   where id = (select revoked_self_signal from t1010)
$$, 'the same author retracts once the member own scope is restored');
select is((select retracted_at is not null from mos.signals
            where id = (select revoked_self_signal from t1010)), true,
  'the restored-scope retraction actually tombstoned the row');

-- retract_reason is writable only in the UPDATE that sets retracted_at.
select throws_ok($$
  update mos.signals set retract_reason = 'Pre-set by the author'
   where id = (select preset_author_signal from t1010)
$$, '42501', null, 'an author cannot pre-set a retraction reason on a live Signal');
select is((select retract_reason from mos.signals where id = (select preset_author_signal from t1010)),
  null::text, 'the refused author pre-set left the reason empty');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select throws_ok($$
  update mos.signals set retract_reason = 'Pre-set by an ops lead'
   where id = (select preset_ops_signal from t1010)
$$, '42501', null, 'an ops lead cannot pre-set a retraction reason on another author''s live Signal');
select is((select retract_reason from mos.signals where id = (select preset_ops_signal from t1010)),
  null::text, 'the refused ops lead pre-set left the reason empty');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.signals set retracted_at = now()
   where id = (select preset_author_signal from t1010)
$$, '23514', null, 'a retraction that omits its reason after a refused pre-set is refused');
select is((select retracted_at from mos.signals where id = (select preset_author_signal from t1010)),
  null::timestamptz, 'the reasonless retraction left the Signal live');

-- A Signal is always created live: a client INSERT cannot carry a tombstone or a reason.
select lives_ok($$
  insert into mos.signals (org_id, author_id, source, audience, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'human','org', now(), 'Live insert control')
$$, 'a client inserts a live All Teams Signal');
select throws_ok($$
  insert into mos.signals (org_id, author_id, source, audience, occurred_at, body, retracted_at)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'human','org', now(), 'Born retracted', now())
$$, '42501', null, 'a client cannot insert a Signal that is already retracted');
select throws_ok($$
  insert into mos.signals (org_id, author_id, source, audience, occurred_at, body, retract_reason)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1',
          'human','org', now(), 'Born with a reason', 'Pre-set reason')
$$, '42501', null, 'a client cannot insert a Signal that already carries a retraction reason');

-- Restore-refused and reason-immutable are enforced by mos._guard_signal_retraction_attribution,
-- which runs before this guard — confirmed here only as an integration
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

-- The server/migration path may still assign a non-default code; a client can then never move it.
reset role;
select lives_ok($$
  update mos.work_lines set code = 'cafe_opening'
   where id = '00000000-0000-0000-0000-00000000c001'
$$, 'the server path (postgres) can assign code on an existing row');
select is((select code from mos.work_lines where id = '00000000-0000-0000-0000-00000000c001'),
  'cafe_opening', 'the server-path code assignment is stored');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  update mos.work_lines set code = 'standard'
   where id = '00000000-0000-0000-0000-00000000c001'
$$, '42501', null, 'a client cannot downgrade a cafe_opening row to standard');
select is((select code from mos.work_lines where id = '00000000-0000-0000-0000-00000000c001'),
  'cafe_opening', 'the refused downgrade left code as cafe_opening');

select * from finish();
rollback;

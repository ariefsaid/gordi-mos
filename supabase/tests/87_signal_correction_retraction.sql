-- AC-411/412 (FR-410/411, D31): corrections append an immutable revision + set edited_at while the
-- author/owning_team/source stay immutable; retraction is author-or-signal.retract only, requires a
-- reason, and leaves a readable tombstone (never a hard delete).
-- Fixture: 20260716000006_mos_signal_test_seed.sql. Signal authored by Author ...0d1, owned by OwnTeam.
--
-- NOTE (recorded deviation from the plan's literal "throws_ok" for the Peer-retract step): a non-author
-- who lacks signal.retract holds the table UPDATE grant but is filtered out by the signals UPDATE policy
-- USING clause, so the statement is a silent 0-row no-op — it does NOT raise (matching the house pattern
-- documented in 26_ops_log_no_delete: "a peer, hidden by USING, would silently no-op"). Denial is
-- therefore asserted by OUTCOME (the row stays un-retracted), which is the true goal of AC-412. The 42501
-- retract-gate raise IS still exercised — by the guard trigger — for a caller who passes USING.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select mos._test_seed_signal_tree();

insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body) values
  ('d0000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01', now(), 'observation v1');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- AC-411: author corrects the body.
select lives_ok($$
  update mos.signals set body = 'observation v2 (corrected)' where id='d0000000-0000-0000-0000-000000000040'
$$, 'AC-411: author correction of body succeeds');
select is((select count(*)::int from mos.signal_revisions
             where signal_id='d0000000-0000-0000-0000-000000000040' and field='body'),
  1, 'AC-411: a body revision row is appended');
select is((select edited_at is not null from mos.signals where id='d0000000-0000-0000-0000-000000000040'),
  true, 'AC-411: edited_at is set on correction');

-- AC-411: immutable columns cannot change (guard raises 42501).
select throws_ok($$
  update mos.signals set owning_team_id='00000000-0000-0000-0000-000000005b02' where id='d0000000-0000-0000-0000-000000000040'
$$, '42501', null, 'AC-411: owning_team_id is immutable');
select throws_ok($$
  update mos.signals set author_id='00000000-0000-0000-0000-0000000000d4' where id='d0000000-0000-0000-0000-000000000040'
$$, '42501', null, 'AC-411: author_id is immutable');

-- AC-412 (non-author denied — silent no-op; see NOTE): Peer attempts to retract.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update mos.signals set retracted_at = now(), retract_reason = 'sneak' where id='d0000000-0000-0000-0000-000000000040';
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select retracted_at is null from mos.signals where id='d0000000-0000-0000-0000-000000000040'),
  true, 'AC-412: a non-author without signal.retract cannot retract (row unchanged)');

-- AC-412 (reason required): the author retracting without a reason is rejected (23514).
select throws_ok($$
  update mos.signals set retracted_at = now() where id='d0000000-0000-0000-0000-000000000040'
$$, '23514', null, 'AC-412: retraction without a reason is rejected');

-- AC-412 (author retracts with a reason): succeeds and persists as a readable tombstone.
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'duplicate of an earlier Signal'
    where id='d0000000-0000-0000-0000-000000000040'
$$, 'AC-412: author retraction with a reason succeeds');
select is((select count(*)::int from mos.signals
             where id='d0000000-0000-0000-0000-000000000040' and retracted_at is not null),
  1, 'AC-412: the retracted Signal persists as a tombstone still readable to the author');

reset role;
select * from finish();
rollback;

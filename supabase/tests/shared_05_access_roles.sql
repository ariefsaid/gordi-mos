-- shared, squashed baseline — the access-role substrate: vocabulary, helpers, the auth hook, the
-- grant guard, provenance, soft revoke, capabilities, and the no-lockout floor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

select shared._test_seed_directory();
select shared._test_seed_access_roles();
-- GrandMgr ...0d03 -> admin ; Author ...0d01 -> member + finance live, ops_lead revoked,
-- and linked to auth user ...aa01 so the hook resolves them.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Vocabulary — six values, and only six
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Run as the migration owner so RLS does not preempt the CHECK error contract.
select lives_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','manager')
$$, 'manager is a valid access role — the company-wide financial view tier');
select lives_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','supervisor')
$$, 'supervisor is a valid access role — revenue only, within a granted scope');
select throws_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','superuser')
$$, '23514', null, 'a value outside the vocabulary is rejected by the CHECK — the set grows only by migration');

-- The DERIVED reporting-line manager is never a stored row. The two senses of "manager" are
-- different things and conflating them is the trap this asserts against.
select is(
  (select count(*)::int from shared.person_access_roles
    where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'manager'),
  0, 'the reporting-line manager is derived from the role chain, never stored as an access role');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Read helpers — claim-sourced and fail-closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["ops_lead","member"]}';
select set_eq($$ select unnest(shared.current_access_roles()) $$, array['ops_lead','member'],
  'current_access_roles returns the claim set');
select ok(shared.has_access_role('ops_lead'), 'has_access_role reads the claim');
select ok(not shared.has_access_role('admin'), 'has_access_role is false for a role not held');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select is(array_length(shared.current_access_roles(), 1), null,
  'an ABSENT access_roles claim yields the empty array, not NULL and not an error');
select ok(not shared.has_access_role('member'),
  'absent claim -> every has_access_role is false (fail closed)');

set local request.jwt.claims = 'not json at all';
select ok(not shared.has_access_role('admin'),
  'malformed claims -> false rather than a raise (fail closed)');

-- ── Capabilities ─────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["admin"]}';
select ok(shared.can('objective.manage'), 'can(objective.manage) is true for admin');
select ok(shared.can('workline.manage'),  'can(workline.manage) is true for admin');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["ops_lead"]}';
-- Inverted by #182, and worth naming rather than editing quietly: this line encoded the SAME
-- superseded admin-only contract the pgTAP triage found in the four cascade files, and it was green
-- here only because the authorising grant had not landed yet. `OD-V4-1` (owner, 2026-07-27) makes
-- Objectives writeable at LEAD level; the `mos` baseline registers ops_lead -> objective.manage, and
-- this assertion follows the ruling with it. The triage's disposition list was drawn from the four
-- files that were RED at the time, so it could not have named this one — same class, ninth instance.
select ok(shared.can('objective.manage'),
  'can(objective.manage) is TRUE for ops_lead — OD-V4-1 supersedes the admin-only catalog, and the grant is registered by the mos baseline');
select ok(shared.can('workline.manage'),      'can(workline.manage) is true for ops_lead');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["member"]}';
select ok(not shared.can('workline.manage'),   'can(workline.manage) is false for member');
select ok(not shared.can('objective.manage'),  'can(objective.manage) is false for member — the ruling moved the write to lead level, not to everyone');

set local request.jwt.claims = '{}';
select ok(not shared.can('objective.manage'),
  'no access_roles claim -> can() is false for everything (fail closed)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The auth hook — the single claim-injection point
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
reset role;

select set_eq($$
  select jsonb_array_elements_text(
    shared.custom_access_token_hook(
      jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
    ) -> 'claims' -> 'access_roles')
$$, array['finance','member'], 'the hook stamps exactly the NON-REVOKED assigned set');

select ok(not (
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles' ? 'ops_lead'),
  'a revoked grant is excluded from the claim — soft revoke actually revokes');

-- An orphan gets an EMPTY ARRAY, not an absent key: absent would make has_access_role() undefined
-- rather than false, which is the difference between fail-closed and fail-open.
select is(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000ff','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles',
  '[]'::jsonb, 'an orphan auth user gets access_roles [] — present and empty, never absent');

select ok(not (
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles' ? 'manager'),
  'the derived reporting-line manager is never stamped into the claim');

-- ── The hook's output is a function of the LOOKUP, not of what arrived on the event ──────────
-- `event -> 'claims'` is an input, and the hook copies it forward. So every claim the hook owns is
-- STATED on every branch, including the one where no live person resolves — org_id and person_id as
-- much as access_roles, since shared.current_org_id() reads exactly that org_id key.
--
-- The event below is built the way it has to be for these to prove anything: it carries a plausible
-- org and person for a user_id that resolves to nobody. Against an empty event they would pass
-- trivially; what they measure is that the minted claims still describe the lookup WITH an input
-- present under the same keys.
select is(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000ff',
      'claims', jsonb_build_object(
        'org_id',    '00000000-0000-0000-0000-0000000000a1',
        'person_id', '00000000-0000-0000-0000-0000000000d1'))
  ) -> 'claims' -> 'org_id',
  'null'::jsonb,
  'an org_id arriving on the event does NOT survive a lookup that found no live person — the hook states the org it resolved');

select is(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000ff',
      'claims', jsonb_build_object(
        'org_id',    '00000000-0000-0000-0000-0000000000a1',
        'person_id', '00000000-0000-0000-0000-0000000000d1'))
  ) -> 'claims' -> 'person_id',
  'null'::jsonb,
  '...and neither does person_id — identity and tenant are cleared together, so no combination of them can be inherited');

-- An ARCHIVED person, not merely an unlinked auth user: the hook's lookup filters archived_at, so
-- this is the case that arises in practice — the account still exists, the person no longer does.
select lives_ok($$
  update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d1'
$$, 'the hook''s subject can be archived — the directory keeps the row, which is why the hook has to filter it');

select is(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object(
        'org_id',    '00000000-0000-0000-0000-0000000000a1',
        'person_id', '00000000-0000-0000-0000-0000000000d1'))
  ) -> 'claims',
  jsonb_build_object('org_id', null, 'person_id', null, 'access_roles', '[]'::jsonb),
  'an ARCHIVED person''s auth user mints null org, null person and no roles — all three, as one statement');

select lives_ok($$
  update shared.people set archived_at = null where id = '00000000-0000-0000-0000-0000000000d1'
$$, 'restored, so the assertions below still describe a live subject');

-- The control: with the person live again, the SAME event shape mints a real org and person. Without
-- this the four above would also pass under a hook that had simply been broken to clear everything.
select is(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
  ) -> 'claims' -> 'org_id',
  to_jsonb('00000000-0000-0000-0000-0000000000a1'::text),
  'a LIVE person still gets a real org_id — the clearing branch is the exception, not the behaviour');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The grant guard
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- Self-escalation is refused for every privileged tier, on a live (non-revoked) grant.
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','finance')
$$, '42501', null, 'an admin cannot grant themselves finance');
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','supervisor')
$$, '42501', null, 'an admin cannot grant themselves supervisor');

-- ...but granting the same role to SOMEONE ELSE is the feature, not the hole.
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d5','finance')
$$, 'an admin may grant finance to another person');

-- ...and "someone else" stops at the tenant boundary. person_id is an existence-only FK, and an FK
-- lookup bypasses RLS, so the column alone accepts any person that exists anywhere; the row's own
-- org_id is pinned by the policy, which says nothing about whose id sits in the person column. This
-- is app privilege rather than a job title, so it is the more consequential of the pair — the
-- sibling Jabatan guard has carried the same check since the round-2 audit.
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000b4','member')
$$, '42501', null,
  'an access role cannot be granted to a person in ANOTHER org — the grant''s own org_id being right does not make its subject right');

-- Run as the migration owner too, so the refusal is proven to be the guard rather than the policy:
-- this connection bypasses RLS entirely, and the write is still refused.
reset role;
select throws_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b4','member')
$$, '42501', null,
  '...and the refusal survives an RLS-bypassing connection, so it is the guard refusing and not a policy');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- Provenance cannot be forged: the guard OVERWRITES a client-supplied granted_by.
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role, granted_by)
  values ('00000000-0000-0000-0000-0000000000d5','ops_lead','00000000-0000-0000-0000-0000000000d4')
$$, 'a grant carrying a bogus granted_by is accepted...');
select is(
  (select granted_by from shared.person_access_roles
    where person_id = '00000000-0000-0000-0000-0000000000d5' and access_role = 'ops_lead'),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  '...but granted_by is forced to the ACTING person, not the value the client sent');

-- Immutability: an existing grant cannot be re-targeted at a different person or role.
select throws_ok($$
  update shared.person_access_roles set person_id = '00000000-0000-0000-0000-0000000000d2'
   where person_id = '00000000-0000-0000-0000-0000000000d1' and access_role = 'member'
$$, '42501', null, 'person_id is immutable on a grant — a grant cannot be re-pointed to escalate someone else');
select throws_ok($$
  update shared.person_access_roles set access_role = 'admin'
   where person_id = '00000000-0000-0000-0000-0000000000d1' and access_role = 'member'
$$, '42501', null, 'access_role is immutable on a grant');

-- Soft revoke is the removal mechanism, and it is reversible.
select lives_ok($$
  update shared.person_access_roles set revoked_at = now()
   where person_id = '00000000-0000-0000-0000-0000000000d1' and access_role = 'member'
$$, 'revoking is an UPDATE that sets revoked_at');
select is(
  (select count(*)::int from shared.person_access_roles
    where person_id = '00000000-0000-0000-0000-0000000000d1' and access_role = 'member' and revoked_at is null),
  0, 'a revoked grant drops out of the live set while the row survives for the audit trail');
select ok(not has_table_privilege('authenticated','shared.person_access_roles','DELETE'),
  'there is no DELETE privilege at all — removal is a soft revoke, never a vanished row');

-- ── No-lockout: the last active admin cannot be stripped ─────────────────────────────────────
-- GrandMgr (...0d03) is org A's only admin, but has no auth.users row, so _count_active_admins()
-- counts zero and the floor is already breached. Link them first, or the assertion below would pass
-- for the wrong reason.
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa03') on conflict (id) do nothing;
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa03'
 where id = '00000000-0000-0000-0000-0000000000d3';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(shared._count_active_admins(), 1,
  'precondition: org A has exactly ONE active admin, so the next revoke is the lockout case');
select throws_ok($$
  update shared.person_access_roles set revoked_at = now()
   where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin'
$$, '42501', null, 'revoking admin from the LAST active admin is refused — there is no in-app recovery from that');

reset role;
select * from finish();
rollback;

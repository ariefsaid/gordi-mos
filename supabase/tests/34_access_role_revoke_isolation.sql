begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixture: GrandMgr (...0d03) -> admin; Author (...0d01) -> member/finance live + ops_lead revoked.
select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

set local role authenticated;
-- Admin session: GrandMgr (...0d03).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-005 (FR-005): granting (P, 'member') twice -> the second hits unique (person_id, access_role)
-- (23505). Re-granting is the revoked_at-clearing UPDATE, not a duplicate INSERT. Target: DirectMgr.
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d2','member')
$$, 'AC-005: first grant of (P, member) succeeds');
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d2','member')
$$, '23505', null, 'AC-005: duplicate (P, member) grant rejected by unique constraint');

-- AC-040 (FR-034/FR-005): revoke then re-grant is reversible; the non-revoked read excludes the role
-- while revoked and includes it after re-grant. Target: Author's live member row.
select lives_ok($$
  update shared.person_access_roles set revoked_at = now(), revoked_by = '00000000-0000-0000-0000-0000000000d3'
   where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='member'
$$, 'AC-040: admin revokes (sets revoked_at)');
select is(
  (select count(*)::int from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='member' and revoked_at is null),
  0, 'AC-040: while revoked, the non-revoked read excludes member');
select lives_ok($$
  update shared.person_access_roles set revoked_at = null, revoked_by = null
   where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='member'
$$, 'AC-040: admin re-grants (clears revoked_at) -> reversible');

-- AC-041 (FR-034, NFR-004): an authenticated member (even the admin) DELETE -> denied (no DELETE grant
-- -> 42501). Confirmed at red: the no-grant path reliably raises 42501 in this harness (mirrors
-- 26_ops_log_no_delete.sql).
select throws_ok($$
  delete from shared.person_access_roles
   where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='member'
$$, '42501', null, 'AC-041: hard delete denied (soft-revoke only)');

-- AC-042 (FR-035, NFR-003): cross-org isolation. A same-org member reads the org-A row; a member of
-- org B sees zero. Same-org read first (Author ...0d01, a plain member of org A).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select count(*)::int from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='finance'),
  1, 'AC-042: a same-org member reads the org-A assignment row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from shared.person_access_roles
     where person_id='00000000-0000-0000-0000-0000000000d1'),
  0, 'AC-042: org-B member sees zero org-A assignment rows (cross-org isolation)');

reset role;
select * from finish();
rollback;

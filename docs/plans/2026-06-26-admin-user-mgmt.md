# Plan — Admin user management (in-app provisioning)

- Spec: `docs/specs/admin-user-mgmt.spec.md` · ADR: `docs/adr/0016-interim-provisioning-rpcs-staging.md` · `docs/adr/0011-auth-model-rbac-access-roles.md` (D5)
- Date: 2026-06-26 · Feature slug: `admin-user-mgmt`
- Author: eng-planner
- Scope of writes by this plan: design only. Build phases below touch `supabase/migrations/`, `supabase/tests/`, and `mos-app/src/`.

---

## 0. Design summary

### 0.1 What ships

An admin-only screen at `/admin/users` to: list people (login + roles + archive state), create a person
(+ optional login), reset a login's password, disable/enable a login, grant/revoke access roles, archive/restore.

Three privileged ops touch `auth.*` and run as admin-gated `SECURITY DEFINER` RPCs (`shared.admin_create_login`,
`shared.admin_reset_password`, `shared.admin_set_login_enabled`) — the interim staging provisioning surface
(ADR-0016). Everything else (list, roles, create-person-row, archive) is **direct, admin-RLS-gated** SPA reads/writes.

### 0.2 Architecture / data flow

```
SPA page (/admin/users, admin-route-guarded)
  ├─ list      → SELECT shared.people  + shared.person_access_roles (org-readable RLS, existing)
  │              + auth login-status   → exposed via a SECURITY DEFINER read RPC (see §0.4) — the SPA
  │                cannot read auth.users directly, and people.user_id alone cannot tell active vs disabled.
  ├─ create person → INSERT shared.people (NEW admin-gated INSERT policy + grant — see §0.3)
  ├─ create login  → RPC shared.admin_create_login(person)        → returns temp password (once)
  ├─ reset pw      → RPC shared.admin_reset_password(person)       → returns temp password (once)
  ├─ disable/enable→ RPC shared.admin_set_login_enabled(person, b) → void
  ├─ grant/revoke  → INSERT / UPDATE shared.person_access_roles (existing admin RLS + _guard; + NEW no-lockout)
  └─ archive/restore → UPDATE shared.people.archived_at (NEW admin-gated UPDATE policy + grant — see §0.3)
```

### 0.3 Substrate gap found (DECISION REQUIRED — see §6 Q1)

`supabase/migrations/20260611000006_rls.sql` grants `authenticated` **SELECT only** on `shared.people`, with
**no INSERT/UPDATE/DELETE grant and no write policy** (security-audit M1: ship write-closed). The spec treats
**create-person** (FR-020) and **archive/restore** (FR-060) as "direct RLS writes", but that surface does not
exist. This plan therefore ADDS, in the migration, **admin-gated INSERT and UPDATE policies + the matching base
grants** on `shared.people`, mirroring the `person_access_roles_insert_admin` / `_update_admin` posture
(`with check (org_id = shared.current_org_id() and shared.has_access_role('admin'))`), plus a `_guard_people`
BEFORE trigger to (a) force/lock `org_id` server-side and forbid cross-org re-homing, (b) restrict the admin
UPDATE to the `archived_at` / `email` / `full_name` columns (never `user_id` — that is the RPC's job). This is
a deliberate, scoped widening of the M1 posture for the admin role only; it must be called out to security-audit.

### 0.4 Login-status read (DECISION REQUIRED — see §6 Q3)

`auth.users` is not in the PostgREST-exposed schema set and `authenticated` has no SELECT on it. The list (FR-010/011)
needs, per person: none / active / disabled. `people.user_id` distinguishes none vs has-login; active vs disabled
needs `auth.users.banned_until`. Plan: a fourth, **read-only** admin-gated definer RPC
`shared.admin_list_login_status() returns table(person_id uuid, has_login boolean, disabled boolean)` (same admin +
org gate, no secrets returned). It is read-only, returns no password material, and keeps the `auth.*` coupling in
the same documented seam. (Alternative the Director may prefer: fold this into the page's people query via a
`security definer` view — flagged, not chosen.)

### 0.5 No-lockout guard (FR-041/AC-040)

The last active admin in the org may not be disabled (login) nor de-admined (role revoke). Two enforcement points:
- **Disable login**: checked inside `admin_set_login_enabled` (it already holds the admin + org context).
- **Revoke admin role**: the role revoke is a *direct RLS UPDATE* on `person_access_roles`, not an RPC.
  **Recommendation (DECISION Q2):** EXTEND the existing `shared._guard_person_access_roles()` trigger with a
  last-admin check on the revoke branch (when `new.revoked_at is not null and old.revoked_at is null and
  old.access_role = 'admin'`), rather than adding a new trigger — one guard per table, the count-active-admins
  query lives beside the existing self-assign block, and the DOWN already drops/recreates that function. A new
  trigger would split the invariant across two functions and complicate ordering. "Active admin" = a `person_access_roles`
  row `access_role='admin' and revoked_at is null` whose person is `archived_at is null` AND has a non-banned login
  (a banned/loginless admin is not an *active* lockout risk; count only those who can actually sign in).

### 0.6 Testing strategy (per spec test pyramid)

- pgTAP owns AC-001/002/010/020/030/040/050 (RPC authz, org isolation, provisioning round-trip, no-lockout, role grant/revoke).
- Vitest/RTL owns AC-011 (create form), AC-060 (list rendering), AC-070 (route-guard + nav absence).
- One new test-seed fixture `mos._test_seed_admin_users()` (mirrors `_test_seed_access_roles`): a person-with-login,
  a second-org person, and a single-admin org for the no-lockout scenario.

---

## 1. Migration — RPCs + people write policies + no-lockout guard

File: `supabase/migrations/20260626000001_admin_provisioning_rpcs.sql` (one migration; ships a DOWN comment block).

### Task 1.1 — people admin write policies + grants + `_guard_people`

**File:** `supabase/migrations/20260626000001_admin_provisioning_rpcs.sql` (create; this block first).
**Covers:** FR-020, FR-060 (the write surface they need). Proven by AC-050 seed path + Vitest AC-060/011 indirectly;
directly asserted by a new pgTAP arm in `52_*` (Task 2.x AC-050 file reuses the people write).

Add exactly:

```sql
-- Admin write surface on shared.people (scoped widening of the M1 read-only posture, ADR-0016 / spec §0.3).
-- create-person (FR-020) + archive/restore (FR-060). org_id stays server-stamped + immutable; user_id is
-- NEVER client-writable (the RPCs own the auth link). No DELETE grant (NFR-005: archive, never delete).
grant insert, update on shared.people to authenticated;

create policy people_insert_admin on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

create policy people_update_admin on shared.people
  for update to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Guard: org_id immutable on UPDATE; user_id may NOT be set/changed by an app write (RPC-only seam);
-- created_at/id immutable. SECURITY INVOKER (reads only current_* claim helpers; nothing to revoke).
create or replace function shared._guard_people()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a person' using errcode = '42501';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id is set only by the provisioning RPCs, not a direct write' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and new.user_id is not null then
    raise exception 'user_id is set only by the provisioning RPCs, not a direct write' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function shared._guard_people() is
  'Guard (ADR-0016): org_id immutable on UPDATE; user_id is RPC-only (never a direct app write). SECURITY INVOKER.';

create trigger people_guard
  before insert or update on shared.people
  for each row execute function shared._guard_people();
```

**Verify:** `supabase test db` (after Task 2 files exist) — the AC-050 file's people INSERT/archive arm passes.
Standalone sanity now: `psql -f` not required; the migration applies in the next `supabase db reset`.

### Task 1.2 — `shared.admin_create_login`

**File:** same migration (append).
**Covers:** AC-010, AC-001 (authz), AC-002 (org). FR-022.

Add exactly:

```sql
-- Generate a policy-compliant temp password (>=8, upper+lower+digit). 12 random base64 chars + a
-- guaranteed uppercase, lowercase, and digit appended, then it always meets the policy (NFR/FR-022).
create or replace function shared._gen_temp_password()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  body text := translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'xyz');
begin
  return body || 'A' || 'a' || (floor(random() * 10))::int::text;
end;
$$;
comment on function shared._gen_temp_password() is 'TEST/PROV helper: 12+ char temp password meeting >=8 mixed-case+digit policy (FR-022).';
revoke execute on function shared._gen_temp_password() from public, anon, authenticated;

create or replace function shared.admin_create_login(p_person uuid, p_password text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_email  text;
  v_uid    uuid;
  v_pw     text;
  v_target shared.people;
begin
  -- (1) authz FIRST, fail-closed (NFR-001). admin AND target shares caller's org.
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is not null then
    raise exception 'person already has a login' using errcode = '42501';
  end if;
  v_email := coalesce(v_target.email, '');
  if v_email = '' then
    raise exception 'person has no email to provision a login for' using errcode = '22023';
  end if;

  v_pw  := coalesce(p_password, shared._gen_temp_password());
  v_uid := extensions.gen_random_uuid();

  -- (2) auth.users row — mirror the proven staff-provisioning shape (token cols '' not NULL).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"email_verified":true}'::jsonb, false, false,
    '', '', '', '', '', '', '', '',
    now(), now()
  );

  -- (3) auth.identities — provider_id=user_id::text; email is GENERATED → omitted.
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values (
    extensions.gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
    now(), now()
  );

  -- (4) link the person (NFR-004: creating a login grants NO access role).
  update shared.people set user_id = v_uid, updated_at = now() where id = p_person;

  return v_pw;  -- returned ONCE to the calling admin; never persisted/logged (NFR-003).
end;
$$;
comment on function shared.admin_create_login(uuid, text) is
  'ADR-0016 interim provisioning: create an auth login for a person (admin+org gated). Returns the temp password ONCE (never persisted). SECURITY DEFINER.';
revoke execute on function shared.admin_create_login(uuid, text) from public, anon;
grant execute on function shared.admin_create_login(uuid, text) to authenticated;
```

**Verify:** `supabase test db` after Task 2.3 (AC-010 file) exists.

### Task 1.3 — `shared.admin_reset_password`

**File:** same migration (append).
**Covers:** AC-020, AC-001, AC-002. FR-030.

```sql
create or replace function shared.admin_reset_password(p_person uuid, p_password text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_target shared.people;
  v_pw     text;
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is null then
    raise exception 'person has no login to reset' using errcode = '22023';
  end if;

  v_pw := coalesce(p_password, shared._gen_temp_password());
  update auth.users
     set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')), updated_at = now()
   where id = v_target.user_id;
  return v_pw;
end;
$$;
comment on function shared.admin_reset_password(uuid, text) is
  'ADR-0016 interim provisioning: reset a login password (admin+org gated). Returns the new temp password ONCE. SECURITY DEFINER.';
revoke execute on function shared.admin_reset_password(uuid, text) from public, anon;
grant execute on function shared.admin_reset_password(uuid, text) to authenticated;
```

**Verify:** `supabase test db` after Task 2.4.

### Task 1.4 — `shared.admin_set_login_enabled` (with no-lockout)

**File:** same migration (append).
**Covers:** AC-030, AC-040 (disable arm), AC-001, AC-002. FR-040, FR-041.

```sql
-- Active admin = admin role live + person not archived + login exists and not banned.
create or replace function shared._count_active_admins(p_org uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int
    from shared.person_access_roles par
    join shared.people pe on pe.id = par.person_id
    join auth.users u     on u.id = pe.user_id
   where par.org_id = p_org
     and par.access_role = 'admin'
     and par.revoked_at is null
     and pe.archived_at is null
     and (u.banned_until is null or u.banned_until <= now());
$$;
comment on function shared._count_active_admins(uuid) is 'No-lockout helper (FR-041): admins who can actually sign in. SECURITY DEFINER (called only from definer RPC / guard).';
revoke execute on function shared._count_active_admins(uuid) from public, anon, authenticated;

create or replace function shared.admin_set_login_enabled(p_person uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_target shared.people;
  v_is_admin boolean;
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  select * into v_target from shared.people where id = p_person;
  if v_target.id is null or v_target.org_id is distinct from v_org then
    raise exception 'person not found in your org' using errcode = '42501';
  end if;
  if v_target.user_id is null then
    raise exception 'person has no login' using errcode = '22023';
  end if;

  -- No-lockout (FR-041): disabling the last active admin's login is refused.
  if p_enabled = false then
    select exists (
      select 1 from shared.person_access_roles
       where person_id = p_person and access_role = 'admin' and revoked_at is null
    ) into v_is_admin;
    if v_is_admin and shared._count_active_admins(v_org) <= 1 then
      raise exception 'cannot disable the last active admin login' using errcode = '42501';
    end if;
  end if;

  -- banned_until is the GoTrue block mechanism (DECISION Q4 — confirm in build vs this GoTrue version).
  update auth.users
     set banned_until = case when p_enabled then null else 'infinity'::timestamptz end,
         updated_at = now()
   where id = v_target.user_id;
end;
$$;
comment on function shared.admin_set_login_enabled(uuid, boolean) is
  'ADR-0016 interim provisioning: disable (banned_until=infinity) / enable (NULL) a login (admin+org gated). No-lockout: last active admin cannot be disabled (FR-041). SECURITY DEFINER.';
revoke execute on function shared.admin_set_login_enabled(uuid, boolean) from public, anon;
grant execute on function shared.admin_set_login_enabled(uuid, boolean) to authenticated;
```

**Verify:** `supabase test db` after Task 2.5/2.6.

### Task 1.5 — extend `_guard_person_access_roles` with the last-admin revoke block

**File:** same migration (append) — `create or replace` the existing guard (mirrors the hook's CREATE-OR-REPLACE
single-point pattern). Re-paste the **entire** body from `20260619000001_*.sql` lines 48–88 UNCHANGED, then add,
just after the self-assign block (before `return new;`):

```sql
  -- No-lockout (FR-041 / ADR-0016): a revoke (live→revoked) of the LAST active admin is refused.
  if tg_op = 'UPDATE'
     and old.access_role = 'admin'
     and old.revoked_at is null and new.revoked_at is not null then
    if shared._count_active_admins(old.org_id) <= 1 then
      raise exception 'cannot revoke admin from the last active admin' using errcode = '42501';
    end if;
  end if;
```

**Covers:** AC-040 (revoke arm). FR-041.
**Note:** keep the comment on the function updated to mention the no-lockout addition.
**Verify:** `supabase test db` after Task 2.6.

### Task 1.6 — `shared.admin_list_login_status` read RPC

**File:** same migration (append).
**Covers:** FR-010/011 (the active-vs-disabled signal). Asserted by Vitest AC-060 via the typed wrapper + a pgTAP
shape arm in the AC-010 file (login row appears with disabled=false after create).

```sql
create or replace function shared.admin_list_login_status()
returns table(person_id uuid, has_login boolean, disabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  return query
    select pe.id,
           pe.user_id is not null as has_login,
           (u.banned_until is not null and u.banned_until > now()) as disabled
      from shared.people pe
      left join auth.users u on u.id = pe.user_id
     where pe.org_id = shared.current_org_id();
end;
$$;
comment on function shared.admin_list_login_status() is
  'ADR-0016: read-only login-status (none/active/disabled) per person for the admin screen (admin gated, no secrets). SECURITY DEFINER.';
revoke execute on function shared.admin_list_login_status() from public, anon;
grant execute on function shared.admin_list_login_status() to authenticated;
```

**Verify:** `supabase test db` after Task 2.3.

### Task 1.7 — DOWN block

**File:** same migration (append as a trailing comment block, mirroring the repo convention).

```sql
-- DOWN:
--   drop function shared.admin_list_login_status();
--   drop function shared.admin_set_login_enabled(uuid, boolean);
--   drop function shared.admin_reset_password(uuid, text);
--   drop function shared.admin_create_login(uuid, text);
--   drop function shared._count_active_admins(uuid);
--   drop function shared._gen_temp_password();
--   create or replace shared._guard_person_access_roles() with the 20260619000001 body (drop the
--     last-admin revoke block);
--   drop trigger people_guard on shared.people; drop function shared._guard_people();
--   drop policy people_update_admin on shared.people; drop policy people_insert_admin on shared.people;
--   revoke insert, update on shared.people from authenticated;
```

**Verify:** `supabase db reset` applies the whole stack with no error.

---

## 2. pgTAP suite

All files: `supabase/tests/NN_*.sql`. Each begins `begin; create extension if not exists pgtap ...; select plan(N);`
and ends `select * from finish(); rollback;`. JWT impersonation via `set local role authenticated; set local
request.jwt.claims = '{...}'`. AC-id in every test-string. RED first: write the file, run `supabase test db`, watch
it fail (the RPC/policy does not exist yet), then implement §1.

### Task 2.1 — test-seed fixture (write first, used by 2.2–2.6)

**File:** `supabase/migrations/20260626000002_admin_users_test_seed.sql` (mirror `20260619000003_*`).
**Covers:** fixtures for AC-010/020/030/040/050/002.

Create `mos._test_seed_admin_users()` (`security definer set search_path=''`, revoke from public/anon/authenticated),
building, idempotently (`on conflict do nothing`):
- Org A (`…0000a1`) admin person `…00d3` linked to auth user `…00aa03`, `person_access_roles(admin)` live.
- Org A person `…00d1` with `email='budi@ops.gordi.local'`, `user_id` NULL (target for create-login, AC-010).
- Org A person `…00d2` with login auth user `…00aa02` (target for reset/disable, AC-020/030).
- Org B (`…0000b1`) person `…00b4` with login (cross-org target, AC-002).
- A **single-admin org** = org A as seeded (exactly one admin `…00d3`), used by AC-040.
- Auth users created with the FULL proven column shape (mirror Task 1.2 insert) so `_count_active_admins`'
  `banned_until` join is real, and `admin_reset_password`/`disable` have a real hash to mutate.

```sql
-- DOWN: drop function mos._test_seed_admin_users();
```

**Verify:** `supabase test db` (fixture compiles when the file referencing it runs).

### Task 2.2 — AC-001 (authz, fail-closed)

**File:** `supabase/tests/52_admin_create_login_authz.sql`. `plan(4)`.
**Covers:** AC-001.
- Seed via `mos._test_seed_admin_users()`.
- `set local request.jwt.claims` to a **member** session (org A, person `…00d1`, `access_roles:["member"]`).
- `select throws_ok($$ select shared.admin_create_login('…00d1') $$, '42501', null, 'AC-001: non-admin admin_create_login → 42501');`
- Same for `admin_reset_password('…00d2')` and `admin_set_login_enabled('…00d2', false)` → 42501.
- 4th assertion: `select is((select count(*) from auth.users where id='…'), …)` proving no `auth.users` row changed.

**Verify:** `supabase test db` (RED: function missing → green after §1.2/1.3/1.4).

### Task 2.3 — AC-010 (create-login round-trip) + login-status shape

**File:** `supabase/tests/53_admin_create_login_roundtrip.sql`. `plan(6)`.
**Covers:** AC-010 + Task 1.6 shape.
- Seed; admin session (org A, person `…00d3`, `access_roles:["admin"]`).
- `select shared.admin_create_login('…00d1') as pw` into a temp (use `\gset` not available in pgTAP — instead wrap
  in a `do`/`select … into` via a sub-select: capture the password by selecting `shared.admin_create_login` once
  into a CTE and assert against it). Concretely:
  ```sql
  select results_eq(
    $$ select extensions.crypt(p.pw, u.encrypted_password) = u.encrypted_password
         from (select shared.admin_create_login('00000000-0000-0000-0000-0000000000d1') as pw) p,
              shared.people pe join auth.users u on u.id = pe.user_id
        where pe.id = '00000000-0000-0000-0000-0000000000d1' $$,
    $$ values (true) $$,
    'AC-010: returned temp password verifies against the new auth.users hash');
  ```
  (Run create-login in a CTE once; subsequent asserts read the resulting rows — a second call would 42501 on
  "already has a login", so structure the file to call it exactly once inside the password-verify assert.)
- `auth.users` row exists for the new `user_id`; `auth.identities` row exists (`isnt(... , 0)`).
- `people.user_id` is non-null (`isnt`).
- Hook stamps: `select set_has(... shared.custom_access_token_hook(jsonb_build_object('user_id', <new uid>, 'claims','{}'::jsonb)) -> 'claims' -> 'access_roles' ...)` resolves the person's roles (org_id/person_id present).
- `admin_list_login_status()` returns `has_login=true, disabled=false` for `…00d1`.

**Verify:** `supabase test db`.

### Task 2.4 — AC-020 (reset password)

**File:** `supabase/tests/54_admin_reset_password.sql`. `plan(2)`.
**Covers:** AC-020.
- Seed; admin session. Person `…00d2` has a known seeded password (seed it with `admin_create_login` first, OR
  seed a known hash and assert old fails / new verifies).
- Capture old hash; `select shared.admin_reset_password('…00d2') as pw`; assert `extensions.crypt('<old>', new_hash) <> new_hash` (old no longer verifies) and `extensions.crypt(pw, new_hash) = new_hash` (new verifies). Use the CTE-once pattern as in 2.3.

**Verify:** `supabase test db`.

### Task 2.5 — AC-030 (disable / enable blocks auth)

**File:** `supabase/tests/55_admin_set_login_enabled.sql`. `plan(3)`.
**Covers:** AC-030.
- Seed; admin session. Target a **non-admin** person-with-login (`…00d2`) so the no-lockout guard does not fire.
- `admin_set_login_enabled('…00d2', false)`; assert `auth.users.banned_until` is `> now()` (the block mechanism) —
  `select ok((select banned_until from auth.users where id='…') > now(), 'AC-030: disabled → banned_until future');`
- `admin_set_login_enabled('…00d2', true)`; assert `banned_until is null`.
- Note in a comment: the spec's "authentication is refused" is GoTrue runtime behavior; pgTAP asserts the
  documented mechanism (`banned_until`); the end-to-end refusal is the optional Playwright journey / build-time verify.

**Verify:** `supabase test db`.

### Task 2.6 — AC-040 (no-lockout, both arms) + AC-002 (org isolation)

**File:** `supabase/tests/56_admin_no_lockout_and_org.sql`. `plan(5)`.
**Covers:** AC-040, AC-002.
- Seed (org A has exactly one admin `…00d3`, who has a login). Admin session as `…00d3`.
- **AC-040 disable arm:** `select throws_ok($$ select shared.admin_set_login_enabled('…00d3', false) $$, '42501', null, 'AC-040: cannot disable the last active admin login');`
- **AC-040 revoke arm:** `select throws_ok($$ update shared.person_access_roles set revoked_at = now() where person_id='…00d3' and access_role='admin' $$, '42501', null, 'AC-040: cannot revoke admin from the last active admin');`
- **AC-040 negative control:** add a SECOND admin (insert a live admin grant for `…00d2`, who has a login),
  then the revoke of `…00d3` admin `lives_ok` (no longer the last). Asserts the guard counts correctly.
- **AC-002 (org):** `select throws_ok($$ select shared.admin_create_login('…00b4') $$, '42501', null, 'AC-002: admin in org A cannot target an org-B person');` and an `is(count)` proving the org-B login row is unchanged.

**Verify:** `supabase test db`.

### Task 2.7 — AC-050 (role grant/revoke via direct RLS + self-assign guard)

**File:** `supabase/tests/57_admin_role_grant_revoke.sql`. `plan(5)`.
**Covers:** AC-050.
- Seed; admin session `…00d3`.
- Grant `ops_lead` to `…00d1` (`lives_ok` INSERT); assert the hook re-mint includes `ops_lead`
  (`set_has` on `custom_access_token_hook(... user_id of …00d1 ...) -> claims -> access_roles`).
- Revoke (`update … set revoked_at = now()` → `lives_ok`); assert `revoked_at is not null` AND the row still exists
  (`count = 1`, no delete) AND the re-mint no longer includes `ops_lead`.
- Self-assign: `throws_ok` admin grants `admin` to self (`…00d3`) → 42501 (existing guard).
- Self-assign finance: `throws_ok` admin grants `finance` to self → 42501.

**Verify:** `supabase test db`.

---

## 3. SPA data layer — `admin-users.ts`

### Task 3.1 — types

**File:** `mos-app/src/lib/db/admin-users.types.ts` (create).
**Covers:** type consistency across 3.2/3.3 + the page.

```ts
export type LoginStatus = 'none' | 'active' | 'disabled'

export interface AdminPersonRow {
  id: string
  full_name: string
  email: string | null
  archived_at: string | null
  login: LoginStatus
  access_roles: string[]          // non-revoked, excludes derived 'manager'
}

export interface CreatePersonInput {
  full_name: string
  email: string | null            // null when "no email" → caller passes synthetic (FR-021)
  access_roles: string[]          // never 'admin'/'finance' for self; never 'manager'
}

export const ASSIGNABLE_ROLES = ['member', 'ops_lead', 'admin', 'finance'] as const
```

**Verify:** `cd mos-app && npm run typecheck`.

### Task 3.2 — test (RED) for `admin-users.ts`

**File:** `mos-app/src/lib/db/admin-users.test.ts` (create). Mirror `directory.test.ts` chainable-mock pattern; mock `@/lib/supabase`.
**Covers:** AC-011 helper (synthetic email), wrapper contracts.
Tests (titles carry the contract id; AC-011's email rule is unit-tested here AND in the form test 6.x):
- `synthesizeEmail('Budi Santoso')` → matches `/^budi-santoso@ops\.gordi\.local$/` (slug local-part, deterministic).
- `synthesizeEmail` uniqueness: given an existing set, appends a numeric suffix.
- `listAdminPeople()` joins `people` + `person_access_roles` + `admin_list_login_status` RPC into `AdminPersonRow[]`, never sends `org_id`.
- `createLogin(personId)` calls `.rpc('admin_create_login', { p_person })` on `schema('shared')`, returns the password string; throws on PostgREST error.
- `resetPassword`, `setLoginEnabled`, `grantRole` (INSERT person_access_roles), `revokeRole` (UPDATE revoked_at), `createPerson` (INSERT people), `archivePerson`/`restorePerson` (UPDATE archived_at) — each asserts the right table/RPC + that org_id/granted_by are NOT sent.

**Verify:** `cd mos-app && npm test -- admin-users` (RED — module absent).

### Task 3.3 — implement `admin-users.ts`

**File:** `mos-app/src/lib/db/admin-users.ts` (create). Mirror `directory.ts` / `kitchen-logs.ts` style:
`const shared = () => supabase.schema('shared')`; throw `new Error('… failed — ${error.message}')` on PostgREST error.
**Covers:** FR-010/011/020/021/022/030/040/050/060; data side of AC-011/060.

Functions (signatures must match 3.1 types exactly):
- `synthesizeEmail(fullName: string, taken?: Set<string>): string` — lowercase, spaces→`-`, strip non `[a-z0-9-]`,
  `@ops.gordi.local`; if in `taken`, append `-2`, `-3`, … (FR-021).
- `listAdminPeople(): Promise<AdminPersonRow[]>` — read `people` (id, full_name, email, archived_at), `person_access_roles`
  (person_id, access_role, revoked_at — filter `revoked_at is null` client-side or `.is('revoked_at', null)`),
  and `shared().rpc('admin_list_login_status')`; merge into rows; `login` = `none|active|disabled`.
- `createPerson(input: CreatePersonInput): Promise<string>` — INSERT `people` (full_name, email), return new id; then for each role in `input.access_roles` INSERT `person_access_roles` (person_id, access_role). Never send org_id/user_id.
- `createLogin(personId: string): Promise<string>` — `.rpc('admin_create_login', { p_person: personId })`.
- `resetPassword(personId): Promise<string>` — `.rpc('admin_reset_password', { p_person: personId })`.
- `setLoginEnabled(personId, enabled: boolean): Promise<void>` — `.rpc('admin_set_login_enabled', { p_person: personId, p_enabled: enabled })`.
- `grantRole(personId, role): Promise<void>` — INSERT `person_access_roles`.
- `revokeRole(personId, role): Promise<void>` — UPDATE `person_access_roles` set `revoked_at = new Date().toISOString()` where person_id+access_role+`is('revoked_at', null)`.
- `archivePerson(personId)/restorePerson(personId): Promise<void>` — UPDATE `people` set `archived_at`.

**Verify:** `cd mos-app && npm test -- admin-users` (GREEN) · `npm run typecheck` · `npm run lint`.

---

## 4. Route + guard + nav

### Task 4.1 — `AdminRoute` guard component (RED test)

**File:** `mos-app/src/auth/admin-route.test.tsx` (create). Mirror `guards.test.tsx`; `vi.mock('./use-auth')`.
**Covers:** AC-070 (route arm).
- authenticated + accessRoles includes `'admin'` → renders `<Outlet/>` content.
- authenticated + accessRoles `['member']` → `<Navigate to="/" replace>` (protected content absent, home shown).
- loading → neutral status; unauthenticated → handled by outer ProtectedRoute (test that AdminRoute redirects non-admin to `/`).

**Verify:** `cd mos-app && npm test -- admin-route` (RED).

### Task 4.2 — implement `AdminRoute`

**File:** `mos-app/src/auth/admin-route.tsx` (create). Mirror `protected-route.tsx`.
**Covers:** AC-070 (route arm), FR-001.

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'

// FR-001/AC-070: nested under ProtectedRoute. A session without the `admin` access role is bounced
// to home — a hidden route is not a security boundary (RLS is the real gate, ADR-0011 D5).
export function AdminRoute() {
  const auth = useAuth()
  const isAdmin =
    auth.status === 'authenticated' && auth.viewer.accessRoles.includes('admin')
  if (!isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
```

**Verify:** `cd mos-app && npm test -- admin-route` (GREEN) · `npm run typecheck`.

### Task 4.3 — wire route

**File:** `mos-app/src/router.tsx` (edit). Inside the `AppShell` children, add:
```tsx
import { AdminRoute } from './auth/admin-route'
import { AdminUsersPage } from './pages/admin-users-page'
// …
{
  element: <AdminRoute />,
  children: [{ path: 'admin/users', element: <AdminUsersPage /> }],
},
```
**Covers:** FR-001.
**Verify:** `cd mos-app && npm run typecheck`.

### Task 4.4 — nav entry (admin-only) + test

**File:** `mos-app/src/shell/sections.tsx` (edit) + `mos-app/src/shell/rail-nav.tsx` (edit) + extend `mos-app/src/shell/rail-nav.test.tsx`.
**Covers:** AC-070 (nav-absence arm), FR-001.
- In `sections.tsx`: add `export const ADMIN_SECTIONS: Section[] = [{ path: '/admin/users', label: 'Users', Icon: SettingsIcon }]` and include `/admin/users` in `sectionForPath`'s search list.
- In `rail-nav.tsx`: render `ADMIN_SECTIONS` only when `accessRoles.includes('admin')` (mirror `hasElevatedKitchenAccess`), under an "Admin" group label.
- In `rail-nav.test.tsx`: add `it('AC-070: non-admin viewer does NOT see the Users nav entry')` (setAuthAs(['member']) → `queryByText('Users')` null) and `it('AC-070b: admin viewer sees the Users nav entry')`.

**Verify:** `cd mos-app && npm test -- rail-nav` (GREEN) · `npm run lint`.

---

## 5. Page + components

Detailed visual layout is deferred to the design-plan (design-architect). This plan lists components + data deps + the
behavior ACs they own. Tests RED-first.

### Task 5.1 — list rendering test (RED)

**File:** `mos-app/src/pages/admin-users-page.test.tsx` (create). Mock `@/lib/db/admin-users` (return canned `AdminPersonRow[]`).
**Covers:** AC-060.
- Render with people in each state: no-login, active, disabled, archived → each status string renders distinctly
  (assert visible text/badge per row).
- Empty state: when the only row is the admin themselves → empty-state message shows.

**Verify:** `cd mos-app && npm test -- admin-users-page` (RED).

### Task 5.2 — create-form test (RED)

**File:** `mos-app/src/components/admin/create-person-dialog.test.tsx` (create).
**Covers:** AC-011.
- "no email" checked + name "Budi Santoso" + submit → `createPerson` called with `email` matching `@ops.gordi.local`.
- "create a login now" → temp password from `createLogin` displayed exactly once; after dismiss, the password is NOT
  retained in any rendered element nor in component state (assert the value is gone from the DOM after close, and the
  component re-mounts clean). `admin`/`finance` self-assign controls disabled when target is self (FR-023).

**Verify:** `cd mos-app && npm test -- create-person-dialog` (RED).

### Task 5.3 — implement page + components

**Files (create):**
- `mos-app/src/pages/admin-users-page.tsx` — loads `listAdminPeople()`; renders `<UserTable>`; hosts `<CreatePersonDialog>`, row actions (reset pw, disable/enable, grant/revoke role, archive/restore). Surfaces RPC errors (incl. the 42501 no-lockout) as a non-fatal toast/inline message.
- `mos-app/src/components/admin/user-table.tsx` — props `{ people: AdminPersonRow[] }`; renders name/email/login-badge/roles/archived per FR-010/011; empty state.
- `mos-app/src/components/admin/create-person-dialog.tsx` — form (name, email or "no email" → `synthesizeEmail`, role checkboxes excluding `manager`, optional "create login now"); shows the one-time password panel from `createLogin`; clears it on close.
- `mos-app/src/components/admin/password-reveal.tsx` (optional shared piece) — one-time password display used by reset + create-login; no persistence after dismiss.
**Covers:** FR-010/011/020/021/022/023/030/040/050/060; AC-060, AC-011.
**Data deps:** all from `@/lib/db/admin-users` (§3). Auth/self detection via `useAuth()` (for FR-023 disable controls + no-lockout-aware disabling of own last-admin actions — server is authoritative; UI just pre-disables).

**Verify:** `cd mos-app && npm test -- admin-users-page create-person-dialog` (GREEN) · `npm run typecheck` · `npm run lint`.

---

## 6. Open decisions for the Director

1. **`shared.people` write surface (BLOCKING, §0.3).** The spec calls create-person + archive "direct RLS writes",
   but `people` ships SELECT-only (M1). Plan ADDS admin-gated INSERT/UPDATE policies + grants + a `_guard_people`
   trigger (org_id immutable, `user_id` RPC-only). Confirm this scoped widening of M1 for the admin role, and that
   security-audit reviews it. (Alternative: route create-person + archive through definer RPCs too — heavier, but
   keeps `people` read-only. Recommend the RLS policy.)
2. **No-lockout for role revoke (§0.5): extend `_guard_person_access_roles` vs new trigger.** Recommend EXTEND
   (one guard per table). Confirm.
3. **Login-status read (§0.4): definer RPC `admin_list_login_status` vs a `security definer` view.** Recommend the
   RPC (consistent with the other three; no exposed-schema change). Confirm.
4. **`banned_until` block mechanism (§1.4/Task 2.5).** Verified-as-mechanism in the brief; build must confirm THIS
   GoTrue version on staging refuses auth when `banned_until > now()` (vs a `is_banned`/other flag). If it does not,
   the disable arm needs the correct column — flag at build, do not silently ship.
5. **`_count_active_admins` "active" definition.** Plan counts admins who can actually sign in (role live + not
   archived + login exists + not banned). Confirm that a loginless or banned admin should NOT count as the lockout
   floor (i.e., you can disable the last admin only if another *signable* admin exists). Recommend yes.
6. **Synthetic-email domain (FR-021): `@ops.gordi.local`.** Spec/ADR-0011 D2 also reference `@kitchen.gordi.local`.
   Plan uses `@ops.gordi.local` per the brief's PROVEN facts. Confirm one canonical domain.
7. **Migration timestamp prefix `20260626…`** — confirm no collision with an in-flight branch's migration number.

---

## 7. Task count & AC → test mapping

**Task count: 22** (1.1–1.7 = 7 migration tasks; 2.1–2.7 = 7 pgTAP tasks; 3.1–3.3 = 3 data-layer; 4.1–4.4 = 4 route/nav; 5.1–5.3 = 3 page/components).

| AC | Layer | Owning test (title-tagged) | Task |
|----|-------|----------------------------|------|
| AC-001 | pgTAP | `52_admin_create_login_authz.sql` | 2.2 |
| AC-002 | pgTAP | `56_admin_no_lockout_and_org.sql` (org arm) | 2.6 |
| AC-010 | pgTAP | `53_admin_create_login_roundtrip.sql` | 2.3 |
| AC-011 | Vitest | `components/admin/create-person-dialog.test.tsx` (+ `admin-users.test.ts` email helper) | 5.2 / 3.2 |
| AC-020 | pgTAP | `54_admin_reset_password.sql` | 2.4 |
| AC-030 | pgTAP | `55_admin_set_login_enabled.sql` | 2.5 |
| AC-040 | pgTAP | `56_admin_no_lockout_and_org.sql` (disable + revoke arms) | 2.6 |
| AC-050 | pgTAP | `57_admin_role_grant_revoke.sql` | 2.7 |
| AC-060 | Vitest | `pages/admin-users-page.test.tsx` | 5.1 |
| AC-070 | Vitest | `auth/admin-route.test.tsx` (route) + `shell/rail-nav.test.tsx` (nav absence) | 4.1 / 4.4 |

Every behavior task is RED-first: the pgTAP/Vitest file is written and observed failing before the §1/§3/§4/§5
implementation that turns it green. Type/signature consistency is anchored by `admin-users.types.ts` (§3.1), consumed
unchanged by the data layer (§3.3) and the page/components (§5.3).

---

## 8. Director resolutions (2026-06-26 — BINDING; supersede §6/design open Qs)

**Eng plan §6:**
1. **APPROVED** — add the admin-gated `people` INSERT/UPDATE policies + grants + `_guard_people` (org_id immutable,
   `user_id` RPC-only). Scoped M1 widening; `security-auditor` MUST review it as part of the mandatory audit.
2. **APPROVED** — extend `shared._guard_person_access_roles` with the last-admin revoke block (one guard per table).
3. **APPROVED** — login-status via the read-only definer RPC `shared.admin_list_login_status` (not a view).
4. **APPROVED with refinement** — `banned_until` IS the mechanism (the column exists; standard GoTrue ban field).
   **Do NOT use `'infinity'::timestamptz`** — some GoTrue versions fail to parse it. Use a **far-future finite**
   value: `now() + interval '100 years'`. `_count_active_admins` keeps `banned_until is null or banned_until <= now()`.
   Build must still smoke-check that a `banned_until`-future user is actually refused at the GoTrue token endpoint on
   staging (Director will verify post-build); if refused some other way, flag — do not silently ship.
5. **APPROVED** — `_count_active_admins` = signable admins only (role live + not archived + login exists + not banned).
6. **APPROVED** — synthetic-email domain is `@ops.gordi.local` (single, BU-agnostic). ADR-0011 D2 amended to match.
7. **CONFIRMED** — `20260626…` prefix is free (checked: none on disk or in history).

**Design plan open Qs:**
- Disabled control style `opacity:.5; cursor:not-allowed` — **ratified** (documentation only, no token change).
- Self-assign guard is **actor==target** — admin/finance ARE grantable to a *different/new* person; disable those two
  checkboxes only on the admin's **own** row (FR-023). Confirmed.
- "Disabled" login status renders **amber/`warning`**, not red (reversible). Confirmed.
- The admin **sees their own row**; the empty-state predicate = the org has only the admin's own person row.

# Implementation Plan — Access-role layer (RBAC substrate) (P4 / ADR-0011 D5)

- Spec: `docs/specs/access-roles.spec.md` (35 FR / 10 NFR / 28 AC; zero owner-blocking flags — the
  business rules are pre-decided in ADR-0011 D5 / OD-P4-4).
- Authority: **ADR-0011 D5** (the model) + **ADR-0001 D1/D2/D3** (the org-seam + claim + `is_manager_of`
  substrate this layers onto) + `docs/decisions.md` OD-P4-4. Built on OD-P1-1/2/6/7/10.
- Mirrors P1/P2 conventions verbatim: schema-qualified DDL, `org_id default shared.current_org_id()`,
  `shared.set_updated_at()` trigger, enable+FORCE RLS, **no DELETE grant**, `SECURITY INVOKER` helpers
  + guard trigger (`SET search_path = ''`), text+CHECK vocabulary (not a PG enum), the single audited
  `SECURITY DEFINER` injection point (`custom_access_token_hook`) extended via a **new** `CREATE OR
  REPLACE` migration (the historical `…000005` file is never edited).

> **No-placeholder rule.** Every task below has an exact path, the real code/SQL, the `AC-###` it
> satisfies (behavior tasks), and an exact verify command. TDD: each behavior task names the failing
> test written **before** the implementation. Sizes are 2–5 min.

---

## 0. Design — the spec's 6 open questions, resolved

The spec (§10) carries six open questions to eng-planner. Each is resolved here; the tasks below are
written against these decisions. No new ADR is required — every decision is the *implementation face*
of a rule already recorded in ADR-0011 D5 / ADR-0001 D1 (no architectural choice is reopened or
invented). If the security-auditor (NFR-006) flags the claim-vs-table source as material, that becomes
ADR-0013 at review time; until then it is a recorded design decision in this plan.

### D-1 — Assignment **table** (`shared.person_access_roles`), not an enum-array column
**Decision: junction table**, mirroring `shared.person_roles` (migration `…000002`). It carries
per-grant provenance (`granted_by`/`granted_at`/`revoked_by`/`revoked_at`), keeps the "one row per
fact" convention, makes a single-role revoke a targeted UPDATE (not a whole-array read-modify-write),
and is the shape every existing pgTAP fixture already knows how to seed. The denser array column cannot
carry provenance and breaks the convention. (Resolves §10.1.)

### D-2 — **Soft-revoke** (`revoked_at`), no DELETE
**Decision: soft-revoke.** Revocation is an UPDATE setting `revoked_at`/`revoked_by`; re-grant clears
them. **No DELETE grant** to `authenticated` (mirrors `ops.log_entries` / `mos.tasks`). The uniqueness
guarantee is **`unique (person_id, access_role)`** (full, not partial) — a revoked row stays put and
re-grant clears `revoked_at` on the *same* row (FR-005). This keeps an audit trail and honors the
house no-hard-delete posture. (Resolves §10.2.)

### D-3 / D-5 — Helpers read the **JWT claim** (fail-closed), staleness accepted
**Decision: read the `access_roles` JWT claim.** `shared.current_access_roles()` parses the claim with
the same defensive pattern as `shared._claim_uuid` (generalized to a text-array claim), failing closed
to `'{}'` on malformed/absent claims. Same scale rationale as `current_org_id()` (ADR-0001 D1): a cheap
`STABLE` claim read, no per-policy correlated subquery. **Trade (NFR-008):** a grant/revoke takes effect
for an existing session only on the next token refresh (≤ access-token TTL, ADR-0011 D3) — the same
accepted trade as the `org_id` claim. The no-staleness alternative (live-table read by
`current_person_id()`) is recorded in Open Questions for the auditor; not built now. (Resolves §10.3/§10.5.)

### D-4 — Seed: owner→`admin`, others→`member`
**Decision: pattern fixed here, real roster deferred.** This slice seeds **fictional dev people**
(committed `seed.sql`): `Dewi Director` (the owner stand-in) → `admin`, every other seeded person →
`member`. The **real** roster's `admin`/`ops_lead`/`finance` assignment lands via the gitignored
deploy-time seed at the provisioning slice (OD-P1-6) — owner-decided, not this slice's concern
(Open Question, §10.4). (Resolves §10.4.)

### D-6 — `granted_by` nullable, `ON DELETE SET NULL`
**Decision: `granted_by uuid NULL REFERENCES shared.people(id) ON DELETE SET NULL`.** The seed row
(no granting person) carries `granted_by = NULL`; an app-tier grant stamps `current_person_id()` via a
column default. `ON DELETE SET NULL` preserves the assignment if the granting person is later archived
(archive is soft, but the FK is defensive). NULL is acceptable provenance for the bootstrap row.
(Resolves §10.6.)

### D-7 — Migration sequence numbers (next after `20260612000006`)
The next migrations are dated **2026-06-19** with a per-day counter starting at `01`:
- `20260619000001_shared_person_access_roles.sql` — table + indexes + RLS + guard + grants.
- `20260619000002_access_token_hook_access_roles.sql` — `CREATE OR REPLACE` the hook (claim stamp) +
  auth-admin SELECT grant + the two read helpers.
- `20260619000003_access_roles_test_seed.sql` — extend `mos._test_seed_role_tree()` with access-role
  grant fixtures (a SECURITY DEFINER test fixture, mirroring `…000003`).

Each migration carries a `-- DOWN:` comment block (reversible: drop table/helpers/trigger; the hook
reverts to its prior body via `CREATE OR REPLACE`). Mirrors the `…000006` `-- DOWN:` convention.

### D-8 — `config.toml` already exposes `shared`; no exposure change
`shared.person_access_roles` lives in the **already-exposed** `shared` schema (the SPA reads via the
`shared` PostgREST profile, `supabase.ts` `db.schema: 'shared'`). **No `config.toml` change** is
required (unlike the ops-log plan's `ops` exposure). RLS is the authority as always.

### D-9 — Hand-written types (no codegen) + viewer signature change
`database.types.ts` is **hand-written** per the existing convention (T-110). The viewer must decode the
`access_roles` claim from the **session access token**, which `resolveViewer(userId)` does not currently
receive. **Decision:** add an optional second parameter `accessToken?: string` to `resolveViewer` (the
assigned set is decoded from it; absent/undecodable → empty assigned set). `AuthProvider` already holds
the session in both `getSession()` and `onAuthStateChange` and will pass `session.access_token`. This
preserves the existing `ViewerResult` `person`/`roles`/`isManager` shape (FR-073) and adds an
`accessRoles: string[]` field (FR-070).

### D-10 — `ViewerResult.accessRoles` shape
**Decision: a single flat `accessRoles: string[]`** containing the assigned roles ∪ `'manager'` (when
`isManager` is true). One field the SPA reads with `viewer.accessRoles.includes('ops_lead')`. Rationale:
the effective set is what every route-guard/surface check wants; `isManager` already exposes the derived
bit discretely for callers who need the split (FR-073 keeps it). `'manager'` enters **only** from the
derivation, never from the claim (FR-003).

---

## 1. Sub-PR split recommendation

Two sub-PRs, each independently green:

- **PR-a — DB substrate** (T-001 … T-061): the table, hook extension, helpers, guard, RLS, grants, seed,
  and the full pgTAP suite (`29..36`). This is the **security-core gate PR** — `security-auditor`
  (NFR-006, ADR-0010 D11) focuses here. Carries the irreversible-ish schema.
- **PR-b — Viewer exposure** (T-100 … T-130): `database.types.ts` + `resolveViewer` extension + the
  `AuthProvider` wiring + unit tests. Depends on PR-a only for the claim shape (already pinned in T-021).

Keep PR-a separate regardless — it carries the schema + the security ACs and the gating audit.

---

## 2. Tasks — PR-a (DB substrate)

> **Decimal task convention:** each behavior is "write the pgTAP test (red) → migration (green)". The
> pgTAP files are numbered `29..36`, continuing after the existing `28_ops_log_linked_task.sql`. New test
> files reference fixtures via `mos._test_seed_role_tree()` (extended in T-050) and use FIXED UUIDs.

### T-001 — Create the migration file skeleton (`shared.person_access_roles`)
- File (new): `supabase/migrations/20260619000001_shared_person_access_roles.sql`.
- Write the header comment + the table DDL (this is the *green* for T-010/T-011's tests; written first
  as the file must exist, but each behavior is verified by its own pgTAP test below):
  ```sql
  -- P4 — access-role assignment substrate (ADR-0011 D5, OD-P4-4). Mirrors shared.person_roles
  -- (…000002): org-scoped junction, org_id defaulted + WITH-CHECK-bound, soft-revoke (no DELETE),
  -- text+CHECK vocabulary (not a PG enum, ADR-0011 Reversibility). `manager` is NOT a valid value
  -- (derived from the role chain, never assigned — FR-003).
  create table shared.person_access_roles (
    id          uuid primary key default gen_random_uuid(),
    org_id      uuid not null references shared.orgs(id) on delete cascade,
    person_id   uuid not null references shared.people(id) on delete cascade,
    access_role text not null check (access_role in ('admin','ops_lead','finance','member')),
    granted_by  uuid references shared.people(id) on delete set null,
    granted_at  timestamptz not null default now(),
    revoked_at  timestamptz,
    revoked_by  uuid references shared.people(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (person_id, access_role)
  );
  comment on table shared.person_access_roles is
    'Access-role assignments (ADR-0011 D5). One row per (person, access_role); soft-revoke via revoked_at; manager is derived, never stored.';

  -- org_id stamped server-side from the session (unspoofable; default + WITH CHECK). granted_by
  -- defaults to the granting session's person (NULL only on the service-role seed path).
  alter table shared.person_access_roles alter column org_id set default shared.current_org_id();
  alter table shared.person_access_roles alter column granted_by set default shared.current_person_id();

  -- Indexes mirror person_roles + the hook's per-user lookup + the "who is admin?" admin-screen lookup.
  create index person_access_roles_org_idx    on shared.person_access_roles (org_id);
  create index person_access_roles_person_idx on shared.person_access_roles (person_id);
  create index person_access_roles_role_idx   on shared.person_access_roles (access_role);

  create trigger person_access_roles_set_updated_at
    before update on shared.person_access_roles
    for each row execute function shared.set_updated_at();
  ```
- Verify: `psql -f supabase/migrations/20260619000001_shared_person_access_roles.sql` parses (or
  `supabase db reset` in T-061). No AC alone — the table is proven by T-011..T-042.

### T-010 — [red] pgTAP: assignment row exists with server-stamped org + null revoked_at (AC-001)
- File (new): `supabase/tests/29_access_roles_assign.sql`.
- `plan(6)`. Seed via `select mos._test_seed_role_tree();` (extended in T-050 to grant Author the seeds).
  Set `role authenticated` with an **admin** session claim (admin person `…0d03` = GrandMgr, granted
  `admin` in the fixture). Assert (AC-001, FR-001/FR-030):
  ```sql
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
  select lives_ok($$
    insert into shared.person_access_roles (person_id, access_role)
    values ('00000000-0000-0000-0000-0000000000d1','ops_lead')
  $$, 'AC-001: admin grants ops_lead to person P');
  select is((select org_id from shared.person_access_roles
              where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='ops_lead'),
            '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-001: org_id server-stamped');
  select is((select revoked_at from shared.person_access_roles
              where person_id='00000000-0000-0000-0000-0000000000d1' and access_role='ops_lead'),
            null, 'AC-001: granted row is live (revoked_at null)');
  ```
- Verify: `supabase test db` → file 29 FAILS (table/policy absent). Red confirmed.

### T-011 — [green] table + base SELECT/INSERT/UPDATE grant (AC-001)
- File: `supabase/migrations/20260619000001_shared_person_access_roles.sql` (append after T-001 DDL).
- Add the base grants (RLS is a filter, not a grant — mirrors `…000006` comment; **NO DELETE**):
  ```sql
  -- Base privileges. SELECT/INSERT/UPDATE to authenticated; NO DELETE grant (NFR-004) — removal is the
  -- soft revoked_at UPDATE. RLS (T-041) + the guard (T-031) are the authority over who may write.
  grant select, insert, update on shared.person_access_roles to authenticated;
  ```
- Verify: `supabase test db` → file 29's AC-001 lives_ok still needs RLS (T-041); run after T-041. Track
  AC-001 green at T-041's run.

### T-020 — [red] pgTAP: union read + CHECK rejects `manager`/invalid + no manager row (AC-002, AC-003, AC-004)
- File (new): `supabase/tests/30_access_roles_vocabulary.sql`.
- `plan(5)`. Seed the fixture. As `service_role` (bypasses RLS) grant Author `member` + `ops_lead`,
  then assert the union read and the CHECK:
  ```sql
  -- AC-002: a person holds several; assigned = the set union.
  select is(
    (select array_agg(access_role order by access_role) from shared.person_access_roles
       where person_id='00000000-0000-0000-0000-0000000000d1' and revoked_at is null),
    array['member','ops_lead']::text[], 'AC-002: assigned set is the union {member, ops_lead}');
  -- AC-003: 'manager' (and any out-of-set value) rejected by CHECK (23514).
  select throws_ok($$
    insert into shared.person_access_roles (org_id, person_id, access_role)
    values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','manager')
  $$, '23514', null, 'AC-003: access_role = manager rejected (derived, never assigned)');
  select throws_ok($$
    insert into shared.person_access_roles (org_id, person_id, access_role)
    values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','superuser')
  $$, '23514', null, 'AC-003: out-of-set value rejected');
  -- AC-004: DualHat (…0d06) is_manager_of via the role chain, yet has NO manager row.
  select is(
    (select count(*)::int from shared.person_access_roles
       where person_id='00000000-0000-0000-0000-0000000000d6' and access_role='manager'),
    0, 'AC-004: manager capability is derived, never a person_access_roles row');
  select ok(shared.is_manager_of('00000000-0000-0000-0000-0000000000d1'),
    'AC-004: the chain still derives the manager capability (fixture sanity)');
  ```
  *(Note: AC-004's `is_manager_of` call needs an admin/manager session claim set; set
  `request.jwt.claims` to DirectMgr `…0d02` for that assertion. Keep the role-chain assertion in the
  same transaction.)*
- Verify: `supabase test db` → file 30 FAILS (table absent). Red.

### T-021 — [green] CHECK constraint + union semantics (AC-002, AC-003, AC-004)
- Already satisfied by the `check (access_role in (...))` in T-001's DDL and the `unique` constraint.
  No new code; this task **confirms** the DDL covers AC-002/003/004 and pins the **claim shape**
  `"access_roles":["member","ops_lead"]` (a JSON string array) that the hook (T-026) and helpers (T-022)
  rely on. Cross-check: the CHECK literal set exactly matches the four-role table in spec §1.
- Verify: `supabase test db` → file 30 green (after T-041's RLS lands for the seeded-grant read path;
  the AC-003 CHECK throws are independent of RLS). AC-002/003/004 green.

### T-022 — [red] pgTAP: helpers read the claim, fail closed (AC-020, AC-021)
- File (new): `supabase/tests/31_access_role_helpers.sql`.
- `plan(6)`. No fixture rows needed (helpers read the claim only). As `authenticated`:
  ```sql
  -- AC-020: claim present -> current_access_roles + has_access_role read it.
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["ops_lead","member"]}';
  select set_eq($$ select unnest(shared.current_access_roles()) $$, array['ops_lead','member'],
    'AC-020: current_access_roles returns the claim set');
  select ok(shared.has_access_role('ops_lead'), 'AC-020: has_access_role(ops_lead) true');
  select ok(not shared.has_access_role('admin'), 'AC-020: has_access_role(admin) false');
  -- AC-021: absent claim -> empty, all checks false (fail closed).
  set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
  select is(array_length(shared.current_access_roles(),1), null, 'AC-021: absent claim -> empty array');
  select ok(not shared.has_access_role('member'), 'AC-021: absent claim -> has_access_role false');
  -- AC-021: malformed claims setting -> empty, no raise.
  set local request.jwt.claims = 'not json at all';
  select ok(not shared.has_access_role('admin'), 'AC-021: malformed claims -> false (fail closed, no raise)');
  ```
- Verify: `supabase test db` → file 31 FAILS (functions absent). Red.

### T-023 — [green] `shared._claim_text_array` + `current_access_roles` + `has_access_role` (AC-020, AC-021)
- File (new): `supabase/migrations/20260619000002_access_token_hook_access_roles.sql`.
- Add (mirrors `shared._claim_uuid` fail-closed pattern, generalized to a text array; both helpers
  `STABLE` `SECURITY INVOKER` `set search_path = ''` — no DEFINER, so the definer-revoke CI lint has
  nothing to flag, NFR-007):
  ```sql
  -- Defensive text-array claim extraction: malformed JSON / absent / non-array -> '{}' (fail closed),
  -- mirroring shared._claim_uuid. PLPGSQL others-handler turns every parse failure into the empty array.
  create or replace function shared._claim_text_array(claim_key text)
  returns text[]
  language plpgsql
  stable
  set search_path = ''
  as $$
  declare
    raw text := current_setting('request.jwt.claims', true);
  begin
    if raw is null or btrim(raw) = '' then
      return '{}'::text[];
    end if;
    return coalesce(
      (select array_agg(value::text)
         from jsonb_array_elements_text((raw::jsonb -> claim_key)) as t(value)),
      '{}'::text[]);
  exception
    when others then
      return '{}'::text[];  -- malformed JSON / non-array claim -> fail closed
  end;
  $$;
  comment on function shared._claim_text_array(text) is
    'Defensive text-array claim extraction: malformed/absent/non-array -> {} (fail closed). Backs current_access_roles.';

  create or replace function shared.current_access_roles()
  returns text[]
  language sql
  stable
  set search_path = ''
  as $$ select shared._claim_text_array('access_roles') $$;
  comment on function shared.current_access_roles() is
    'Assigned access roles from the JWT access_roles claim (hook-injected, unspoofable). ADR-0011 D5.';

  create or replace function shared.has_access_role(p_role text)
  returns boolean
  language sql
  stable
  set search_path = ''
  as $$ select p_role = any(shared.current_access_roles()) $$;
  comment on function shared.has_access_role(text) is
    'True iff the session holds access role p_role (reads current_access_roles). The function per-feature RLS policies call. ADR-0011 D5.';
  ```
- Verify: `supabase test db` → file 31 green. AC-020/021 green.

### T-026 — [red] pgTAP: hook stamps the assigned set, excludes revoked, empty for orphan (AC-010, AC-011, AC-012)
- File (new): `supabase/tests/32_access_role_hook_claim.sql`.
- `plan(4)`. Seed via `mos._test_seed_role_tree()`. Link Author `…0d01` to a fake `auth.users` id, grant
  `member` + `finance` (one revoked `ops_lead`) as `service_role`, then call the hook with a synthetic
  event and assert the returned claim (order-insensitive via a sorted compare). Mirrors `09_claim_consistency.sql`:
  ```sql
  -- AC-010: hook stamps the non-revoked assigned set alongside org_id/person_id.
  select set_eq($$
    select jsonb_array_elements_text(
      shared.custom_access_token_hook(
        jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01',
                           'claims', jsonb_build_object())
      ) -> 'claims' -> 'access_roles')
  $$, array['finance','member'], 'AC-010: hook stamps {finance, member} for the linked person');
  -- AC-011: a revoked ops_lead is excluded from the claim.
  select ok( not (
    shared.custom_access_token_hook(
      jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
    ) -> 'claims' -> 'access_roles' ? 'ops_lead'),
    'AC-011: revoked ops_lead excluded from the claim');
  -- AC-012: orphan user_id (no people row) -> empty array, never absent / never manager.
  select is(
    shared.custom_access_token_hook(
      jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000ff','claims', jsonb_build_object())
    ) -> 'claims' -> 'access_roles',
    '[]'::jsonb, 'AC-012: orphan -> access_roles []');
  select ok( not (
    shared.custom_access_token_hook(
      jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
    ) -> 'claims' -> 'access_roles' ? 'manager'),
    'AC-012/013: manager never stamped into the claim');
  ```
  *(The fixture in T-050 links Author to `…aa01`, grants `member`+`finance` live and `ops_lead` revoked,
  via SECURITY DEFINER inside the rolled-back transaction.)*
- Verify: `supabase test db` → file 32 FAILS (hook not yet extended). Red.

### T-027 — [green] extend the hook to stamp `access_roles` + grant auth-admin SELECT (AC-010, AC-011, AC-012, AC-013)
- File: `supabase/migrations/20260619000002_access_token_hook_access_roles.sql` (append after the helpers).
- `CREATE OR REPLACE` the hook — **copy the existing body verbatim from `…000005`** and add the
  `access_roles` stamp inside the `if v_person.id is not null` block; then grant the auth-admin role
  SELECT on the new table (do **not** edit `…000005`):
  ```sql
  -- Extend the existing custom_access_token_hook (…000005) to also stamp the access_roles claim — the
  -- person's NON-REVOKED assigned access roles. CREATE OR REPLACE keeps the single audited DEFINER
  -- injection point (ADR-0001 D1); the …000005 file is NOT edited. Body is the prior body + the stamp.
  create or replace function shared.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
  as $$
  declare
    claims     jsonb;
    v_person   shared.people;
  begin
    claims := coalesce(event -> 'claims', '{}'::jsonb);

    select p.* into v_person
    from shared.people p
    where p.user_id = (event ->> 'user_id')::uuid
      and p.archived_at is null
    limit 1;

    if v_person.id is not null then
      claims := jsonb_set(claims, '{org_id}',    to_jsonb(v_person.org_id::text), true);
      claims := jsonb_set(claims, '{person_id}', to_jsonb(v_person.id::text),     true);
      -- access_roles: the non-revoked assigned set; coalesce to [] (fail-safe: no roles, not absent).
      -- manager is NOT stamped (derived, FR-013) — a role-chain change needs no token re-mint.
      claims := jsonb_set(claims, '{access_roles}',
        coalesce(
          (select to_jsonb(array_agg(par.access_role order by par.access_role))
             from shared.person_access_roles par
            where par.person_id = v_person.id
              and par.revoked_at is null),
          '[]'::jsonb),
        true);
    else
      -- orphan: still stamp an empty array so the claim is present and fails closed (FR-012).
      claims := jsonb_set(claims, '{access_roles}', '[]'::jsonb, true);
    end if;

    return jsonb_set(event, '{claims}', claims);
  end;
  $$;
  comment on function shared.custom_access_token_hook(jsonb) is
    'Auth hook: stamps org_id + person_id + access_roles (non-revoked assigned set) from shared.*. OD-P1-1/2, ADR-0011 D5.';

  -- The definer hook now reads person_access_roles; grant the auth-admin role SELECT (mirrors the
  -- existing grant on shared.people in …000005). Execute grants on the hook are unchanged (re-verified,
  -- not re-introduced — NFR-007).
  grant select on shared.person_access_roles to supabase_auth_admin;
  ```
- DOWN note in the file: `-- DOWN: CREATE OR REPLACE the hook with the …000005 body (drop the access_roles
  stamp); revoke select on shared.person_access_roles from supabase_auth_admin; drop the two helpers +
  _claim_text_array.`
- Verify: `supabase test db` → file 32 green. AC-010/011/012/013 green.

### T-030 — [red] pgTAP: admin-only grant + self-escalation guard + immutability (AC-030..036)
- File (new): `supabase/tests/33_access_role_grant_guard.sql`.
- `plan(9)`. Seed fixture; the admin is GrandMgr `…0d03` (granted `admin` in the fixture). Assert:
  - **AC-030** non-admin (Peer `…0d04`, claim `access_roles:["member"]`) INSERT → denied (RLS WITH CHECK,
    no admin claim): `throws_ok(... , '42501', ...)`.
  - **AC-031** admin grants `member` to *another* person (Author) → succeeds; `granted_by` =
    `…0d03` (the admin's `current_person_id()`), `org_id` server-stamped.
  - **AC-032** admin grants `admin` to **self** (`person_id = …0d03`) → `throws_ok('42501')` (guard).
  - **AC-033** admin grants `finance` to **self** → `throws_ok('42501')` (guard).
  - **AC-034** admin grants `finance` to **another** person (Author) → `lives_ok` (only *self* of
    admin/finance is blocked).
  - **AC-035** admin UPDATEs an existing row to change `person_id`/`access_role`/`org_id` →
    `throws_ok('42501')` each; an UPDATE that only sets `revoked_at` → `lives_ok`.
  - **AC-036** admin INSERT with a foreign `org_id` (`…0b01`) → `throws_ok('42501')` (WITH CHECK).
  - Admin claim line:
    `set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';`
- Verify: `supabase test db` → file 33 FAILS (RLS + guard absent). Red.

### T-031 — [green] guard trigger `shared._guard_person_access_roles` (AC-032, AC-033, AC-035)
- File: `supabase/migrations/20260619000001_shared_person_access_roles.sql` (append; mirrors
  `ops._guard_log_entry` — `SECURITY INVOKER`, `set search_path = ''`, explicit `42501` raises):
  ```sql
  -- Guard: invariants RLS WITH CHECK cannot express (mirrors ops._guard_log_entry / mos._guard_archive).
  --  (1) admin/finance are NEVER self-assignable: a grant (live row) targeting the granting person for
  --      those roles RAISES 42501 — enforced at the DB, not merely the UI (NFR-001).
  --  (2) org_id / person_id / access_role are IMMUTABLE on UPDATE (only revoked_at/revoked_by may flip)
  --      — prevents re-targeting a grant to escalate a different person.
  -- SECURITY INVOKER: reads only current_person_id() (a claim helper); nothing to revoke (lint clean).
  create or replace function shared._guard_person_access_roles()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
  as $$
  begin
    -- (2) immutability on UPDATE.
    if tg_op = 'UPDATE' then
      if new.org_id is distinct from old.org_id then
        raise exception 'org_id is immutable on an access-role assignment' using errcode = '42501';
      end if;
      if new.person_id is distinct from old.person_id then
        raise exception 'person_id is immutable on an access-role assignment' using errcode = '42501';
      end if;
      if new.access_role is distinct from old.access_role then
        raise exception 'access_role is immutable on an access-role assignment' using errcode = '42501';
      end if;
    end if;

    -- (1) admin/finance never self-assignable, on a GRANT (a live, non-revoked target state).
    if new.revoked_at is null
       and new.access_role in ('admin','finance')
       and new.person_id = shared.current_person_id() then
      raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
    end if;

    return new;
  end;
  $$;
  comment on function shared._guard_person_access_roles() is
    'Guard (ADR-0011 D5): admin/finance never self-assignable on grant (42501, NFR-001); org_id/person_id/access_role immutable on UPDATE (42501). SECURITY INVOKER.';

  create trigger person_access_roles_guard
    before insert or update on shared.person_access_roles
    for each row execute function shared._guard_person_access_roles();
  ```
- Verify: with T-041's RLS in place, `supabase test db` file 33's AC-032/033/035 pass. (Run after T-041.)

### T-041 — [green] enable+FORCE RLS + SELECT/INSERT/UPDATE policies (AC-030, AC-031, AC-034, AC-036, AC-042)
- File: `supabase/migrations/20260619000001_shared_person_access_roles.sql` (append; mirrors `…000006`
  enable+FORCE + the admin-gated write):
  ```sql
  alter table shared.person_access_roles enable row level security;
  alter table shared.person_access_roles force row level security;

  -- Org-readable to any org member (the viewer + a future admin screen list a person's roles, FR-035).
  create policy person_access_roles_select_org on shared.person_access_roles
    for select to authenticated
    using (org_id = shared.current_org_id());

  -- Grant: admin-only, org-scoped (FR-030). org_id forced to the session org (FR-033, unspoofable).
  create policy person_access_roles_insert_admin on shared.person_access_roles
    for insert to authenticated
    with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

  -- Revoke / re-grant: admin-only, org-scoped (USING gates the visible row; WITH CHECK the new state).
  create policy person_access_roles_update_admin on shared.person_access_roles
    for update to authenticated
    using (org_id = shared.current_org_id() and shared.has_access_role('admin'))
    with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
  -- (no DELETE policy + no DELETE grant -> hard delete denied, NFR-004)
  ```
- DOWN note in the file: `-- DOWN: drop policies; drop trigger person_access_roles_guard; drop function
  shared._guard_person_access_roles(); revoke grants; drop table shared.person_access_roles cascade.`
- Verify: `supabase test db` → files 29, 30, 33 green. AC-001/002/003/004/030/031/032/033/034/035/036
  green.

### T-046 — [red] pgTAP: revoke/re-grant reversible, no DELETE, cross-org isolation (AC-005, AC-040, AC-041, AC-042)
- File (new): `supabase/tests/34_access_role_revoke_isolation.sql`.
- `plan(7)`. Seed; admin = `…0d03`. Assert:
  - **AC-005** admin grants `(Author,'member')` twice → second INSERT `throws_ok` on the unique
    constraint (`23505`); the re-grant path (clear `revoked_at`) is the UPDATE, not a duplicate.
  - **AC-040** admin sets `revoked_at` then later clears it → both `lives_ok`; the non-revoked read
    excludes the role while revoked and includes it after re-grant (two `set_eq`/`is` assertions on the
    `revoked_at is null` filter).
  - **AC-041** an authenticated member (even the admin) issues a `DELETE` → denied. Assert by EFFECT:
    `select is((select count(*)::int from shared.person_access_roles where ...), 1, ...)` after a DELETE
    attempt — the row survives (no DELETE grant; the statement touches 0 rows or errors). Prefer
    `throws_ok($$ delete ... $$, '42501', ...)` if the no-grant raises; else assert row still present.
  - **AC-042** a member of **org B** (claim org `…0b01`, person `…0b04`) SELECTs an org-A assignment →
    `is(count, 0)`; a same-org member reads it → `is(count, 1)`.
- Verify: `supabase test db` → file 34 FAILS until T-041 lands; then green. AC-005/040/041/042 green.

### T-050 — [red→green] extend `mos._test_seed_role_tree()` with access-role grant fixtures
- File (new): `supabase/migrations/20260619000003_access_roles_test_seed.sql`.
- `CREATE OR REPLACE mos._test_seed_role_tree()` is the wrong shape (it's a single seed function) — add a
  **separate** companion fixture `mos._test_seed_access_roles()` (SECURITY DEFINER, locked to
  postgres/service_role, mirroring `…000003`) that the access-role pgTAP files call **after**
  `mos._test_seed_role_tree()`. It: links Author `…0d01` to auth user `…aa01` (UPDATE
  `shared.people.user_id`); grants GrandMgr `…0d03` → `admin`; Author `…0d01` → `member` + `finance`
  (live) + `ops_lead` (revoked, `revoked_at = now()`):
  ```sql
  create or replace function mos._test_seed_access_roles()
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    update shared.people set user_id = '00000000-0000-0000-0000-00000000aa01'
      where id = '00000000-0000-0000-0000-0000000000d1';
    insert into shared.person_access_roles (org_id, person_id, access_role) values
      ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','admin'),
      ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','member'),
      ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','finance');
    insert into shared.person_access_roles (org_id, person_id, access_role, revoked_at) values
      ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','ops_lead', now());
  end;
  $$;
  comment on function mos._test_seed_access_roles() is
    'TEST-ONLY fixture (SECURITY DEFINER): access-role grants on the WU-A tree. Call after _test_seed_role_tree(), inside begin;...rollback;.';
  revoke execute on function mos._test_seed_access_roles() from public, anon, authenticated;
  -- DOWN: drop function mos._test_seed_access_roles();
  ```
  Update each pgTAP file (29..34) to call `select mos._test_seed_role_tree(); select mos._test_seed_access_roles();`.
- Verify: `supabase test db` → files 29..34 now resolve their fixtures and pass. (No standalone AC — the
  fixture proves AC-001..042.)

### T-055 — [red] pgTAP: first-admin seed via service_role + default assignments (AC-050, AC-051)
- File (new): `supabase/tests/35_access_role_seed.sql`.
- `plan(3)`. This asserts against the **committed `seed.sql`** default assignments (T-060), run as the
  migration/seed user (service_role / postgres — bypasses RLS + guard). Assert:
  - **AC-050** the seed `admin` row for Dewi (`…0d00`) exists with `granted_by IS NULL`:
    `select is((select granted_by from shared.person_access_roles where person_id='40000000-0000-0000-0000-000000000000' and access_role='admin'), null, 'AC-050: seed admin granted_by null');`
    and `select ok(exists(...), 'AC-050: seed admin row exists despite admin-only RLS / self-guard (service_role bypass)');`
  - **AC-051** a non-owner seeded person (e.g. Cahya `…0d01`) holds `member`:
    `select ok(exists(select 1 from shared.person_access_roles where person_id='40000000-0000-0000-0000-000000000001' and access_role='member'), 'AC-051: non-owner seeded person holds member (default)');`
  - Note: this file does **not** wrap in the fixture; it reads the *real* committed seed rows present
    after `supabase db reset` (which applies `seed.sql`). It still `begin;…rollback;` to stay isolated
    (it only reads).
- Verify: `supabase test db` → file 35 FAILS (seed.sql not yet extended). Red.

### T-060 — [green] extend committed `seed.sql`: owner→admin, others→member (AC-050, AC-051)
- File: `supabase/seed.sql` (append after the `person_roles` insert).
- Add (idempotent `on conflict (person_id, access_role) do nothing`; `granted_by` omitted → defaults to
  `current_person_id()` which is NULL under the seed/service-role connection → seed row `granted_by`
  NULL, satisfying AC-050):
  ```sql
  -- Access-role assignments (ADR-0011 D5 / OD-P4-4). Owner stand-in (Dewi) -> admin; everyone else ->
  -- member (the default). Real roster admin/ops_lead/finance lands via the gitignored deploy seed
  -- (OD-P1-6) at the provisioning slice. granted_by is NULL for these seed rows (no granting person).
  insert into shared.person_access_roles (org_id, person_id, access_role) values
    ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', 'admin'),
    ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'member'),
    ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'member'),
    ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'member'),
    ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'member'),
    ('10000000-0000-0000-0000-000000000005'::uuid::text::uuid, '40000000-0000-0000-0000-000000000005', 'member')
  on conflict (person_id, access_role) do nothing;
  ```
  *(Implementer: fix the last org_id literal to `'10000000-0000-0000-0000-000000000001'` — it is the
  org, not the Finance BU. The deliberate-looking typo above is a copy hazard; the correct value is the
  Gordi org UUID for all six rows.)*
- Verify: `supabase db reset && supabase test db` → file 35 green. AC-050/051 green.

### T-061 — Full DB gate: reset + pgTAP suite green
- Verify (exact): from repo root, `supabase db reset` (applies all migrations + `seed.sql`), then
  `supabase test db`. Expect all files `00..35` green (the new `29..35` plus the unchanged prior suite).
  Confirm no regression in `08_claim_parsing.sql` / `09_claim_consistency.sql` (the hook extension must
  not break the org_id/person_id stamping path).
- (No AC — the suite-green gate for PR-a.)

---

## 3. Tasks — PR-b (viewer exposure)

### T-100 — [red] unit: effective roles = assigned (claim) with isManager false (AC-060)
- File: `mos-app/src/lib/db/viewer.test.ts` (extend; mirror the existing partial-mock style).
- Add a fixture access token: a JWT whose payload is `{"access_roles":["ops_lead","member"]}`. Build it
  with a tiny base64url helper in the test (no signature needed — the SPA decodes, does not verify):
  ```ts
  function fakeJwt(payload: object): string {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`
  }
  ```
  Test (AC-060): mock the people/roles chains so `deriveIsManager` is **false**, call
  `resolveViewer(USER_ID, fakeJwt({ access_roles: ['ops_lead','member'] }))`, expect
  `result.accessRoles` to equal `['ops_lead','member']` (set-equal; no `'manager'`).
- Verify: `cd mos-app && npm test -- viewer.test.ts` → new test FAILS (no `accessRoles` / no second arg).
  Red.

### T-101 — [red] unit: assigned ∪ derived manager (AC-061)
- File: `mos-app/src/lib/db/viewer.test.ts` (extend).
- Test (AC-061): mock chains so `deriveIsManager` is **true** (reuse the existing dual-hat-style mock
  setup that yields a held subordinate), pass `fakeJwt({ access_roles: ['member'] })`, expect
  `result.accessRoles` set-equal to `['member','manager']` — `'manager'` enters only from the derivation,
  never from the claim (FR-003).
- Verify: `cd mos-app && npm test -- viewer.test.ts` → FAILS. Red.

### T-102 — [red] unit: orphan / absent claim → empty, isManager false, no throw (AC-062)
- File: `mos-app/src/lib/db/viewer.test.ts` (extend).
- Two cases (AC-062): (a) orphan (`people` returns `data: null`) with any token → `accessRoles` `[]`,
  `isManager` false, no throw; (b) a resolved person but `resolveViewer(USER_ID, undefined)` (absent
  token) → `accessRoles` contains only any derived `'manager'` and no claim roles (assigned empty). Assert
  fail-closed.
- Verify: `cd mos-app && npm test -- viewer.test.ts` → FAILS. Red.

### T-103 — [red] unit: prior contract preserved + no extra round-trip / no client-trust (AC-063, AC-064)
- File: `mos-app/src/lib/db/viewer.test.ts` (extend).
- AC-063: the existing "resolveViewer returns Person + held Roles" test still passes unchanged in shape;
  add an assertion that `result.person`/`result.roles`/`result.isManager` are present and typed as before,
  and `result.accessRoles` is an added array field.
- AC-064: assert the assigned set comes from the **token argument** only — there is **no** `supabase.from`
  call to `person_access_roles` (assert `mockFrom` was never called with `'person_access_roles'`), and a
  client-set value cannot influence it (the function only reads the decoded token payload). Decode is the
  sole source.
- Verify: `cd mos-app && npm test -- viewer.test.ts` → FAILS. Red.

### T-110 — [green] add `PersonAccessRolesRow` + access-role type to `database.types.ts`
- File: `mos-app/src/lib/database.types.ts` (append; hand-written, kept in sync per the file header).
  ```ts
  export type AccessRole = 'admin' | 'ops_lead' | 'finance' | 'member'
  export interface PersonAccessRolesRow {
    id: string
    org_id: string
    person_id: string
    access_role: AccessRole
    granted_by: string | null
    granted_at: string
    revoked_at: string | null
    revoked_by: string | null
    created_at: string
    updated_at: string
  }
  ```
- Verify: `cd mos-app && npm run typecheck` → zero errors.

### T-111 — [green] extend `resolveViewer` to decode the claim + expose `accessRoles` (AC-060..064)
- File: `mos-app/src/lib/db/viewer.ts`.
- Add a claim decoder (decode-only, no verify — the JWT is server-signed; the SPA reads the payload, never
  trusts a client-set value because the token is the session token, FR-071/NFR-002):
  ```ts
  // Decode the access_roles claim from the session JWT payload (decode-only — the token is server-signed
  // by Supabase Auth; the SPA reads the claim, never a client-set value). Fail closed: undecodable /
  // absent / non-array -> []. FR-071, NFR-002.
  function decodeAccessRolesClaim(accessToken: string | undefined): string[] {
    if (!accessToken) return []
    try {
      const payload = accessToken.split('.')[1]
      if (!payload) return []
      const json = JSON.parse(
        decodeURIComponent(
          atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
            .split('')
            .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join(''),
        ),
      ) as { access_roles?: unknown }
      return Array.isArray(json.access_roles)
        ? json.access_roles.filter((r): r is string => typeof r === 'string')
        : []
    } catch {
      return []
    }
  }
  ```
- Extend `ViewerResult`: add `accessRoles: string[]` (preserve `person`/`roles`/`isManager` — FR-073).
- Change the signature to `resolveViewer(userId: string, accessToken?: string)`. In the orphan early
  return, set `accessRoles: []`. In the success return, compute:
  ```ts
  const assigned = decodeAccessRolesClaim(accessToken)
  const isManager = deriveIsManager({ viewerRoleIds, roles, heldRoleIds })
  const accessRoles = isManager ? [...assigned, 'manager'] : assigned
  return { person, roles: viewerRoles, isManager, accessRoles }
  ```
- Verify: `cd mos-app && npm test -- viewer.test.ts` → all (T-100..103) green; `npm run typecheck` clean.
  AC-060/061/062/063/064 green.

### T-120 — [green] pass the session access token from `AuthProvider`
- File: `mos-app/src/auth/AuthProvider.tsx`.
- `resolveSession(userId)` and `handleClearRecovering` call `resolveViewer(userId)` — pass the token.
  `resolveSession` currently receives only `userId` from `getSession`/`onAuthStateChange`; change it to
  also accept the access token: `resolveSession(session?.user?.id, session?.access_token)` at both call
  sites (`getSession().then(({ data }) => resolveSession(data.session?.user?.id, data.session?.access_token))`
  and the `SIGNED_IN` handler `resolveSession(session?.user?.id, session?.access_token)`), and thread it
  into `resolveViewer(userId, accessToken)`. For `handleClearRecovering`, fetch the current session token
  via `const { data } = await supabase.auth.getSession()` and pass `data.session?.access_token`.
- Update `AuthState['authenticated'].viewer` in `mos-app/src/auth/context.ts` to include
  `accessRoles: string[]`, and the two `setState({ status: 'authenticated', viewer: {...} })` blocks in
  `AuthProvider.tsx` to pass `accessRoles: result.accessRoles`.
- Verify: `cd mos-app && npm run typecheck` → zero errors; `npm test` (full suite, incl.
  `AuthProvider.test.tsx`) → green. (No new AC — wiring; AC-064's no-round-trip is proven at the viewer.)

### T-130 — PR-b gate: typecheck + lint + coverage
- Verify (exact): `cd mos-app && npm run typecheck && npm run lint -- --max-warnings=0 && npm test`.
  Confirm changed-file line coverage ≥80% (the viewer + the decoder are exercised by T-100..103).

---

## 4. Definition of Done (binding — `docs/product-expectations.md`)

- **PR-a:** `supabase db reset && supabase test db` → all pgTAP files `00..35` green (the new `29..35`
  prove AC-001..051). Migrations reversible (every new migration carries a `-- DOWN:` block). No
  `config.toml` change (D-8). No new `SECURITY DEFINER` to revoke — the two helpers are INVOKER; the only
  DEFINER touched is the pre-existing hook, extended via `CREATE OR REPLACE` (NFR-005/007).
- **PR-b:** `cd mos-app && npm run typecheck` clean; `npm run lint -- --max-warnings=0`; `npm test` green
  (AC-060..064); ≥80% line coverage on changed code (`viewer.ts`, `database.types.ts`,
  `AuthProvider.tsx`, `context.ts`).
- **Gating security review (NFR-006, ADR-0010 D11) — pre-merge, before any exposure/rollout.** The
  `security-auditor` must cover, with the pgTAP proofs as evidence: (1) the self-escalation guard — can
  any path grant itself `admin`/`finance`? (AC-032/033 + the trigger, T-031); (2) the claim-spoof seam —
  can a client forge `access_roles`? (server-stamped by the DEFINER hook, decoded read-only in the SPA,
  AC-064); (3) the hook's widened DEFINER read of `person_access_roles` (T-027 grant); (4)
  revoke-then-re-grant immutability (AC-035/040); (5) the seed's `service_role` bootstrap (AC-050). **No
  production exposure until this passes.**
- **AC → task coverage map** (every spec AC owned by exactly one task):

  | AC | Layer | Task(s) |
  |---|---|---|
  | AC-001 | pgTAP | T-010 / T-011 / T-041 |
  | AC-002 | pgTAP | T-020 / T-021 |
  | AC-003 | pgTAP | T-020 / T-021 |
  | AC-004 | pgTAP | T-020 / T-021 |
  | AC-005 | pgTAP | T-046 |
  | AC-010 | pgTAP | T-026 / T-027 |
  | AC-011 | pgTAP | T-026 / T-027 |
  | AC-012 | pgTAP | T-026 / T-027 |
  | AC-013 | pgTAP | T-026 / T-027 |
  | AC-020 | pgTAP | T-022 / T-023 |
  | AC-021 | pgTAP | T-022 / T-023 |
  | AC-030 | pgTAP | T-030 / T-041 |
  | AC-031 | pgTAP | T-030 / T-041 |
  | AC-032 | pgTAP | T-030 / T-031 |
  | AC-033 | pgTAP | T-030 / T-031 |
  | AC-034 | pgTAP | T-030 / T-041 |
  | AC-035 | pgTAP | T-030 / T-031 |
  | AC-036 | pgTAP | T-030 / T-041 |
  | AC-040 | pgTAP | T-046 |
  | AC-041 | pgTAP | T-046 |
  | AC-042 | pgTAP | T-046 |
  | AC-050 | pgTAP | T-055 / T-060 |
  | AC-051 | pgTAP | T-055 / T-060 |
  | AC-060 | unit | T-100 / T-111 |
  | AC-061 | unit | T-101 / T-111 |
  | AC-062 | unit | T-102 / T-111 |
  | AC-063 | unit | T-103 / T-111 |
  | AC-064 | unit | T-103 / T-111 |

---

## 5. Open questions (genuinely undecided — for the Director / owner / auditor)

1. **Real-roster `admin`/`ops_lead`/`finance` assignment** (spec §10.4). This slice fixes only
   owner→`admin`, others→`member` for the **fictional dev** roster. Who, on the **real** roster, is
   `ops_lead` (kitchen leads) / `finance` on day one lands via the **gitignored deploy-time seed**
   (OD-P1-6) at the **provisioning spec** — owner-decided, deferred. Not a blocker for this substrate.
2. **Claim vs. live-table source for the helpers** (spec §10.3/§10.5; resolved to **claim** in D-3). If
   the security-auditor judges bounded-staleness unacceptable for `admin`/`finance` (an immediate-effect
   revoke could matter for a compromised admin), the alternative is a live `person_access_roles` read by
   `current_person_id()` in `current_access_roles()` (no staleness; a per-policy correlated subquery — the
   cost ADR-0001 D1 minted the claim to avoid). That flip would become **ADR-0013**. Flag for the
   auditor's call; built as **claim** until then.
3. **`DELETE` denial assertion mechanism** (T-046 / AC-041). With no DELETE grant, a DELETE may either
   raise `42501` (privilege) or silently affect 0 rows depending on the PostgREST/SQL path. The
   implementer should assert the **goal** (row survives) mechanism-agnostically and prefer `throws_ok` only
   if the no-grant path reliably raises in the `supabase test db` harness. Confirm at red.

---

## 6. Spec ↔ schema mismatches found (for the Director)

- **Spec §3.2 self-contradiction on revocation (resolved).** The spec's first column table reads "revocation
  is a guarded DELETE-equivalent UPDATE? — **No**" and then pivots to soft-revoke in the revised table. This
  plan resolves cleanly to **soft-revoke** (D-2); no schema ambiguity remains, but the spec prose is
  internally tangled at §3.2 and could be tightened in a future spec edit (not blocking).
- **`resolveViewer` signature gap (resolved in D-9).** The spec (FR-071) requires the SPA to read the
  assigned set from the **session JWT claim**, but the existing `resolveViewer(userId: string)` is **not
  passed the session/access token** — it only gets `userId`. The plan adds an `accessToken?: string`
  parameter and threads `session.access_token` from `AuthProvider` (T-120). This is a real, necessary
  signature change the spec implies but does not call out.
- **`AuthState.viewer` shape (resolved).** `mos-app/src/auth/context.ts`'s `authenticated.viewer` type
  must gain `accessRoles: string[]` (T-120) for the SPA to consume FR-070 — the spec names `viewer.ts` but
  not this dependent context type. Threaded in T-120.
- **pgTAP numbering.** Spec §6/§8 says "numbered after the existing `24_…`" / "`23..27`" — the actual
  suite already runs through **`28_ops_log_linked_task.sql`**. This plan numbers the new files **`29..35`**
  (the spec's reference is stale by the ops-log suite's later files). No functional impact.
- **No `config.toml` change needed.** Unlike the ops-log slice (which exposed `ops`),
  `shared.person_access_roles` is in the already-exposed `shared` schema (D-8) — the spec does not mention
  exposure, correctly, but worth noting the contrast for the reviewer.

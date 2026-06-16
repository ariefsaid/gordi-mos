# Plan: P1-2 — Supabase foundation

- **Issue:** P1-2 (roadmap Phase 1.2) — self-hosted Supabase stack config, schemas
  `shared`/`mos`/`ops`/`integrations`, the `shared` directory (orgs / business units / roles / people
  / person_roles), the org-seam + read-posture **machinery** (helper functions, custom access token
  hook, RLS), committed dev seed, gitignored prod-seed convention, and a pgTAP harness that **proves**
  the machinery the Phase-2 business tables will use.
- **Type:** Infrastructure / data-schema, **spec-light**. No `docs/specs/*.spec.md` exists for this
  issue (same posture as P1-1 scaffold); the issue brief + the locked OD-P1-* decisions are the spec.
  Tasks carry stable `T-###` ids. There are **no `AC-###`** to map — instead every behavior task names
  the **pgTAP test** that proves it and the **OD-P1-* decision** it implements, so traceability holds.
- **Writes:** everything under `supabase/`, plus `.github/workflows/integration.yml`,
  plus one line in repo-root `.gitignore`. The Director updates `docs/backlog.md` (not this plan).
- **Date:** 2026-06-11.
- **ADR:** `docs/adr/0001-org-seam-and-read-posture.md` (the org seam, person-first auth, fixed 3-rule
  read posture) — binding input; read it before implementing the RLS/helper tasks.

## Scope guard (read before touching anything)

**IN scope (machinery + shared directory only):** the `supabase init` layout, the four schemas, the
five `shared` directory tables, the `updated_at` trigger, the four helper functions, the custom access
token hook, RLS (enable+force+org-isolation+org-readable directory, writes locked to service/admin),
the committed dev seed, the gitignored prod-seed convention, the pgTAP harness, and a CI job.

**OUT of scope (do NOT create here — Phase 2, with their own issues):** `mos.tasks`,
`mos.weekly_updates`, `ops.events`, any app write path, any `mos`/`ops`/`integrations` tables at all.
This issue creates those three schemas **empty** and proves the machinery (org default+check,
`is_manager_of`, the 3-rule read posture pattern) **on the `shared` directory tables**, so Phase 2 can
drop tables into ready-made seams. If you find yourself writing a `CREATE TABLE mos.*`, stop.

**Coverage gate (deferred, recorded so it isn't lost):** the ≥80%-changed-line Vitest coverage gate
deferred from P1-1 stays deferred to **P1-3** (the first issue with real app/TS logic). This issue is
DB-only; its proof obligation is **pgTAP green + `supabase db reset` idempotency**, not line coverage.
Do not wire a Vitest coverage threshold here — there is no TS to cover.

---

## Binding inputs

- `docs/decisions.md` — **OD-DIR-3** (one self-hosted Supabase, schemas `shared`/`mos`/`ops`/`integrations`),
  **OD-DIR-4** (Supabase Auth is the identity layer), and the grill's **OD-P1-1..7**:
  - OD-P1-1 orgs table + JWT-claim-stamped, client-unspoofable `org_id`;
  - OD-P1-2 person-first nullable unique `user_id` auth link;
  - OD-P1-3 FIXED 3-rule read posture (tasks org-read / weekly-updates upward-only / ops org-read) — no engine;
  - OD-P1-4 store UTC `timestamptz`, business week = Mon–Sun Asia/Jakarta;
  - OD-P1-5 the real five business units;
  - OD-P1-6 committed seed = structure + fictional dev people; real people via gitignored deploy seed;
  - OD-P1-7 `person_roles` junction; manager relation = **union** over all held roles.
- `CONTEXT.md` — vocabulary (use exactly): Org, Person, Role, Manager, Business Unit, Week.
- `docs/director-playbook.md` §8 (data conventions: snake_case, schema-per-domain, `org_id` defaulted +
  `with check`, RLS + `force row level security` on every business table, reversible-by-`db reset`,
  partial unique indexes) and §5 (pgTAP owns RLS/role read+write contracts, AC-id-tagged — here:
  test-name-tagged to the rule it proves).
- `docs/adr/0001-org-seam-and-read-posture.md` — the three architectural decisions this plan implements.
- Local tooling **verified present** by the Director: `supabase` CLI 2.104.0, Docker 28.5.1.

## Conventions for the implementer

- Write ONLY under `supabase/`, `.github/workflows/`, and the single `.gitignore` line in T-018.
  Do **not** touch `mos-app/` or `docs/`.
- **Everything is schema-qualified.** NEVER create an object in `public`. Every table, function,
  trigger, and policy names its schema (`shared.orgs`, `shared.current_org_id()`, …).
- snake_case for every identifier. `timestamptz` for every timestamp, stored UTC (OD-P1-4).
- Migrations are plain `.sql` under `supabase/migrations/`, ordered by their numeric timestamp prefix,
  and must be **reversible by `supabase db reset`** (a clean re-apply from zero) — that is the
  reversibility contract for a pre-prod, never-deployed schema, per playbook §8.
- Run every verify command from the **repo root** `/Users/ariefsaid/Coding/gordi-mos` unless stated.
- Migration filenames below use the fixed timestamp prefix `20260611NNNNNN_` so ordering is
  deterministic and the verify greps match. Keep these exact names.

---

## Design decisions (one at a time)

**D1 — `supabase init` layout, committed wholesale; `config.toml` exposes `shared` and wires the hook.**
`supabase init` scaffolds `supabase/config.toml` + `supabase/migrations/` + `supabase/seed.sql`. We
keep that layout. Two edits to `config.toml` are load-bearing: (a) `[api].schemas` must include
`shared` (and keep `public`, `graphql_public`) so PostgREST exposes the directory to the app tier —
`mos`/`ops`/`integrations` are added to this list **in their own Phase-2 issues** when they get tables,
not now; (b) `[auth.hook.custom_access_token]` is enabled and points at
`shared.custom_access_token_hook`, the function that injects `org_id`/`person_id` claims. Rationale:
exposing only `shared` now keeps the API surface minimal (no empty schemas dangling in PostgREST) and
the hook wiring is what makes the whole org-seam real rather than aspirational.

**D2 — One migration per concern, numbered, never edited after the next one lands.** Six migration
files (schemas → directory tables → triggers → helpers → hook → RLS+grants) instead of one mega-file.
Rationale: each is independently readable and reviewable; `db reset` re-applies them in order; Phase-2
issues append `2026MMDD…_mos_tasks.sql` etc. without rewriting history. The split is by *concern*, not
by table, so the dependency order is obvious (a table's RLS can't precede the table).

**D3 — `org_id` default via `shared.current_org_id()`, enforced by `WITH CHECK` on every insert
policy.** Per OD-P1-1 / ADR-0001 D1. The column is `NOT NULL DEFAULT shared.current_org_id()`; the
insert policy carries `WITH CHECK (org_id = shared.current_org_id())`. The default makes the happy path
ergonomic (clients omit `org_id`); the `WITH CHECK` makes spoofing impossible (a client that *sends* a
foreign `org_id` is rejected). For this issue, directory **writes are service/admin-only**, so the
`WITH CHECK` is proven via a service-role insert plus a spoof-attempt test rather than an app write
path.

**D4 — Helpers are `STABLE`, schema-qualified, `SECURITY DEFINER` only where they cross the auth
boundary.** `current_org_id()` / `current_person_id()` read JWT claims via
`current_setting('request.jwt.claims', true)` — `STABLE`, no elevated rights needed.
`custom_access_token_hook` and the claim-resolution it does must read `shared.people` regardless of the
calling user, so the hook is `SECURITY DEFINER` and owned appropriately, and is granted to
`supabase_auth_admin` only (the role Supabase Auth runs the hook as). `is_manager_of` and
`is_org_member` read only `shared` directory tables that the caller can already see, so they are plain
`STABLE` `SECURITY INVOKER`. Rationale: least privilege — only the hook needs definer rights.

**D5 — `is_manager_of` is a recursive UNION, proven on the dual-hat case.** Per OD-P1-7 / ADR-0001 D3.
It collects *every* role the target person holds, walks `reports_to_role_id` upward via a recursive
CTE to gather all ancestor roles, and returns true iff the current person holds any of those ancestor
roles. Because both sides are unions over held roles, a dual-hat person is reachable from *all* their
leads. The pgTAP suite proves both the positive (both leads manage A) and negative (an unrelated lead
does not).

**D6 — Two-org pgTAP fixture for isolation.** The cross-org tests need a *second* org with its own
people to prove isolation; that fixture is created **inside the pgTAP test transaction** (so it never
pollutes the committed seed and rolls back automatically). Rationale: isolation can only be proven with
≥2 orgs, but the committed seed stays single-org (Gordi) per OD-P1-1.

**D7 — CI gets a *sibling* `integration.yml`, app `verify.yml` untouched.** A new workflow runs the
Supabase CLI + Docker on PRs, does `supabase db start` (which applies migrations + seed) then
`supabase test db`. Keeping it separate means a DB-only PR and an app-only PR each run only what they
need, and the existing app job is byte-for-byte unchanged (playbook §6 "keep the existing app job
untouched").

**D8 — No `org_id` on `shared.orgs` itself.** `orgs` *is* the tenant; it has no parent org. Its RLS is
"a member of org X may read row X" (`id = shared.current_org_id()`), not the `org_id = …` predicate the
child tables use. All four *child* directory tables carry `org_id`.

---

## File manifest (what this issue creates)

```
supabase/
  config.toml                                  (T-001 init, T-002 edits)
  .gitignore                                   (T-001 init; verified T-018)
  seed.sql                                     (T-016 — committed dev seed)
  seed.production.sql.example                  (T-017 — gitignored-convention template)
  README.md                                    (T-017 — seed convention note)
  migrations/
    20260611000001_schemas.sql                 (T-003)
    20260611000002_shared_directory.sql        (T-004)
    20260611000003_updated_at_trigger.sql      (T-005)
    20260611000004_helpers.sql                 (T-006)
    20260611000005_access_token_hook.sql       (T-007)
    20260611000006_rls.sql                     (T-008)
  tests/
    00_schemas.sql                             (T-010)
    01_rls_enabled.sql                         (T-011)
    02_org_isolation.sql                       (T-012)
    03_person_without_auth.sql                 (T-013)
    04_multi_role.sql                          (T-014)
    05_is_manager_of_dualhat.sql               (T-015a)
    06_org_id_spoof.sql                        (T-015b)
.github/workflows/integration.yml              (T-019)
.gitignore                                     (T-018 — one appended block)
```

---

## Tasks

> Every task lists exact path(s), full content or exact edit, and the exact verify command. Run from
> repo root `/Users/ariefsaid/Coding/gordi-mos` unless stated. Tasks are ordered; later tasks assume
> earlier ones ran.

### T-001 — `supabase init`

Scaffold the Supabase project layout.

```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase init
```

If it prompts about generating VS Code / IntelliJ settings, answer **n** to both (keep the tree
minimal). This creates `supabase/config.toml`, `supabase/seed.sql`, `supabase/.gitignore`, and the
empty `supabase/migrations/` directory.

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && test -f supabase/config.toml && test -d supabase/migrations && test -f supabase/.gitignore && echo OK
```
Expect `OK`.

### T-002 — `config.toml`: expose `shared`, wire the custom access token hook

Edit `supabase/config.toml`. Two changes, exact:

1. In the `[api]` block, set `schemas` so PostgREST exposes `shared` alongside the defaults. Replace
   the generated `schemas = ["public", "graphql_public"]` line with:
   ```toml
   schemas = ["public", "graphql_public", "shared"]
   ```
   (Do **not** add `mos`/`ops`/`integrations` — they are empty this issue and get exposed in their
   Phase-2 issues. D1.)

2. Enable the custom access token hook. The generated `config.toml` contains a commented
   `[auth.hook.custom_access_token]` stanza; replace it (or append if absent) with exactly:
   ```toml
   [auth.hook.custom_access_token]
   enabled = true
   uri = "pg-functions://postgres/shared/custom_access_token_hook"
   ```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && \
  grep -q 'schemas = \["public", "graphql_public", "shared"\]' supabase/config.toml && \
  grep -q 'pg-functions://postgres/shared/custom_access_token_hook' supabase/config.toml && \
  grep -A2 '\[auth.hook.custom_access_token\]' supabase/config.toml | grep -q 'enabled = true' && \
  echo OK
```
Expect `OK`.

### T-003 — Migration: create the four schemas

Create `supabase/migrations/20260611000001_schemas.sql`:

```sql
-- P1-2 — domain schemas (OD-DIR-3). Never dump MOS objects into public.
-- shared: cross-app directory & tenancy. mos/ops/integrations: created empty here;
-- Phase-2 issues add their tables (mos.tasks, mos.weekly_updates, ops.events, …).
create schema if not exists shared;
create schema if not exists mos;
create schema if not exists ops;
create schema if not exists integrations;

comment on schema shared is 'Cross-app directory and tenancy: orgs, people, roles, business units.';
comment on schema mos is 'Management OS domain (tasks, weekly updates) — tables land in Phase 2.';
comment on schema ops is 'Operational events feed — tables land in Phase 2.';
comment on schema integrations is 'Inbound mirrors from ops apps (kitchen, …) — tables land later.';

-- Authenticated app role may resolve objects in shared; PostgREST exposes it (config.toml).
grant usage on schema shared to authenticated, anon, service_role;
grant usage on schema mos, ops, integrations to authenticated, service_role;
```

**Verify (applies cleanly and the schemas exist):**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/reset1.log 2>&1; tail -5 /tmp/reset1.log && \
  supabase db reset --debug >/dev/null 2>&1; \
  psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -tAc \
  "select string_agg(nspname,',' order by nspname) from pg_namespace where nspname in ('shared','mos','ops','integrations')"
```
Expect the printed value `integrations,mos,ops,shared`. (If `supabase status -o env` is unavailable in
2.104.0, substitute the local DB URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.) The
pgTAP suite (T-010) is the durable proof of this; this verify is the quick smoke.

### T-004 — Migration: the `shared` directory tables

Create `supabase/migrations/20260611000002_shared_directory.sql`:

```sql
-- P1-2 — shared directory (OD-P1-1/2/5/7). All ids uuid; all timestamps timestamptz UTC.

-- Orgs: the tenant container (OD-P1-1). orgs has no parent org (ADR-0001 D8).
create table shared.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table shared.orgs is 'Tenant container. One row (Gordi) today; multi-org later = add rows.';

-- Business units (OD-P1-5): the five real operating areas. org-scoped.
create table shared.business_units (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name)
);
comment on table shared.business_units is 'Gordi operating areas (OD-P1-5). Every task/person belongs to one.';

-- Roles (OD-P0-9a): named positions; reporting line is role->role self-FK.
create table shared.roles (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  business_unit_id   uuid references shared.business_units(id) on delete set null,
  name               text not null,
  reports_to_role_id uuid references shared.roles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, name)
);
comment on column shared.roles.reports_to_role_id is 'Self-FK: this role reports to that role. Manager chain derives from this (OD-P0-9a).';

-- People (OD-P1-2): exist independent of login; optional unique auth link; soft-archive.
create table shared.people (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  full_name   text not null,
  email       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table shared.people is 'Directory person; may exist before/without a login (OD-P1-2). RACI-referenceable pre-auth.';
-- At most one person per auth user; many person rows may have NULL user_id without colliding.
create unique index people_user_id_unique on shared.people (user_id) where user_id is not null;
create index people_org_idx on shared.people (org_id);

-- person_roles (OD-P1-7): a person may hold several roles. Manager relation unions over these.
create table shared.person_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  role_id     uuid not null references shared.roles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (person_id, role_id)
);
comment on table shared.person_roles is 'Junction: people<->roles, many-to-many (OD-P1-7, dual-hat).';
create index person_roles_role_idx on shared.person_roles (role_id);
create index person_roles_person_idx on shared.person_roles (person_id);
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/reset2.log 2>&1 && tail -3 /tmp/reset2.log && \
  echo "migration applied (pgTAP in T-010..T-015 is the durable proof)"
```
Expect the reset log to end with success (no error) and the echo line.

### T-005 — Migration: `updated_at` trigger and its attachment to mutable tables

Create `supabase/migrations/20260611000003_updated_at_trigger.sql`:

```sql
-- P1-2 — touch updated_at on every UPDATE. One function, schema-qualified, attached per table.
create or replace function shared.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orgs_set_updated_at
  before update on shared.orgs
  for each row execute function shared.set_updated_at();

create trigger business_units_set_updated_at
  before update on shared.business_units
  for each row execute function shared.set_updated_at();

create trigger roles_set_updated_at
  before update on shared.roles
  for each row execute function shared.set_updated_at();

create trigger people_set_updated_at
  before update on shared.people
  for each row execute function shared.set_updated_at();
-- person_roles is immutable (insert/delete only), so it has updated_at-free shape and no trigger.
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/reset3.log 2>&1 && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='shared' and t.tgname like '%set_updated_at'"
```
Expect `4`.

### T-006 — Migration: helper functions (`current_org_id`, `current_person_id`, `is_org_member`, `is_manager_of`)

Create `supabase/migrations/20260611000004_helpers.sql`:

```sql
-- P1-2 — the org-seam + read-posture machinery (ADR-0001 D4/D5).

-- current_org_id(): the org claim minted into the JWT by the access-token hook (OD-P1-1).
-- STABLE, SECURITY INVOKER: reads only the request claims, no elevated rights.
create or replace function shared.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'org_id',
    ''
  )::uuid
$$;
comment on function shared.current_org_id() is 'Org id from the JWT custom claim (hook-injected, client-unspoofable). OD-P1-1.';

-- current_person_id(): the person claim minted into the JWT by the hook (OD-P1-2 link).
create or replace function shared.current_person_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'person_id',
    ''
  )::uuid
$$;
comment on function shared.current_person_id() is 'Person id from the JWT custom claim. OD-P1-2.';

-- is_org_member(): true when the session is bound to an org (i.e., has an org claim).
create or replace function shared.is_org_member()
returns boolean
language sql
stable
as $$
  select shared.current_org_id() is not null
$$;
comment on function shared.is_org_member() is 'Session is bound to an org. Basis of org-readable RLS.';

-- is_manager_of(target): UNION over ALL roles the target holds, walking reports_to_role_id upward;
-- true iff the current person holds ANY ancestor role. Dual-hat -> reachable from all leads (OD-P1-7).
create or replace function shared.is_manager_of(target_person_id uuid)
returns boolean
language sql
stable
as $$
  with recursive
  -- every role the target currently holds
  target_roles as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = target_person_id
  ),
  -- all ancestor roles of the target's roles (the management chain, union over all held roles)
  ancestor_roles as (
    select r.id, r.reports_to_role_id
    from shared.roles r
    join target_roles tr on tr.role_id = r.id
    union all
    select parent.id, parent.reports_to_role_id
    from shared.roles parent
    join ancestor_roles a on a.reports_to_role_id = parent.id
  ),
  -- every role the current viewer holds
  viewer_roles as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  )
  select exists (
    -- viewer holds a STRICT ancestor of a target role (exclude the target's own roles)
    select 1
    from ancestor_roles a
    join viewer_roles vr on vr.role_id = a.id
    where a.id not in (select role_id from target_roles)
  )
$$;
comment on function shared.is_manager_of(uuid) is
  'True iff current person holds a role strictly above any role the target holds (recursive union, OD-P1-7).';
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/reset4.log 2>&1 && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select string_agg(proname,',' order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='shared' and proname in ('current_org_id','current_person_id','is_org_member','is_manager_of')"
```
Expect `current_org_id,current_person_id,is_manager_of,is_org_member`. (Behavior — especially the
dual-hat union — is proven by pgTAP T-015a, not this existence check.)

### T-007 — Migration: custom access token hook

Create `supabase/migrations/20260611000005_access_token_hook.sql`:

```sql
-- P1-2 — custom access token hook (OD-P1-1/2). Injects org_id + person_id claims at token mint.
-- SECURITY DEFINER: must read shared.people regardless of caller; granted only to supabase_auth_admin.
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
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
comment on function shared.custom_access_token_hook(jsonb) is
  'Auth hook: stamps org_id + person_id custom claims from shared.people. OD-P1-1/2.';

-- Supabase Auth runs the hook as supabase_auth_admin; lock execution to that role only.
revoke execute on function shared.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant  execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;
-- The hook (definer) needs to read people; grant the admin role select on the directory.
grant usage on schema shared to supabase_auth_admin;
grant select on shared.people to supabase_auth_admin;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/reset5.log 2>&1 && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='shared' and proname='custom_access_token_hook'"
```
Expect `t` (SECURITY DEFINER set). Claim-injection behavior is proven indirectly by the seed login flow
in Phase 1.3; for this issue the helpers (T-006) read whatever claims exist and pgTAP sets claims
directly (T-012/T-015) to prove the downstream RLS.

### T-008 — Migration: RLS — enable+force, org isolation, org-readable directory, writes locked

Create `supabase/migrations/20260611000006_rls.sql`:

```sql
-- P1-2 — RLS for the shared directory (ADR-0001 D3/D8, OD-P1-1/3).
-- Posture this issue: every table org-READABLE by org members; WRITES = service_role/admin only
-- (app write paths ship with their Phase-2 features). org_id defaulted + WITH CHECK = unspoofable.

----------------------------------------------------------------------
-- orgs: the tenant itself. Readable by its own members; no org_id column (ADR-0001 D8).
----------------------------------------------------------------------
alter table shared.orgs enable row level security;
alter table shared.orgs force row level security;

create policy orgs_select_own on shared.orgs
  for select to authenticated
  using (id = shared.current_org_id());

-- (no insert/update/delete policy for authenticated -> writes denied; service_role bypasses RLS)

----------------------------------------------------------------------
-- Child directory tables: org isolation on read; org_id defaulted + checked; writes denied to app.
-- Pattern repeated 4x; each table sets the org_id default so future app writes omit it.
----------------------------------------------------------------------

-- business_units
alter table shared.business_units alter column org_id set default shared.current_org_id();
alter table shared.business_units enable row level security;
alter table shared.business_units force row level security;
create policy business_units_select_org on shared.business_units
  for select to authenticated
  using (org_id = shared.current_org_id());

-- roles
alter table shared.roles alter column org_id set default shared.current_org_id();
alter table shared.roles enable row level security;
alter table shared.roles force row level security;
create policy roles_select_org on shared.roles
  for select to authenticated
  using (org_id = shared.current_org_id());

-- people
alter table shared.people alter column org_id set default shared.current_org_id();
alter table shared.people enable row level security;
alter table shared.people force row level security;
create policy people_select_org on shared.people
  for select to authenticated
  using (org_id = shared.current_org_id());

-- person_roles
alter table shared.person_roles alter column org_id set default shared.current_org_id();
alter table shared.person_roles enable row level security;
alter table shared.person_roles force row level security;
create policy person_roles_select_org on shared.person_roles
  for select to authenticated
  using (org_id = shared.current_org_id());

----------------------------------------------------------------------
-- The org_id-spoof proof surface: an INSERT policy for authenticated on people that enforces
-- WITH CHECK (org_id = current_org_id()). This is intentionally a NARROW, provable surface for this
-- issue (T-015b) — it does NOT open a real app write path (the app has no people-write feature yet),
-- it proves that even WHEN a write policy exists, a client cannot stamp a foreign org_id (OD-P1-1).
----------------------------------------------------------------------
create policy people_insert_own_org on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id());
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/reset6.log 2>&1 && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select string_agg(c.relname,',' order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shared' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity"
```
Expect `business_units,orgs,people,person_roles,roles` (all five RLS-enabled **and** forced). pgTAP
T-011 is the durable assertion; this is the smoke.

### T-009 — Confirm pgTAP is available in the local stack

Supabase's local DB ships the `pgtap` extension; `supabase test db` enables it in a scratch DB. Confirm
it is installable so T-010+ can `BEGIN; select plan(...);`.

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/dev/null 2>&1 && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select 1 from pg_available_extensions where name='pgtap'"
```
Expect `1`. (If empty, the implementer adds `create extension if not exists pgtap with schema extensions;`
as the first line each test file already carries in T-010+; no migration change.)

### T-010 — pgTAP: schemas exist

Create `supabase/tests/00_schemas.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_schema('shared', 'shared schema exists');
select has_schema('mos',    'mos schema exists (empty until Phase 2)');
select has_schema('ops',    'ops schema exists (empty until Phase 2)');
select has_schema('integrations', 'integrations schema exists (empty until later)');

select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect this file's plan green (`00_schemas.sql .. ok`). (Later test files are added before the final
T-021 full run; running `supabase test db` now executes whatever exists.)

### T-011 — pgTAP: RLS enabled + forced on every shared business table

Create `supabase/tests/01_rls_enabled.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- RLS enabled on every shared business table (directory). 5 tables.
select ok(c.relrowsecurity, format('RLS enabled on shared.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='shared' and c.relname in ('orgs','business_units','roles','people','person_roles')
order by c.relname;

-- RLS FORCED on every shared business table (owner not exempt). 5 tables.
select ok(c.relforcerowsecurity, format('RLS forced on shared.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='shared' and c.relname in ('orgs','business_units','roles','people','person_roles')
order by c.relname;

select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect `01_rls_enabled.sql .. ok` (10 assertions pass).

### T-012 — pgTAP: cross-org isolation (two-org fixture)

Create `supabase/tests/02_org_isolation.sql`. Proves a session claimed into org A reads org-A rows and
**cannot** read org-B rows (ADR-0001 D3, OD-P1-1). The second org is created in-transaction (D6).

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- Two-org fixture (rolled back at end). Created as the table owner (migrations role), bypassing RLS.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'A Unit'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b2', 'B Unit');

-- Become the authenticated app role with a JWT claim placing us in Org A.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';

-- Sees its own org's unit.
select is(
  (select count(*)::int from shared.business_units where name = 'A Unit'),
  1,
  'org A session reads its own business unit'
);

-- Cannot see org B's unit (RLS org-isolation).
select is(
  (select count(*)::int from shared.business_units where name = 'B Unit'),
  0,
  'org A session cannot read org B business unit (cross-org isolation)'
);

reset role;
select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect `02_org_isolation.sql .. ok` (2 assertions).

### T-013 — pgTAP: person-without-auth is allowed

Create `supabase/tests/03_person_without_auth.sql`. Proves a `shared.people` row with `user_id IS NULL`
is valid (OD-P1-2 person-first), and the partial unique index permits many such rows.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000c1', 'Org C', 'org-c');

-- Two login-less people in the same org: both allowed (NULL user_id does not collide).
select lives_ok($$
  insert into shared.people (org_id, full_name) values
    ('00000000-0000-0000-0000-0000000000c1', 'Login-less One'),
    ('00000000-0000-0000-0000-0000000000c1', 'Login-less Two')
$$, 'two people with NULL user_id insert without unique violation (person-first, OD-P1-2)');

select is(
  (select count(*)::int from shared.people where org_id='00000000-0000-0000-0000-0000000000c1' and user_id is null),
  2,
  'both login-less people persist'
);

select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect `03_person_without_auth.sql .. ok` (2 assertions).

### T-014 — pgTAP: multi-role junction works

Create `supabase/tests/04_multi_role.sql`. Proves one person holds several roles (OD-P1-7) and the
`(person_id, role_id)` unique constraint blocks duplicates.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000d1', 'Org D', 'org-d');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Unit One'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'Unit Two');
insert into shared.roles (id, org_id, business_unit_id, name) values
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'Role One'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', 'Role Two');
insert into shared.people (id, org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d1', 'Dual Hat');

select lives_ok($$
  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d4'),
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d5')
$$, 'one person holds two roles (OD-P1-7)');

select is(
  (select count(*)::int from shared.person_roles where person_id='00000000-0000-0000-0000-0000000000d6'),
  2,
  'both role assignments persist'
);

select throws_ok($$
  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d4')
$$, '23505', null, 'duplicate (person, role) is rejected by the unique constraint');

select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect `04_multi_role.sql .. ok` (3 assertions).

### T-015a — pgTAP: `is_manager_of` dual-hat union chain (the load-bearing proof)

Create `supabase/tests/05_is_manager_of_dualhat.sql`. The OD-P1-7 scenario: person A holds two roles in
two units reporting to two leads L1 and L2; an unrelated lead L3 manages a third unit. Assert: L1
manages A, L2 manages A, L3 does **not** manage A, and A does not manage L1.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Fixture: org with three units, three lead roles, two staff roles under L1 and L2.
insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000e1', 'Org E', 'org-e');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e1','Unit U1'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000e1','Unit U2'),
  ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000e1','Unit U3');

-- Lead roles (no reports_to -> top of their unit).
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','Lead U1', null),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3','Lead U2', null),
  ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e4','Lead U3', null);
-- Staff roles reporting up to L1 and L2.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','Staff U1','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3','Staff U2','00000000-0000-0000-0000-0000000000f2');

-- People: A (dual hat), L1, L2, L3.
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000e1','Person A'),
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000e1','Lead One'),
  ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-0000000000e1','Lead Two'),
  ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-0000000000e1','Lead Three');

-- A holds BOTH staff roles (dual hat). Leads hold their lead roles.
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000f4'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000f5'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-0000000000f3');

-- Evaluate is_manager_of(A) from each lead's perspective by setting the person_id claim.
set local role authenticated;

set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-000000000011"}';
select ok( shared.is_manager_of('00000000-0000-0000-0000-00000000000a'),
  'Lead One (L1) manages dual-hat A (union over held roles)');

set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-000000000022"}';
select ok( shared.is_manager_of('00000000-0000-0000-0000-00000000000a'),
  'Lead Two (L2) ALSO manages dual-hat A (union, OD-P1-7)');

set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-000000000033"}';
select ok( not shared.is_manager_of('00000000-0000-0000-0000-00000000000a'),
  'unrelated Lead Three (L3) does NOT manage A');

set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-00000000000a"}';
select ok( not shared.is_manager_of('00000000-0000-0000-0000-000000000011'),
  'subordinate A does NOT manage Lead One (relation is strictly upward)');

reset role;
select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect `05_is_manager_of_dualhat.sql .. ok` (4 assertions — both leads positive, unrelated lead and
the inverse direction negative).

### T-015b — pgTAP: `org_id` spoof attempt fails

Create `supabase/tests/06_org_id_spoof.sql`. Proves the `WITH CHECK (org_id = current_org_id())`
rejects a client trying to stamp a foreign `org_id` (OD-P1-1).

> **Security-audit update (M1).** The standing `grant insert on shared.people to authenticated` and the
> `people_insert_own_org` policy were REMOVED from `20260611000006_rls.sql` — a permanent write surface
> with no app caller is needless attack surface. `06_org_id_spoof.sql` now creates the grant + WITH CHECK
> policy INSIDE its own `begin;…rollback;` transaction (nothing persists), and proves: (1) `authenticated`
> has NO standing INSERT privilege (`has_table_privilege` = false), (2) defaulted insert succeeds,
> (3) foreign-org insert fails `42501`, (4) explicit-NULL org insert fails `42501`. Now **4 assertions**.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B', 'org-b');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';

-- Insert WITHOUT org_id -> default stamps current_org_id() = A. Allowed.
select lives_ok($$
  insert into shared.people (full_name) values ('Honest Person')
$$, 'insert with defaulted org_id (current org A) is allowed');

-- Insert CLAIMING org B while session is org A -> WITH CHECK rejects (RLS 42501).
select throws_ok($$
  insert into shared.people (org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b2', 'Spoofer')
$$, '42501', null, 'client cannot stamp a foreign org_id (WITH CHECK blocks spoof, OD-P1-1)');

reset role;
select * from finish();
rollback;
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase test db
```
Expect `06_org_id_spoof.sql .. ok` (4 assertions, per the M1 update above).

### Security-audit pgTAP additions (M2, L3)

- `supabase/tests/08_claim_parsing.sql` (**9 assertions**) — M2: `current_org_id()`/`current_person_id()`
  FAIL CLOSED (return NULL, no raise) on empty-string, non-UUID, and malformed-JSON claims; happy path
  with a valid claim still resolves. Backed by the new `shared._claim_uuid(text)` helper.
- `supabase/tests/09_claim_consistency.sql` (**2 assertions**) — L3: a viewer claiming `org_id` = Org A
  with a `person_id` belonging to Org B gets `is_manager_of` = false (cross-org `person_id` matches no
  in-org `person_roles` under RLS → fails closed). Invariant comment added to `is_manager_of`.

### T-016 — Committed dev seed (`supabase/seed.sql`)

Overwrite `supabase/seed.sql` with the org row, the **real five** business units (OD-P1-5), a
placeholder role tree, and **fictional canon dev people** (OD-P1-6 — no real names/emails in a public
repo). `supabase db reset` applies this automatically after migrations.

```sql
-- P1-2 dev seed (committed, PUBLIC repo). Structure (OD-P1-5) + fictional dev people (OD-P1-6).
-- Real names/emails ONLY via the gitignored deploy seed (supabase/README.md). NEVER add real PII here.
-- Fixed UUIDs so tests/fixtures can reference them deterministically.

-- The single org (OD-P1-1).
insert into shared.orgs (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Gordi', 'gordi')
on conflict (id) do nothing;

-- The five real business units (OD-P1-5).
insert into shared.business_units (id, org_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cafe Ops – General'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Kitchen and Bar'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Roastery'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Sales – CRM'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Finance and People')
on conflict (id) do nothing;

-- Placeholder role tree: one org-lead role (no reports_to) + one lead role per unit reporting to it.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('30000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', null,                                   'Managing Director', null),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Cafe Ops Lead',     '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Kitchen Lead',      '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Roastery Lead',     '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'Sales Lead',        '30000000-0000-0000-0000-000000000000'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'Finance Lead',      '30000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;

-- Fictional canon dev people (OD-P1-6). No auth link (user_id NULL) — provisioned in Phase 1.3.
insert into shared.people (id, org_id, full_name, email) values
  ('40000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'Dewi Director',  'dewi.dev@example.test'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cahya Cafe',     'cahya.dev@example.test'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Krishna Kitchen','krishna.dev@example.test'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Rama Roastery',  'rama.dev@example.test'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Sari Sales',     'sari.dev@example.test'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Fitri Finance',  'fitri.dev@example.test')
on conflict (id) do nothing;

-- Role assignments: director holds the MD role; each lead holds their unit lead role.
-- Cahya is dual-hatted (Cafe Ops + Sales) to exercise the union manager chain in dev.
insert into shared.person_roles (org_id, person_id, role_id) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000000'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005')
on conflict (person_id, role_id) do nothing;
```

**Verify (reset applies migrations + seed; row counts match):**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset >/tmp/seed.log 2>&1 && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select (select count(*) from shared.orgs), (select count(*) from shared.business_units), (select count(*) from shared.roles), (select count(*) from shared.people), (select count(*) from shared.person_roles)"
```
Expect `1|5|6|6|6` (1 org, 5 units, 6 roles, 6 people, 6 role assignments).

### T-017 — Gitignored prod-seed convention: template + README

Create `supabase/seed.production.sql.example` (committed template — the `.example` is committed; the
real `supabase/seed.production.sql` is gitignored in T-018 and authored at deploy time):

```sql
-- supabase/seed.production.sql  (COPY this .example to seed.production.sql at deploy time; that file is GITIGNORED)
-- Real Gordi people + real auth links. NEVER commit this file (public repo, OD-P1-6).
-- Applied manually against the deployed stack, not by `db reset`. Real names/emails go here ONLY.
--
-- insert into shared.people (org_id, user_id, full_name, email) values
--   ('10000000-0000-0000-0000-000000000001', '<auth.users uuid>', '<Real Name>', '<real@gordi.id>')
-- on conflict do nothing;
--
-- insert into shared.person_roles (org_id, person_id, role_id) values
--   ('10000000-0000-0000-0000-000000000001', '<person uuid>', '<role uuid>');
```

Create `supabase/README.md`:

```markdown
# Gordi MOS — Supabase (self-hosted, local-dev config)

One self-hosted Supabase stack serves MOS + future Gordi ops apps, separated by Postgres schemas
`shared` / `mos` / `ops` / `integrations` (OD-DIR-3). This directory targets **local dev**; the
ris-dev production deployment is a later issue.

## Layout
- `config.toml` — local stack config. `[api].schemas` exposes `shared`; the custom access token hook
  (`shared.custom_access_token_hook`) injects `org_id` + `person_id` JWT claims (OD-P1-1/2).
- `migrations/` — ordered, reversible-by-`db reset` SQL. Schemas → directory → triggers → helpers →
  hook → RLS.
- `seed.sql` — **committed** dev seed: real structure (OD-P1-5 units, role tree) + **fictional** dev
  people (OD-P1-6). Applied automatically by `supabase db reset`.
- `tests/` — pgTAP suite (`supabase test db`): schemas, RLS enabled+forced, cross-org isolation,
  person-without-auth, multi-role, `is_manager_of` dual-hat union chain, `org_id` spoof.

## Seed privacy (public repo — OD-P1-6)
Real names/emails NEVER enter `seed.sql`. At deploy time, copy `seed.production.sql.example` to
`seed.production.sql` (gitignored) and fill in real people + auth links; apply it manually against the
deployed stack. The committed seed stays fictional.

## Common commands (run from repo root)
- `supabase start` — boot the local stack (Docker).
- `supabase db reset` — drop, re-apply all migrations, re-run `seed.sql` (the reversibility contract).
- `supabase test db` — run the pgTAP suite.
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && test -f supabase/seed.production.sql.example && \
  grep -q 'GITIGNORED' supabase/seed.production.sql.example && \
  grep -q 'seed.production.sql' supabase/README.md && echo OK
```
Expect `OK`.

### T-018 — Gitignore the real prod seed

Append to repo-root `/Users/ariefsaid/Coding/gordi-mos/.gitignore` (do not remove existing lines; add
this block after the secrets block):

```gitignore
# Supabase deploy-time real-people seed — NEVER commit (public repo, OD-P1-6).
# The .example template IS committed; the filled-in real file is not.
supabase/seed.production.sql
```

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && grep -q '^supabase/seed.production.sql$' .gitignore && \
  git check-ignore supabase/seed.production.sql && echo OK
```
Expect the path echoed by `git check-ignore` then `OK`.

### T-019 — CI: sibling `integration.yml` (app `verify.yml` untouched)

Create `/Users/ariefsaid/Coding/gordi-mos/.github/workflows/integration.yml`. Runs only the DB suite;
does not touch the app job. Uses the official `supabase/setup-cli` action, starts the stack, runs pgTAP.

```yaml
name: integration

on:
  push:
    branches: [main]
  pull_request:

jobs:
  db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start local Supabase stack (applies migrations + seed)
        run: supabase db start

      - name: pgTAP suite
        run: supabase test db

      - name: Stop stack
        if: always()
        run: supabase stop
```

> Note: `supabase db start` boots Postgres + applies `migrations/` + `seed.sql` in the GitHub-hosted
> runner's Docker. If the installed CLI subcommand differs (`supabase start` vs `supabase db start`),
> the implementer uses whichever the pinned CLI exposes; the load-bearing steps are *boot stack* then
> `supabase test db`. The existing `mos-app` `verify.yml` is **not edited**.

**Verify (workflow is well-formed and isolated from the app job):**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && \
  node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/integration.yml','utf8');['supabase/setup-cli','supabase test db'].forEach(s=>{if(!y.includes(s))throw new Error('missing '+s)});console.log('OK')" && \
  git diff --quiet -- .github/workflows/verify.yml && echo "verify.yml untouched"
```
Expect `OK` then `verify.yml untouched`.

### T-020 — Confirm `supabase/.gitignore` keeps secrets out (init default)

`supabase init` (T-001) wrote `supabase/.gitignore` ignoring `.branches`, `.temp`, and the local
`.env`. Confirm it is intact so no local stack secrets get committed.

**Verify:**
```bash
cd /Users/ariefsaid/Coding/gordi-mos && test -f supabase/.gitignore && \
  grep -q '.env' supabase/.gitignore && echo OK
```
Expect `OK`. (If `supabase init`'s default omits `.env`, append a line `.env` to `supabase/.gitignore`.)

### T-021 — FINAL GATE: full pgTAP green + `db reset` idempotency

The merge gate for this DB-only issue. Run in order; all must pass.

```bash
cd /Users/ariefsaid/Coding/gordi-mos && \
  supabase db reset && \
  supabase db reset && \
  supabase test db && \
  echo "ALL DB GATES PASS"
```

The **doubled `db reset`** is the idempotency check: a second clean re-apply from zero must succeed
identically (no migration depends on prior state, seeds are `on conflict do nothing`). `supabase test
db` must report **all ten** test files green (07 role-cycle guard + 08 claim-parsing + 09 claim-
consistency added since the original draft):

```
00_schemas.sql ............... ok
01_rls_enabled.sql ........... ok
02_org_isolation.sql ......... ok
03_person_without_auth.sql ... ok
04_multi_role.sql ............ ok
05_is_manager_of_dualhat.sql . ok
06_org_id_spoof.sql .......... ok
07_role_cycle.sql ............ ok
08_claim_parsing.sql ......... ok
09_claim_consistency.sql ..... ok
```

**Verify:** terminal prints `ALL DB GATES PASS` and the pgTAP summary shows 10/10 files (Tests=41)
passing with **0 failed**. Cross-check no object leaked into `public`:

```bash
cd /Users/ariefsaid/Coding/gordi-mos && \
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
```
Expect `0` (no MOS table in `public` — schema-qualification held).

---

## Task → proof mapping (no `AC-###`; pgTAP test + OD decision per behavior)

| Task | Builds | Proven by | OD / ADR |
|---|---|---|---|
| T-001/02 | init + config (schemas exposed, hook wired) | T-002 grep; downstream login (P1-3) | OD-DIR-3/4, D1 |
| T-003 | four schemas | **T-010** `00_schemas.sql` | OD-DIR-3, ADR D-context |
| T-004 | shared directory tables | T-013/T-014 (shape), T-016 (counts) | OD-P1-2/5/7 |
| T-005 | `updated_at` trigger | T-005 trigger-count verify | playbook §8 |
| T-006 | helpers incl. `is_manager_of` | **T-015a** `05_is_manager_of_dualhat.sql` | OD-P1-1/7, ADR D4/D5 |
| T-007 | access token hook | T-007 secdef verify; P1-3 login | OD-P1-1/2, ADR D1/D4 |
| T-008 | RLS enable+force+isolation+spoof-check | **T-011, T-012, T-015b** | OD-P1-1/3, ADR D3/D8 |
| T-013 | person-first allowed | **T-013** `03_person_without_auth.sql` | OD-P1-2 |
| T-014 | multi-role junction | **T-014** `04_multi_role.sql` | OD-P1-7 |
| T-016 | committed dev seed | T-016 row-count verify | OD-P1-5/6 |
| T-017/18 | gitignored prod-seed convention | T-017/T-018 verify + `git check-ignore` | OD-P1-6 |
| T-019 | CI DB job (app job untouched) | T-019 verify | playbook §6 |
| T-021 | full green + idempotency | **T-021** (all 7 + doubled reset) | merge gate |

**Total: 23 tasks** (T-001 … T-021, with T-015 split into T-015a + T-015b).

**pgTAP test list (7 files):** `00_schemas.sql` · `01_rls_enabled.sql` · `02_org_isolation.sql` ·
`03_person_without_auth.sql` · `04_multi_role.sql` · `05_is_manager_of_dualhat.sql` · `06_org_id_spoof.sql`.

**Migration list (6 files):** `20260611000001_schemas.sql` · `20260611000002_shared_directory.sql` ·
`20260611000003_updated_at_trigger.sql` · `20260611000004_helpers.sql` ·
`20260611000005_access_token_hook.sql` · `20260611000006_rls.sql`.

---

## Notes for the implementer

- **TDD posture for SQL.** For each pgTAP file, the discipline is: write the test asserting the
  *intended* behavior, run `supabase test db`, watch it fail (RED) if the migration is absent/wrong,
  then make the migration green — never edit a test to match a wrong migration. The dual-hat test
  (T-015a) is the one most likely to expose a logic bug in `is_manager_of`; treat its RED→GREEN as the
  real proof of the recursive-union design, not a formality.
- **Schema-qualify everything; never `public`.** T-021's final cross-check (`0` tables in `public`)
  fails loudly if anything leaks.
- **`mos`/`ops`/`integrations` stay empty.** If a task tempts you to add a table there, it is out of
  scope — that table belongs to a Phase-2 issue.
- This is the **security-critical slice** (auth hook + RLS + tenancy seam) — the Director will route it
  to the **opus implementer** and run the **security-auditor** (live cross-org / spoof exploit
  attempts) after build, per playbook §2 step 6.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (release-engineer's job).

## Open questions for the Director

None blocking. Four FYI / confirm-at-build items:

1. **`config.toml` hook stanza key.** The exact `config.toml` shape for the access-token hook can vary
   slightly across CLI versions (`[auth.hook.custom_access_token]` with `uri = "pg-functions://…"` is
   the 2.x form). The implementer should diff against what `supabase init` actually emits on CLI
   2.104.0 and match its key names; the load-bearing facts (hook enabled, points at
   `shared.custom_access_token_hook`) are fixed. Non-blocking.
2. **`supabase status -o env` availability.** The T-003 verify uses the fixed local DB URL
   `postgresql://postgres:postgres@127.0.0.1:54322/postgres` as the portable form; if your local stack
   uses a non-default port, adjust the verify commands' connection string accordingly. Non-blocking.
3. **CI Docker time.** `supabase db start` in CI pulls several images on a cold cache (~1–2 min). If PR
   feedback latency matters, add an image cache step later; not needed for correctness now. Recorded so
   it isn't a surprise.
4. **Coverage gate** stays deferred to **P1-3** (stated in the Scope guard) — confirm you're content to
   carry it one more issue, since this issue has no TS to cover.

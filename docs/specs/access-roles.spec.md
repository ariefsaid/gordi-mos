# Spec — Access-role layer (RBAC substrate) (P4 / ADR-0011 D5)

- Feature: the **access-role assignment substrate** end-to-end — how a `shared.people` row holds one or
  more **access roles** (`admin` · `ops_lead` · `finance` · `member`), with `manager` **derived** (never
  assigned); the **JWT-claim stamping** that extends the existing `custom_access_token_hook` (migration
  `…000005`) so RLS and the SPA read a person's access roles **without a join**; the **RLS helper(s)**
  (`shared.has_access_role(text)` / `shared.current_access_roles()`) that every future feature's
  per-table policy will call; the **DB-layer granting rules** (only `admin` grants/revokes;
  **`admin` and `finance` are never self-assignable**; the **first `admin` is seeded** at deploy); and
  the **viewer exposure** in `mos-app/src/lib/db/viewer.ts` surfacing the user's **effective** access
  roles (assigned ∪ derived manager) to the SPA.
- Status: Draft for owner sign-off.
- Authority: business rules are **pre-decided** in **ADR-0011 D5** (the fixed access-role set + three-layer
  enforcement + manager-derived + `admin`/`finance` never-self-assignable + first-admin-seeded) and
  `docs/decisions.md` **OD-P4-4** (the RBAC decision). Built on **ADR-0001** (the org seam + the FIXED
  read posture + `shared.is_manager_of` union chain — the RLS substrate the access layer sits on),
  **OD-P1-2** (person-first directory, nullable `user_id`), **OD-P1-7** (multi-role people / union manager
  chain), **OD-P1-9** (admin-invite provisioning). This spec **encodes** those decisions; it does not
  re-open them. Each requirement cites its source inline.
- Vocabulary: `CONTEXT.md` — **Role** (org position) / **Access role** (app authorization:
  `admin` · `ops_lead` · `finance` · `member`, **+ derived `manager`**) / **RACI** (R/A/C/I) are the
  canonical three-way split and are used **exactly**. "**Access role**" never means org **Role** or a
  **RACI** role. `manager` is **NOT** an assigned access role — it is *derived from the role chain*
  (CONTEXT.md "Manager", OD-P1-7).
- Mirrors the P1/P2 conventions: the org seam (`org_id` default `shared.current_org_id()`, server-stamped
  unspoofable, OD-P1-1), the **enable + FORCE RLS** posture, the **no-DELETE-grant** posture (removal is a
  guarded UPDATE, never a hard delete), schema-qualified `set search_path = ''` functions, the
  `_guard_*` BEFORE-trigger pattern for invariants RLS WITH CHECK cannot express (mirrors
  `ops._guard_log_entry` / `mos._guard_archive`), and the custom-access-token-hook injection point that
  ADR-0001 D1 established (this slice **extends** it, does not replace it).

## Out of scope (explicit non-goals — each lands with its own feature)

- **The per-feature RLS *gates that USE* access roles** — kitchen's `ops_lead`-only
  `Submitted → Approved` approval (ADR-0012 D3), the `finance`-only `reporting` schema read posture
  (ADR-0010 D5 / OD-P4-2). This slice provides the **substrate** (the assignment table, the claim, the
  `has_access_role()` helper); the per-table policies that *call* `has_access_role('ops_lead')` /
  `has_access_role('finance')` ship **with their owning Modules**. No kitchen/reporting policy is written
  here.
- **SPA route-guards beyond the viewer hook** — this slice exposes the **effective access roles** on the
  viewer object so a route-guard *can* read them; the route-guard component / `<RequireAccessRole>`
  wrapper / the admin-UI gate themselves are **later UI slices**.
- **Backend authz** — the thin backend (ADR-0010 D6) that checks a caller is `admin` on `service_role`
  provisioning endpoints **does not exist yet**; ADR-0011 D5's "third enforcement layer" lands with that
  backend. This slice is the **DB + claim + viewer** substrate only.
- **The user-management UI** (assign/revoke screens) — a later slice (OD-P1-9: v1 grants may be
  CLI/dashboard/SQL; an admin UI is post-MVP). This slice provides the **grant rules at the DB layer**
  (who *may* write a `person_access_roles` row), not the UI that drives them.
- **Synthetic-email provisioning / GoTrue session config** (ADR-0011 D2/D3) — those are the
  provisioning-spec's concern; this slice assumes a provisioned `auth.users`↔`shared.people` link
  (OD-P1-2) already exists and only governs *which access roles* that person holds.
- **A configurable role↔permission engine** — explicitly **deferred** (ADR-0011 D5, same posture as
  ADR-0001 D3's fixed read matrix). The fixed enum grows by one migration; the engine is the recorded
  escape hatch, **not built now**.

---

## 1. Overview & value

Every future Module and feature of MOS needs to ask one question at the DB and in the SPA: **"what may
this person *do* in the app?"** — distinct from *what org position they hold* (Role) and *which tasks
they own* (RACI). This slice builds the **answer substrate**: the access-role layer of ADR-0011 D5.

A person holds **zero or more** of a **fixed set of four** access roles —

| Access role | What it grants (ADR-0011 D5 / OD-P4-4 / CONTEXT.md) |
|---|---|
| **`admin`** | The **system administrator** — user management + system config. The **only** role that sees the admin UI. **Never self-assignable.** |
| **`ops_lead`** | Review / approve operational logs (the kitchen `Submitted → Approved` gate, ADR-0012 D3) + elevated operational surfaces. |
| **`finance`** | Review financial data / dashboards from the `reporting` schema (ADR-0010 D5 / OD-P4-2). **Never self-assignable.** |
| **`member`** | **Default.** Own tasks, file own weekly update, log operational activity if rostered. |

— and the person's **effective access = the assigned roles ∪ the derived `manager` capability**, where
`manager` is **never stored**: it is derived from the role chain (`shared.is_manager_of`, OD-P1-7,
CONTEXT.md "Manager"). The substrate has three load-bearing parts:

1. **Assignment** at the DB (`shared.person_access_roles` — see §3), org-scoped, RLS-enforced: only an
   `admin` may grant or revoke, `admin`/`finance` are never self-assignable, and the **first `admin` is
   seeded** at deploy so there is someone who can grant the rest (chicken-and-egg, ADR-0011 D5).
2. **The JWT claim** — the existing `custom_access_token_hook` (ADR-0001 D1, migration `…000005`) is
   **extended** to stamp the person's assigned access roles into the access token, so RLS reads them with
   a cheap `STABLE` helper instead of a per-policy join (the same scale rationale as the `org_id` claim,
   ADR-0001 D1) — and the SPA reads them off the session without a round-trip.
3. **The read helpers** — `shared.has_access_role(text)` and `shared.current_access_roles()` that future
   per-feature policies call (`USING (shared.has_access_role('ops_lead'))`), and the **viewer exposure**
   in `viewer.ts` that surfaces the **effective** set (assigned ∪ derived manager) to the SPA.

The set is **fixed**, **small**, **RLS-native**, and **auditable** — the deliberate explicit-over-engine
trade of ADR-0011 D5. It grows by one migration (add an enum value + its policies), and the
client-unspoofable property is structural: roles are **server-stamped** into a signed JWT, never sent by
the client.

---

## 2. Domain model & vocabulary (CONTEXT.md — used exactly)

| Term | Meaning in this spec |
|---|---|
| **Access role** | An app-authorization grant a person holds — one of the fixed set `admin` · `ops_lead` · `finance` · `member` (CONTEXT.md "Access role", OD-P4-4). **Distinct** from org **Role** and from a **RACI** role. A person may hold several; effective access is the union. |
| **`admin`** | System administrator — the only access role that sees the admin UI; the only role that may grant/revoke access roles. Never self-assignable; first one seeded at deploy. |
| **`ops_lead`** | Operational reviewer/approver (kitchen `Submitted → Approved`, ADR-0012 D3) + elevated operational surfaces. Admin-granted. |
| **`finance`** | Financial reviewer (`reporting` schema, ADR-0010 D5). Admin-granted, never self-assignable. |
| **`member`** | The default access role — own tasks, own weekly update, rostered ops logging. |
| **Derived `manager`** | **NOT** an assignable access role. A *capability* derived from the org role chain: true iff the person holds a role strictly above any role someone else holds (`shared.is_manager_of`, OD-P1-7, CONTEXT.md "Manager"). It is part of **effective** access but is **never** a `person_access_roles` row. |
| **Effective access roles** | The **assigned** access roles **∪** the **derived `manager`** capability — what the SPA renders surfaces from (FR-070). The DB substrate stores only the *assigned* set; `manager` is computed. |
| **Assignment** | A `shared.person_access_roles` row binding a person to one access role, org-scoped (§3). Granting/revoking is admin-only and self-escalation-guarded. |
| **First `admin` (seed)** | The bootstrap `admin` assignment created at deploy (ADR-0011 D5; its credential via the `op` secret path, ADR-0010 D9/D12) so the chicken-and-egg of "who grants the first admin" is resolved. |
| **Manager** | A person holding a role strictly above (any of) another's roles via the union chain (`shared.is_manager_of`, OD-P1-7). The basis of the derived-manager capability. |

---

## 3. Data model

> **Open question carried to §10 (not resolved here):** **assignment table vs. enum-array column.** This
> spec presents **both** shapes and leans to the **`shared.person_access_roles` junction table**, because
> it mirrors the existing `shared.person_roles` junction (OD-P1-7), inherits the directory's org-seam +
> enable/FORCE-RLS conventions verbatim, lets a grant carry its own provenance (`granted_by`,
> `granted_at`) for audit, and is the shape every existing pgTAP fixture already knows how to seed. The
> **enum-array column** (`shared.people.access_roles access_role[]`) is denser to read and trivially
> stamped into the JWT, but it cannot carry per-grant provenance, makes a single-role revoke a
> read-modify-write of the whole array, and breaks the "one row per fact" convention the junction uses.
> **eng-planner finalizes the DDL.** The requirements below are written against the **table** shape; the
> array variant's deltas are noted where they differ.

### 3.1 The access-role vocabulary — `text` + CHECK (not a PG enum)

The four access roles are constrained by **`CHECK (access_role IN ('admin','ops_lead','finance','member'))`**
— **text + CHECK**, not a Postgres `ENUM` type — mirroring `ops.log_entries.event_type` /
`ops.log_entries.origin` (OD-P2-17/18) and the explicit ADR-0011 D5 / Reversibility note that the set
"grows by one migration (add a role + its policies)". Widening a CHECK is a cheap reversible `ALTER`; a
PG enum value cannot be dropped and reorders awkwardly. *(Array variant: a domain or CHECK over array
elements; eng-planner picks.)*

### 3.2 `shared.person_access_roles` (the assignment table — leaning shape)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `org_id` | uuid NOT NULL, FK `shared.orgs(id)` ON DELETE CASCADE, default `shared.current_org_id()` | Org seam; server-stamped, client-unspoofable (OD-P1-1). Mirrors `shared.person_roles.org_id`. |
| `person_id` | uuid NOT NULL, FK `shared.people(id)` ON DELETE CASCADE | The grantee. Mirrors `person_roles.person_id`. |
| `access_role` | text NOT NULL, `CHECK (access_role IN ('admin','ops_lead','finance','member'))` | The granted access role (§3.1). The word **`manager` is NOT a valid value** — derived, never assigned (FR-003). |
| `granted_by` | uuid NULL, FK `shared.people(id)` ON DELETE SET NULL | Who granted it — provenance for audit. NULL for the seed (`admin` granted by the bootstrap, no granting person). Server-stamped to `current_person_id()` on app-tier insert (NULL only on the service-role seed). |
| `granted_at` | timestamptz NOT NULL default `now()` | When granted. |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | `updated_at` via `shared.set_updated_at()` trigger (P1 pattern). |

Constraints / indexes:
- **`unique (person_id, access_role)`** — a person holds each access role at most once (mirrors
  `person_roles`' `unique (person_id, role_id)`).
- Index `(org_id)` (mirrors `people_org_idx` / `person_roles` indexes).
- Index `(person_id)` — the hook's per-user lookup at token mint + the viewer read.
- Index `(access_role)` — "who is an `admin`?" admin-screen lookups (future).

> There is **no** stored `manager` row, and **no** `archived_at`: an access role is either held or not;
> revocation is a **guarded DELETE-equivalent UPDATE**? — **No.** Per the house no-hard-delete posture
> and ADR-0011 reversibility, revocation is modeled as **deleting the assignment row via a guarded path**
> is rejected (no DELETE grant). Instead revocation is a **soft state**: see §3.4 — revocation is an
> UPDATE setting a `revoked_at timestamptz NULL` column (reversible, audit-preserving), and the
> "effective" read filters `revoked_at IS NULL`. *(Open question §10: whether revocation is soft
> (`revoked_at`) or a row delete; this spec leans soft to honor the no-DELETE-grant posture and keep an
> audit trail of revocations — eng-planner confirms. The columns below assume soft-revoke.)*

Revised columns (soft-revoke):
| Column | Type | Notes |
|---|---|---|
| `revoked_at` | timestamptz NULL | Soft-revoke (reversible). A held assignment is `revoked_at IS NULL`. The JWT claim, `has_access_role`, and the viewer all read **only non-revoked** rows. **No DELETE grant** — revocation never destroys the row (NFR-004, mirrors `ops.log_entries` archive). |
| `revoked_by` | uuid NULL, FK `shared.people(id)` ON DELETE SET NULL | Who revoked it (provenance). |

The `unique (person_id, access_role)` constraint then admits **re-granting** by clearing `revoked_at`
(an UPDATE), not by inserting a duplicate. *(If eng-planner prefers a partial unique
`(person_id, access_role) WHERE revoked_at IS NULL` to allow a fresh row after revoke, that is an
acceptable equivalent — §10.)*

### 3.3 Extending the access-token hook (migration `…000005` → a new migration that `CREATE OR REPLACE`s the hook)

The existing `shared.custom_access_token_hook(event jsonb)` (ADR-0001 D1) already resolves the caller's
`shared.people` row and stamps `org_id` + `person_id`. This slice **extends** it (via
`CREATE OR REPLACE`, a new dated migration — it does **not** edit the historical `…000005` file) to also
stamp an **`access_roles` claim**: a JSON array of the person's **non-revoked assigned** access roles.

```
-- inside the hook, after v_person is resolved and org_id/person_id are stamped:
if v_person.id is not null then
  claims := jsonb_set(claims, '{access_roles}',
    coalesce(
      (select to_jsonb(array_agg(par.access_role order by par.access_role))
         from shared.person_access_roles par
        where par.person_id = v_person.id
          and par.revoked_at is null),
      '[]'::jsonb),
    true);
end if;
```

- The hook is **`SECURITY DEFINER`** already (it must read `shared.people` regardless of caller); it will
  additionally read `shared.person_access_roles`, so the existing
  `grant select on shared.people to supabase_auth_admin` is extended with
  `grant select on shared.person_access_roles to supabase_auth_admin`.
- The claim holds **only assigned** roles — `manager` is **not** stamped (it is derived client-/policy-side,
  FR-003/070), so a role-chain change does not require a re-mint to affect manager-derived surfaces.
- **Staleness** (FR-031 / §10): the claim reflects assignments **as of token mint**. A grant/revoke takes
  effect for a given session only on the **next token refresh** (≤ the access-token TTL, ADR-0011 D3). This
  is the accepted same trade as the `org_id` claim (ADR-0001 D1) and is recorded as an open question
  (whether the helper reads the claim or the live table — §10).

### 3.4 The read helpers (`shared.has_access_role` / `shared.current_access_roles`)

Two `STABLE` `SET search_path = ''` helpers, mirroring `shared.current_org_id()` /
`shared.is_org_member()` (migration `…000004`):

- **`shared.current_access_roles() returns text[]`** — the caller's **assigned** access roles. Source is
  the **JWT `access_roles` claim** (read with the defensive `request.jwt.claims` parse pattern of
  `shared._claim_uuid`, generalized to a text-array claim, **failing closed to `'{}'`** on malformed /
  absent claims). *(Open question §10: claim vs. live table read — claim is the cheap scale path matching
  `current_org_id`; a live `person_access_roles` read by `current_person_id()` is the
  no-staleness alternative. This spec leans **claim**, fail-closed.)*
- **`shared.has_access_role(p_role text) returns boolean`** — `select p_role = any(shared.current_access_roles())`.
  This is the function **future per-feature policies call** —
  e.g. kitchen's approval policy will be `USING (shared.has_access_role('ops_lead'))`, the `reporting`
  schema `USING (shared.has_access_role('finance') or shared.has_access_role('admin'))`. Both are
  `SECURITY INVOKER` (they read only request claims — no elevated rights, no `SECURITY DEFINER` to revoke,
  so the integration-CI definer-revoke lint stays clean, NFR-007).

> **`manager` is deliberately absent from these helpers' surface as an *assignable* value** — a policy
> needing the manager capability calls `shared.is_manager_of(target)` (ADR-0001), not
> `has_access_role('manager')`. The two are orthogonal substrates joined only in the *effective* view
> (FR-070).

### 3.5 The grant/revoke gate — `admin`-only, self-escalation-guarded (DB layer)

Writes to `shared.person_access_roles` are governed by RLS + a `_guard` trigger (the seam RLS WITH CHECK
cannot express alone, mirroring `ops._guard_log_entry` / `mos._guard_archive`):

- **Only `admin` may INSERT or UPDATE** (grant / revoke / re-grant) — RLS policy
  `WITH CHECK (org_id = current_org_id() AND shared.has_access_role('admin'))`, `USING` likewise on
  UPDATE.
- **`admin` and `finance` are never self-assignable** — a `_guard_person_access_roles` BEFORE
  INSERT/UPDATE trigger RAISES `42501` when `new.person_id = shared.current_person_id()` **and**
  `new.access_role IN ('admin','finance')` and the row is being **granted** (a non-revoked state).
  *(Self-grant of `member`/`ops_lead` is also pointless for an existing admin but is the escalation-sensitive
  pair that ADR-0011 D5 names; the guard targets `admin`/`finance` exactly.)* This is enforced at the
  **DB**, not merely the UI (NFR-001) — WITH CHECK alone cannot express "person ≠ self for these roles
  on grant", so the trigger is the authority.
- **`org_id` and `person_id`/`access_role` immutability on UPDATE** — an UPDATE may only flip
  `revoked_at`/`revoked_by` (and `updated_at`); changing `person_id`, `access_role`, or `org_id` on an
  existing row RAISES `42501` (mirrors `ops._guard_log_entry`'s immutability check — prevents
  re-targeting a grant to escalate a different person).
- **No DELETE grant** to `authenticated` (NFR-004) — revocation is the soft-revoke UPDATE (§3.2). The
  **seed** (first admin) is created by **`service_role`** (bypasses RLS) at deploy (FR-060).

---

## 4. Functional requirements (EARS)

### Assignment model & union semantics
- **FR-001** The system shall persist an access-role assignment as a `shared.person_access_roles` row
  binding a `person_id` to one `access_role`, org-scoped, with `org_id` defaulted to
  `shared.current_org_id()` (ADR-0011 D5, OD-P4-4, §3.2). *(Array variant: an element of
  `shared.people.access_roles`.)*
- **FR-002** The system shall allow a person to hold **several** access roles, and shall treat a person's
  **assigned** access = the **set (union)** of their non-revoked assignment rows; the `access_role`
  vocabulary shall be constrained by CHECK to exactly `{admin, ops_lead, finance, member}` (ADR-0011 D5,
  CONTEXT.md "Access role").
- **FR-003** The system shall **not** store `manager` as an assignable access role — `manager` shall be
  **derived** from the org role chain (`shared.is_manager_of`, OD-P1-7) and shall be **rejected** as a
  `person_access_roles.access_role` value by the CHECK (CONTEXT.md "Manager", ADR-0011 D5).
- **FR-004** The system shall constrain the `access_role` vocabulary as **text + CHECK** (not a PG enum)
  so the set is widened by one reversible migration (ADR-0011 Reversibility, mirrors OD-P2-17).
- **FR-005** The system shall enforce **at most one** assignment row per `(person_id, access_role)` (no
  duplicate grants); re-granting a previously revoked role shall clear `revoked_at` rather than insert a
  duplicate (§3.2). *(Equivalent: a partial-unique allowing a fresh row when none is live — §10.)*

### JWT-claim stamping (extends `custom_access_token_hook`, ADR-0001 D1)
- **FR-010** The system shall **extend** the existing `shared.custom_access_token_hook` to stamp an
  **`access_roles` claim** into the access token — a JSON array of the person's **non-revoked assigned**
  access roles — alongside the existing `org_id` / `person_id` claims (ADR-0001 D1, §3.3).
- **FR-011** The system shall stamp the `access_roles` claim **server-side at token mint** from
  `shared.person_access_roles`, so the value is **client-unspoofable** (a signed JWT, never client input),
  and shall grant the auth-admin role SELECT on `shared.person_access_roles` for the definer hook to read
  it (OD-P1-1 unspoofable posture, §3.3).
- **FR-012** Where a person holds **no** assigned access role (or the people row is unresolved), the
  system shall stamp an **empty array** `[]` for `access_roles` (fail-safe: no roles, not absent claim),
  consistent with the orphan-fails-closed posture (OD-P1-10, §3.3).
- **FR-013** The system shall **not** stamp `manager` into the claim — the claim carries assigned roles
  only; the manager capability is derived (FR-003/070) so a role-chain change needs no token re-mint to
  affect manager-derived surfaces (§3.3).

### Read helper(s)
- **FR-020** The system shall provide `shared.current_access_roles() returns text[]` returning the
  caller's **assigned** access roles, reading the JWT `access_roles` claim and **failing closed to an
  empty array** on a malformed / absent claim (mirrors `shared._claim_uuid`'s fail-closed parse, §3.4).
  *(Open §10: claim vs. live-table source.)*
- **FR-021** The system shall provide `shared.has_access_role(p_role text) returns boolean` returning true
  iff `p_role` is among `current_access_roles()`, as the function future per-feature RLS policies call
  (§3.4, ADR-0011 D5 enforcement-at-RLS).
- **FR-022** The system shall implement both helpers as `STABLE` `SECURITY INVOKER` `SET search_path = ''`
  (no `SECURITY DEFINER`, so the definer-revoke CI lint has nothing to flag), mirroring
  `shared.current_org_id()` / `shared.is_org_member()` (NFR-007, §3.4).

### Granting rules + self-escalation guard (DB layer)
- **FR-030** The system shall permit **only an `admin`** to INSERT (grant) or UPDATE (revoke / re-grant)
  a `shared.person_access_roles` row — RLS gated on `shared.has_access_role('admin')` and
  org-scoped — and shall **deny** the write to any non-`admin` (ADR-0011 D5, OD-P4-4).
- **FR-031** When an `admin` attempts to grant **`admin` or `finance` to themselves**
  (`new.person_id = shared.current_person_id()`), the system shall **deny** it at the DB layer
  (`shared._guard_person_access_roles` BEFORE INSERT/UPDATE → `42501`) — `admin`/`finance` are **never
  self-assignable** (ADR-0011 D5; enforced in the DB, not merely the UI, NFR-001).
- **FR-032** The system shall treat `org_id`, `person_id`, and `access_role` as **immutable** once
  written: any UPDATE changing them RAISES `42501` (guard trigger) — an UPDATE may only flip
  `revoked_at` / `revoked_by` (revoke / re-grant) (§3.5, mirrors `ops._guard_log_entry` immutability).
- **FR-033** The system shall stamp `granted_by` to `shared.current_person_id()` server-side on an
  app-tier grant (NULL only for the service-role seed) and shall stamp `org_id` from
  `current_org_id()` — both unspoofable (OD-P1-1, §3.2).
- **FR-034** The system shall model **revocation** as a soft `revoked_at` UPDATE (reversible,
  audit-preserving), and shall **not** grant DELETE to `authenticated` on `shared.person_access_roles`
  (no hard delete — removal is structurally impossible for the app tier; mirrors `ops.log_entries`
  / `mos.tasks`) (NFR-004, §3.2).
- **FR-035** The system shall make `shared.person_access_roles` **org-readable** to authenticated org
  members for SELECT (`org_id = current_org_id()`) so the viewer and a future admin screen can list a
  person's roles, while reads remain org-isolated (cross-org returns zero rows) (OD-P1-1, mirrors the
  directory org-readable posture).

### First-`admin` seed (bootstrap)
- **FR-060** The system shall **seed the first `admin`** at deploy via `service_role` (which bypasses
  RLS, so the self-escalation guard and the admin-only grant rule do not block the bootstrap), resolving
  the "who grants the first admin" chicken-and-egg (ADR-0011 D5; credential via the `op` secret path,
  ADR-0010 D9/D12). The seed assignment carries `granted_by = NULL` (no granting person).
- **FR-061** The system shall apply **sensible default assignments** to the existing seeded roster: the
  **owner → `admin`**; **all other seeded people → `member`** (ADR-0011 D5 default = `member`). Real
  names/emails enter only via the **uncommitted gitignored deploy-time seed** (OD-P1-6); **fictional dev
  people** get dev-only assignments in the committed test seed. *(Open §10: exact `admin`/`ops_lead`/`finance`
  assignment for the real roster — owner-decided at the provisioning spec; this slice fixes only the
  pattern owner→`admin`, others→`member`.)*

### Viewer exposure (`mos-app/src/lib/db/viewer.ts`)
- **FR-070** The system shall surface the current user's **effective access roles** on the viewer object —
  the **assigned** access roles (from the session JWT `access_roles` claim) **∪** the **derived
  `manager`** capability (the existing `isManager` derivation, FR-003/OD-P1-7) — as a stable shape the
  SPA reads (e.g. `ViewerResult.accessRoles: string[]` containing the assigned roles plus `'manager'`
  when `isManager` is true, or a discrete `{ assigned: string[]; isManager: boolean }`) (ADR-0011 D5,
  CONTEXT.md "Access role" effective = union).
- **FR-071** The system shall read the **assigned** access roles in the SPA from the **session JWT
  claim** (no extra round-trip / no DB read for the assigned set) — the SPA decodes the `access_roles`
  claim off the Supabase session — consistent with how `org_id` / `person_id` are already session-borne
  (ADR-0001 D1, §3.3).
- **FR-072** Where the viewer is an **orphan** (no `shared.people` row) or the claim is absent, the
  system shall expose **no access roles** (empty assigned set, `isManager` false) — fail closed, no throw
  — consistent with `resolveViewer`'s existing orphan handling (OD-P1-10, viewer.ts).
- **FR-073** The viewer exposure shall **not** alter the existing `person` / `roles` / `isManager` shape
  it already returns — it **adds** the effective-access-roles surface (FR-070), preserving the current
  `resolveViewer` contract (viewer.ts).

---

## 5. Non-functional requirements

- **NFR-001 (Security — grant/self-escalation guard enforced at the DB).** The admin-only grant rule
  (FR-030) and the `admin`/`finance`-never-self-assignable guard (FR-031) shall be enforced at the **DB
  layer** (RLS + `_guard` trigger), **not merely** the SPA — a hidden route is not a security boundary
  (ADR-0011 D5). A non-`admin` write and a self-grant of `admin`/`finance` are both denied even by a
  direct PostgREST call. Proven in **pgTAP**.
- **NFR-002 (Security — unspoofable, server-stamped).** The `access_roles` JWT claim shall be stamped
  **server-side** by the definer hook (FR-010/011); the SPA and RLS read the signed claim, never client
  input. `org_id` / `granted_by` on the assignment row are server-stamped + WITH-CHECK-bound (OD-P1-1).
  A client cannot self-assign by setting a claim or a foreign `org_id`. Proven in **pgTAP** (claim
  presence + org-scope) + **unit** (SPA reads the claim, never trusts a client-set value).
- **NFR-003 (Security — RLS enable + FORCE, org-isolated).** `shared.person_access_roles` shall have RLS
  **enabled and FORCED**; SELECT org-scoped (`org_id = current_org_id()`, cross-org → zero rows);
  INSERT/UPDATE admin-only org-scoped (FR-030/035). Proven in **pgTAP**.
- **NFR-004 (Security — no hard delete).** No DELETE grant to `authenticated` on
  `shared.person_access_roles`; revocation is the soft `revoked_at` UPDATE (FR-034) — hard delete is
  structurally impossible for the app tier (mirrors `mos.tasks` / `ops.log_entries`). Proven in **pgTAP**
  (a DELETE attempt is denied).
- **NFR-005 (Reversibility & convention).** The migration(s) shall be reversible (drop table /
  helpers / guard cleanly; the hook extension reverts to its prior body via `CREATE OR REPLACE`) and
  follow existing conventions — schema-qualified, `set search_path = ''` on every function, enable+FORCE
  RLS, **no DELETE grant**, **`SECURITY INVOKER`** helpers (so the SECURITY-DEFINER-revoke CI lint has
  nothing to flag on the new helpers; the hook stays the single audited `SECURITY DEFINER` injection
  point per ADR-0001), text+CHECK vocabulary (ADR-0001 D1, P1/P2 patterns, integration.yml lint).
- **NFR-006 (Gating security review — ADR-0010 D11).** This slice is part of the **auth / RLS /
  provisioning surface** that ADR-0011 names and ADR-0010 **D11** makes a **gating** security-auditor
  review **before any exposure or rollout** (OD-P4-7). The `security-auditor` shall cover: the
  self-escalation guard (can any path grant itself `admin`/`finance`?), the claim-spoof seam (can a
  client forge `access_roles`?), the hook's widened definer read (`person_access_roles`), the
  revoke-then-re-grant immutability, and the seed's `service_role` bootstrap. **No production exposure
  until this passes.**
- **NFR-007 (No new `SECURITY DEFINER` to revoke).** The two read helpers are `SECURITY INVOKER`; the
  only `SECURITY DEFINER` touched is the **pre-existing** `custom_access_token_hook` (extended, not new),
  whose execute is already revoked from `authenticated/anon/public` and granted only to
  `supabase_auth_admin` (migration `…000005`) — re-verified, not re-introduced (mirrors the
  ops-log INVOKER-only rationale).
- **NFR-008 (Claim staleness — accepted, bounded).** A grant/revoke takes effect for an existing session
  only on the next token refresh (≤ access-token TTL, ADR-0011 D3) — the same accepted trade as the
  `org_id` claim (ADR-0001 D1). Recorded; the no-staleness alternative (live-table helper read) is the
  open question §10.
- **NFR-009 (Vocabulary fidelity).** Code, columns, claims, and any copy shall use CONTEXT.md terms
  exactly: **Access role** (the app-authz layer, values `admin`/`ops_lead`/`finance`/`member`), **derived
  `manager`** (never an assigned value), **Role** reserved for org position, **RACI** reserved for task
  ownership. The column/claim name is `access_role(s)` — never bare `role` (which means org Role).
- **NFR-010 (Coverage / gates).** Changed code shall meet the binding gates: ≥80% lines on changed code,
  `npm run typecheck` clean, ESLint `--max-warnings=0`; each `AC-###` proven at its lowest sufficient
  layer (pgTAP for the DB substrate, Vitest/RTL unit for the viewer).

---

## 6. Acceptance criteria (Given/When/Then) — each tagged with its owning test layer

> **Test-pyramid rule (CLAUDE.md):** each `AC-###` is owned by **one** test at the **lowest sufficient
> layer**. The **assignment CHECK + union + manager-not-stored + JWT-claim + `has_access_role` + admin-only
> grant + self-escalation guard + immutability + no-DELETE + org-scope** → **pgTAP** (the security core).
> The **viewer effective-role derivation (assigned ∪ derived manager), orphan/empty, claim-decode** →
> **Unit (Vitest/RTL)**. The AC id is tagged in the owning test's title so `grep -r AC-###` finds the proof.

### Assignment model, union, manager-derived, CHECK → **pgTAP**
- **AC-001 [pgTAP]** Given a person P in org A, When an `admin` grants P the `ops_lead` access role, Then
  a `shared.person_access_roles` row exists for `(P, 'ops_lead')` with `org_id` = A and `revoked_at`
  NULL — FR-001, FR-030.
- **AC-002 [pgTAP]** Given P holds `member` and `ops_lead`, When P's assigned access roles are read, Then
  the result is the **set `{member, ops_lead}`** (union; held several) — FR-002.
- **AC-003 [pgTAP]** Given an INSERT with `access_role = 'manager'` (or any value outside
  `{admin, ops_lead, finance, member}`), Then the CHECK rejects it (`manager` is derived, never
  assigned; vocabulary is fixed) — FR-002, FR-003, FR-004.
- **AC-004 [pgTAP]** Given a person who holds a role strictly above another person's role (so
  `shared.is_manager_of` is true), When `shared.person_access_roles` is queried, Then **no `manager`
  row exists** for them — the manager capability is derived, not stored — FR-003.
- **AC-005 [pgTAP]** Given `(P, 'member')` already exists, When an `admin` attempts to grant
  `(P, 'member')` again, Then the `unique (person_id, access_role)` constraint (or the re-grant clearing
  `revoked_at`) prevents a duplicate row — FR-005.

### JWT claim stamping → **pgTAP**
- **AC-010 [pgTAP]** Given P holds `member` and `finance` (non-revoked), When the
  `custom_access_token_hook` runs for P's `user_id`, Then the returned claims contain
  `access_roles = ["finance","member"]` (the assigned set; order-insensitive) alongside the existing
  `org_id` / `person_id` claims — FR-010, FR-011.
- **AC-011 [pgTAP]** Given P holds a revoked `ops_lead` and a live `member`, When the hook runs, Then
  `access_roles` contains **`member` only** (revoked roles excluded) — FR-010, FR-034.
- **AC-012 [pgTAP]** Given a `user_id` with **no** linked people row (orphan) or a person with no
  assignments, When the hook runs, Then `access_roles` is `[]` (empty array, fail-safe — never absent /
  never `manager`) — FR-012, FR-013.

### Read helpers → **pgTAP**
- **AC-020 [pgTAP]** Given a session whose JWT `access_roles` claim is `["ops_lead","member"]`, Then
  `shared.current_access_roles()` returns `{ops_lead, member}` and `shared.has_access_role('ops_lead')`
  is true while `shared.has_access_role('admin')` is false — FR-020, FR-021.
- **AC-021 [pgTAP]** Given a session with **no** / a malformed `access_roles` claim, Then
  `shared.current_access_roles()` returns an **empty array** and `shared.has_access_role(<anything>)` is
  false (fail closed) — FR-020 (mirrors `_claim_uuid` fail-closed).

### Admin-only grant + self-escalation guard (DB) → **pgTAP** (the security core)
- **AC-030 [pgTAP]** Given a session that is **not** `admin` (e.g. a `member` or even an `ops_lead`),
  When it attempts to INSERT a `person_access_roles` row, Then RLS denies it (no admin claim) — FR-030,
  NFR-001/003.
- **AC-031 [pgTAP]** Given an `admin` session, When it grants `member` / `ops_lead` to **another** person
  P, Then it succeeds with `granted_by` = the admin's `current_person_id()` and `org_id` server-stamped —
  FR-030, FR-033.
- **AC-032 [pgTAP]** Given an `admin` session, When it attempts to grant **`admin` to itself**
  (`person_id = current_person_id()`), Then the `_guard` trigger denies it (`42501`) — `admin` never
  self-assignable — FR-031, NFR-001.
- **AC-033 [pgTAP]** Given an `admin` session, When it attempts to grant **`finance` to itself**, Then it
  is denied (`42501`) — `finance` never self-assignable — FR-031, NFR-001.
- **AC-034 [pgTAP]** Given an `admin` session, When it grants `finance` to **another** person, Then it
  succeeds (only **self**-assignment of `admin`/`finance` is blocked, not granting them to others) —
  FR-030, FR-031.
- **AC-035 [pgTAP]** Given an existing `(P, 'ops_lead')` row, When an `admin` UPDATEs it to change
  `person_id` (re-target) or `access_role` or `org_id`, Then the `_guard` trigger denies it (`42501`,
  immutable) while an UPDATE that only sets `revoked_at` succeeds — FR-032.
- **AC-036 [pgTAP]** Given an `admin` attempts to set a foreign `org_id` on a grant, Then WITH CHECK
  (`org_id = current_org_id()`) rejects it — FR-033, NFR-002/003.

### Revocation, org-read, no hard delete → **pgTAP**
- **AC-040 [pgTAP]** Given `(P, 'ops_lead')` live, When an `admin` sets `revoked_at` (revoke) and later
  clears it (re-grant), Then both succeed (reversible) and the assigned-set read excludes the role while
  revoked, includes it after re-grant — FR-034, FR-005.
- **AC-041 [pgTAP]** Given any `person_access_roles` row, When an authenticated member (admin or not)
  issues a **DELETE**, Then it is denied (no DELETE grant) — removal is soft-revoke only — FR-034,
  NFR-004.
- **AC-042 [pgTAP]** Given an assignment row in org A, When a member of **org B** SELECTs it, Then **zero
  rows** (cross-org isolation); a same-org member reads it — FR-035, NFR-003.

### First-admin seed → **pgTAP**
- **AC-050 [pgTAP]** Given the deploy seed runs as `service_role`, When it inserts the first `admin`
  assignment, Then it succeeds **despite** the admin-only RLS rule and the self-escalation guard
  (`service_role` bypasses RLS / the guard's self-check has no `current_person_id` for the seed path),
  and the row carries `granted_by = NULL` — FR-060.
- **AC-051 [pgTAP]** Given the default-assignment seed, When applied, Then the **owner** person holds
  `admin` and a non-owner seeded person holds `member` (the default) — FR-061.

### Viewer effective-role derivation (assigned ∪ derived manager) → **Unit (Vitest/RTL)**
- **AC-060 [unit]** Given a session whose decoded `access_roles` claim is `["ops_lead","member"]` and a
  role chain where `deriveIsManager` is **false**, When the viewer resolves, Then its effective access
  roles are exactly `{ops_lead, member}` (no `manager`) — FR-070, FR-071.
- **AC-061 [unit]** Given a session with assigned `["member"]` **and** a role chain where
  `deriveIsManager` is **true**, When the viewer resolves, Then its effective access roles are
  `{member, manager}` — the **assigned ∪ derived-manager** union; `manager` appears **only** from the
  derivation, never from the claim — FR-070, FR-003.
- **AC-062 [unit]** Given an **orphan** session (no `shared.people` row) or an absent `access_roles`
  claim, When the viewer resolves, Then effective access roles are **empty** and `isManager` is false
  (fail closed, no throw) — FR-072.
- **AC-063 [unit]** Given any viewer resolution, Then the existing `person` / `roles` / `isManager`
  fields of `ViewerResult` are unchanged in shape and value, and the effective-access-roles surface is
  **added** (the prior contract is preserved) — FR-073.
- **AC-064 [unit]** Given the SPA reads the assigned access roles, When it does so, Then it decodes the
  **session JWT `access_roles` claim** and makes **no** extra DB/network round-trip for the assigned set
  (it never trusts a client-set value) — FR-071, NFR-002.

---

## 7. Error handling

| Condition | Layer | Behaviour |
|---|---|---|
| Non-`admin` attempts to grant/revoke an access role | RLS WITH CHECK / USING | Denied (no admin claim) (AC-030). |
| `admin` attempts to grant `admin`/`finance` **to self** | DB `_guard` trigger | Denied `42501` — never self-assignable (AC-032/033). |
| UPDATE changes `person_id` / `access_role` / `org_id` of an existing grant | DB `_guard` trigger | Denied `42501` — immutable; only `revoked_at`/`revoked_by` may change (AC-035). |
| Client-supplied foreign `org_id` on grant | RLS WITH CHECK | Rejected (`org_id = current_org_id()`) (AC-036). |
| Invalid `access_role` value (incl. `manager`) | DB CHECK | Rejected (AC-003). |
| Duplicate `(person_id, access_role)` grant | DB unique constraint | Rejected; re-grant clears `revoked_at` instead (AC-005). |
| Hard DELETE of an assignment by the app tier | Privilege (no grant) | Denied — removal is soft-revoke only (AC-041). |
| Cross-org read of an assignment | RLS USING | Zero rows (org-isolated) (AC-042). |
| Malformed / absent `access_roles` claim | helper (`current_access_roles`) | Returns empty array; `has_access_role` false (fail closed) (AC-021). |
| Orphan session / no people row | hook + viewer | Claim `[]`; viewer empty effective set, no throw (AC-012, AC-062). |
| Grant/revoke not yet reflected in an existing session | (accepted) claim staleness | Effective on next token refresh (≤ TTL); recorded NFR-008 / §10. |

---

## 8. Implementation checklist (build order; TDD red-green per CLAUDE.md — for eng-planner)

**Schema / DB (pgTAP red first):**
- [ ] Migration `shared.person_access_roles` (§3.2): columns, `access_role` CHECK
      (`{admin,ops_lead,finance,member}`), `unique (person_id, access_role)`, `revoked_at`/`revoked_by`
      soft-revoke, indexes (`org_id`, `person_id`, `access_role`), `org_id` default
      `shared.current_org_id()`, `set_updated_at` trigger; reversible. *(Decide table vs. enum-array — §10.)*
- [ ] Extend `shared.custom_access_token_hook` via a **new dated migration** (`CREATE OR REPLACE`, do
      **not** edit `…000005`): stamp the `access_roles` claim (non-revoked assigned set); add
      `grant select on shared.person_access_roles to supabase_auth_admin`. Reversible (replace back to
      prior body).
- [ ] `shared.current_access_roles()` + `shared.has_access_role(text)` — `STABLE` `SECURITY INVOKER`
      `set search_path=''`, fail-closed claim parse (generalize `_claim_uuid` to a text-array claim).
- [ ] `shared._guard_person_access_roles()` BEFORE INSERT/UPDATE trigger: self-grant of `admin`/`finance`
      → `42501`; `person_id`/`access_role`/`org_id` immutable on UPDATE → `42501` (mirror
      `ops._guard_log_entry`). `SECURITY INVOKER`.
- [ ] Base grants: SELECT / INSERT / UPDATE to `authenticated`; **NO DELETE grant** (NFR-004).
- [ ] RLS enable+FORCE: SELECT `org_id = current_org_id()` (org-readable, FR-035); INSERT/UPDATE
      `WITH CHECK (org_id = current_org_id() AND shared.has_access_role('admin'))` (+ USING on UPDATE).
- [ ] First-`admin` **seed**: in the gitignored deploy-time seed (OD-P1-6) as `service_role` — owner →
      `admin`, others → `member`; fictional dev people in the committed test seed get dev assignments.
- [ ] pgTAP suite (numbered after the existing `24_…`): assignment/union/CHECK (AC-001..005), hook claim
      (AC-010..012), helpers (AC-020/021), admin-only + self-escalation guard + immutability + org-scope
      (AC-030..036), revoke/no-delete/org-read (AC-040..042), seed (AC-050/051). Extend the
      `_test_seed_role_tree` fixture (migration `…000003`) with access-role grant fixtures.

**Lib / SPA (`mos-app/src/lib/db/viewer.ts`):**
- [ ] Extend `ViewerResult` with the effective access-roles surface (FR-070) — decode the session JWT
      `access_roles` claim for the assigned set (FR-071), union with `'manager'` when `isManager`
      (deriveIsManager, FR-003). Preserve the existing `person`/`roles`/`isManager` shape (FR-073).
      Orphan/absent → empty (FR-072).
- [ ] `database.types.ts` regenerated for the new `shared.person_access_roles` table.
- [ ] Unit tests (Vitest/RTL): effective-role derivation incl. assigned∪manager and orphan
      (AC-060..064).

**Security (gating — NFR-006, ADR-0010 D11):**
- [ ] `security-auditor` pass on the self-escalation guard, claim-spoof seam, hook definer read, the seed
      bootstrap — **before any exposure/rollout**.

---

## 9. Owner-decision flags

**None blocking the substrate.** The business rules are pre-decided in **ADR-0011 D5 / OD-P4-4** (fixed
set, three-layer enforcement, manager-derived, `admin`/`finance` never-self-assignable, first-admin
seeded) and encoded above. The **exact `admin`/`ops_lead`/`finance` assignment for the real seeded
roster** beyond "owner→`admin`, others→`member`" is owner-decided at the **provisioning spec** (not a
blocker for this substrate, recorded in §10).

---

## 10. Open questions (recorded, NOT resolved here — for grill / eng-planner / owner)

1. **Assignment table vs. enum-array.** `shared.person_access_roles` junction (leaning — mirrors
   `person_roles`, carries `granted_by`/`revoked_at` provenance, single-fact rows, fixture-friendly) **vs.**
   an `access_role[]` column on `shared.people` (denser, trivially stamped into the JWT, but no per-grant
   provenance and a revoke is a whole-array read-modify-write). **eng-planner finalizes the DDL.**
2. **Soft-revoke vs. row delete.** This spec leans **soft `revoked_at`** to honor the no-DELETE-grant
   posture and keep a revocation audit trail. The alternative — a hard `person_access_roles` row delete
   gated to `admin` (would require a DELETE grant + policy, breaking the house no-DELETE posture). Confirm
   soft-revoke; and confirm `unique (person_id, access_role)` + re-grant-clears-`revoked_at` vs. a
   partial-unique `WHERE revoked_at IS NULL` allowing a fresh row.
3. **JWT-claim vs. RLS-table-join (and staleness).** `has_access_role`/`current_access_roles` reading the
   **JWT claim** (leaning — the cheap scale path matching `current_org_id`, but **stale until the next
   token refresh**, ≤ access-token TTL) **vs.** reading the **live `person_access_roles` table** by
   `current_person_id()` (no staleness, but a per-policy correlated subquery — the cost ADR-0001 D1
   minted the claim to avoid). Decide whether immediate-effect grants/revokes are worth the per-policy
   read, or whether the bounded-staleness claim suffices for a ~15–30-user rollout.
4. **Exact `admin`/`finance`/`ops_lead` default assignment for the existing seeded roster.** This slice
   fixes only owner→`admin`, others→`member`. Who else is `ops_lead` (the kitchen leads) / `finance` on
   day one is owner-decided at the provisioning spec (and lands via the gitignored deploy-time seed,
   OD-P1-6).
5. **Does `current_access_roles()` read the claim or the table?** (The implementation face of #3.) If the
   claim: confirm the text-array claim shape `["member","ops_lead"]` and the fail-closed parse. If the
   table: confirm it is `SECURITY INVOKER` over the org-readable assignment table by `current_person_id()`.
6. **`granted_by` for the seed.** Leaning `NULL` (no granting person for the bootstrap admin). Confirm the
   FK `ON DELETE SET NULL` and that a NULL `granted_by` is acceptable provenance for the seed row.
```

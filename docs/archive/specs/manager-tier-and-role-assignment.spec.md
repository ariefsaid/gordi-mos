# Spec — `manager` financial tier + admin assignment of Jabatan & Access level

- Status: Draft for sign-off (2026-07-29)
- Source decisions: **owner (LOCKED)** — see `docs/adr/0050-manager-financial-visibility-tier.md`
  (amends ADR-0011 D5). Related: ADR-0011, ADR-0016, ADR-0010 D5, ADR-0001, ADR-0020.
- Scope: one branch / one PR. **(A)** a new `manager` access tier (company-wide revenue + COGS/margin
  view, org-scoped, SELECT-only); **(B)** admin can assign a person's **Jabatan** (Position) and
  **Access level** (including `manager`).
- Non-goals (recorded, deferred): a `supervisor` own-BU tier (blocked on a BU↔branch/channel mapping —
  reporting grain has no `business_unit`); overhead RLS (no overheads table exists); soft-delete on
  `shared.person_roles`; admin-editable capability grants (ADR-0020 D2).

## Glossary (terminology LOCKED)

- **Jabatan / Position** — org-chart position; a `shared.person_roles` row (person↔`shared.roles`).
  Never labeled "Role" in the UI.
- **Akses / Access level** — an app-authorization assignment; a `shared.person_access_roles` row. Never
  labeled "Role" in the UI.
- **`manager` (access role)** — stored, admin-granted; grants company-wide financial VIEW. Distinct from
  the derived reporting-line **manager** (`is_manager_of`), which stays derived and never stored (ADR-0050).

---

## Functional requirements (EARS)

### A — `manager` financial tier (DB)

- **FR-101** The system SHALL accept `manager` as a valid value of
  `shared.person_access_roles.access_role` (vocabulary widened to `admin | ops_lead | finance | member | manager`).
- **FR-102** When a person holds a non-revoked `manager` access role, the access-token hook SHALL stamp
  `manager` into the `access_roles` JWT claim (already automatic — the hook aggregates non-revoked rows).
- **FR-103** The SELECT RLS on `reporting.sales_daily_revenue` SHALL permit a same-org viewer holding
  `manager` to read all org rows.
- **FR-104** The SELECT RLS on `reporting.sales_margin_daily` SHALL permit a same-org viewer holding
  `manager` to read all org rows.
- **FR-105** The system SHALL NOT grant `manager` any INSERT/UPDATE/DELETE on either reporting table.
- **FR-106** The existing `finance`/`admin` SELECT arms and the `reporting_writer` write policy on both
  tables SHALL remain unchanged.
- **FR-107** `manager` SHALL NOT be self-assignable: a live grant targeting the granting person for
  `manager` SHALL raise `42501` (parity with `admin`/`finance`; ADR-0050 D4).
- **NFR-101** (tenancy) `manager` SELECT SHALL remain org-scoped (`org_id = shared.current_org_id()`);
  cross-org reads return zero rows.
- **NFR-102** (security) `manager` grants VIEW only — no write path; no overheads (none exist).

### A — `manager` financial tier (SPA reach)

- **FR-110** A viewer holding `manager` SHALL be able to reach the Dashboard route and see the Plan
  destination in navigation.
- **FR-111** The company revenue/margin Home tiles SHALL render for a `manager` viewer
  (`canViewFinance` true).
- **FR-112** `manager` SHALL NOT be admitted to budget/pricing planning routes or write capabilities
  (view-only boundary; those stay `finance`/`admin`).
- **FR-113** The finance-view gates (`canViewFinance` / `RequireAccessRole` / Plan destination) SHALL key
  on the **stored** access-role set only. The derived reporting-line manager (`viewer.isManager`) SHALL
  NOT be merged into `accessRoles` (security-review correction — otherwise every reporting-line manager
  would pass the finance gate onto an empty, RLS-blocked dashboard). This inverts the pre-existing
  `AC-061` (`viewer.test.ts`), whose latent `assigned ∪ derived-manager` behavior had no consumer.

### B — Admin assignment of Jabatan + Access level

- **FR-201** An admin SHALL be able to assign a Jabatan (`shared.person_roles` row) to a person in their org.
- **FR-202** An admin SHALL be able to remove a person's Jabatan assignment (hard delete).
- **FR-203** A non-admin SHALL NOT be able to assign/remove a Jabatan (RLS denies with `42501`).
- **FR-204** A Jabatan assignment SHALL reference a person AND a role that both belong to the caller's
  org; otherwise the guard SHALL raise `42501`. `org_id` SHALL be server-stamped and unspoofable.
- **FR-205** An admin SHALL be able to grant/revoke a person's Access level, including `manager`, via the
  existing `shared.person_access_roles` admin write path.
- **FR-206** The admin People UI SHALL label the org-chart assignment **"Position"** and the access
  assignment **"Access level"**, and SHALL NOT label either "Role".
- **FR-207** A person MAY simultaneously hold `ops_lead` and `manager`; the axes are independent.
- **FR-208** A Jabatan assignment SHALL record **who made it**: `shared.person_roles.granted_by` SHALL be
  stamped server-side from `shared.current_person_id()` by the guard, and a client-supplied value SHALL be
  discarded rather than trusted. Added by the 2026-07-30 security audit (M-1): assigning a top-of-chain
  Position widens the holder's reach through `shared.is_manager_of()` — specifically `can_edit_task`
  (UPDATE), `can_edit_log_entry` (UPDATE) and `can_read_weekly_update` (read); task and ops-log SELECT
  are org-wide and NOT manager-gated, so this is a data-integrity and attribution concern, not
  cross-org escalation (impact corrected per the 2026-07-30 review) — and that
  permission-affecting write previously recorded no actor (STRIDE Repudiation). Under the service/seed
  connection `granted_by` is NULL — there is no acting person to attribute.
  **Not required — but recorded as an ACCEPTED RISK, not a non-issue.** Self-assignment of a Position
  is deliberately allowed: `person_roles` records an org **position**, not an app privilege; an admin
  setting their own job title is legitimate, and a hard block is a lockout footgun in a single-admin org.
  *Corrected per the 2026-07-30 review:* the original justification ("no privilege delta — an admin can
  already impersonate via `admin_reset_password`") was a category error. It is true on **capability**
  but false on **detectability**, which is the axis M-1 is about. Impersonation is loud and
  irreversible — it overwrites the victim's password hash, locks them out immediately, cannot be undone
  through the app, and leaves `auth.sessions` / GoTrue audit rows. A silent Position self-grant leaves
  none of that, and because removal is a hard DELETE with no attribution, the sequence
  *self-grant → read subordinates' weekly updates → delete* leaves **zero residue even after M-1**.
  So the residual risk is real; it is accepted because a hard block costs more than the residual is
  worth, **not** because the residual is nil. Closing it properly means attributable revocation
  (`revoked_at` soft-delete or an append-only audit table), tracked as a follow-up — not a self-assign block.
- **NFR-201** All assignment writes SHALL be enforced server-side (RLS/guard), not merely UI-gated.

---

## Acceptance criteria (Given/When/Then) — each owned by ONE test at the lowest sufficient layer

### pgTAP — vocabulary (`supabase/tests/30_access_roles_vocabulary.sql`, updated)

- **AC-101** *(FR-101)* Given the access-role vocabulary, When a row with `access_role = 'manager'` is
  inserted, Then it is accepted (no CHECK violation).
- **AC-102** *(FR-101)* Given the vocabulary, When a row with `access_role = 'superuser'` is inserted,
  Then it is rejected with `23514`.

### pgTAP — manager reporting RLS (`supabase/tests/83_reporting_manager_tier_rls.sql`, new)

- **AC-103** *(FR-103)* Given org-A revenue rows, When a same-org viewer holds `['manager']`, Then they
  read all org-A `sales_daily_revenue` rows.
- **AC-104** *(FR-104)* Given org-A margin rows, When a same-org viewer holds `['manager']`, Then they
  read all org-A `sales_margin_daily` rows.
- **AC-105** *(FR-207/103/104)* Given a viewer holds `['ops_lead','manager']`, Then they read org-A
  revenue and margin rows (coexistence — `ops_lead` alone reads zero).
- **AC-106** *(NFR-102)* Given a viewer holds only `['ops_lead','member']`, Then they read zero revenue
  and zero margin rows.
- **AC-107** *(NFR-101)* Given a `manager` in org B, Then they read zero org-A revenue and margin rows.
- **AC-108** *(FR-105)* Given a `manager` viewer, When they attempt INSERT on either reporting table,
  Then it is denied with `42501`.
- **AC-109** *(FR-106)* Given the widened policy, When a `finance` viewer reads, Then they still read all
  org-A rows (finance arm not weakened).

### pgTAP — admin assignment (`supabase/tests/84_admin_assign_jabatan.sql`, new)

- **AC-110** *(FR-205/107)* Given an admin session, When the admin grants `manager` to another person,
  Then it lives; When the admin grants `manager` to self, Then `42501`.
- **AC-111** *(FR-201/204)* Given an admin session, When the admin inserts a `person_roles` row for a
  same-org person + role, Then it lives and `org_id` is server-stamped to the admin's org.
- **AC-112** *(FR-202)* Given an admin session, When the admin deletes a `person_roles` row, Then it is
  removed.
- **AC-113** *(FR-203)* Given a non-admin session, When inserting a `person_roles` row, Then `42501`.
- **AC-114** *(FR-204)* Given an admin session, When inserting a `person_roles` row whose `role_id`
  belongs to another org, Then the guard raises `42501`.
- **AC-115** *(FR-204/NFR-201)* Given an admin session, When inserting a `person_roles` row with an
  explicit foreign `org_id`, Then the WITH CHECK raises `42501`.
- **AC-116** *(FR-204)* Given an admin session, When inserting a `person_roles` row for a person in
  another org (same-org role), Then the guard raises `42501` (the guard checks the person's org too).
- **AC-117** *(FR-203)* Given a non-admin session, When deleting an existing `person_roles` row, Then the
  admin-only delete policy filters it out (no error, zero rows affected) and the row remains.
- **AC-209** *(FR-208)* Given an authenticated admin session, When it inserts a `person_roles` row, Then
  the row's `granted_by` holds the **acting** person's id, stamped server-side by
  `shared._guard_person_roles()`.
- **AC-211** *(FR-208)* Given the same session, When it inserts a `person_roles` row **supplying** a
  `granted_by` naming someone else, Then the insert succeeds but the supplied value is **discarded** and
  replaced with the acting person's id — attribution is never client-controlled.
- **AC-214** *(FR-204/208)* Given the deployed schema, Then the `person_roles_guard` trigger is
  **attached** to `shared.person_roles`. It is the *only* wall for the cross-org person/role seam — the
  RLS `WITH CHECK` does not verify either FK's org — so an unattached trigger lets an admin write
  cross-org `person_roles` rows while every behavioural test still passes for the wrong reason. This is
  a data-integrity hole in that table, **not** privilege escalation: every policy consuming
  `is_manager_of` is independently org-bound, so no cross-org business data becomes readable.
- **AC-215** *(FR-208)* Given the service/seed connection (no `current_person_id()`), When a
  `person_roles` row is inserted, Then `granted_by` is NULL — there is no acting person to attribute,
  and the column must not invent one.

### Vitest / RTL — types, DAL, UI

- **AC-120** *(FR-101/206)* `ASSIGNABLE_ROLES` includes `manager`; `ROLE_META.manager` has a label and a
  non-empty, non-"derived" description. *(admin-users.types.test.ts)*
- **AC-121** *(FR-205)* Given the RoleEditor for another person, Then a "Manager" checkbox is rendered.
  *(role-editor.test.tsx — replaces the old "manager never rendered" assertion)*
- **AC-122** *(FR-107)* Given the RoleEditor for the viewer's own row, Then the "Manager" checkbox is
  disabled (self-guard parity). *(role-editor.test.tsx)*
- **AC-123** *(FR-205)* Given the RoleEditor, When toggling "Manager" on, Then `grantRole(id,'manager')`
  is called; off → `revokeRole(id,'manager')`. *(role-editor.test.tsx)*
- **AC-124** *(FR-201/202)* `listRoles()` returns role options; `assignJabatan(p,r)` inserts a
  `person_roles` row; `removeJabatan(p,r)` deletes it; `listAdminPeople()` includes each person's
  `jabatan`. *(admin-users.test.ts)*
- **AC-125** *(FR-201/206)* Given the Position picker, Then it lists org roles labeled "Position" (never
  "Role"); checking a role calls `assignJabatan`, unchecking calls `removeJabatan`.
  *(position-picker.test.tsx)*
- **AC-126** *(FR-206)* Given the People table, Then it shows a "Position" column and an "Access" column,
  neither labeled "Role"; the per-person menu item reads "Manage access & position" (not "Manage roles").
  *(user-table.test.tsx)*
- **AC-127** *(FR-110/112)* Given the router, Then the `/dashboard` route guard admits `manager`; the
  `/plan/budget` route guard does NOT admit `manager`. *(router.test.tsx)*
- **AC-128** *(FR-110)* Given the Plan destination, Then it is live for a `manager` viewer;
  `canViewFinance(['manager'])` is true. *(destinations.test.ts)*
- **AC-129** *(FR-111)* Given a `manager` viewer on Home, Then the company money tiles render (the
  finance fetch is issued). *(home-page.test.tsx and/or stacked-union-home.test.tsx)*

## Test layer ownership

- RLS / role read+write contracts → **pgTAP** (`supabase test db`): AC-101..117, AC-209, AC-211, AC-214.
- Types / component render / DAL wrappers → **Vitest/RTL**: AC-120..129.
- **No new e2e** — no new cross-stack journey; existing curated journeys unaffected.

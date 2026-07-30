# Spec — `supervisor` per-branch revenue-scope tier

- Status: Draft for sign-off (2026-07-29)
- Source decisions: **owner (LOCKED)** — see `docs/adr/0051-supervisor-per-branch-revenue-scope.md`
  (adds a sixth access role; resolves ADR-0050's deferred `supervisor`). Related: ADR-0050, ADR-0011,
  ADR-0010 D5, ADR-0016, ADR-0001, ADR-0020.
- Scope: one branch / one PR. A new **`supervisor`** access tier = **revenue-VIEW-only**, scoped to an
  explicit per-person set of `(channel, branch_code|null)`; an admin **scope editor**; and a Home/
  Dashboard **revenue-vs-margin split** so a supervisor sees revenue but never a margin panel.
- Non-goals (recorded): margin/COGS for supervisors (owner locked revenue-only; margin grain has no
  channel column); BU-derived visibility (rejected — Ipul's branch is finer than his BU, ADR-0051 D2);
  planning/write for supervisors (budget/pricing stay finance/admin); a supervisor cockpit on the
  stacked-union Home (follow-up; that surface is flag-off in production).

## Glossary (terminology LOCKED)

- **`supervisor` (access role)** — stored, admin-granted; grants **revenue VIEW** scoped to the person's
  granted channel/branch set. Never labeled "Role" in the UI.
- **Revenue scope** — a `reporting.supervisor_revenue_scope` row: `(person, channel, branch_code)`.
  `branch_code = null` means the **whole channel**. The admin UI section is labeled **"Revenue scope"**.
- **`canViewRevenue` / `canViewMargin`** — the split SPA gates (ADR-0051 D4). Revenue = finance | admin |
  manager | supervisor; Margin = finance | admin | manager.

---

## Functional requirements (EARS)

### A — `supervisor` tier (DB)

- **FR-301** The system SHALL accept `supervisor` as a valid value of
  `shared.person_access_roles.access_role` (vocabulary widened to
  `admin | ops_lead | finance | member | manager | supervisor`).
- **FR-302** When a person holds a non-revoked `supervisor` access role, the access-token hook SHALL
  stamp `supervisor` into the `access_roles` JWT claim (already automatic — the hook aggregates
  non-revoked rows without enumerating values; no hook change).
- **FR-303** The system SHALL provide `reporting.supervisor_revenue_scope(org_id, person_id, channel,
  branch_code, granted_by, created_at)` with: one row per `(person, channel, branch_code)`;
  `branch_code` NULL meaning the whole channel; `channel` constrained to `{POS,B2B}`; admin-only,
  org-scoped INSERT/DELETE RLS; a guard enforcing the org seam (target person in caller's org) and
  forcing `granted_by` server-side; `org_id` server-stamped and unspoofable.
- **FR-304** A `supervisor` SHALL be able to SELECT their **own** scope rows, and an `admin` SHALL be
  able to SELECT all org scope rows; no other role SHALL read scope rows.
- **FR-305** The SELECT RLS on `reporting.sales_daily_revenue` SHALL permit a same-org `supervisor` to
  read **only** the rows whose `(channel, branch_code)` matches one of their scope rows (a NULL
  `branch_code` scope row matching every branch of that channel), and **no** other rows.
- **FR-306** The SELECT RLS on `reporting.sales_margin_daily` SHALL remain unchanged; a `supervisor`
  SHALL read **zero** margin rows.
- **FR-307** The system SHALL grant `supervisor` no INSERT/UPDATE/DELETE on either reporting table nor on
  the scope table; only an `admin` writes scope rows.
- **FR-308** `supervisor` SHALL NOT be self-assignable: a live grant targeting the granting person for
  `supervisor` SHALL raise `42501` (parity with `admin`/`finance`/`manager`; ADR-0051 D5).
- **FR-309** The existing `finance`/`admin`/`manager` SELECT arms and the `reporting_writer` write policy
  on both reporting tables SHALL remain unchanged.
- **NFR-301** (tenancy) `supervisor` SELECT SHALL remain org-scoped (`org_id = shared.current_org_id()`);
  cross-org reads return zero rows.
- **NFR-302** (security) `supervisor` grants VIEW only — no write path; no margin; no overheads.
- **NFR-303** (data provenance) The admin branch catalog SHALL be computed from live
  `select distinct channel, branch_code, branch_name from reporting.sales_daily_revenue`, never a
  hardcoded list.

### B — SPA reach: revenue-vs-margin split

- **FR-310** `canViewRevenue(accessRoles)` SHALL return true for `finance | admin | manager | supervisor`.
- **FR-311** `canViewMargin(accessRoles)` SHALL return true for `finance | admin | manager` (supervisor
  excluded).
- **FR-312** A viewer holding `supervisor` SHALL be able to reach the Dashboard route and see the Plan
  destination in navigation.
- **FR-313** The Dashboard SHALL render its gross-margin/COGS KPI row and the margin columns (Interim
  COGS / Gross margin / Margin %) and issue the margin fetch **only** when `canViewMargin` is true; for a
  supervisor those surfaces SHALL be absent (never an empty/`—` margin panel).
- **FR-314** The Home company money surface SHALL render the **revenue** tile when `canViewRevenue` and
  the **margin** tile when `canViewMargin`; a supervisor SHALL see the revenue tile and NOT the margin
  tile.
- **FR-315** `supervisor` SHALL NOT be admitted to the budget/pricing planning routes (they stay
  `finance | admin`).

### C — Admin assignment: role + revenue scope

- **FR-320** `supervisor` SHALL be an assignable Access level (`ASSIGNABLE_ROLES` + `ROLE_META`), so the
  RoleEditor renders a "Supervisor" checkbox and the People table renders its Tag.
- **FR-321** The RoleEditor "Supervisor" checkbox SHALL be self-guarded (disabled on the viewer's own
  row, parity with admin/finance/manager).
- **FR-322** When a person holds `supervisor`, the RoleEditor SHALL show a **"Revenue scope"** editor
  that lists live `(channel, branch_code)` options plus a "Whole {channel}" option per channel; checking
  an option SHALL call `assignRevenueScope`, unchecking SHALL call `removeRevenueScope`.
- **FR-323** The data layer SHALL provide `listRevenueScopeOptions()`, `assignRevenueScope(personId,
  channel, branchCode|null)`, `removeRevenueScope(personId, channel, branchCode|null)`, and
  `listAdminPeople()` SHALL include each person's `revenue_scope`.
- **FR-324** The scope section SHALL be labeled **"Revenue scope"** and SHALL NOT be labeled "Role".
- **NFR-320** All assignment writes SHALL be enforced server-side (RLS/guard), not merely UI-gated.

---

## Acceptance criteria (Given/When/Then) — each owned by ONE test at the lowest sufficient layer

### pgTAP — vocabulary (`supabase/tests/30_access_roles_vocabulary.sql`, updated)

- **AC-301** *(FR-301)* Given the access-role vocabulary, When a row with `access_role = 'supervisor'` is
  inserted, Then it is accepted (no CHECK violation).
- **AC-302** *(FR-301)* Given the vocabulary, When a row with an out-of-set `access_role` is inserted,
  Then it is rejected with `23514` (retains the existing negative).

### pgTAP — scope table RLS + self-assign (`supabase/tests/85_supervisor_scope_rls.sql`, new)

- **AC-303** *(FR-303)* Given an admin session, When the admin inserts a scope row for a same-org person
  (specific branch, and a whole-channel `branch_code = null`), Then both live and `org_id` is
  server-stamped to the admin's org.
- **AC-304** *(FR-303/NFR-320)* Given a non-admin session, When inserting a scope row, Then `42501`.
- **AC-305** *(FR-303)* Given an admin session, When inserting a scope row for a person in another org,
  Then the guard raises `42501`; and When inserting with an explicit foreign `org_id`, Then the WITH
  CHECK raises `42501`; and When inserting a `channel` not in `{POS,B2B}`, Then `23514`.
- **AC-306** *(FR-304)* Given a supervisor with one own scope row, When they SELECT the scope table, Then
  they read exactly their own row and not another person's.
- **AC-307** *(FR-303)* Given an admin session, When the admin deletes a scope row, Then it is removed;
  and Given a non-admin (the supervisor) session, When they attempt to delete their own scope row, Then
  the admin-only delete policy filters it (no error, zero rows affected) and the row remains.
- **AC-308** *(FR-308)* Given an admin session, When the admin grants `supervisor` to another person,
  Then it lives; When the admin grants `supervisor` to self, Then `42501`.

### pgTAP — revenue scoped RLS (`supabase/tests/86_supervisor_revenue_rls.sql`, new)

- **AC-310** *(FR-305)* Given org-A revenue with two POS branches + two B2B branches, and a supervisor
  scoped to `POS/BGR`, Then they read exactly the `POS/BGR` rows — not the other POS branch, not any B2B.
- **AC-311** *(FR-305)* Given a supervisor scoped to `B2B` whole-channel (`branch_code = null`), Then
  they read all B2B rows and zero POS rows.
- **AC-312** *(FR-306)* Given a supervisor, When they read `reporting.sales_margin_daily`, Then they read
  zero rows.
- **AC-313** *(NFR-301)* Given a supervisor in org B scoped to `POS/BGR`, Then they read zero org-A rows.
- **AC-314** *(FR-307)* Given a supervisor, When they attempt INSERT on `sales_daily_revenue`, Then
  `42501`.
- **AC-315** *(FR-309)* Given the extended policy, When a `finance` viewer and a `manager` viewer read,
  Then each still reads all org-A revenue rows (arms not weakened).
- **AC-316** *(FR-305)* Given a supervisor with two scope rows (`POS/BGR` + `B2B/null`), Then they read
  the `POS/BGR` row and all B2B rows, and not the other POS branch (multi-row coexistence).
- **AC-317** *(FR-305)* Given a supervisor with **no** scope rows, Then they read zero revenue rows
  (fail-closed).

### Vitest / RTL — capabilities, types, DAL, UI, router, home, dashboard

- **AC-320** *(FR-310/311)* `canViewRevenue` returns true for `['supervisor']` and each of
  finance/admin/manager; `canViewMargin` returns false for `['supervisor']` and true for
  finance/admin/manager. *(capabilities.test.ts)*
- **AC-321** *(FR-320/324)* `ASSIGNABLE_ROLES` includes `supervisor`; `ROLE_META.supervisor` has a label
  ("Supervisor") and a non-empty, revenue-oriented description. *(admin-users.types.test.ts)*
- **AC-322** *(FR-320/321)* Given the RoleEditor, Then a "Supervisor" checkbox renders; on the viewer's
  own row it is disabled (self-guard). *(role-editor.test.tsx)*
- **AC-323** *(FR-322/324)* Given the RevenueScopePicker with live options, Then it lists a "Whole
  {channel}" option per channel + each branch under a **"Revenue scope"** label (never "Role"); checking
  an unassigned option calls `assignRevenueScope(id, channel, branchCode|null)`; unchecking an assigned
  option calls `removeRevenueScope(id, channel, branchCode|null)`. *(revenue-scope-picker.test.tsx)*
- **AC-324** *(FR-322)* Given the RoleEditor, Then the RevenueScopePicker renders **only** when the
  person holds `supervisor` (absent otherwise). *(role-editor.test.tsx)*
- **AC-325** *(FR-323)* `listRevenueScopeOptions()` returns the distinct options; `assignRevenueScope`
  inserts a scope row with NO `org_id`; `removeRevenueScope` deletes by person+channel+branch
  (null-safe); `listAdminPeople()` includes each person's `revenue_scope`. *(admin-users.test.ts)*
- **AC-326** *(FR-312/315)* Given the router, Then the `/dashboard` route guard admits `supervisor`; the
  `/plan/budget` route guard does NOT admit `supervisor`. *(router.test.tsx)*
- **AC-327** *(FR-312)* Given the Plan destination, Then it is live for a `supervisor` viewer;
  `plan.anyOf` includes `supervisor`. *(destinations.test.ts)*
- **AC-328** *(FR-314)* Given a `supervisor` viewer on Home, Then the revenue tile renders and the margin
  tile does NOT (the margin fetch is not issued). *(home-page.test.tsx)*
- **AC-329** *(FR-313)* Given a `supervisor` viewer on the Dashboard, Then the gross-margin/COGS KPI row
  and the margin columns are absent and the margin fetch is not issued; the revenue KPIs render. Given a
  `finance` viewer, Then the margin row renders (unchanged). *(dashboard-page.test.tsx)*

## Test layer ownership

- RLS / role read+write contracts → **pgTAP** (`supabase test db`): AC-301..317. **CI-gated** (the local
  Supabase stack is unavailable to agents; the pgTAP files are authored to the fixtures and run in CI).
- Capabilities / types / component render / DAL wrappers / router / home / dashboard → **Vitest/RTL**:
  AC-320..329.
- **No new e2e** — no new cross-stack journey; existing curated journeys unaffected.

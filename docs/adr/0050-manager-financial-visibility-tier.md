# ADR-0050 — `manager` financial-visibility access tier (amends ADR-0011 D5)

- Status: **Accepted** (2026-07-29; owner decision LOCKED — this ADR records it, does not re-open it)
- Deciders: Owner (Arief) + Director
- Amends: **ADR-0011 D5** (the fixed access-role set `admin | ops_lead | finance | member`) — adds a fifth
  value, and **reverses** ADR-0011's statement that "manager … is never an assignable access role."
- Related: **ADR-0011** (auth model + RBAC; enum grows by one migration — Reversibility) ·
  **ADR-0016** (interim admin-provisioning definer RPCs; the admin-only, org-scoped write posture) ·
  **ADR-0010 D5** (the `reporting` schema — curated financial read-model, finance/admin RLS) ·
  **ADR-0001** (org seam; `org_id` isolation) · **ADR-0020** (capability authorization — client
  convenience, RLS is authority).
- Consumed by: `docs/specs/manager-tier-and-role-assignment.spec.md`,
  `docs/plans/2026-07-29-manager-tier-and-role-assignment.md`.

## Context

Two owner decisions, one branch:

1. **A company-wide financial-visibility tier.** Today only `finance` and `admin` may SELECT the
   `reporting` read-models (`reporting.sales_daily_revenue`, `reporting.sales_margin_daily`). The owner
   wants a tier for people who should see **company-wide revenue AND COGS/gross-margin** across all
   business units, but who are **not** finance (no overheads, no write, no planning surfaces).

2. **Admin can assign a person's Jabatan + Access level.** `/admin/people` provisions logins and edits
   access roles, but cannot set a person's **Jabatan** (org-chart position, `shared.person_roles`).

### The name collision (must be understood before reading the decision)

`CONTEXT.md` / ADR-0011 use **"manager"** for the **derived reporting-line capability** —
`shared.is_manager_of`, walked up the `shared.roles.reports_to_role_id` chain, **never stored**, and
ADR-0011 D5 says it is "never an assignable access role." The owner has now also asked for a **stored,
admin-granted access role literally named `manager`** for financial visibility. These are **two distinct
mechanisms that share a word**:

| "manager" sense | Mechanism | Stored? | Governs |
|---|---|---|---|
| Reporting-line manager (ADR-0011) | `shared.is_manager_of` (role-chain CTE) | No (derived) | task/RACI/weekly-update up-chain reads |
| **Financial-visibility `manager`** (this ADR) | `shared.person_access_roles.access_role = 'manager'`, stamped into the `access_roles` JWT claim | Yes (admin-granted, soft-revocable) | SELECT on the two `reporting` tables |

They coexist without interference: `is_manager_of` reads the role chain; the `manager` access role is a
claim value read by `has_access_role('manager')`. The access-token hook already **aggregates whatever
non-revoked rows exist** in `person_access_roles` (it does not enumerate values), so a granted `manager`
role flows into the claim with **no hook change**.

> **Correction (2026-07-29, security review).** The "no interference" claim was NOT initially true on
> the **client**: `viewer.ts` merged the derived reporting-line manager into the same `accessRoles`
> array the SPA finance gates read (`accessRoles = isManager ? [...assigned,'manager'] : assigned`).
> Once this branch wired `canViewFinance`/`RequireAccessRole`/the Plan destination to that slug, every
> reporting-line manager would have passed the finance-view gate onto an empty, RLS-blocked dashboard
> (no data breach — the JWT lacks the grant — but a dead-end + invariant violation). Fixed by removing
> that merge: `accessRoles` now carries the **stored claim only**, and the derived sense is exposed
> solely via the `viewer.isManager` boolean (which all reporting-line features already use). This
> inverted the latent, unconsumed `AC-061`. See spec FR-113.

## Decision

### D1 — Add `manager` to the access-role vocabulary

Extend the `shared.person_access_roles.access_role` CHECK from four values to five: add `manager`. This is
the "enum grows by one migration" path ADR-0011 Reversibility anticipated. The hook, `has_access_role`,
`current_access_roles`, and `_claim_text_array` need no change (none enumerate values).

### D2 — `manager` grants company-wide financial VIEW, org-scoped, SELECT-only

`manager` is added to the SELECT `USING` of **both** reporting policies
(`sales_daily_revenue_select_finance_admin`, `sales_margin_daily_select_finance_admin`) via
`ALTER POLICY` — the policy **names**, the existing `finance`/`admin` arms, and the
`reporting_writer` write policy are **untouched**. `manager` gets:

- **Revenue** (`reporting.sales_daily_revenue`) — all org rows across every channel/branch.
- **COGS / gross-margin** (`reporting.sales_margin_daily`) — all org rows.
- **No write path** on either table (no INSERT/UPDATE/DELETE; the base grant to `authenticated` is
  SELECT-only and FORCE RLS is on).
- **Org-scoped**: `org_id = shared.current_org_id()` remains conjoined — cross-org reads stay zero.

### D3 — No overheads (nothing to build)

There is **no overheads table**. Overheads therefore remain finance/admin-only **by construction** — a
`manager` cannot see what does not exist. When an overheads read-model is built, its RLS is authored
finance/admin-only unless a separate decision widens it.

### D4 — `manager` is NOT self-assignable (parity with `finance`)

Company-wide financial visibility is the same separation-of-duties concern `finance` is. The
`shared._guard_person_access_roles` self-assign block (`admin`,`finance`) is extended to
(`admin`,`finance`,`manager`): an admin cannot grant themselves `manager`; a second admin must. The SPA
`RoleEditor` self-guard mirrors this. (**Planner decision by parity; flagged for owner confirmation** —
not an explicit owner instruction. Low-cost, reversible: it only forbids self-grant, not admin-to-other
grant.)

### D5 — Jabatan assignment uses admin-scoped RLS, **not** a definer RPC

`shared.person_roles` (Jabatan) is a plain directory junction with **no `auth.*` write and no privilege
escalation**. The ADR-0016 definer RPCs exist *solely* because they write `auth.users`/`auth.identities`;
Jabatan writes touch neither. So Jabatan assignment mirrors the **`person_access_roles` admin RLS
pattern** (ADR-0011 D5): admin-only, org-scoped `INSERT`/`DELETE` policies + a guard enforcing the org
seam. This is the simpler, less-privileged tool (charter: prefer simplicity, minimum privilege).
Unassign is a **hard `DELETE`** because `person_roles` has no soft-delete column and `is_manager_of`
reads live rows only — adding soft-delete would ripple into every manager-chain read (out of scope);
a removed Jabatan is re-assignable. (**Deviates from the issue brief's "follow the definer-RPC pattern";
recorded here for the Director to override if desired.**)

### D6 — Terminology lock in the UI

The org-chart position renders as **"Position"** (Jabatan); the access assignment renders as **"Access
level"** (Akses). **Neither is ever labeled "Role"** in the UI. The DB slugs are unchanged.

### D7 — Independent, multi-row axes

A person may hold `ops_lead` (ops write) **and** `manager` (financial view) simultaneously — one row per
`(person, access_role)`. The axes do not gate each other.

### D8 — SPA reach (make the DB grant usable)

RLS is the authority, but the SPA route/nav/home gates must admit `manager` or the grant is unreachable.
A single `canViewFinance(accessRoles) = finance | admin | manager` helper is applied to the **view**
surfaces only: the Dashboard route guard, the Plan destination nav, and the Home money tiles.
`manager` is **excluded** from **write/planning** surfaces (budget/pricing routes, follow-up confirm).

## Alternatives considered

- **A `supervisor` tier (own-BU revenue only).** **Deferred.** The reporting tables' grain is
  `channel/branch/esb` with **no `business_unit` dimension**; scoping to "own BU" requires a
  BU↔branch/channel mapping that does not exist and must be decided first. Recorded as the follow-on.
- **Rename the access role to avoid the "manager" collision** (e.g. `financials_viewer`). Rejected — the
  owner named it `manager`; the collision is documented (this ADR's Context) and mechanically harmless.
- **Definer RPC for Jabatan** (issue-brief default). Rejected per D5 — unnecessary privilege for a
  non-auth junction.
- **Soft-delete on `person_roles`.** Rejected — ripples into `is_manager_of` and all manager-chain
  reads; out of scope. Hard DELETE, re-assignable.

## Consequences

- **Positive** — one-migration enum growth; the hook/helpers are untouched; both reporting policies keep
  their finance/admin arms and writer bypass; the two "manager" senses are documented and non-interfering.
- **Positive** — Jabatan assignment reuses the proven admin-RLS pattern; no new privileged surface.
- **Negative / accepted** — the word "manager" is overloaded; mitigated by this ADR's disambiguation
  table and by keeping `is_manager_of` untouched.
- **Negative / accepted** — the reporting policy names still read `…_finance_admin` though they now admit
  `manager`; kept to preserve the original migrations' DOWN references (a rename would break them). A
  `COMMENT ON POLICY` documents the widening.
- **Security-review note** — the security-auditor must confirm: (a) `manager` gets SELECT only (no write
  path) on both tables; (b) cross-org reads stay zero; (c) `manager` self-assign is blocked; (d) Jabatan
  admin RLS enforces the org seam (person AND role in caller's org). This touches RLS/auth seams → the
  battery's security lens is required before merge.

## Reversibility

- **Enum shrink** = the migration DOWN re-adds the four-value CHECK — but **fails while any live
  `manager` row exists** (revoke/delete them first). Documented in the migration DOWN.
- **Reporting policies** = DOWN `ALTER POLICY` back to the finance/admin-only `USING`.
- **Jabatan RLS** = DOWN drops the two policies + guard + grants.
- **`supervisor` and overheads** remain open, recorded here as deferred with their blockers.

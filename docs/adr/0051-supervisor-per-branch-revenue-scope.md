# ADR-0051 — `supervisor` per-person, per-branch revenue-scope tier (resolves ADR-0050's deferred `supervisor`)

- Status: **Accepted** (2026-07-29; owner decision LOCKED — this ADR records it, does not re-open it)
- Deciders: Owner (Arief) + Director
- Amends / extends: **ADR-0050** (the `manager` financial-visibility tier; adds a **sixth** access-role
  value and **resolves** ADR-0050's deferred `supervisor` follow-on — see "Resolution of ADR-0050's
  deferral" below). Also amends **ADR-0011 D5** (the access-role set) by one more value.
- Related: **ADR-0010 D5** (the `reporting` schema — curated financial read-model) · **ADR-0001**
  (org seam; `org_id` isolation) · **ADR-0016** (admin-only, org-scoped write posture) · **ADR-0020**
  (capability authorization — client convenience; RLS is authority).
- Consumed by: `docs/specs/supervisor-revenue-scope.spec.md`,
  `docs/plans/2026-07-29-supervisor-revenue-scope.md`.

## Context

The owner wants a **sixth** access role, `supervisor`: a **revenue-VIEW-only** tier scoped to an
**explicit, per-person set of channel + (optional) branch**. Concrete cases:

- **Ipul** should see the revenue of the **single HQ café branch** (channel `POS`, one `branch_code`) —
  and nothing else.
- **Epoy** should see the revenue of the **whole B2B channel** (all B2B branches).

Two facts make this different from the `manager` tier:

1. **Not company-wide, not margin.** A `supervisor` sees **only** the revenue of their granted
   channel/branch set — never other branches, never COGS/gross-margin, never overheads, never any write
   or planning surface. `reporting.sales_margin_daily` is POS-only and has **no channel column**, so a
   per-channel/branch scope is not even expressible there; supervisors are excluded from it entirely.

2. **Not derived from the person's business unit.** Ipul's scope (one branch) is **finer** than his
   business unit (Retail Ops spans several outlets). Deriving visibility from `shared.business_units`
   would over-grant. Therefore visibility is an **explicit per-person grant** recorded in its own table,
   decoupled from the org chart.

### Resolution of ADR-0050's deferral

ADR-0050 "Alternatives considered" deferred a `supervisor` own-BU tier because "the reporting tables'
grain is `channel/branch/esb` with **no `business_unit` dimension**; scoping to 'own BU' requires a
BU↔branch/channel mapping that does not exist and must be decided first." **This ADR resolves that
deferral** — not by building a BU↔branch map, but by rejecting BU-derivation altogether in favour of a
**per-person `(channel, branch_code)` scope table**. The reporting grain (`channel`, `branch_code`) is
exactly the scope grain, so no mapping layer is needed.

### The reporting grain (hard facts, not re-derived here)

`reporting.sales_daily_revenue` grain is `org_id, revenue_date, channel, esb_code, branch_code,
branch_name, …` (migration `20260701000001`). The only channels present are **`POS`** and **`B2B`**.
`branch_code`/`branch_name` are free-text pass-through from the upstream warehouse view
`v_daily_revenue_unified` — **MOS does not own them** (fed by the nightly snapshot; the real HQ
`branch_code` lives only in staging data, e.g. `BGR`). Consequently the admin scope picker MUST be
populated from **live** `select distinct channel, branch_code, branch_name from
reporting.sales_daily_revenue`, never from a hardcoded list.

## Decision

### D1 — Add `supervisor` to the access-role vocabulary

Extend the `shared.person_access_roles.access_role` CHECK from five values to six: add `supervisor`
(migration `20260729000003`). The access-token hook aggregates whatever non-revoked rows exist (it does
**not** enumerate values), so a granted `supervisor` role flows into the `access_roles` JWT claim with
**no hook change** — confirmed against `20260619000002`. `has_access_role`, `current_access_roles`,
`_claim_text_array` are untouched.

### D2 — A per-person, per-branch scope table (`reporting.supervisor_revenue_scope`)

```
reporting.supervisor_revenue_scope(
  id, org_id, person_id, channel text not null check (channel in ('POS','B2B')),
  branch_code text null,   -- NULL = the WHOLE channel (all branches)
  granted_by, created_at)
```

- **One row per `(person, channel, branch_code)`.** `branch_code IS NULL` = the whole channel (Epoy's
  case); a non-null `branch_code` = one specific branch (Ipul's case). Uniqueness is enforced by two
  partial unique indexes (one for `branch_code is not null`, one for `branch_code is null`) so the model
  is portable across PG versions and a person cannot hold both a duplicate specific-branch row and two
  whole-channel rows for the same channel.
- **Admin-only writes, org-scoped.** INSERT/DELETE mirror the `shared.person_roles` admin RLS pattern
  (ADR-0050 D5): `with check`/`using (org_id = shared.current_org_id() and has_access_role('admin'))`.
  `org_id` is server-stamped by the column default (unspoofable) and a `BEFORE INSERT` guard enforces
  the org seam (the target person must be in the caller's org) and forces `granted_by` server-side.
  Removal is a **hard DELETE** (no soft-delete column needed — a removed scope is re-grantable and RLS
  reads live rows). `channel` is CHECK-constrained to `{POS,B2B}`; `branch_code` is **not** validated
  against a branch table (none exists — it is warehouse pass-through) and the picker only ever offers
  live values.

### D3 — Revenue RLS admits `supervisor`, scoped; the RLS-subquery decision

`reporting.sales_daily_revenue`'s SELECT policy `sales_daily_revenue_select_finance_admin` is extended
via `ALTER POLICY` (name + the finance/admin/manager arms + the `reporting_writer` write policy kept
**untouched**) with a fourth OR-arm:

```sql
or (
  shared.has_access_role('supervisor')
  and exists (
    select 1 from reporting.supervisor_revenue_scope s
    where s.person_id = shared.current_person_id()
      and s.org_id    = shared.current_org_id()
      and s.channel   = sales_daily_revenue.channel
      and (s.branch_code is null or s.branch_code = sales_daily_revenue.branch_code)
  )
)
```

**The subquery-vs-SECURITY-DEFINER decision — chosen: inline correlated `EXISTS` + a supervisor
self-read SELECT policy on the scope table (NOT a definer helper).** Rationale:

- **Correctness under RLS.** The policy runs as the querying user; the correlated `EXISTS` on
  `supervisor_revenue_scope` is therefore subject to *that table's* RLS. It resolves to a supervisor's
  own rows **only if** the scope table grants the supervisor SELECT on their own rows. So the scope
  table's SELECT policy admits `person_id = shared.current_person_id()` (in addition to admin reading all
  org rows for the editor). With that policy the `EXISTS` returns the supervisor's grants and the arm
  works. This is confirmed by a pgTAP test (a supervisor with a `POS/BGR` grant reads exactly the
  `POS/BGR` rows).
- **Minimum new privileged surface (charter: least privilege).** A SECURITY DEFINER helper would add a
  new definer function to audit and to satisfy the definer-revoke CI lint (NFR-007). The scope table
  needs an admin SELECT policy **anyway** (the `/admin/people` scope editor reads it via
  `listAdminPeople`). Widening that SELECT policy to also admit a supervisor reading *their own* rows
  leaks nothing — a supervisor already knows which branches they can see, and the rows carry only
  channel/branch/provenance. So the self-read policy is strictly cheaper than a definer function.
- **Margin table policy is UNCHANGED** — supervisors never touch `reporting.sales_margin_daily`.

### D4 — `canViewRevenue` / `canViewMargin` split (SPA reach)

Today `canViewFinance` is all-or-nothing and gates a Home money grid + Dashboard that show **both**
revenue and margin. A `supervisor` needs revenue but not margin. The single helper is split:

- **`canViewRevenue(accessRoles)` = `finance | admin | manager | supervisor`** — gates: the Dashboard
  route (`RequireAccessRole`), the Plan destination nav, the Home **revenue** tile, and the revenue KPIs
  on the Dashboard.
- **`canViewMargin(accessRoles)` = `finance | admin | manager`** — gates: the Home **margin** tile and
  the Dashboard's gross-margin/COGS KPI row + the margin columns (Interim COGS / Gross margin / Margin %)
  in the detail table, and it **skips the margin fetch** entirely for a supervisor.

Net effect: a `supervisor` lands on a **revenue-only** Dashboard and a revenue-only Home tile — never an
empty margin panel (the margin surfaces are absent, not zeroed) and never a misleading `—`. Budget /
pricing planning routes stay **`finance | admin`** — a supervisor is view-only, no planning
(ADR-0050 D8 boundary carried forward).

### D5 — `supervisor` is NOT self-assignable (parity with finance/manager)

`supervisor` joins the `shared._guard_person_access_roles` self-assign block
(`admin`,`finance`,`manager` → `admin`,`finance`,`manager`,`supervisor`). **Rationale + honest caveat:**
an admin already sees *all* revenue (the admin arm), so a self-granted `supervisor` would grant an admin
nothing new — the separation-of-duties argument is weaker here than for `finance`/`manager`. We still
block it for (a) consistency/least-surprise across all financial-visibility roles, (b) a clean
provenance trail (`granted_by ≠ self` for every financial role), and (c) it is low-cost and reversible
(forbids only self-grant, not admin-to-other). **Planner-parity decision, flagged for owner
confirmation** (as ADR-0050 D4 was) — not an explicit owner instruction.

### D6 — Admin UI: `supervisor` renders + a "Revenue scope" editor

- `supervisor` is added to `ASSIGNABLE_ROLES` + `ROLE_META`, so it auto-renders as a checkbox in the
  RoleEditor and a Tag in the People table (no per-component list edit).
- A new **`RevenueScopePicker`** (mirrors `PositionPicker`) mounts inside the RoleEditor dialog **only
  when the person holds `supervisor`**. It lists live channel/branch options from
  `listRevenueScopeOptions()` (a `reporting.list_revenue_branches()` SECURITY **INVOKER** function that
  returns `select distinct channel, branch_code, branch_name … order by channel, branch_name` — RLS
  still governs, no new privilege) plus a **"Whole {channel}"** option (`branch_code = null`) per
  channel. Toggling calls `assignRevenueScope` / `removeRevenueScope`.
- **Terminology (locked):** the section is labeled **"Revenue scope"**, never "Role" (consistent with
  ADR-0050 D6's "Position"/"Access level" lock).

## Alternatives considered

- **Derive scope from the person's business unit** (BU→branches). **Rejected** — Ipul's branch is finer
  than his BU; BU-derivation over-grants and needs a BU↔branch map that does not exist. The per-person
  scope table is the resolution of ADR-0050's deferral.
- **Channel-only scope (no branch grain).** **Rejected by the owner** — Ipul needs one branch, not all
  of POS. The table's nullable `branch_code` supports both grains (branch or whole channel).
- **A SECURITY DEFINER scope-check helper in the revenue policy.** Rejected per D3 — the scope table
  needs an admin SELECT policy regardless, and a supervisor self-read policy is a smaller, leak-free
  surface than a new definer function. Recorded as the scaling escape hatch (below).
- **Give `supervisor` the margin table too.** Rejected — owner locked revenue-only; the margin grain has
  no channel column, so per-channel scope is inexpressible there anyway.
- **Reuse `canViewFinance` unchanged.** Rejected — it would either admit a supervisor onto an empty
  margin panel or exclude them from revenue. The `canViewRevenue`/`canViewMargin` split is required.

## Consequences

- **Positive** — one-migration enum growth; the hook/helpers untouched; both reporting policy *names* and
  their finance/admin/manager arms + the writer bypass preserved (DOWN-chain stable); margin policy
  entirely untouched; the scope model is exactly the reporting grain (no mapping layer).
- **Positive** — the admin scope editor reuses the `PositionPicker` shape; the branch catalog is
  server-computed from live data (never hardcoded, so real staging `branch_code`s just work).
- **Negative / accepted** — the revenue policy now carries a correlated `EXISTS` sub-select. At current
  scale (one org, a few thousand revenue rows, <10 scope rows) this is negligible: the leading
  `org_id = current_org_id()` predicate + the OR-arm short-circuit mean the sub-select only evaluates for
  supervisor sessions, and a `(org_id, person_id, channel, branch_code)` index bounds it. **Scaling seam
  (documented):** if the revenue table reaches millions of rows *and* many supervisors query
  concurrently, convert the arm to a `STABLE SECURITY DEFINER` helper that precomputes the scope set once
  per statement (semi-join) — a mechanical, behavior-preserving swap. Not needed now.
- **Negative / accepted** — the stacked-union Home (`SHOW_HOME_STACKED`, default **off**) derives its
  money section from cockpit scope (owner/BU-head); a *plain* supervisor gets no cockpit and thus no
  company money section there. Their revenue reach is the (production-default) Home v1 revenue tile + the
  Plan → Dashboard route. Extending the home-stack derivation to a supervisor cockpit is a documented
  follow-up, not this issue.
- **Security-review note (required before merge — touches RLS/auth/schema seams):** confirm (a)
  supervisor SELECT is scoped to their granted channel/branch only (a POS-HQ supervisor sees no other POS
  branch and no B2B; a whole-channel B2B supervisor sees all B2B and no POS); (b) supervisor is denied on
  the margin table; (c) cross-org reads stay zero; (d) supervisor has no write path on revenue/margin/
  scope (only admin writes scope); (e) supervisor self-assign is blocked; (f) the scope-table guard
  enforces the org seam; (g) a supervisor with **no** scope rows reads **zero** revenue (fail-closed).

## Reversibility

- **Enum shrink** = the `20260729000003` DOWN re-adds the five-value CHECK — but **fails while any live
  `supervisor` row exists** (revoke/delete them first). Documented in the migration DOWN.
- **Revenue policy** = the `20260729000004` DOWN `ALTER POLICY`s back to the ADR-0050 USING (finance/
  admin/manager, no supervisor arm).
- **Scope table** = DOWN drops the table (cascade), its guard + trigger, and `list_revenue_branches()`.
- **Self-assign guard** = DOWN `CREATE OR REPLACE`s the guard body back to the ADR-0050 self-assign set.

# ADR-0020 — Capability-based authorization: `can()` + role defaults + individual overrides

- Status: **Accepted, amended 2026-07-10** (individual override matrix + precedence; grill-with-docs)
- Deciders: Owner (Arief) + Director
- Related: ADR-0011 (access roles `admin`/`ops_lead`/`finance`/`member` — evolved, not discarded:
  they become seeded role rows) · ADR-0019 D1 (BU/Activity taxonomy; owning-BU scope) · ADR-0017 D2
  (deputy runs under the user's authorization — `can()` becomes part of that ceiling) ·
  ADR-0001 (org seam — unchanged beneath all of this) · `docs/decisions.md` OD-IA-2.
- Scope note: records the authorization architecture. Function signatures, storage, RLS rewrites,
  and Admin UI belong to the clean-baseline and feature specs/plans.

## Context

RLS policies hardcode role names (`shared.has_access_role('finance')`), so adding or adjusting a
role is a migration. The owner wants roles **adjustable from the admin UI** — create/edit roles and
toggle access on/off as the org evolves — without dev involvement. Meanwhile ADR-0019's taxonomy
creates real cross-BU write questions (Marketing must read but not write Finance's COGS; B2B Ops
chases invoices Finance settles).

Options considered: (a) stay org-global (breaks on cross-BU writes); (b) copy a complete permission
matrix onto every person (drifts and becomes expensive to groom); (c) org-chart-derived scope with fixed
roles (no admin flexibility); **(d) code-owned capabilities + editable role defaults + sparse scoped
individual overrides — chosen**. The admin UI may present a complete person-by-capability matrix, but
unchanged cells continue to inherit role defaults rather than becoming copied person grants.

## Decision

1. **Capabilities are a fixed, code-owned vocabulary** of action keys (`cogs.write`,
   `invoice.settle`, `kitchen.approve`, `reporting.read`, …). New keys ship with features — admins
   combine capabilities, never invent them. That is the safety boundary.
2. **Access roles are rows and supply defaults.** Admin creates/renames access roles, toggles default
   capabilities per role, and assigns roles to people (extends `/admin/people`). The four ADR-0011 access
   roles become seeded rows. They are defaults, not the only source of effective access.
3. **Every grant or override carries an applicable scope.** Supported scope shapes include `self`,
   `own_team`, selected named Teams, `own_bu`, selected named BUs, and `org`; each capability declares
   which shapes are meaningful. The
   own-BU check derives membership from the org chart plus the owning-BU column on contended records.
   Moving a person therefore updates inherited own-BU reach, while selected-BU/org exceptions remain
   explicit. Exact storage and scope parameters belong to the implementing spec/migration.
4. **RLS calls `shared.can(capability)`** — one SECURITY-relevant function resolving person → roles
   → capabilities + scope. Policies never name roles again; role edits never touch schema.
5. **Guardrails:** `admin` capabilities immutable; the system refuses to remove the last admin;
   every toggle change is audit-logged (who/what/when — the ADR-0019 activity-log pattern).
6. **Migration posture amended by OD-REDESIGN-34.** The E6 opportunistic migration plan is historical;
   the owner-authorized clean baseline applies `can()` consistently to the redesigned domain. Any
   environment reset remains separately owner-gated.
7. **Deputy inheritance:** the agent's tools run under the caller's JWT (ADR-0017 D2), so `can()`
   ceilings the deputy automatically — no parallel agent permission model.
8. **Sparse individual overrides:** an admin may set an explicit allow or deny for a person's capability
   and scope. For a given action on a resource, effective access resolves in this fixed order:
   **applicable explicit deny → applicable explicit allow → union of applicable role grants → default
   deny**. Removing the override returns the cell to inherited role behavior.
9. **The admin UI is an effective-permission matrix, not a copied matrix.** Each person/capability cell
   visibly says Inherited, Allowed, or Denied, shows its source and scope, and supports Reset to role
   default. Every override change records actor, target person, capability, effect, scope, before/after,
   and timestamp.
10. **Capabilities do not erase record governance.** Record-specific rules (for example, Process A is
    the publisher) remain an additional gate. Bypassing one requires a distinct, deliberately granted
    override capability and a visible audited action; a broad `process.publish` grant is not implicitly
    `process.publish_any`.
11. **Teams are scopes, never actors.** A Person acts through an effective capability inherited from an
    access-role default or individual override. An org Role may be mapped in Admin Settings to default
    Access role(s); assigning that org Role inherits those grants at the Role's Team/selected-Team/BU/org
    scope. Org Role, Access role, and Team membership remain distinct and the effective-permission UI
    exposes every source.

## Consequences

- Admin gains real self-service (new role for "Procurement" = clicks, not a deploy) at the cost of
  a capability vocabulary devs must curate and name well — key naming is now API design.
- Individual exceptions solve legitimate cross-functional cases without role proliferation, at the cost
  of a new drift risk. Sparse storage, visible inheritance/source, Reset, audit history, and an admin
  "people with overrides" filter are required controls.
- Team scope now provides the concrete execution boundary below BU (ADR-0025 D36/D39/D41); Activity
  remains workflow classification rather than the authorization seam.
- pgTAP contract tests move from per-role assertions to per-capability ones as policies migrate.
- Wrong-capability grants become an admin error class; the audit log + seeded-role defaults are the
  recovery path.

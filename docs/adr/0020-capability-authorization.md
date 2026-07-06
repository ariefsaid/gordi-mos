# ADR-0020 — Capability-based authorization: `can()` + admin-editable roles

- Status: **Accepted** (owner-approved 2026-07-04 — grill-with-docs session)
- Deciders: Owner (Arief) + Director
- Related: ADR-0011 (access roles `admin`/`ops_lead`/`finance`/`member` — evolved, not discarded:
  they become seeded role rows) · ADR-0019 D1 (BU/Activity taxonomy; owning-BU scope) · ADR-0017 D2
  (deputy runs under the user's authorization — `can()` becomes part of that ceiling) ·
  ADR-0001 (org seam — unchanged beneath all of this) · `docs/decisions.md` OD-IA-2.
- Scope note: records the authorization architecture. The `can()` function signature, table DDL,
  RLS rewrites, and the admin UI belong to the implementing spec/plan (lands with the first
  consuming module — Plan / AR bridge / Work spine).

## Context

RLS policies hardcode role names (`shared.has_access_role('finance')`), so adding or adjusting a
role is a migration. The owner wants roles **adjustable from the admin UI** — create/edit roles and
toggle access on/off as the org evolves — without dev involvement. Meanwhile ADR-0019's taxonomy
creates real cross-BU write questions (Marketing must read but not write Finance's COGS; B2B Ops
chases invoices Finance settles).

Options considered: (a) stay org-global (breaks on cross-BU writes); (b) per-BU role assignments
(an admin-maintained permission matrix — the RACI-matrix trap in permission form); (c) org-chart-
derived scope with fixed roles (no admin flexibility); **(d) capabilities + editable roles + scoped
grants — chosen** (subsumes c as the scope mechanism).

## Decision

1. **Capabilities are a fixed, code-owned vocabulary** of action keys (`cogs.write`,
   `invoice.settle`, `kitchen.approve`, `reporting.read`, …). New keys ship with features — admins
   combine capabilities, never invent them. That is the safety boundary.
2. **Roles are rows, not code.** Admin creates/renames roles, toggles capabilities per role in a UI,
   assigns roles to people (extends `/admin/people`). The four ADR-0011 roles become **seeded rows**
   (renameable, not deletable).
3. **Every grant carries a scope: `own_bu` or `org`.** The own-BU check derives membership from the
   org chart (person → position → `business_unit_id`, which `shared.roles` already carries) plus the
   **owning-BU column** on contended records (reference data, ops rows, invoices). Moving a person
   in the org chart moves their write reach — no per-person grants to groom. The org chart becomes
   load-bearing for authorization (accepted deliberately: it forces the org chart to stay true).
4. **RLS calls `shared.can(capability)`** — one SECURITY-relevant function resolving person → roles
   → capabilities + scope. Policies never name roles again; role edits never touch schema.
5. **Guardrails:** `admin` capabilities immutable; the system refuses to remove the last admin;
   every toggle change is audit-logged (who/what/when — the ADR-0019 activity-log pattern).
6. **Migration posture: opportunistic.** New modules (Plan, AR bridge, Work spine) authorize via
   `can()` from day one; existing working RLS migrates when touched — no big-bang rewrite.
7. **Deputy inheritance:** the agent's tools run under the caller's JWT (ADR-0017 D2), so `can()`
   ceilings the deputy automatically — no parallel agent permission model.

## Consequences

- Admin gains real self-service (new role for "Procurement" = clicks, not a deploy) at the cost of
  a capability vocabulary devs must curate and name well — key naming is now API design.
- Intra-BU activity-level scoping (kitchen-vs-bar inside Retail Ops) is **deliberately absent** —
  added only on evidence of real conflict (ADR-0019 deferral).
- pgTAP contract tests move from per-role assertions to per-capability ones as policies migrate.
- Wrong-capability grants become an admin error class; the audit log + seeded-role defaults are the
  recovery path.

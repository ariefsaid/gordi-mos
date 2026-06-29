# ADR-0016 — Interim admin-provisioning via Supabase definer RPCs (staging)

- Status: Accepted (2026-06-26)
- Deciders: Owner (Arief) + Director
- Related: **ADR-0010 D6** (privileged provisioning belongs in the thin FastAPI backend; Edge Functions
  rejected) · **ADR-0011 D5** (three-layer enforcement; admin-only grant; `admin`/`finance` never
  self-assignable; first admin seeded) · **ADR-0011 D2** (synthetic `@ops.gordi.local` email, admin-set
  password for staff without an inbox) · spec `docs/specs/admin-user-mgmt.spec.md`.

## Context

The owner wants an **in-app admin screen** to add/manage users and reset passwords, working on **Supabase
Cloud staging now** (`staging-deploy-state`). ADR-0010 D6 already decided that the privileged auth
operations (create login / set password / disable) are *server-trust* work that **must not run from the
browser**, and put them in a **thin FastAPI backend on `ris-dev`** (the repointed kitchen poller, shared
with the ESB-outbox worker). Edge Functions / `pg_cron` were explicitly **rejected** there.

That backend is being built in its own repo/workstream (the kitchen FastAPI parity effort) and is **not yet
deployed to staging**. The admin screen needs *some* privileged path to be usable for testing before it
lands. Most of the screen — listing people, granting/revoking access roles, archiving — is **already
governed by admin RLS** and needs no backend at all; only **three operations** touch `auth.*` and require
elevated trust.

## Decision

Implement the three privileged operations as **admin-gated `SECURITY DEFINER` RPCs in Supabase** as the
**interim staging provisioning surface**, and build the rest of the screen on existing RLS:

- `shared.admin_create_login(p_person uuid, p_password text default null) returns text`
- `shared.admin_reset_password(p_person uuid, p_password text default null) returns text`
- `shared.admin_set_login_enabled(p_person uuid, p_enabled boolean) returns void`

Each RPC: `language plpgsql security definer set search_path = ''`; **first statement** asserts
`shared.has_access_role('admin')` and that the target person shares the caller's `shared.current_org_id()`,
raising `42501` otherwise (fail-closed, NFR-001); EXECUTE revoked from `anon`/`public`, granted to
`authenticated` (the in-body admin check is the real gate, NFR-002). They mirror the exact `auth.users` /
`auth.identities` shape GoTrue requires (token columns `''` not NULL; generated `identities.email` omitted;
`extensions.crypt(..., gen_salt('bf'))`) — the same shape proven by the manual staff provisioning on
2026-06-26. Generated passwords are **returned only** to the calling admin, never persisted (NFR-003). A
**no-lockout** guard refuses disabling / de-admining the last active admin (FR-041/AC-040).

**Why a definer RPC and not an Edge Function:** Edge Functions are already rejected (ADR-0010 D6). The RPC
keeps the privileged path **inside the database the project already runs**, with **no new deploy surface**
on staging or self-hosted prod, and reuses the existing claim-based authz (`has_access_role`) the rest of
the schema uses. The `service_role` key never enters the browser.

**Scope boundary (the deviation, explicit):** these RPCs are the **staging** provisioning surface. ADR-0010
D6's **thin FastAPI backend remains the production authority**. For production we will either (a) route the
SPA's three privileged calls to the thin backend and retire the RPCs, or (b) **promote** the RPCs to the
prod path *only* after the D11 gating security review explicitly clears the `auth.*`-writing definer surface
— a decision deferred to deploy time, not taken here.

## Consequences

- The admin screen is **fully usable on staging today**; ~70% of it (list / roles / archive) is plain RLS
  and is prod-ready as-is.
- One **new, contained coupling**: the RPCs write `auth.users`/`auth.identities` directly, coupling to
  GoTrue's internal schema. Contained to three functions with a documented seam; a GoTrue major upgrade is
  the only thing that could require touching them. The supported alternative (GoTrue Admin API via the thin
  backend) stays the prod plan.
- The `auth.*`-writing definer surface is **security-review-gating**: `security-auditor` MUST clear these
  RPCs (privilege-escalation, org isolation, no-lockout, secret-leak) before merge — over and above the
  standard battery.
- Reversible: the migration ships a DOWN dropping the three functions; nothing else depends on them.
- No conflict with the parity workstream — RPCs live in the `shared` schema (MOS migrations); the thin
  backend lives in a separate repo. Disjoint.

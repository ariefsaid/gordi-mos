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

## Amendment (2026-06-29) — prod resolution: promote the RPCs, retire the thin-backend-for-provisioning

- Status: **Accepted** (owner + Director, 2026-06-29). The D11 security audit (ADR-0010 D11 / ADR-0011 D11)
  returned **CLEAR FOR PROD PROMOTION** (verdict below) — RPCs are the prod provisioning authority for
  **single-org** prod; one Medium fix gates **multi-org**. Supersedes ADR-0010 **D6**'s provisioning concern.

**Decision.** Promote these definer RPCs to be the **production** provisioning authority too. Do **not**
build the thin FastAPI backend for provisioning. The SPA already calls the RPCs via PostgREST (gated by the
in-RPC `admin` check + org scope); prod simply uses the same path staging proved.

**Why this supersedes ADR-0010 D6.** D6 specified *one FastAPI service on ris-dev, two concerns* —
(1) ESB-outbox push and (2) admin/provisioning endpoints. **Both concerns have since left that plan:**
- (1) ESB-outbox → the existing `gordi-kitchen-app` was extended instead of building a new service
  (ADR-0012 amendment; `docs/platform-workstream-status.md` §3).
- (2) provisioning → these RPCs.
So D6's "new thin FastAPI backend" has **nothing left to host** and is retired. The production shape becomes
**SPA (Cloudflare Pages, prod self-hosted) + Supabase (data / auth / RLS + provisioning RPCs)** — no bespoke
backend tier for MOS provisioning. (`gordi-kitchen-app` remains the kitchen/ESB worker only — clean
separation, not a kitchen app that also does MOS user admin.)

**Why the RPCs are acceptable in prod (the D6 worry, re-weighed).** D6 kept privileged auth writes out of
the DB over the GoTrue-internal-coupling risk. That risk is **contained on self-hosted prod**: we control the
GoTrue version, so a breaking schema change can only arrive via a *deliberate* upgrade — at which point the
three functions are updated as part of that upgrade. The surface is 3 functions with a documented seam,
`service_role` never reaches the browser, and the in-RPC `admin` + org check is the real gate (RLS-class
authority, not endpoint code). Net: the RPCs trade a managed-API dependency for less infra, no new deploy
surface, and no new secret-zero problem (D12).

**Gate (binding).** This promotion is **not live until the D11 gating security audit** of the RPC surface
returns CLEAR (privilege-escalation · org isolation · no-lockout · auth.* write-correctness · secret-leak).
If it returns blockers, fix them before promoting. The audit verdict is recorded below.

**D11 audit verdict (2026-06-29): CLEAR FOR PROD PROMOTION** (security-auditor, prod lens). No Critical/High.
All six gate questions closed: (1) privilege-escalation — admin check is first/fail-closed on the
hook-minted, client-unspoofable `access_roles` claim; EXECUTE revoked from anon/public. (2) org isolation —
total; the prior cross-org count oracle was removed (M-1); pgTAP 56 proves cross-org refusal. (3) the
`auth.*` direct-write shape is GoTrue-correct (bcrypt; finite `banned_until`; no oauth-bypassing/
unauthenticatable row) and the coupling is acceptable on **self-hosted prod** (deliberate GoTrue upgrades).
(4) no-lockout enforced on all three arms (disable / revoke / archive). (5) secrets — ~72-bit CSPRNG temp
pw, returned once, never logged/persisted; `search_path=''` on all 8 fns; no injection. (6) no Critical/High
prod blockers.

**One Medium — fix before MULTI-ORG (B2B) prod, not blocking single-org:** `admin_create_login` lets a
cross-org duplicate email surface a raw `23505` (`users_email_partial_key` is global; `shared.people.email`
isn't) — opaque error + a minor cross-tenant existence oracle (no data crosses; the insert is refused).
Remediation: pre-check / catch `unique_violation` → clean app error, no cross-org echo; + stop forwarding
raw PG error text in `admin-users.ts`. Gordi is **single-org today** so this is unexercised; tracked as the
**single→multi-org seam blocker** (the exact tenancy boundary the charter says must not be bypassable).
Advisory (non-blocking): a GoTrue-upgrade smoke test in the prod runbook (the one residual coupling risk);
`for update` on the create-login person read.

**Net:** the RPC surface is **promoted as the prod provisioning authority for single-org prod**; ADR-0010 D6's
thin FastAPI backend is retired. The cross-org-email fix is the gate for turning on multi-org.

**Still deferred to whatever owns prod hardening** (unchanged from above): M-2 email validation, L-1 temp-pw
entropy, L-2 clipboard auto-clear — now owned by the RPC layer / SPA rather than a backend.

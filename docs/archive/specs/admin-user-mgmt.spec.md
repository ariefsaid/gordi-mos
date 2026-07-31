# Spec — Admin user management (in-app provisioning) (P4 / ADR-0011 D5 · ADR-0010 D6)

- Feature: an **admin-only in-app screen** to manage the org's **people, their logins, and their access
  roles** without SQL or the Supabase Dashboard. Covers: **list** people with login + role + archive
  status; **create** a person (with an optional login); **reset** a login's password; **disable / enable**
  a login; **grant / revoke** access roles; **archive / restore** a person. The three *privileged auth*
  operations (create-login, reset-password, disable/enable) run through **admin-gated `SECURITY DEFINER`
  RPCs** in Supabase — the **staging provisioning surface**; everything else is **direct, admin-RLS-gated**
  reads/writes from the SPA using the admin's own JWT.
- Status: **Draft for owner sign-off.**
- Authority: enforcement model is **pre-decided** — **ADR-0011 D5** (three-layer enforcement: route-guard ∪
  RLS ∪ backend-authz; fixed access-role set `admin · ops_lead · finance · member`; `manager` derived,
  never assigned; **`admin`/`finance` never self-assignable**; admin-only grant/revoke; first admin seeded)
  and **ADR-0010 D6** (privileged provisioning is *server-trust*, **never the browser**; the **thin FastAPI
  backend** is the production home for it). This spec **encodes** those; it does not re-open them. The
  **deviation** — running the 3 privileged ops as Supabase definer RPCs **instead of** the thin backend —
  is **staging-scoped and intentional**, recorded in **ADR-0016** (this feature's ADR). Built on **ADR-0001**
  (org seam + FIXED read posture), **OD-P1-2** (person-first directory, nullable `user_id`), **OD-P1-9**
  (admin-invite provisioning), and the existing `shared.custom_access_token_hook` claim stamping (migration
  `…0619000002`).
- Vocabulary (`CONTEXT.md`, used exactly): **Role** = org position (`shared.roles`); **Access role** = app
  authorization (`admin · ops_lead · finance · member` + derived `manager`); **Person** = a `shared.people`
  row, may exist **without** a login (`user_id` null); **Login** = the `auth.users` row + `auth.identities`
  + the `people.user_id` link. "Create a user" in the UI = create a **Person**, optionally with a **Login**.
- Conventions mirrored: org seam (`org_id = shared.current_org_id()`, server-stamped, unspoofable);
  enable + FORCE RLS; **no hard delete** (disable/archive are reversible state, never `DELETE`);
  schema-qualified `SECURITY DEFINER … set search_path = ''`; the existing `_guard_*` invariant pattern;
  the single audited claim-injection point is **not** touched.

## Out of scope (explicit non-goals)

- **The production provisioning path.** The thin FastAPI backend (ADR-0010 D6) remains the prod authority
  and is built in its own repo/workstream. ADR-0016 records that the definer RPCs are the **interim staging
  surface**; promoting or retiring them for prod is a future decision, not this slice.
- **Self-service flows** — signup, email-based password recovery, magic links. Synthetic-email staff
  (`@ops.gordi.local`) have no inbox; the model is **admin-set passwords** (ADR-0011 D2). No email is sent.
- **A configurable role↔permission engine** (ADR-0011 "end state"). The fixed 4-role set stands.
- **Editing org Roles / `person_roles` / the manager chain.** This screen manages **access roles + logins**,
  not the reporting hierarchy. (`person_roles` CRUD lands with its own feature if needed.)
- **Bulk import / CSV.** One person at a time.
- **MFA, session management, audit-log UI.** Out of first slice.

## Functional requirements (EARS)

**Surface & access**
- **FR-001** — The system SHALL expose the admin user-management screen at a route reachable only by a
  session holding the `admin` access role; a non-admin session SHALL NOT see the navigation entry or the
  route (route-guard layer).
- **FR-002** — WHERE a non-admin session requests any admin user-management data or RPC directly, the system
  SHALL deny it at the database (RLS / RPC authz), independent of the route-guard (ADR-0011 D5: a hidden
  route is not a security boundary).

**List**
- **FR-010** — The screen SHALL list every non-deleted `shared.people` row in the admin's org, showing:
  full name, email, **login status** (none / active / disabled), **assigned access roles**, and **archived**
  state.
- **FR-011** — The list SHALL distinguish a person **with no login** (`user_id` null) from one **with a
  login** and from one whose login is **disabled**.

**Create person (+ optional login)**
- **FR-020** — The admin SHALL be able to create a person with a full name, an email, and zero or more
  access roles, in the admin's org (org stamped server-side).
- **FR-021** — WHERE the admin marks "no email", the system SHALL generate a synthetic
  `<local-part>@ops.gordi.local` address (ADR-0011 D2) deterministically from the name, ensuring uniqueness.
- **FR-022** — WHERE the admin chooses "create a login now", the system SHALL provision the auth user via the
  `admin_create_login` RPC and return a **generated temporary password shown exactly once**; the password
  SHALL meet the project policy (≥8 chars, mixed case + digit).
- **FR-023** — The system SHALL NOT permit assigning `admin` or `finance` to oneself (existing guard;
  surfaced as a disabled control + enforced at the DB).

**Reset password**
- **FR-030** — For a person **with a login**, the admin SHALL be able to reset the password via the
  `admin_reset_password` RPC, receiving a **new generated temporary password shown once**.

**Disable / enable login**
- **FR-040** — For a person with a login, the admin SHALL be able to **disable** it (the user can no longer
  authenticate) and **re-enable** it, via `admin_set_login_enabled`. Disable is reversible; no row is deleted.
- **FR-041** — The system SHALL prevent disabling, or revoking `admin` from, the **last active admin** in the
  org (no-lockout invariant).

**Roles**
- **FR-050** — The admin SHALL be able to **grant** and **revoke** access roles (`member · ops_lead · admin ·
  finance`) for a person via direct writes to `shared.person_access_roles` (admin-RLS-gated; revoke = soft
  `revoked_at`, never delete). `manager` SHALL NOT be offerable (derived, never assigned).

**Archive**
- **FR-060** — The admin SHALL be able to **archive** (soft, `people.archived_at`) and **restore** a person;
  an archived person SHALL drop out of claim stamping (the hook already filters `archived_at is null`).

## Non-functional requirements

- **NFR-001 (authz, fail-closed)** — Every privileged RPC SHALL verify the caller holds `admin`
  (`shared.has_access_role('admin')`) **and** that the target person is in the caller's org, BEFORE any
  write; absent/empty claims fail closed. No RPC trusts a caller-supplied `org_id` or actor identity.
- **NFR-002 (least privilege)** — The `service_role` key SHALL NOT reach the browser. The definer RPCs run as
  their owner; EXECUTE SHALL be revoked from `anon`/`public` and granted only to `authenticated` (with the
  in-body admin check as the real gate).
- **NFR-003 (no secret leakage)** — Generated passwords SHALL be returned only as the RPC result to the
  calling admin over the authenticated channel, SHALL NOT be written to any table, log, or `raw_user_meta_data`.
- **NFR-004 (no escalation)** — Creating a login SHALL NOT itself grant any access role; role assignment is a
  separate, guarded action. The existing `_guard_person_access_roles` invariants (immutability, self-assign
  block, provenance forcing) SHALL remain authoritative.
- **NFR-005 (reversibility)** — No operation SHALL hard-delete a person, login, or role; all removals are
  reversible state (`archived_at` / `revoked_at` / disabled). Migration SHALL ship a DOWN.
- **NFR-006 (auth-schema coupling, contained)** — Direct `auth.users`/`auth.identities` writes SHALL mirror
  the columns GoTrue requires (token columns `''` not NULL; `identities.email` is generated → omitted) and
  SHALL be confined to the RPCs, so the coupling has exactly one home (the documented seam ADR-0016 calls out).

## Acceptance criteria (Given/When/Then) — each owned by ONE test at the lowest sufficient layer

- **AC-001** (Integration / pgTAP) — *Given* a session **without** `admin`, *When* it calls
  `admin_create_login` / `admin_reset_password` / `admin_set_login_enabled`, *Then* each RPC raises (42501,
  fail-closed) and no `auth.users` row changes.
- **AC-002** (Integration / pgTAP) — *Given* an `admin` session in org A, *When* it targets a person in org
  B via any privileged RPC, *Then* the RPC raises and nothing changes (org isolation).
- **AC-010** (Integration / pgTAP) — *Given* an `admin` and a person with `user_id` null, *When*
  `admin_create_login(person)` runs, *Then* an `auth.users` + `auth.identities` row exist, `people.user_id`
  is linked, the returned password authenticates (hash verifies), and the auth hook stamps that person's
  `org_id`/`person_id`/`access_roles`.
- **AC-011** (Unit / Vitest) — *Given* the create form with "no email" checked and name "Budi Santoso",
  *When* submitted, *Then* the generated email matches `@ops.gordi.local` and the temp password is displayed
  exactly once (not persisted in component state after dismiss).
- **AC-020** (Integration / pgTAP) — *Given* a person with a login, *When* `admin_reset_password` runs,
  *Then* the old password no longer verifies and the newly returned one does.
- **AC-030** (Integration / pgTAP) — *Given* a person with a login, *When* `admin_set_login_enabled(false)`
  runs then a sign-in is attempted, *Then* authentication is refused; *When* `(true)` runs, *Then* it
  succeeds again.
- **AC-040** (Integration / pgTAP) — *Given* the org has exactly one active admin, *When* an attempt is made
  to disable that admin's login or revoke its `admin` role, *Then* the operation is refused (no-lockout).
- **AC-050** (Integration / pgTAP) — *Given* an `admin`, *When* it grants `ops_lead` then revokes it for a
  person, *Then* the grant appears in `current_access_roles` after re-mint and the revoke sets `revoked_at`
  (no row deleted). *Given* the admin targets **itself** with `admin`/`finance`, *Then* the guard refuses.
- **AC-060** (Unit / Vitest) — *Given* the user list, *When* rendered with people in each state (no-login /
  active / disabled / archived), *Then* each status renders distinctly and the empty state shows when the
  org has only the admin.
- **AC-070** (Unit / Vitest) — *Given* a non-admin viewer, *When* the app shell renders, *Then* the admin
  user-management nav entry is absent and the route redirects (route-guard).

## Test pyramid mapping

- **pgTAP** (`supabase test db`) owns the security/contract ACs (001, 002, 010, 020, 030, 040, 050) — the RPC
  authz, org isolation, auth provisioning round-trip, no-lockout, role grant/revoke. This is the authority
  layer (RLS + definer behavior).
- **Vitest/RTL** owns the component ACs (011, 060, 070) — form behavior, status rendering, route-guard.
- **E2E (Playwright)** — *optional* single curated journey (admin creates a login → the new user signs in) if
  the staging RPC surface is exercised end-to-end; not required for sign-off (pgTAP proves the contract).

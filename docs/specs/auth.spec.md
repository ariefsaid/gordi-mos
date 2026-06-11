# Feature: Auth — login, session, viewer profile, role surface (P1-3)

## Overview

Supabase Auth sign-in for the Gordi MOS app (`mos-app/`, local stack at `:55321`): one login screen
offering both email+password and magic-link (OD-P1-8), persisted auto-refreshing session with route
guarding, post-auth resolution of the viewer's Person + held Roles into app context (including the
derived Manager surface for P1-4), and the fail-closed orphan screen (OD-P1-10). Provisioning is
admin-invite only (OD-P1-9) — this feature ships no registration. UI beyond the login screen is a
placeholder home (viewer name + sign-out); the real shell is P1-4 (roadmap 1.3/1.4 gate: owner logs
in and sees their own name).

Foundation already in place (P1-2 migrations): `shared.people.user_id` nullable-unique link,
access-token hook minting `org_id` + `person_id` claims, `shared.current_person_id()` /
`is_manager_of()` helpers, org-readable directory RLS.

## Functional Requirements

### Login screen (`/mos/login`)

**FR-001 — Login screen identity.** The system shall serve a login screen at `/mos/login` titled
**"Gordi MOS"** with subtitle **"Management OS"** (OD-P0-4), all chrome in English (OD-P0-2).

**FR-002 — Password sign-in.** When a user submits email + password, the system shall authenticate
against Supabase Auth and, on success, navigate to the app home (OD-P1-8).

**FR-003 — Magic-link request.** When a user requests a magic link for an email address, the system
shall trigger the Supabase OTP email (no user creation — `shouldCreateUser: false`, OD-P1-9) and show
a neutral "Check your email for a sign-in link" confirmation that is identical whether or not an
account exists (OD-P1-8; no account enumeration).

**FR-004 — Magic-link completion.** When a user opens a valid magic link, the system shall establish
a session and land them on the app home.

**FR-005 — Password reset.** When a user requests a password reset, the system shall trigger the
Supabase recovery email and show the same neutral confirmation regardless of account existence; when
the user opens the recovery link, the system shall present a set-new-password form and, on success,
land them on the app home.

**FR-006 — Quiet credential errors.** IF password sign-in fails (wrong password OR unknown email),
THEN the system shall show one generic inline message ("Invalid email or password") — byte-identical
for both causes, with no indication of whether the account exists.

**FR-007 — Loading states.** While any auth request (sign-in, magic link, reset) is in flight, the
system shall disable the submitting control and show a loading indicator; controls re-enable on
settle.

**FR-008 — No self-registration.** The login screen shall present no sign-up affordance of any kind
(OD-P1-9 admin-invite only).

### Session & route guarding

**FR-009 — Persisted session.** The system shall persist the Supabase session in local storage and
auto-refresh tokens via the Supabase client for the lifetime of the session.

**FR-010 — Signed-out guard.** When an unauthenticated user navigates to any app route other than
`/mos/login` (or the recovery route), the system shall redirect them to `/mos/login`.

**FR-011 — Signed-in login redirect.** When an authenticated user navigates to `/mos/login`, the
system shall redirect them to the app home.

**FR-012 — Sign-out.** When the viewer signs out, the system shall clear the session, return to
`/mos/login`, and ensure subsequent navigation — including the browser Back button — renders no
protected content.

**FR-013 — No protected flash.** While session state is resolving on load, the system shall render a
neutral loading state, never protected content.

### Viewer profile & role surface

**FR-014 — Viewer resolution.** When a session is established, the system shall load the viewer's
Person (`shared.people` row addressed by the JWT `person_id` claim) and their held Roles
(`person_roles` → `roles`) and expose them as app-wide viewer context.

**FR-015 — Manager surface.** The viewer context shall expose `isManager`: true iff any role the
viewer holds has subordinate roles (`reports_to_role_id` = a held role) with at least one current
holder — the CONTEXT.md Manager definition, union over all held roles (OD-P1-7). Derived from the
org-readable directory; never a stored flag. Consumed by the P1-4 shell/team module.

**FR-016 — Orphan fails closed.** IF the session carries no `person_id` claim (or the people row is
unreadable/absent), THEN the system shall show a blocked screen — "Your account isn't set up yet —
contact Arief." — whose only action is sign-out, and shall perform no directory writes (OD-P1-10; no
auto-created people rows).

**FR-017 — Placeholder home.** The app home shall display the viewer's full name and a sign-out
control. Nothing more — the real shell/My Week is P1-4.

## Non-Functional Requirements

**NFR-001 — Env config, no secrets.** Supabase connection comes from `VITE_SUPABASE_URL` (local:
`http://127.0.0.1:55321`) and `VITE_SUPABASE_ANON_KEY` read from `mos-app/.env`; `.env` is
gitignored, a committed `mos-app/.env.example` carries local-dev values only. No production secrets
or service keys in the repo or in client code.

**NFR-002 — WCAG-AA login form.** Inputs have programmatically associated labels; errors are linked
to their field (`aria-describedby`) and announced; fully keyboard operable with visible focus;
contrast per `DESIGN.md` tokens.

**NFR-003 — Local e2e testability.** Magic-link and recovery emails must be retrievable from the
local mail catcher (mailpit/inbucket at `:55324`) so e2e journeys can complete them; local
`supabase/config.toml` `site_url`/redirect allowlist must include the Vite dev/test origin.

**NFR-004 — Prod auth posture.** Production Supabase config has `enable_signup` off (OD-P1-9); the
anon key is the only client credential; the access-token hook (P1-2) remains the sole source of
`org_id`/`person_id` claims.

## Acceptance Criteria

Owning layer named per AC (test pyramid; AC id tagged in the owning test's title).

### E2E (Playwright, curated journeys)

**AC-001 — Password login journey** *(e2e)*
Given a provisioned Person with a linked auth user and password,
When they visit a protected app route, are redirected to `/mos/login` (FR-010), and submit valid
email + password,
Then they land on the app home showing their full name (FR-002/014/017).

**AC-002 — Sign-out and back-button guard** *(e2e)*
Given a signed-in viewer on the app home,
When they sign out and then press the browser Back button,
Then they are at `/mos/login` and no protected content (their name) is rendered (FR-012).

**AC-003 — Orphan blocked screen** *(e2e)*
Given an auth user with valid credentials but no linked `shared.people` row,
When they sign in,
Then they see the blocked screen ("contact Arief"), no app navigation, and sign-out returns them to
`/mos/login` (FR-016, OD-P1-10).

**AC-004 — Magic-link journey** *(e2e, via mailpit :55324)*
Given a provisioned Person with a linked auth user,
When they request a magic link, the neutral confirmation appears, and they open the link from the
local mail catcher,
Then a session is established and the app home shows their full name (FR-003/004).

### Unit (Vitest/RTL, mocked Supabase client)

**AC-005 — Quiet credential error** *(unit)*
Given the auth client rejects with "invalid credentials" in one case and "user not found" in another,
When the password form is submitted in each case,
Then the rendered error message is the identical generic string in both (FR-006).

**AC-006 — Neutral magic-link/reset confirmation** *(unit)*
Given an email address with no account,
When a magic link (and, separately, a password reset) is requested,
Then the neutral "check your email" confirmation renders, identical to the existing-account case
(FR-003/005).

**AC-007 — In-flight loading state** *(unit)*
Given an auth request that has not yet settled,
When the form was submitted,
Then the submit control is disabled and a loading indicator shows; it re-enables after settle (FR-007).

**AC-008 — Signed-in login redirect** *(unit)*
Given a resolved authenticated session,
When the router renders `/mos/login`,
Then the user is redirected to the app home (FR-011).

**AC-009 — No protected flash while resolving** *(unit)*
Given session state still resolving,
When a protected route renders,
Then a neutral loading state renders and protected content does not (FR-013).

**AC-010 — isManager derivation** *(unit, pure function over directory data)*
Given (a) a viewer holding a role with a held subordinate role, (b) a viewer whose role's subordinate
roles have no current holders, (c) a viewer with no subordinate roles, and (d) a dual-hat viewer
managing only via their second role,
When `isManager` is derived,
Then it is true / false / false / true respectively (FR-015, OD-P1-7).

**AC-011 — Login form accessibility** *(unit)*
Given the rendered login form,
When inspected,
Then every input is reachable by accessible label, and a triggered error is referenced by the field's
`aria-describedby` (NFR-002).

**AC-012 — Viewer context resolution** *(unit)*
Given a session whose JWT carries `person_id`/`org_id` claims and a mocked directory returning the
person + two held roles,
When viewer context initializes,
Then it exposes that Person and both Roles (FR-014).

### pgTAP (`supabase test db`)

**AC-013 — Profile read contract** *(pgTAP)*
Given an authenticated session with hook-minted `org_id` + `person_id` claims,
When it selects its own `shared.people` row and its `person_roles`/`roles`,
Then the rows are returned (RLS permits the FR-014 reads).

**AC-014 — Orphan reads nothing** *(pgTAP)*
Given an authenticated session whose JWT carries no `org_id`/`person_id` claims (no people link),
When it selects from any directory table,
Then zero rows return — the data layer behind OD-P1-10 fails closed. (Extends/tags the existing
claim-parsing proof in `supabase/tests/08_claim_parsing.sql` if already covered.)

## Error Handling

| Condition | Surface | User message (EN chrome, OD-P0-2) |
|---|---|---|
| Wrong password or unknown email (password form) | inline on form | "Invalid email or password." |
| Magic-link / reset requested, any email | inline confirmation | "Check your email for a link." (neutral, FR-003/005) |
| Expired / already-used magic or recovery link | login screen notice | "That link has expired — request a new one." |
| Supabase rate limit (429) | inline on form | "Too many attempts — try again in a minute." |
| Network / server failure | inline on form | "Couldn't reach the server — try again." |
| Authenticated, no people row | blocked screen | "Your account isn't set up yet — contact Arief." (OD-P1-10) |

## Implementation TODO

- [ ] `mos-app`: add `@supabase/supabase-js`; client module reading `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; `.env.example` + gitignore `.env` (NFR-001)
- [ ] Login screen at `/mos/login`: password + magic-link + reset request, quiet errors, loading states, DESIGN.md tokens, a11y (FR-001..008, NFR-002)
- [ ] Recovery (set-new-password) route (FR-005)
- [ ] Session provider + route guards (protected redirect, login redirect, no-flash, sign-out incl. back-button) (FR-009..013)
- [ ] Viewer context: person + roles fetch from claims; `isManager` derivation; orphan detection → blocked screen (FR-014..016)
- [ ] Placeholder home: name + sign-out (FR-017)
- [ ] Local auth config: site_url/redirect allowlist for dev/test origin; confirm mailpit flow (NFR-003)
- [ ] Tests per AC ownership above (3+1 e2e journeys, 8 unit, 2 pgTAP)

## Out of Scope

- Admin invite UI / user provisioning flows (OD-P1-9: CLI/dashboard for v1)
- Real app shell, nav, My Week (P1-4)
- Deep-link return-to after login (post-login always lands home in v1)
- Profile editing, role management, MFA, "remember me" toggle, session-duration tuning
- Any directory writes from the app (P1-2 RLS posture unchanged)

## Open Questions

None — all business rules locked by OD-P1-8 (both login methods), OD-P1-9 (admin-invite only),
OD-P1-10 (orphan fails closed), OD-P0-2/4 (chrome language, naming). No new `[OWNER-DECISION]`
items raised.

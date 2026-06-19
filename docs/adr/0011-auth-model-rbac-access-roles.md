# ADR-0011 — One auth model (Supabase Auth + RLS) + RBAC access roles

- Status: **Proposed** (2026-06-19; awaiting owner spec sign-off — the specs that consume this ADR
  follow later)
- Deciders: Owner (Arief) + Director, in grill-with-docs session (2026-06-19)
- Related:
  - **OD-DIR-4** (Supabase Auth is the shared identity layer; CF Access is **not** the long-term MOS
    auth model — this ADR finalizes that for *everything*, kitchen included, in D1) ·
    **OD-P1-2** (person-first, nullable `user_id` — the directory model the synthetic-email staff in
    D2 plug into) · **OD-P1-7** (multi-role people; union manager chain — the **derived manager** in
    D5) · **OD-P1-8** (password + magic-link login) · **OD-P1-9** (admin-invite-only provisioning) ·
    **OD-P1-10** (orphan login fails closed) · **OD-P1-11** (Resend SMTP) ·
    **OD-P4-7** (the auth / RLS / provisioning surface this ADR defines is covered by ADR-0010 D11's
    *gating* security review, before any exposure or rollout)
  - **ADR-0001** (org seam + the FIXED read posture + `is_manager_of` union chain — the RLS substrate
    the access roles layer onto) · **ADR-0010** (the thin backend that hosts the `service_role`
    provisioning endpoints in D5; the `finance`/`admin`-gated `reporting` schema, ADR-0010 D5; the
    **D11 gating security review** of this auth/RLS/provisioning surface + the **D12 secret-zero**
    bootstrap behind the first-admin seed) ·
    **ADR-0012** (the kitchen ops Module whose RLS the `member` / `ops_lead` split governs in D1)
  - `CONTEXT.md` (vocabulary — the **Role** / **Access role** / **RACI** three-way split is canonical
    there; this ADR uses those exact terms) · the wiki **"Ops Gordi Mini-Apps Umbrella"**
    (**Accepted-Risk A1**, public `/kitchen/` — **reversed** here, see D1 + `docs/decisions.md` OD-P4-3)
  - `docs/project-brief.md` (the "first users = managers + selected ops" framing this **widens** in D6)
- Scope note: **This ADR records the auth model + the RBAC access-role *set* and where it is
  enforced.** It authorizes no migration, RLS policy, or GoTrue config change by itself — the specs and
  plans that consume it follow. It is binding *direction* for the security-auditor's eventual review of
  the auth + RLS + provisioning seams — a review that is **gating before rollout** (ADR-0010 D11).

## Context

Two auth models collide today and must be reconciled before kitchen becomes a MOS Module (ADR-0012) and
before user rollout (ADR-0010 D10):

- **Kitchen today.** Cloudflare Access gates only `/kitchen/manage/*` (6 ops-lead emails). The
  `/kitchen/` **logging surface is public, no login** — the wiki's **Accepted-Risk A1**: frictionless
  tablet UX, attribution via a free-text "Yang catat" dropdown, the review queue as the GIGO gate.
  Kitchen line staff (e.g. Ibnu, Ansori) are **strings in a `KITCHEN_TEAM` env var** — no accounts,
  likely no company email.
- **MOS.** **Supabase Auth + RLS** end to end (ADR-0001), person-first directory with a nullable
  `user_id` (OD-P1-2), password + magic-link login (OD-P1-8), admin-invite provisioning (OD-P1-9).

The owner wants **real per-person attribution** for kitchen logging, **accepting login friction** —
which dissolves A1 but forces decisions about identity for staff without email, session longevity on a
personal-phone PWA, the offline story, and the authorization model (who may approve, who sees admin,
who reads financials). `CONTEXT.md` already separates three orthogonal concepts that this ADR keeps
strictly apart:

- **Role** — a named org-chart position; people hold several; roles form the reporting line; the
  **manager** relation is *derived* from the role chain (never assigned).
- **Access role** — the **app-authorization** layer this ADR defines (`admin` / `ops_lead` / `finance`
  / `member`).
- **RACI** — per-task R/A/C/I ownership.

## Decision

### D1 — One auth model: Supabase Auth + RLS, for everything

**All surfaces** — kitchen capture **and** kitchen review **and** all of MOS — authenticate through
**Supabase Auth** and authorize through **RLS**. This dissolves the kitchen-vs-MOS auth collision: there
is one identity layer, one JWT, one set of policies.

- **Cloudflare Access stops being an app gate.** It may remain as **infra-level Tunnel protection**
  (ADR-0010 D3) but no longer decides who may use a feature.
- This **reverses the umbrella Accepted-Risk A1** (public `/kitchen/`) — kitchen logging now requires
  login (recorded in `docs/decisions.md` OD-P4-3).
- **The review queue stays the GIGO gate**, now enforced by **RLS** instead of a public form + a manual
  queue: a **`member`** may insert *their own* `Submitted` kitchen log; **only `ops_lead`** may approve
  (ADR-0012 D3's `Submitted → Approved` transition is the RLS-gated write).

### D2 — Identity for staff without email: synthetic emails

Supabase Auth (GoTrue) has **no native *username* credential** — it is email/phone based. Therefore:

- Staff **lacking a real email** get a **synthetic email** (e.g. `ibnu@kitchen.gordi.local`), with
  **email-confirmation disabled** for that path and an **admin-provisioned password** (D5; OD-P1-9 —
  admin-invite-only is preserved, the admin just sets the credential directly for these accounts).
- Staff **with a real email** use **magic-link or password** (OD-P1-8 unchanged).
- The mechanism is uniformly **email + password (or magic link)**; a displayed **"username" is just the
  local-part** of the (real or synthetic) email. No new credential type is introduced into GoTrue.

These accounts link to existing `shared.people` rows via the **nullable `user_id`** seam (OD-P1-2) —
the person row may already exist (RACI-referenceable) before the login is provisioned.

### D3 — Sessions: long-lived on a personal-phone PWA

A **short access token, auto-refreshed**, backed by a **30-day rolling session + an inactivity timeout**
(self-hosted GoTrue session config). The effect on a personal-phone PWA is a **"persistent" feel** —
re-login roughly **monthly**, not per-shift. (Recommended defaults to confirm at spec: refresh-token
**rolling expiry 30 days**, **inactivity timeout 30 days**, access-token TTL the GoTrue default ~1 h —
*confirm exact minutes at spec*; the goal is "feels logged-in for a month".)

### D4 — PWA scope: installable + push, **online-only writes** (offline-first deferred)

MOS is an **installable, mobile-responsive, push-capable PWA** with **online-only writes**. Kitchen has
wifi and the current kitchen app is already online-only, so this changes nothing operationally. Writes
that hit a dead connection show a graceful **"no connection — retry"** state rather than queuing.

**Offline-first sync is deferred** behind a documented trigger (*a proven connectivity gap on the
floor*): it is genuinely hard and it **collides with the ESB-outbox idempotency model** (ADR-0012 — a
client-side offline queue plus a server-side dedup outbox is two sources of truth for "did this post").
Online-only writes keep the outbox the single dedup authority.

### D5 — RBAC: a FIXED access-role set now, configurable later

A **fixed enum of four access roles** — the app-authorization layer, distinct from org **Role** and
from **RACI** (`CONTEXT.md`):

| Access role | What it grants |
|---|---|
| **`admin`** | The **system administrator** — user management + system configuration. The **only** role that sees the admin UI. |
| **`ops_lead`** | Review / approve operational logs (the kitchen `Submitted → Approved` gate, ADR-0012 D3) + elevated operational surfaces. |
| **`finance`** | Review financial data / dashboards from the `reporting` schema / warehouse (ADR-0010 D5). |
| **`member`** | **Default.** Own tasks, file own weekly update, log operational activity if rostered. |

- A person **may hold several** access roles; **effective access = assigned roles ∪ the derived
  manager capability** (manager stays *derived from the role chain* per `CONTEXT.md` / OD-P1-7 — it is
  **never an assignable access role**).
- **Enforced at three layers:** the **route guard** (the SPA hides surfaces a role can't use), **RLS**
  (the DB is the real authority — a hidden route is not a security boundary), and **backend authz** (the
  thin backend's `service_role` provisioning endpoints, ADR-0010 D6, check the caller is `admin`).
- **Granting `admin` / `finance` is admin-only and never self-assignable.** The **first `admin` is
  seeded at deploy** (otherwise no one could grant the first one; the seed reads its credential via the
  `op` secret path of ADR-0010 D9/D12). `ops_lead` is likewise admin-granted.
- A **configurable role↔permission model** (policies as data, evaluated by a generic engine) is the
  **deferred upgrade path** — explicitly **not built now** (the same posture ADR-0001 D3 took for the
  read matrix: a fixed enum is RLS-friendly and auditable; the engine is a multi-month product the
  ~15–30-user rollout does not need).

### D6 — The user base expands to kitchen line staff

Kitchen line staff **become MOS users** (access role **`member`**) in `shared.people`. This **widens**
the brief's "first users = managers + selected ops" to **"+ kitchen line staff"**, and correspondingly
**widens the RLS surface** (more authenticated principals, the synthetic-email cohort of D2). Recorded
as a deliberate scope expansion, not drift.

## Alternatives considered

- **Keep two auth models coexisting** (CF Access for kitchen, Supabase Auth for MOS). Rejected — that
  *is* the collision; two models means two mental models, two failure modes, and no shared identity
  between a kitchen log and a MOS task.
- **Cloudflare Access for everything.** Rejected — loses the **Supabase-JWT-keyed RLS** that the entire
  MOS authorization model (ADR-0001) is built on; CF Access can't drive row-level policies. (CF Access
  is retained only as infra-level Tunnel protection, D1.)
- **SMS-OTP for staff without email.** Rejected — needs a paid SMS provider; Resend (OD-P1-11) is
  email-only. Synthetic emails (D2) cost nothing.
- **Per-action login on a shared kitchen tablet.** Rejected — brutal friction. The whole reason
  per-person attribution becomes feasible (vs the A1 free-text dropdown) is the **personal-phone PWA +
  long-lived session** (D3): each person is already logged in as themselves.
- **Dynamic / configurable RBAC from day one.** Rejected — YAGNI at ~15–30 users; a **fixed enum is
  RLS-friendly** and auditable. The configurable model is the recorded deferred path (D5).

## Consequences

- **Positive — one identity, one authorization model, end to end.** A kitchen log, a task, a weekly
  update, and a financial dashboard are all governed by the same JWT + RLS substrate (ADR-0001); the
  security-auditor has one model to attack.
- **Positive — real per-person attribution on the floor.** `submitted_by` / `reviewed_by`
  (ADR-0012 D3) are real authenticated principals, not free-text strings — the A1 GIGO risk is closed
  by RLS, not by a manual queue.
- **Positive — the access-role enum is small, auditable, and RLS-native.** Four roles, admin-granted,
  enforced in three places; the deferred engine is a known, recorded future decision, not a surprise.
- **Negative / accepted — the RLS surface widens** (D6): more principals (incl. the synthetic-email
  cohort), and kitchen capture/review now flow through RLS policies that did not exist when `/kitchen/`
  was public. The security-auditor must cover the `member`-insert-own / `ops_lead`-approve split and
  the synthetic-email path — and this **review is gating before rollout** (ADR-0010 D11): the auth /
  RLS / provisioning surface defined here is one of the seams that must pass audit *before* MOS is
  exposed to the internet or rolled out to users.
- **Negative / accepted — synthetic emails are a small operational wart.** `@kitchen.gordi.local`
  addresses never receive mail; the admin sets passwords directly. This is the price of GoTrue having
  no username credential, and is cheaper than an SMS provider or a custom auth shim.
- **Negative / accepted — offline-first is owed if the floor proves flaky** (D4). The trigger is
  documented; until then online-only keeps the ESB-outbox the single dedup authority.
- **Negative / accepted — login friction replaces the frictionless public form.** This is the owner's
  explicit trade (attribution > friction), made survivable by the long-lived PWA session (D3).

## Reversibility

- **The access-role enum is a fixed set that grows by one migration** (add a role to the enum + its
  policies) — the same explicit-over-engine trade as ADR-0001 D3; the deferred configurable engine
  (D5) is the recorded escape hatch if the enum stops scaling.
- **Synthetic emails are reversible per person** — when a staff member gets a real email, the admin
  updates the auth user; the `shared.people` row and all attribution survive (the `user_id` link is
  stable, OD-P1-2).
- **Session lengths are GoTrue config** (D3) — tunable without a code change.
- **The A1 reversal is a one-way product decision** (public → authenticated); re-opening a public
  surface would be a fresh, deliberate decision, not a silent revert.
- **CF Access remaining as Tunnel protection** (D1) is independent of the app auth model — it can be
  added or removed at the infra layer without touching RLS.

## Open questions (recorded, not resolved here)

1. **Exact session minutes** (D3) — recommended 30-day rolling + 30-day inactivity; *confirm at spec*.
2. **Synthetic-email domain** — `@kitchen.gordi.local` is the working proposal; confirm it won't
   collide with any real mail routing (a `.local` TLD is safe by RFC; confirm at spec).
3. **First-admin seeding mechanism** (D5) — CLI vs a one-time deploy seed (lean: deploy seed, mirroring
   OD-P1-6's gitignored deploy-time seed; its credential comes via the `op` secret path, ADR-0010
   D9/D12); *confirm at the provisioning spec*.

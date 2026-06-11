# ADR 0001 — Org seam, person-first auth, and the fixed day-one read posture

- **Status:** Accepted
- **Date:** 2026-06-11
- **Issue:** P1-2 — Supabase foundation (roadmap Phase 1.2)
- **Deciders:** Owner (Arief) + Director, in grill-with-docs session #1 (LOCKED as OD-P1-1..7, `docs/decisions.md`)
- **Supersedes / superseded by:** none

This ADR records the three architectural commitments that the P1-2 grill produced. The
implementation machinery (migrations, helper functions, RLS, pgTAP) is specified in
`docs/plans/2026-06-11-supabase-foundation.md`; this document records *why* the shapes are what they
are so a future maintainer does not re-litigate them. The decisions are binding inputs to the plan,
not open questions.

---

## Context

Gordi MOS is the first app on **one self-hosted Supabase stack** that will later also serve other
Gordi ops apps (kitchen mirror, future roastery), separated by Postgres **schemas**
(`shared` / `mos` / `ops` / `integrations`), not by separate Supabase projects (OD-DIR-3). That
decision forces three foundational questions to be answered *before* any business table lands, because
every later table inherits their answers and a wrong answer here is expensive to reverse:

1. **Tenancy seam** — how does a row know which tenant (org) it belongs to, and how do we keep a
   client from claiming to be in an org it is not?
2. **Identity vs. login** — Gordi wants people referenceable in RACI and reporting lines *before*
   they have (or ever get) a login. How do `shared.people` and `auth.users` relate?
3. **Read authorization posture** — who can read what on day one, and is that a hardcoded set of rules
   or a configurable permission engine?

The product is single-org today (Gordi is the only tenant) but the charter
(`docs/product-expectations.md`) requires "minimal for one client, architected to scale to millions"
— so the seam must exist and be enforced from row zero even though it carries one value today.
The MOS reporting model is **role-based, not person-based** (OD-P0-9a, inherited from the dormant
Notion Management OS `Roles.Reports to` self-relation), and people may hold **several roles at once**
(OD-P1-7) — both shape the read posture.

---

## Decision 1 — Org seam: `shared.orgs` + JWT-claim-stamped `org_id` (OD-P1-1)

- A `shared.orgs` table is the tenant container, seeded with exactly **one** row (Gordi). Multi-org
  later is "add rows", never a schema change.
- **Every business table** (now: the `shared` directory tables; later: `mos.tasks`,
  `mos.weekly_updates`, `ops.events`) carries `org_id uuid NOT NULL REFERENCES shared.orgs(id)`.
- `org_id` is **never sent by the client**. It is:
  - `DEFAULT shared.current_org_id()` — stamped server-side from the session JWT's `org_id` custom
    claim, and
  - constrained by the RLS `WITH CHECK (org_id = shared.current_org_id())` predicate on every insert —
    so even a client that *does* send an `org_id` cannot write a row into another org.
- The custom claim is injected by a **custom access token hook** (plpgsql, wired in `config.toml`)
  that runs at token-mint time and reads the authenticated user's `org_id` (and `person_id`) from
  `shared.people`. The client receives a JWT it cannot forge (signed by Supabase Auth); RLS trusts the
  claim, not client input.

**Why JWT claim and not a per-request `SET app.org_id`, a join to a membership table on every policy,
or a `public.users` mirror:**

- A session variable (`SET LOCAL app.org_id = …`) is set by the client/connection and is therefore
  spoofable from the app tier; a signed JWT claim is not.
- Resolving `org_id` by joining `shared.people` on `auth.uid()` inside *every* RLS policy works, but
  costs a correlated subquery per policy evaluation on every row; minting it once into the token and
  reading it with a `STABLE` helper is the documented Supabase-scale pattern and keeps policies cheap.
- It matches the proven PMO portal pattern, so the security-auditor and future maintainers have one
  mental model across Gordi apps.

## Decision 2 — Person-first, nullable auth link (OD-P1-2)

- `shared.people` exists **independently of login**. A person row can be created, given roles, and
  referenced by RACI and reporting before they can (or ever) authenticate.
- The link to auth is an **optional, unique** `user_id uuid REFERENCES auth.users(id)`:
  - nullable — a person without a login is the normal state for many ops people;
  - unique (partial unique index `WHERE user_id IS NOT NULL`) — at most one person per auth user, and
    many person rows may have no auth user without colliding on `NULL`.
- A soft-archive `archived_at timestamptz` retires a person without deleting history (RACI references,
  past weekly updates) — hard deletes would orphan or cascade through business data.

**Why:** the unit of meaning in MOS is the *person in the org chart*, not the *login*. Modeling
identity as "an auth user that may have a profile" (the naive Supabase default) would make
RACI-before-login impossible and couple the directory's lifecycle to Supabase Auth. Person-first with
a nullable link decouples the two: provisioning a login is "fill in `user_id`", deprovisioning is
"null it / set `archived_at`", neither of which touches the directory's referential integrity.

## Decision 3 — Day-one read posture: a FIXED 3-rule matrix, not a configurable engine (OD-P1-3)

The grill explicitly sharpened the owner's initial "role-matrix-from-day-one" instinct down to
**three hardcoded, individually pgTAP-proven** read rule-sets — one per first-slice surface. Writes
for this issue are locked to service-role/admin; per-feature write paths arrive with their features.

| Surface (lands in) | Read rule | Rationale |
|---|---|---|
| **Tasks** (`mos.tasks`, Phase 2.1) | **Org-readable** — any org member reads any task in their org. | Cross-unit visibility *is* the product (the MOS "see across silos" value). Writes later gated by R / A / manager. |
| **Weekly updates** (`mos.weekly_updates`, Phase 2.2) | **Upward-only** — readable by the author, every manager in the author's manager chain (the **union** over *all* roles the author holds, walked recursively up `reports_to_role_id`), and the CEO. | A weekly update is a report to one's management line, not a public post. Union-over-held-roles means a dual-hat person's single update is reviewable by *any* of their managers (OD-P1-7). |
| **Ops events** (`ops.events`, Phase 2.3) | **Org-readable** — any org member reads the ops feed. | The daily ops feed is a shared operational picture. Writes later = mirror service + unit members' manual adds. |

The **directory tables** built in this issue (`shared.people`, `shared.roles`,
`shared.business_units`, `shared.person_roles`) are **org-readable** by any org member — the org chart
is shared context, and every surface above needs to resolve names/roles/units to render. Directory
**writes** are locked to service-role/admin for this issue (provisioning is an admin action; no app
write path to the directory ships in the first slice).

**The manager-chain primitive.** `shared.is_manager_of(target_person_id)` is the load-bearing function
behind the upward-only rule. It returns true when the current person holds *any* role that sits above
*any* role the target holds, walking `reports_to_role_id` recursively. Because both the viewer and the
target may hold multiple roles (OD-P1-7), it is a **union over a recursive CTE**, not a single chain
walk. The dual-hat scenario is a first-class correctness requirement and gets a dedicated pgTAP proof:

> Person A holds two roles in two business units, reporting to two different leads L1 and L2.
> `is_manager_of(A)` must be true for **both** L1 and L2, and **false** for an unrelated lead L3.

**Why fixed, not configurable:**

- A configurable role→permission engine (policies stored as data, evaluated by a generic rule
  interpreter) is a genuine product — and a genuine multi-month sink — that the first slice does not
  need. Three `CREATE POLICY` statements are auditable, fast (the planner sees real predicates), and
  trivially provable in pgTAP. A data-driven engine is none of those on day one.
- Each rule is independently testable and independently changeable. When the product earns a fourth
  surface or a real exception, we add/alter one policy — we do not retrofit an engine.
- A configurable engine is explicitly recorded as **post-MVP** here so that "we should build the
  permission engine" is a known, deferred decision and not a surprise.

---

## Consequences

**Positive**

- The tenancy seam is enforced from row zero and is client-unspoofable by construction (default +
  `WITH CHECK`), so adding the second tenant is data-only and the security-auditor has one model to
  attack.
- The directory is usable (RACI, reporting, team modules) before anyone logs in, and survives people
  leaving via soft-archive without corrupting historical references.
- Day-one authorization is three readable policies, each with a pgTAP proof, including the dual-hat
  union edge case — so reviewers verify behavior, not intent.
- Every later business table (`mos.*`, `ops.*`) inherits a ready-made pattern: add `org_id` (defaulted
  + checked), enable+force RLS, write the surface's one read policy, copy a pgTAP shape. No rewrite.

**Negative / costs accepted**

- The custom access token hook is now a piece of auth-critical infrastructure: if it stops injecting
  `org_id` / `person_id`, every defaulted insert and org-scoped read breaks. It is covered by pgTAP
  and must be re-verified by the security-auditor whenever auth changes. (Mitigation: helpers are
  `STABLE`, schema-qualified, and `SECURITY DEFINER` only where they must read across the auth
  boundary; the hook is the single injection point.)
- The 3-rule posture means any genuinely new read shape is a migration (a new/altered policy), not a
  config change. This is the intended trade — explicitness over a premature engine — but it does mean
  product changes to read scope are code, reviewed and shipped like code.
- `is_manager_of` walks a recursive CTE per evaluation. At Gordi's org size (~tens of roles) this is
  negligible; at large scale the manager chain may warrant a materialized closure table. Recorded as a
  future optimization, not built now (YAGNI); the function's signature stays stable so the internals
  can be swapped without touching callers or policies.

---

## Alternatives considered

1. **Tenancy via separate Supabase projects per app/tenant** (rejected, OD-DIR-3). Operationally
   heavier (N stacks to run, patch, back up), blocks cross-app identity sharing
   (`shared.people` across MOS + ops apps), and is the opposite of the "one stack, schema-separated"
   decision already locked.
2. **Tenancy via a session variable (`SET app.org_id`) instead of a JWT claim** (rejected). Spoofable
   from the app tier; a signed claim is the only client-unforgeable source.
3. **Resolve `org_id` by joining `shared.people` on `auth.uid()` inside each policy** (rejected as the
   primary path). Correct but costs a correlated subquery on every row of every policy; the minted
   claim + `STABLE` helper is the scale pattern. (The join remains the *fallback* the hook itself uses
   once, at token-mint time.)
4. **Auth-first identity (`auth.users` is the person; a profile row hangs off it)** (rejected,
   OD-P1-2). Makes RACI-before-login and login-less ops people impossible and couples the directory to
   the auth lifecycle.
5. **Configurable role→permission engine on day one** (rejected, OD-P1-3; deferred to post-MVP). Real
   product, real multi-month cost, none of it needed for three known surfaces; harder to audit and
   slower to evaluate than three explicit policies.
6. **Person-based reporting line (`people.reports_to_person_id`)** (rejected, OD-P0-9a). The Notion
   heritage and Gordi's real structure are role-based; a person-based line cannot express "this seat
   reports to that seat regardless of who fills it" and breaks under dual-hatting. Roles carry
   `reports_to_role_id`; the manager relation is derived from the role chain.

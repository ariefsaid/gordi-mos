# ADR-0017 — Agent-native, user-composed UI — deputy authorization + declarative hydration over a (to-be-built) mobile-first kit, across the OLTP+OLAP split

- Status: **Proposed** (2026-06-30; awaiting owner spec sign-off — the specs and plans that consume
  this ADR follow later)
- Deciders: Owner (Arief) + Director, in grill-with-docs session (2026-06-30)
- Related:
  - **ADR-0001** (org seam — `shared.current_org_id()` JWT claim, the custom access-token hook, RLS as
    the single authority, `org_id` defaulted + `WITH CHECK` — the substrate D2/D5 bind to) ·
    **ADR-0011** (the four access roles `admin`/`ops_lead`/`finance`/`member`; the three-layer
    enforcement, ADR-0011 D5, D2 carries into the deputy — and the **derived** `is_manager_of` manager
    chain, **defined in ADR-0001 D3** and reused by ADR-0011, the share-authz lever in D6) ·
    **ADR-0010** (the OLTP/OLAP split + the `reporting` financial read-model fed by a snapshot job,
    ADR-0010 D5; the `gordi_readonly` **least-privilege agent role**, ADR-0010 **D11**, whose raw-warehouse
    path D3 reserves to the server agent; the Healthchecks/monitor seam, ADR-0010 **D7**, this ADR's D10
    extends; the D11 gating security review this surface joins; **and ADR-0010's 2026-06-30 Amendment
    [Proposed] — the warehouse's online home on the Tencent VPS, on which D3's server-side analyst-agent
    placement depends; ADR-0010 open-Q#2 [agent access to financial rows], which D3 partially resolves**) ·
    **ADR-0012** (the ESB outbox + central idempotency — the write path D4 routes user-composed input
    through; `member`-insert / `ops_lead`-approve gates) ·
    **ADR-0016** (the `SECURITY DEFINER` provisioning RPCs — the privileged surface D2 forbids the
    deputy from ever touching)
  - `CONTEXT.md` "Agent-composed UI & analytics" section (canonical terms used verbatim here: **deputy
    agent**, **user view**, **promotion**, **read-model** [operational / reporting], **certified
    metric**, **OLTP/OLAP**) · `docs/decisions.md` **OD-P4-2** (the `reporting` read-model canon) ·
    `docs/product-expectations.md` (the charter — minimal-for-one-client-yet-scales; the `org_id` seam
    must not be bypassable)
  - **External prior art:** PMO sister-app **ADR-0036** "agent-native, user-composed UI" (the deputy
    model + declarative-hydration pattern MOS adapts) · **Builder.io `agent-native`**
    (<https://github.com/BuilderIO/agent-native>) — an external open-source framework cited as prior
    art and as a candidate runtime dependency we would run **config-over-fork** (D8); named as a tool,
    not imported into MOS's own design language (the de-reference firewall).
- Scope note: **This ADR records the agent-native adoption pattern, the deputy authorization model, the
  dual-plane reach, and the trusted-core seams.** It authorizes no migration, no RLS policy, no DSL
  grammar, and no code by itself — the specs and plans that consume it follow. Schema columns, final
  RLS, the query-DSL grammar, and the compiler ceilings' exact numbers **belong to the implementing
  plan / migration**, not this ADR.

## Context

The owner's goal, in his words: let the Gordi team **create UI to their own needs without waiting for
the product dev cycle** — to **analyse, input, or present** things their preferred way — and to
**propose** their composed UI back into the product. In `CONTEXT.md` terms: a **user view** composed
either through the product UI or through the **deputy agent**, then **promoted** if it proves its worth.

MOS shares PMO's foundations — Supabase (Postgres + Auth + RLS), the `org_id` seam (ADR-0001), RLS as
the single enforcement authority, and a DAL seam (`mos-app/src/lib/db/*` that **never sends `org_id`**)
— so PMO ADR-0036's **security** model ports cleanly, and in fact **cleaner**: MOS has **no
impersonation** (it never built PMO's view-only impersonation), so the deputy has no realRole /
effectiveRole subtlety to navigate — it simply binds the live session.

But PMO's **build** premise does **not** transfer, and two MOS-specific facts dominate this ADR:

1. **MOS has no kit to generalize.** PMO had a mature primitive kit (`DataTable`/`KPITile`/`Funnel`/…),
   hand-coded dashboards, and TanStack Query to register and re-point. MOS has **none of these**: a
   minimal atoms-only primitive kit (`docs/reference/mos-design-kit` + `DESIGN.md` tokens — no
   chart/KPI/DataTable components), **no TanStack Query** (manual `useEffect`/`useState`), and no
   dashboards. So the trusted core MOS adopts the pattern *onto* is largely **net-new** and must be
   built **mobile-first** (the rollout is a personal-phone PWA, ADR-0011 D3/D4).
2. **MOS is dual-plane.** PMO was a single Supabase. MOS is **OLTP Supabase + OLAP warehouse**
   (ADR-0010 D1) — `CONTEXT.md`'s OLTP/OLAP split. The warehouse (`gordi-esb-bak` / `gordi-esb-pg`,
   807 MB, rebuildable from the ESB) has **no RLS and no `org_id`** and spans companies. A deputy bound
   to one user's JWT cannot be safely pointed at it. This plane question never existed for PMO and is
   the crux of D3.

This ADR records how MOS adopts the agent-native *idea* without detonating its security foundation,
what is net-new, what plane the deputy may reach, and under what gate (if any) the Builder.io runtime
earns a place.

## Decision

### D1 — Adopt the *pattern*, not the framework as host

MOS is **not** migrated onto agent-native. **Supabase stays the schema and authorization authority**
(ADR-0001/0011) — migrating MOS onto agent-native would invert ownership (the framework becomes the
host app and Supabase degrades to "just Postgres," discarding Supabase Auth, RLS-via-PostgREST, and the
DAL seam). MOS adopts the **principles** on top of the existing Supabase stack: UI/agent **parity**
(anything the UI can do, the deputy can do, through the same capability); **action-defined-once**;
**text-to-hydration over a primitive kit** (the agent arranges and pipes data into pre-built primitives,
never generates code); and **one shared SQL state** (UI and deputy read/write the same RLS-governed
database). This mirrors PMO ADR-0036 §1; the divergences are D3 (dual-plane) and the net-new trusted
core (Context fact #1).

### D2 — The deputy authorization model is the core security invariant

The **deputy agent** runs **as the user's own JWT** — the real `access_roles` and `current_org_id()`
claims the custom access-token hook minted (ADR-0001 D1, ADR-0011 D5), bounded by the **same RLS** the
human is. A deputy carrying the user's badge, never a master key. Its maximum reach is, by construction,
the user's reach, because every read and write it issues passes the same policies. Enforcement is
**by the database, not by the prompt** — so prompt injection becomes a **nuisance, not a breach** (an
injected "show every org" can at most make the deputy *try*; RLS still returns zero cross-org rows).

> **The one rule that can never bend:** the deputy runtime is **never** handed `service_role`, **never**
> a `BYPASSRLS`/privileged connection, and **never** a **privileged provisioning/admin** RPC — the
> `SECURITY DEFINER` user/auth-mutating RPCs of ADR-0016 (e.g. `shared.admin_create_login`). It binds the
> **live authenticated session** and nothing else.

**Provisioning-definer vs business-action-definer (the line D4 leans on).** "Never a `SECURITY DEFINER`
RPC" is **too broad** — it would wrongly block legitimate writes. The real line is *what the RPC mutates
and whose authority it asserts*: the deputy is forbidden **privileged provisioning/admin** definers
(those that create logins, grant roles, or otherwise act with elevated authority the calling user does
not have — ADR-0016), but **may** invoke an ordinary **business-action** definer that still enforces the
**calling user's own** authorization internally (e.g. `ops.approve_kitchen_log` called *as* an
`ops_lead`, where the SoD/RLS check inside the RPC binds the real caller). The test is not "is it
`DEFINER`?" but "does it grant the deputy reach the user lacks?" — if yes, forbidden; if it merely
executes a capability the user already holds, allowed (D4).

**The MOS simplification (vs PMO).** PMO's deputy rule had to distinguish `realRole` from an
impersonated `effectiveRole` (PMO ADR-0008/0016). **MOS has no impersonation** — there is no
effectiveRole to confuse with a real one. The deputy simply binds the user's current session. This is
strictly *less* surface than PMO had, and it is recorded so a future maintainer does not import PMO's
impersonation caveat into a model that has no impersonation.

### D3 — Dual-plane reach (the MOS-specific core, absent in PMO)

The user-facing **deputy** reads exactly **three RLS-bounded targets, all under the user's JWT** — and
nothing else:

- **(a) Base tables** — `mos.*` / `ops.*` / `shared.*`, already RLS-governed (ADR-0001/0011/0012).
- **(b) Operational read-models** — `security_invoker` views over MOS's **own** `mos`/`ops`
  transactional data (tasks, kitchen, ops). `security_invoker` means the view executes with the
  *querying user's* privileges, so the underlying base-table RLS still fires — the view is a curated,
  named shape, not an RLS bypass. **Never the warehouse.**
- **(c) The reporting read-model** — the curated, **`finance`/`admin`-RLS'd** snapshot fed from the
  OLAP warehouse (ADR-0010 D5 / OD-P4-2). It is a *copy* in Supabase, so it is RLS-able under the MOS
  access-role model and its latency/uptime are decoupled from the warehouse.

**Raw warehouse SQL — the `gordi_readonly` analyst path — is reserved to the trusted, server-side
analyst agent** (OpenClaw on the VPS; `gordi_readonly` is the least-privilege agent role of ADR-0010 D11;
the VPS as the warehouse's online home is ADR-0010's 2026-06-30 Amendment, **still Proposed — D3's
server-agent placement is contingent on it landing**), **never** the user deputy. The reason is
structural, not preference: the warehouse has **no RLS and no `org_id`** and **spans companies**, so the
deputy model — whose entire safety proof is "bounded by the user's JWT → RLS" — **cannot bound it**. A
deputy with a direct warehouse connection would be an unbounded cross-company reach by construction.

**Net invariant:** the deputy is provably **single-plane for security** — every target it touches is
RLS-bounded under the user's own claims — even though its *value* spans both planes (it can read live
ops data and curated financials, just never raw cross-company OLAP).

**Reconciling ADR-0010 open-Q#2 (financial-row egress to an inference provider).** ADR-0010 leaves open
"may AI agents read `reporting`/warehouse financial rows? — not until a secure inference provider is
chosen." D3 resolves only the **authorization** half: a `finance`/`admin` deputy *is allowed* to read the
`reporting` snapshot (RLS permits it; a `member` deputy gets zero financial rows). It does **not** dissolve
Q2's **data-egress** half — routing those figures through an **LLM** deputy sends them to a model provider,
which is exactly Q2's concern. Therefore: a finance user reading `reporting` in a **manually-composed**
user view is unaffected (no model in the loop); the **agent/LLM** path over `reporting` inherits Q2's
**secure-inference-provider** precondition and stays gated until that is settled (tracked in D10's
telemetry + the D11 gating review). Q2 remains fully open for the **server-side analyst agent's raw
warehouse** access — D3 does not touch that.

**Reporting bound at scale.** The reporting snapshot ships **warehouse-side aggregates** — cardinality
= dimensions × grain (e.g. revenue-by-branch-by-day), **not** transaction volume — so the `reporting`
surface the deputy reads stays bounded even as the OLAP warehouse grows. (The warehouse already exposes
`v_daily_revenue_unified` (POS + B2B, with a `channel` column) and `v_daily_sales_summary` (per branch);
the snapshot job aggregates from these source-side, per D11.)

### D4 — Input scope: existing entities only; novel shapes become a promotion

User-composed **input** surfaces write **only** through MOS's **existing validated write paths** — the
RLS-gated DAL writes and the **business-action** RPCs the UI already uses (the D2
provisioning-vs-business-action line — never a privileged provisioning/admin RPC), plus the **ESB
outbox** (ADR-0012's central idempotency) for any ESB-bound write — and **only to entities the schema
already has**. A user view's input affordance is the same write-action the built-in UI would call; it inherits
the same RLS, the same `member`-insert / `ops_lead`-approve gates (ADR-0011 D1), and the same outbox
dedup.

**A novel data shape the schema lacks is out of scope for runtime composition.** No runtime DDL, no
EAV/custom-fields store, no agent-authored tables. When a user needs to capture a shape MOS has no
home for, that is **not** a composition — it is a **promotion request** (D6): the demonstrated need
becomes a requirement the dev team builds a real, typed, RLS'd entity for. This keeps the schema the
single, reviewed source of truth and keeps every write inside an already-audited path.

### D5 — Declarative-artifact rule + `user_views` as an ordinary tenant row

When the deputy/user "builds UI," it emits a **schema-validated declarative spec** that the **trusted
renderer** hydrates into real MOS primitives + `DESIGN.md` tokens. It **never** emits executable
code or SQL that runs.

*(The **trusted renderer** is the generic MOS-owned component that reads a `user_views` spec and instantiates
registered primitives bound to compiled, RLS-scoped queries — the analog of a coded page component, but
data-driven; its **architecture and where it runs are plan-owned**, but two properties are fixed here: it
hydrates **only** registry-known primitives/read-models, and a spec that fails validation at render —
e.g. a referenced primitive or read-model was renamed/retired — **degrades to an error state, never a
crash and never an unvalidated render.** The **validator** — the schema check that gates this, its form
plan-owned — is the trust boundary. Spec versioning / primitive-deprecation migration is plan-owned.)*

Three storage-form rules:

1. The spec stores **queries, not results** — never cached rows.
2. On render, queries **re-execute under the *current viewer's* JWT → RLS**. A private **user view**
   runs only as its owner; a **shared** one returns each viewer *their own* authorized data — sharing
   can never leak a row.
3. The spec is **schema-validated** on save *and* on render against the primitive/read-model registry
   (D7) — only known primitives, known read-models, and known fields are accepted. This validation is
   the line between "agent-composed" and "arbitrary code," and the validator is a **trust boundary**.

**`user_views` is an ordinary tenant row.** Saving a **user view** = inserting a `user_views` row
**through the DAL** (`org_id` stamped server-side per ADR-0001 — the client never sends it), **no
migration, no deploy**. Proposed shape (illustrative — **final columns and RLS belong to the
implementing migration, not this ADR**):

```
user_views
  id          uuid pk default gen_random_uuid()
  org_id      uuid not null references shared.orgs(id) default shared.current_org_id()  -- ADR-0001 seam
  owner_id    uuid not null            -- the composing person (the "user level")
  name        text not null
  spec        jsonb not null           -- the validated declarative composition (primitives + query-specs + layout)
  scope       text not null default 'private'   -- 'private' | 'shared_team' (D6); further scopes a deferred extension
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()
  archived_at timestamptz              -- soft-archive (the ADR-0001 / ADR-0004 archive discipline), never hard-delete
```

RLS sketch (final policy belongs to the migration): `SELECT` = owner ∪ shared-within-`org_id` per
`scope`; `INSERT`/`UPDATE`/`DELETE` = owner. Mirror ADR-0001's `current_org_id()` default + `WITH CHECK`
pattern and prove it in pgTAP. **Generated executable components** (JSX/SQL that runs) are explicitly
**out of scope** here — if ever pursued they need a **separate ADR and a real sandbox**.

### D6 — Coexistence, composition, and sharing authorization

**Built-in Surfaces are code; user views are data**, under one route `/views/:viewId` rendered by one
`<UserViewRenderer>` with dynamic nav, using the **same kit + tokens** so a user view is **visually
native**. The whole capability sits **behind a feature flag** for hide-first rollout. User views live
**only** under `/views/*` (they cannot shadow `/tasks`, `/kitchen`, etc.); code-routes and rows never
overwrite.

**Composition authorization** reuses the existing model — **no new access role**:

- **Compose-private** = **every** member (a user view is theirs alone by default — `CONTEXT.md`).
- **Share-to-team** = the team's **manager/supervisor**, gated by the **derived `is_manager_of` chain**
  (ADR-0001 D3, reused by ADR-0011) — the same union-over-roles manager relation the upward-only weekly-update rule
  already uses. Sharing is a *manager* capability, **not** a new access role and **not** `admin`.

**Promotion** (`CONTEXT.md`) is the product's intake of demonstrated demand, and it doubles as the
**quality/curation gate**: either *flip-to-shared* (wider sharing, no code) or *build-to-coded* (the
dev team builds a real Module, using the user view's **spec as the requirement**). Promotion is
**maintainer-gated** — never automatic.

### D7 — Growth & performance posture (seam now, machinery on trigger)

The deputy's **security** invariant (D2/D3) is **unchanged by scale** — growth is a *performance and
resource* concern, handled here so the seams exist before they are needed.

- **Read-model registry indirection.** Operational read-models are addressed by **logical name** via a
  registry, not by hard-coded view names. A name resolves to a `security_invoker` view **today**, and is
  swappable to a **materialized rollup table** (with its **own** RLS + a scheduled `SECURITY DEFINER`
  refresh) **later — same contract, non-breaking**. Pre-recorded recipe for the swap: **materialized
  views do not inherit base-table RLS**, so a matview rollup needs its own RLS policy (the
  `org_id`/role predicate) + a definer refresh job; the registry hides the swap from every caller.
- **Mandatory compiler ceilings on EVERY compiled query** — not just a free-form path: a **statement
  timeout**, a **row cap**, and a **required time-range bound** (a compiled query with no time bound is
  rejected). These bound resource abuse and schema probing regardless of who authored the spec. (Exact
  numbers belong to the compiler spec.)
- **Index-backed predicates.** The RLS predicates the deputy's reads lean on (`org_id`, time-range)
  must be **index-backed**; partition/matview-refresh triggers are **named and deferred** (built when
  the trigger fires, not pre-emptively).
- **Reporting stays bounded** via source-side aggregation (D3) — the snapshot is dimensions × grain,
  not transaction volume.

### D8 — Run agent-native whole, config-over-fork (used as intended, integrated)

Owner intent: **use the framework the way its builders intend** — do **not** reinvent it and do **not**
pick it apart. If the Builder.io runtime is adopted (gated by D9), keep **agent-native whole** as its
own scaffolded Nitro + Drizzle app, **configured, never source-edited**:

- **Drizzle points at MOS's Supabase Postgres via `.rls()`** — the binding that wraps each query in a
  transaction setting `request.jwt.claims` + `SET LOCAL ROLE authenticated`, so MOS's `org_id` /
  `access_roles` policies fire identically to `supabase-js`. This **is** D2's rule operationalized: the
  binding carries the user JWT, RLS fires.
- **Supabase migrations remain the single schema source of truth; Drizzle is introspect-only**
  (`drizzle-kit pull`, **never** `push`).
- **MOS embeds only the assistant/conversation panel** — prefer a **subdomain + shared-session SSO**
  over an iframe (ADR-0011 D1's single Supabase identity makes one session portable). **Caveat (same
  limitation PMO ADR-0036 §9 hit):** cookie-`Domain` session sharing needs a **real parent domain**, and
  MOS deploys to `*.pages.dev` today (ADR-0010 D3) — so subdomain SSO is **contingent on a custom parent
  domain** and is a **D9-spike / build-time step**, not free. If unavailable, the session is handed over
  explicitly (the supabase-js `setSession` portability PMO proved) rather than auto-shared by cookie.
  **Artifacts render native in MOS** via the trusted renderer (D5), not inside the panel.

The D5 trusted core keeps agent-native **swappable at the seam** (insurance against a v0.x dependency),
**but the seam is not the plan — using agent-native is.** The **HARD rule** mirrors D2: the sidecar's
DB binding must **never** be `service_role` or any non-`.rls()` connection — enforced by a guard/lint,
not by discipline alone.

### D9 — MOS-specific spike gate (PMO's green spike does NOT transfer)

PMO's spike passed against PMO's **managed, single-Supabase, profiles-derived-role** stack. MOS's stack
is **self-hosted, multi-schema, and JWT-claim-derived** (`current_org_id()` / `access_roles` from the
custom access-token hook — **not** PMO's `profiles`-derived role). So **the PMO green does not
transfer**; D8 is contingent on a MOS-own throwaway spike (no prod touch) proving, against MOS's actual
stack:

1. Drizzle `.rls()` (or the sidecar's binding) enforces `org_id` + `access_roles` policies
   **identically to `supabase-js` using MOS's actual JWT claim shape** — **blocks** a cross-org read,
   **allows** an in-org read, and a **kill-test** confirms a non-`.rls()`/privileged connection
   **bypasses** RLS (the exact failure the D2/D8 guard prevents).
2. `drizzle-kit pull` is **introspect-only** across the exposed MOS schemas (`shared`/`mos`/`ops`/
   `integrations`/`reporting`) — it mirrors, never wants to own/migrate.
3. The assistant panel embeds with **shared-session SSO — no second login**.

**PASS → adopt D8** (config-over-fork sidecar). **FAIL** (RLS leaks through the binding, schema
ownership conflicts, or SSO is unworkable) → **do not fork to force it**; build a **MOS-native NL→spec
author** against the D5 trusted core. **Either way, D3–D7 proceed** — the trusted core, `user_views`,
the dual-plane reach, the registry, and the ceilings **stand alone**, independent of which agent authors
the spec.

### D10 — Observability of the deputy

The deputy is a new security-sensitive principal and must be observable. Three streams, extending the
ADR-0010 D7 monitor posture:

- **(a) Action/write audit**, attributed to the **real user** (the deputy acts *as* them, D2) — every
  write a user view triggers is traceable to a person.
- **(b) Generation log** — prompt → emitted spec, **replayable** (so a bad composition can be
  reproduced and diagnosed).
- **(c) Telemetry** — per-compose LLM **cost, latency, errors**, and **logged injection attempts**
  (RLS-blocked cross-org tries are signal, not noise).

A **per-user daily compose/token budget cap** bounds runaway use and abuse. Because financial data is
tiered (**first-class** financial-statement figures vs **second-class** figures that affect them —
`CONTEXT.md` certified-metric definition), (a) and (c) are **non-optional** on any reporting-touching
deputy path.

### D11 — Data freshness (as-of on every non-live figure)

Every **reporting**-derived (non-live, snapshot-fed) figure a user view renders **must show its as-of
timestamp** — the `CONTEXT.md` read-model "carries an **as-of** time" rule. First-class financial data
must **never** be mistaken for live OLTP data. Live operational figures (read-model kind (b)) are
current by construction; reporting figures (kind (c)) are as-of the last snapshot and say so.

## Build sequence (belongs to the implementation PLAN — summarized only)

**Value-first, inverting PMO ADR-0036 §10** because MOS has **no kit to register** (Context fact #1):

1. **Hand-build one mobile-first operational dashboard** off already-loaded ops/kitchen data — this
   *produces* the first primitive kit.
2. **Extract** those primitives → the **registry** (D7).
3. **Query-spec DSL + RLS-scoped compiler** — multi-schema, with the mandatory ceilings (D7).
4. **`user_views` + `<UserViewRenderer>` + `/views/:viewId` route + dynamic nav** (D5/D6), behind the
   feature flag.
5. **Manual builder** (no agent) — proves the core end-to-end and ships user value alone.
6. **Deputy spec-author** — via the D8 sidecar **or** MOS-native, per the D9 gate.

The **sales** dashboard (warehouse → reporting → dashboard) is a **parallel track** depending on
ADR-0010-amendment work (warehouse online + the reporting migration + the snapshot job), converging with
this sequence at a later issue.

## Alternatives considered

- **Full-framework host (migrate MOS onto agent-native).** Rejected (D1) — inverts ownership; discards
  Supabase Auth, RLS-via-PostgREST, the DAL seam, and the ADR-0001/0011 substrate; a v0.x framework
  owning a tenancy-sensitive app.
- **Privileged / `service_role` Drizzle (or any non-`.rls()` binding) for the sidecar.** Rejected
  (D2/D8) — **bypasses RLS**, destroying the `org_id` seam (ADR-0001) the charter says must not be
  bypassable. Two state authorities over one DB.
- **Vendor / fork agent-native (a permanent pick-apart).** Rejected (D8) — owner preference *and* on
  merit: forfeits upstream upgradability; MOS would own the maintenance of a young external framework.
- **The deputy holds a direct `gordi_readonly` warehouse connection.** Rejected (D3) — the warehouse
  has **no RLS / no `org_id`** and **spans companies**, so a deputy connection is an **unbounded
  cross-company reach** by construction; D3 reserves the raw warehouse path to the trusted server-side
  analyst agent and routes the deputy only to the RLS'd `reporting` snapshot.
- **The deputy / user composes a novel data shape at runtime (EAV / custom-fields / runtime DDL).**
  Rejected (D4) — out of scope; a novel shape is a **promotion request** (D6), built as a real typed,
  RLS'd entity by the dev team. Keeps the schema the single reviewed source of truth.
- **The agent generates executable React/SQL at runtime.** Deferred (D5) — arbitrary code in a
  multi-tenant app needs a real sandbox; declarative specs deliver most of the value safely. Revisit
  only via a dedicated ADR.
- **Configurable role↔permission engine to gate composition/sharing.** Rejected — the same
  explicit-over-engine trade as ADR-0001 D3 / ADR-0011 D5; reusing the derived `is_manager_of` chain for
  share-authz (D6) needs no new machinery.
- **Do nothing / no agent-composed UI.** Rejected — forgoes a strategic capability the architecture is
  unusually ready for (RLS + `org_id` + the DAL seam), and forgoes the **promotion-as-requirements**
  goldmine (demonstrated demand becomes the spec).

## Consequences

**Positive**

- Users get a deputy that is a true same-class citizen — explore, compose, input — **provably bounded by
  their own access** (D2 deputy + RLS), with prompt injection reduced to a nuisance, and **cleaner than
  PMO** because MOS has no impersonation.
- The security guarantee is **by construction** (DB-enforced), reusing the foundation MOS already paid
  for (RLS, `org_id`, the DAL seam) — not bolted on.
- The deputy is **single-plane for security** (D3) yet **dual-plane for value** — the dual-plane risk
  PMO never faced is resolved by reserving raw OLAP to the server agent and routing the deputy only to
  the RLS'd reporting snapshot.
- The trusted core (registry, DSL+compiler, renderer, `user_views`) delivers value **with or without**
  agent-native — a manual builder alone is shippable; the runtime is decoupled and reversible (D8/D9).
- User views and built-in Surfaces coexist cleanly (separate namespace + source of truth) yet look
  native (shared kit + tokens); adding a user view needs **no deploy** (D5/D6).
- **Promotion** turns demonstrated demand into product requirements — the spec writes itself from a
  proven user view.

**Negative / costs accepted**

- **Real net-new, security-sensitive surface** — a primitive registry, a query-spec DSL + compiler, a
  spec renderer, and `user_views`. The **compiler and the spec validator are trust boundaries** (the
  compiler must never emit non-RLS-scoped or raw SQL; the validator must reject anything off-registry).
  Larger net-new lift than PMO had (Context fact #1).
- **Maturity risk** of a v0.x agent-native runtime in a tenancy-sensitive path — mitigated by the D5
  decoupling (it is *only* a spec-author against the trusted core) and the D9 gate.
- **A new principal to observe** (D10) and a freshness obligation (D11); a budget cap and as-of stamps
  are owed.
- **Shared views add re-execution-under-viewer complexity** (D5 rule 2) that must be tested — a leak
  here is a tenancy breach.

## Reversibility

- **`user_views` is additive** — one table + RLS in a schema that already exists; reversible by dropping
  the table (and the route/renderer/registry), leaving the four/five-schema canon untouched.
- **The trusted core is additive** — registry, DSL, compiler, renderer are new code behind a feature
  flag; removable without touching base tables or existing Surfaces.
- **Agent-native is config-over-fork (D8)** — a separate scaffolded sidecar, swappable at the D5 seam
  for a MOS-native spec-author (the D9 FAIL branch) without an app rewrite.
- **The read-model registry indirection (D7)** makes the view→matview swap a non-breaking config change,
  not a caller rewrite.
- **The whole capability is feature-flagged (D6)** — hide-first, reversible by a flag flip.

## Verification

- **Decision-level (this ADR):** owner sign-off on Status → Accepted; cross-refs to
  ADR-0001/0010/0011/0012/0016 + PMO ADR-0036 resolve; the `CONTEXT.md` terms are used verbatim.
- **Spike gate (D9):** a pgTAP-style proof that the Drizzle `.rls()`/sidecar binding **blocks a
  cross-org SELECT** and **permits the in-org SELECT** identically to `supabase-js` **using MOS's actual
  `current_org_id()`/`access_roles` JWT shape**; a **kill-test** that a non-`.rls()`/privileged
  connection bypasses RLS; `drizzle-kit pull` is introspect-only across the exposed schemas; the
  assistant panel embeds with no second login. Pass/fail documented in the spike's plan.
- **Trusted core (when built):**
  - **pgTAP for `user_views` RLS** — owner isolation, `scope` sharing returns *viewer-scoped* rows,
    cross-org blocked (mirror ADR-0001/0005's RLS proof shape).
  - **A `security_invoker` guard test** — an operational read-model view executes with the querying
    user's privileges (base-table RLS still fires), not the view owner's.
  - **The deputy-invariant test** — the deputy path carries the **real user JWT** and is **denied a
    cross-tenant read**; plus a **guard** proving **no privileged / non-`.rls()` path exists** for the
    sidecar binding (D8's HARD rule).
- **One curated e2e** (per ADR-0010's ~6–8-journey budget): a user **composes → saves → reopens a
  private user view**; a **second user cannot see it**.

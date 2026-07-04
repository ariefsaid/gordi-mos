# ADR-0018 — Port the PMO-native agent stack (copy-adapt, no shared package)

- Status: **Accepted** (owner-approved 2026-07-04 — grill-with-docs session; the specs and plans that
  consume this ADR follow, one per port train P1/P2/P3; each train is independently shippable and
  gated on its own spec → plan → build → review loop)
- Deciders: Owner (Arief) + Director, in grill-with-docs session (2026-07-04)
- Related:
  - **ADR-0017** (the agent-native / user-composed UI ADR this one **supersedes in part and re-scopes**:
    this ADR **replaces D8's runtime-adoption half** (config-over-fork of the upstream agent-native
    framework — retired upstream) **and re-scopes D9** (its RLS-binding half already PASSED at the
    2026-07-02 spike; its SSO half is **moot** under the same-origin port — D3/D7); **ADR-0017 D1–D7
    survive unchanged** — deputy authorization model, dual-plane reach, input scope, declarative-artifact
    rule, coexistence/sharing, growth posture, observability, freshness all carry forward as written.
    ADR-0017 §4a / build-sequence Issues 2–3 (extract the kit → registry; grow the query-spec DSL +
    compiler) are **re-scoped to the P1 port train** (D6) — the registry/DSL arrive by port, not grown
    from scratch.)
  - **ADR-0010** (platform topology — the OLTP/OLAP split, the `reporting` financial read-model fed by a
    snapshot job (D5), the least-privilege `gordi_readonly` agent role (D11), the self-hosted Supabase
    stack whose edge-runtime container is the deputy runtime's self-hosted prod home (D3); the Tencent
    VPS online home for the OLAP warehouse + the server-side analyst agent, ADR-0010 Amendment A1 /
    OD-AN-1 amendment) ·
    **ADR-0011** (access roles `admin`/`ops_lead`/`finance`/`member`; the three-layer enforcement; RLS as
    the ceiling the deputy tools run under — D2/D4) ·
    **ADR-0016** (the `SECURITY DEFINER` provisioning RPCs — explicitly **out of deputy reach**, D4) ·
    **ADR-0012** (the ESB outbox — the write path D4's write tools route through) ·
    **ADR-0001** (org seam + `current_org_id()` + `org_id` defaulted + `WITH CHECK` — the substrate every
    ported agent table inherits, D7)
  - **PMO (sibling internal project, `/Users/ariefsaid/Coding/PMO`)** — ADRs **0037–0046** (the agent
    stack this ADR ports; mapped to trains in D6): **0037** compiler/DSL + `ENTITY_WHITELIST` ·
    **0038** renderer/executor dispatch · **0039** untrusted-output validation boundary (single LLM call
    site) · **0040** in-app panel Option A · **0041** model-calling agent action capability seam ·
    **0042** versioning convention (**PMO-internal; explicitly EXCLUDED from the port**) ·
    **0043** thread/event persistence + run lifecycle · **0044** automations (cron + event) +
    notifications inbox · **0045** transcript interaction contracts (typed widgets, ask-user, live
    context) · **0046** dispatch watermark table. PMO's ADR-0040 (2026-07-03, "Decided — Option A only")
    **retired the sidecar as a user surface** and is the upstream event that killed ADR-0017 D8's premise.
  - `CONTEXT.md` glossary — **Port** (the copy-adapt adoption posture), **Grounded answer** (the D5
    anti-fabrication rule), **deputy agent** / **user view** / **read-model** / **OLTP / OLAP** (used
    verbatim) · `docs/decisions.md` **OD-AN-1** (agent-native adoption), **OD-AN-2** (`reporting` as a
    growing set; two-tier drill-down), **OD-AN-3** (this ADR's owner-decision entry)
  - `docs/product-expectations.md` (the charter — production-grade, minimal for one client yet scales;
    the `org_id` seam must not be bypassable — D2/D4/D7 bind to it)
- Scope note: **This ADR records the port decision and its sequencing.** It authorizes no migration, no
  RLS policy, no DSL grammar, and no code by itself — one spec + plan per port train (P1/P2/P3) follows,
  each through the full loop. Exact schema columns, RLS policies, the DSL grammar, the tool catalog
  enumeration, and the credit-ledger shape **belong to each train's implementing plan / migration**, not
  this ADR.

## Context

ADR-0017 D8 adopted **config-over-fork of the upstream agent-native framework** (see ADR-0017 refs for
the external prior art and the candidate runtime — vendor names kept out of MOS's own design language
per the de-reference firewall) as a **sidecar**, gated by the D9 spike, with PMO's adoption as the
reference implementation. **That premise died upstream.** PMO's ADR-0040 (2026-07-03, "Decided — Option A
only") **retired the sidecar as a user surface** — it was a builder/admin-grade UI, not app-user-grade;
the sidecar's PMO adoption PR was **closed UNMERGED**; the owner ruled **"cherry-pick"** (copy-adapt the
valuable machinery, not adopt the runtime as a dependency).

PMO then **rebuilt the agent stack PMO-NATIVE on its own substrate**: an in-app drawer (`AssistantPanel`)
+ Supabase Edge Functions (`agent-chat`, `agent-dispatch`, `compose-view`) with a **caller-JWT deputy
loop** (the deputy runs as the user's own access token — ADR-0017 D2's invariant, implemented as a
loop) and a **curated tool catalog** over the repository (entity) seam. That stack is now **complete on
PMO dev** ("batteries-included Option A", PMO PRs #200–#218) and **post-audit** (gpt-5.5 cross-family
audits + red-team fixes #219–#222 landed). Footprint: ≈4.0k lines of edge functions + ≈2.5k lines of
client code + migrations + ADRs 0039–0046. Critically for the port: it contains **no code from the
upstream agent-native framework** (no AGPL / no de-reference concern in the ported artifacts) — the
framework was a *sidecar* dependency PMO retired before the native rebuild; what PMO rebuilt is its own.

So the choice in front of MOS is no longer "adopt the framework as a sidecar (D8)" vs "build a
MOS-native spec-author from scratch (D9 FAIL branch)". It is **"port PMO's proven, audited, native stack
and own the fork" vs "re-grow a registry/DSL/runtime from scratch"** — and the owner chose **port**,
because PMO already paid for and audited the exact machinery ADR-0017's build sequence (Issues 2–6) was
going to grow organically. This ADR records that choice and the **no-shared-package / no-auto-sync**
adoption posture that keeps the two apps decoupled.

Two MOS-specific facts carry forward unchanged from ADR-0017 and shape the port (D4/D5/D7):

1. **MOS is dual-plane** (OLTP Supabase + OLAP warehouse). PMO was single-plane. The deputy's
   read-catalog must span **both planes** (mos OLTP entities + `reporting` read-models), while the raw
   warehouse stays reserved to the server-side analyst agent (ADR-0017 D3 / OD-AN-2) — PMO never had a
   second plane to reach.
2. **MOS adds a grounding NFR PMO lacks** (D5). PMO's prompt has no explicit anti-fabrication rule; MOS
   makes grounding a **binding, test-enforced** property, not a prompt hope — because MOS's deputy reads
   curated financial figures where a confident-but-fabricated number is materially worse than silence.

## Decision

### D1 — Port maximum, copy-adapt (substrate + agent + batteries)

MOS **ports PMO's agent stack from PMO dev** — the whole stack: the **substrate** (DSL / compiler /
entity whitelist / renderer+executor / untrusted-output boundary), the **agent** (the deputy loop /
panel / thread+event persistence / run lifecycle / approve-deny writes), and the **batteries**
(automations / notifications / typed transcript widgets / dispatch watermark / usage+credits) — rather
than building its own, and rather than the retired sidecar.

- **Supersedes ADR-0017 §4a / build-sequence Issues 2–3** ("extract the kit → registry"; "grow the
  query-spec DSL + compiler"): the registry and the DSL **are no longer grown from scratch** — they
  **arrive by port**, shaped by PMO's design. MOS adapts its dashboard kit (the Issue-1 primitive kit,
  already shipped) to PMO's registry contract rather than inventing both halves.
- **Supersedes ADR-0017 D8's runtime-adoption half**: the config-over-fork sidecar is retired upstream
  (PMO ADR-0040); MOS does not adopt a retired dependency. (D8's *other* half — the structural query
  chokepoint the 2026-07-02 spike result demanded — **survives and is inherited**: the ported
  `agent-chat` edge function is the single LLM call site PMO ADR-0039 already gates, and the deputy's
  every DB query still flows through the caller-JWT binding under RLS, exactly as the spike's
  `withOrgClaims`-style structural chokepoint requires. The mechanism is owned by MOS after the port,
  not borrowed.)

The decision is **port maximum** because the alternative — re-grow a registry, a DSL+compiler, a
renderer, a deputy loop, a run lifecycle, a transcript-contract system, an automation engine, and a
credit ledger — would re-pay every lesson PMO already bought and audited (tenancy, credit forgery,
separation-of-duties bypass — see Consequences). PMO's stack is complete and audited; MOS copies and
owns it.

### D2 — No DRY, no shared package (MOS owns its fork outright)

Two apps, two schemas, two DALs, different jobs-to-be-done; PMO is still churning under audits. MOS
**copies the code and owns the fork outright** — **no shared package, no runtime dependency, no automatic
sync.** Future PMO fixes arrive by **deliberate manual cherry-pick, re-reviewed under MOS's own gates**
(typecheck / lint / pgTAP / the review battery) — **never auto-synced.**

This is the **"Port"** adoption posture (recorded in `CONTEXT.md`): copy-adapt proven code, then MOS
owns its copy. The terms it deliberately avoids — **DRY/shared-library** (couples two drifting apps
under different schemas and JTBDs), **fork** (implies tracking an upstream; there is none after the
port), **vendor** (implies third-party code; PMO is internal) — are each rejected for the reason stated.

The asymmetry is intentional and is the point: after the port the two codebases **drift freely**; there
is **no upstream to track**. Divergence is a feature (see Consequences), not technical debt to pay down.

### D3 — Runtime home = Supabase Edge Functions, same shape as PMO

The deputy runtime lives in **Supabase Edge Functions**, the same substrate PMO ADR-0040 chose:
`agent-chat` (the multi-turn deputy loop), `agent-dispatch` (tool execution), `compose-view` (one-shot
view composition). This works on **both** MOS environments:

- **MOS staging** (Supabase Cloud) — native edge functions.
- **Self-hosted prod** — the **edge-runtime container** that ships with self-hosted Supabase
  (ADR-0010). Same function code, different host; no second codebase.

The **Tencent VPS** (`tencent-OpenClaw`, ADR-0010 Amendment A1) **remains the server-side analyst
agent's home** — the OLAP plane, where the deputy's sibling (the trusted `gordi_readonly` agent of
ADR-0017 D3 / OD-AN-2) lives **next to the RLS'd-data it queries**. The deputy (OLTP, caller-JWT,
RLS-ceilinged) and the analyst (OLAP, least-privilege, curated-promotion loop) stay on their own planes
exactly as ADR-0017 D3 / OD-AN-2 specified; this ADR does not move either.

> **Rejected — re-home the deputy runtime to a VPS Node service** (the ADR-0010 D6 thin-backend shape).
> This would add a **second deployable** (a bespoke MOS backend tier) **+ a JWT bridge** between the
> browser and the deputy — exactly the ops cost PMO's ADR-0040 rejected when it chose same-origin edge
> functions over a sidecar. ADR-0010 D6's own 2026-06-29 amendment already **retired the thin FastAPI
> tier** (both its concerns left: ESB → `gordi-kitchen-app`; provisioning → `SECURITY DEFINER` RPCs);
> re-introducing a backend tier just to host the deputy would unwind that retirement for no gain. Edge
> functions keep the production shape at **SPA + Supabase (data / auth / RLS + edge functions)** — no
> bespoke MOS backend.

### D4 — Deputy tool catalog + DSL entity whitelist (the MOS-authored part)

The deputy's reach is defined by a **curated tool catalog** (ported from PMO's repository seam) +
a **DSL entity whitelist** (ported from PMO ADR-0037's `ENTITY_WHITELIST`). MOS authors the **MOS
content** of both; the machinery that enforces them is ported.

**Entity whitelist — spans BOTH planes** (the MOS-specific fact PMO never had):

- **mos OLTP entities:** tasks, updates (weekly + daily log), objectives, projects/processes, people.
- **`reporting` read-models:** `sales_daily_revenue` (live); `sales_margin_daily` (the next read-model,
  lands before the port — D6 sequencing). RLS **already ceilings** non-`finance`/non-`admin` users out
  of `reporting` (ADR-0011 D5 / ADR-0010 D5) — there is **no extra gating layer** for the deputy to add;
  the catalog simply exposes a read-model and RLS does the rest.

**Tool execution model (ported from PMO):**

- **Read tools auto-execute** (the deputy calls them inline; RLS bounds the result to the user's reach).
- **Write tools — v1 = ONLY `create-task` and `post-update`**, behind the ported **approve/deny chips**
  (the agent-proposes / user-disposes pattern): the deputy emits a proposed write; the user approves or
  denies in the panel; only on approval does the write execute through the **same RLS-gated DAL / RPC
  path the built-in UI uses** (ADR-0017 D4). No write tool in v1 touches anything the user could not
  already write through the UI.

**Explicitly OUT of deputy reach** (hard exclusions, enforced by the catalog, not the prompt):

- **The raw OLAP warehouse** — reserved to the **analyst agent only** (ADR-0017 D3 / OD-AN-2; the
  warehouse has no RLS / no `org_id` / spans companies — structurally unboundable by a caller-JWT
  deputy).
- **Provisioning `SECURITY DEFINER` RPCs** (ADR-0016 — `shared.admin_create_login` etc.) —
  **provisioning is never a business action and is never deputy-reachable.** This is the ADR-0017 D2
  privileged-provisioning-vs-business-action line, made concrete in the catalog: the catalog contains no
  tool that invokes a privileged definer.

The catalog + whitelist are the **MOS-owned surface**: ported machinery, MOS content, audited per train.

### D5 — Grounding NFR (binding, test-enforced — the MOS delta PMO lacks)

PMO's deputy prompt lacks an explicit anti-fabrication rule. **MOS adds one and makes it binding**, not
prompt-only — a **Grounded answer** (`CONTEXT.md`): every data claim in a deputy reply **must trace to
a tool result returned in that conversation.** Concretely:

- A **data question** → the deputy **must query** (invoke a read tool); it **never answers from memory**.
- An **empty or failed read** → the deputy **says so and stops** — it never estimates, infers, or fills
  the gap from training data.
- Any **non-live figure** (anything from `reporting` — snapshot-fed, ADR-0010 D5) **carries its as-of
  freshness** (the `snapshot_as_of` column / ADR-0017 D11 rule) — a deputy reply that quotes a financial
  figure without its as-of time fails grounding.
- The rule **applies even when the user HAS access** to the data. Grounding is a discipline on *how* the
  answer is sourced, not a permission gate; a `finance` user asking for revenue still gets a
  tool-cited, as-of-stamped answer, not a recalled number.

**Enforcement is by acceptance tests, not by the prompt alone.** Each train's spec carries **AC(s)
asserting tool-cited answers** (a reply that cites a tool result it actually has) **+ explicit "no data"
behavior** (a question whose read returns empty/failed gets a "no data / read failed — I stopped" reply,
not a guess). Prompt wording is hygiene; the tests are the contract.

### D6 — Sequencing + slicing (three trains, each shippable, each through the full loop)

The port starts **AFTER** two prerequisites land: (1) the **`sales_margin_daily` read-model** (the next
`reporting` slice — OD-AN-2's `margin_daily`; the depth the sales dashboard's "shallow data" look was
missing), and (2) the **My-Week-replacement dashboard** (the dashboard that supersedes the personal
home). Then three **issue-trains**, each through the **full loop** (spec → plan → build → review
battery → accept → ship), each **independently shippable**, with a **cherry-pick window between trains**
(any PMO fix that lands during a train is folded in before the next train starts, re-reviewed under MOS
gates — D2):

- **P1 — Substrate.** The DSL / compiler / entity-whitelist (PMO ADR-0037 equivalent) + the
  renderer/executor dispatch over the **MOS dashboard kit** (PMO 0038) + the **untrusted-output
  validation boundary** (PMO 0039 — the single LLM call site) + `user_views` (ADR-0017 D5) + the
  **manual builder** (no agent) + **one-shot compose** (`compose-view`). **Shippable with zero
  conversational agent** — a user composes a view by hand, the renderer hydrates it; this is the
  re-scoped ADR-0017 §4a Issues 2–5 (registry / DSL / renderer+`user_views` / manual builder) delivered
  in one port train instead of grown. *(PMO ADR-0042 — versioning convention — is PMO-internal and
  explicitly EXCLUDED; MOS adopts its own spec-versioning when P1's plan needs it.)*
- **P2 — Panel + runtime.** The `agent-chat` edge function (**multi-turn deputy loop + grounding**,
  D5) + the `AssistantPanel` drawer + thread/event persistence + run lifecycle (PMO 0040/0041/0043) +
  **approve/deny writes** (D4 — `create-task` / `post-update`). This is the first train with a live
  deputy; P1 already shipped the substrate it loops over.
- **P3 — Batteries.** Automations (cron + event) + notifications inbox (PMO 0044) + typed transcript
  widgets / ask-user / live context (PMO 0045) + dispatch watermark (PMO 0046) + the **usage / credits
  ledger** (cost control — extends ADR-0017 D10's per-user daily budget into a durable ledger; exact
  shape plan-owned).

The trains are ordered by **dependency**, not by value-preference: P2 needs P1's substrate to loop
over; P3's automations dispatch through P2's runtime. Each is shippable on its own (P1 ships a manual
composer; P2 ships a deputy; P3 ships automation + durability).

### D7 — MOS deltas baked in (the port is not a verbatim copy)

The port carries **MOS-specific adaptations** applied during the copy, not deferred:

- **All agent tables live in the `mos` schema with `org_id` + RLS**, like every business table
  (ADR-0001). The ported tables — `threads`, `events` (PMO 0043), `usage` / credits (P3), `automations`,
  `notifications` (PMO 0044), the dispatch `watermark` (PMO 0046), `user_views` (ADR-0017 D5) — each get
  `org_id` defaulted server-side + `WITH CHECK`, RLS proven in pgTAP. PMO's tenancy model (its own audit
  fixes #219–#222) is the reference, re-proven against MOS's `current_org_id()` claim shape.
- **UI is re-skinned to MOS `DESIGN.md`** (One-Blue, DM Sans / Plus Jakarta, the navy + burnt-orange
  brand tokens of OD-P3-7) — **no PMO look-and-feel leaks.** The `AssistantPanel` drawer, the transcript
  widgets (P3), and every composed-view primitive render in MOS tokens, not PMO's. This is the
  de-reference firewall applied visually.
- **ADR-0017 D9's untested SSO half is MOOT.** D9's RLS-binding half **PASSED** (already recorded at the
  2026-07-02 spike); its **SSO half** (the `*.pages.dev` parent-domain / cookie-`Domain` problem, D8
  caveat) was still untested — and is now **moot**: PMO ADR-0040's Option A is **same-origin edge
  functions** (the deputy runs on MOS's own origin, not a sidecar subdomain), so there is **no second
  origin and no cookie-domain problem to solve.** The SSO half of D9 is closed by removal, not by a
  spike.

## Consequences

**Positive**

- **The registry/DSL/runtime arrive proven and audited.** MOS inherits PMO's audit lessons — tenancy
  isolation, credit-forgery prevention, separation-of-duties bypass fixes (#219–#222) — **for free**;
  re-growing from scratch would re-pay for every one of those lessons in MOS incidents instead of PMO's.
- **Faster to a live deputy than the organic build sequence.** ADR-0017's Issues 2–6 collapse into three
  port trains with the hard parts (compiler ceilings, untrusted-output boundary, run lifecycle) already
  battle-tested; the MOS lift is adaptation + re-skin + the D5 grounding delta, not invention.
- **Grounding is a first-class MOS property** (D5) — the deputy that touches curated financials is
  bound by a test-enforced anti-fabrication rule PMO never had, so a confident-but-fabricated revenue
  figure is a caught test failure, not a shipped regression.
- **The production shape stays simple** (D3): SPA + Supabase (data/auth/RLS + edge functions), no
  bespoke MOS backend tier — consistent with the ADR-0010 D6 retirement and PMO ADR-0040's same-origin
  choice.
- **Divergence is a feature** (D2): after the port, MOS and PMO drift freely; MOS is not coupled to
  PMO's audit churn, and PMO is not blocked by MOS's gates.

**Negative / accepted**

- **MOS's registry/DSL arrive shaped by PMO's design, not grown organically.** ADR-0017 §4a's
  "value-first births the kit" posture is **inverted**: MOS adapts its kit to PMO's registry contract
  rather than growing its own. Accepted trade — **proven, audited shape > organic shape**; the registry
  contract is small and adaptable, and the dashboard kit MOS already shipped (Issue 1) is the thing that
  has to fit it.
- **Divergence cuts both ways.** Once the codebases drift, a PMO fix MOS wants is a **manual
  cherry-pick re-reviewed under MOS gates** (D2), never a pull — so MOS owns the cost of re-evaluating
  every ported fix against its own schema/RLS/tests. This is the deliberate price of decoupling.
- **The port inherits PMO's shape, warts and all.** Where PMO's design is suboptimal for MOS's dual-plane
  reality, MOS adapts (D4's two-plane whitelist, D5's grounding) — but the adaptation cost is paid at
  port time, not amortized, and must be re-audited under MOS gates.
- **A new durable surface to own** — the agent tables (D7), the credit ledger (P3), the dispatch
  watermark (P3), and the grounding-test suite (D5) are all net-new MOS-owned obligations, each with its
  own RLS proof and observability (ADR-0017 D10 carries forward unchanged).

## Reversibility

- **Each train is independently shippable and independently reversible** (D6). P1 alone ships a manual
  composer with **zero conversational agent**; if the agent never ships, the substrate is still a
  product. P2/P3 are additive on P1 and removable without touching P1 or base tables.
- **The agent tables are additive** (D7) — new tables in the `mos` schema with `org_id` + RLS; reversible
  by dropping them, leaving the four/five-schema canon + the Issue-1 dashboard kit untouched.
- **The runtime is swappable at the seam.** The deputy is config-over-port (D2), not a host migration:
  edge functions are a substrate MOS could later re-home (a Node service, a VPS) without an app rewrite —
  the D3 rejection of a VPS tier is a choice, not a lock-in. ADR-0017 D5's trusted renderer keeps the
  agent swappable against the substrate, unchanged.
- **The whole capability is feature-flagged** (ADR-0017 D6) — hide-first, reversible by a flag flip, train
  by train.
- **The grounding NFR (D5) is test-enforced**, so it is reversible only by a deliberate owner call to
  relax the tests, never by a silent drift.

## Verification

- **Decision-level (this ADR):** owner sign-off on Status → Accepted; cross-refs to ADR-0010/0011/0012/
  0016/0017 + PMO ADRs 0037–0046 resolve; the `CONTEXT.md` terms (**Port**, **Grounded answer**,
  **deputy agent**, **read-model**, **OLTP/OLAP**) are used verbatim.
- **Per train (the specs + plans that consume this ADR):**
  - **P1:** pgTAP for `user_views` RLS (owner isolation, scope sharing viewer-scoped, cross-org blocked —
    mirrors ADR-0017's verification shape) + a `security_invoker` guard test on the read-models the DSL
    addresses + a spec-validation boundary test (an off-registry primitive/read-model is rejected,
    degrades to an error state, never renders). One curated e2e: compose → save → reopen a private view;
    a second user cannot see it (the ADR-0017 e2e budget).
  - **P2:** pgTAP for `threads`/`events` RLS (cross-org blocked, owner/manager read per ADR-0017 D6
    share-authz) + the deputy-invariant test (the deputy path carries the **real user JWT** and is
    **denied a cross-tenant read**; no privileged/non-caller-JWT path exists — the structural chokepoint
    the 2026-07-02 spike demanded) + the **grounding acceptance tests** (D5): a tool-cited answer passes;
    a data question answered from memory fails; an empty/failed read yields an explicit "no data" reply,
    not a guess; a `reporting` figure carries its `snapshot_as_of`.
  - **P3:** pgTAP for `automations`/`notifications`/`watermark`/`usage` RLS + the **credit-ledger
    forgery test** (the audit lesson PMO paid for, re-proven against MOS's ledger) + the dispatch
    watermark idempotency test (an automation fires at most once per dispatch).
- **The de-reference firewall is itself verified**: a grep of the ported artifacts + this ADR's own new
  text finds **no external vendor brand names** (the upstream agent-native framework is referenced only
  via "see ADR-0017 refs"; PMO is the named internal sibling). The ported code contains no upstream
  framework code (the sidecar was retired before PMO's native rebuild) — no AGPL surface to review.

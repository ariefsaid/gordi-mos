# Agent Capability Expansion — PMO → MOS gap analysis

- **Status:** Draft (input to an owner grilling session — not a decision, not a spec for build)
- **Date:** 2026-07-06
- **Author:** Director (read-only synthesis)
- **Sources (read-only):** PMO ADRs 0036–0046, 0049–0053 (skip 0048 ERPNext); PMO live agent
  (`supabase/functions/agent-chat/{actions,schema,prompt,handler}.ts`, `compose-view/`); MOS ported agent
  (`supabase/functions/agent-chat/`, `compose-view/`, `mos-app/src/lib/agent/`, `mos-app/src/components/assistant/`);
  MOS ADRs 0017/0018 + port plans `2026-07-0{4,5,6}-port-*.md`.
- **Scope:** a concrete candidate list of agent capabilities MOS could expand, each with user-value,
  rough effort, dependencies, and MOS-applicability. Feeds the owner grilling on **what to expand and in what order**.

---

## §0 — How to read this doc

Two kinds of statement are deliberately separated:

- **Evidence** (what PMO has / what MOS has) — cited to a PMO ADR + file and a MOS file/ADR. These are facts.
- **Synthesis** (proposed MOS expansion) — the expansion candidates, sequencing, and open questions. These are
  the Director's recommendations for the owner to grill, **not** decisions.

**Current MOS posture (the baseline this doc expands from):** MOS is at **P3a + P2.1** of the port train
(ADR-0018 D6). Shipped: P1 substrate (viewspec compiler/DSL + renderer + `user_views` + manual builder +
one-shot `compose-view`), P2 panel/runtime (`agent-chat` deputy loop + grounding NFR + `AssistantPanel` +
thread/event persistence + run lifecycle + approve/deny writes `create_task`/`post_update`), P2.1 DB-side
aggregate RPC, and **P3a** (deep thread-history replay + `mos.notifications` + channel-adapter seam + Inbox
destination UI + `ask_user` clarifying question + rating/downvote + `notify` action + work-item comments +
`@mention`→notification). **P3b (automations) is the next already-planned step**, gated on a staging
live-verify of the `generateLink` → `custom_access_token` hook (P3 plan §3.3).

---

## §1 — Capability inventory: PMO vs MOS

Legend: **HAS** = MOS ports/has it · **PARTIAL** = MOS has the mechanism but a meaningful piece is missing ·
**MISSING** = MOS does not have it.

### 1a — Substrate & panel (mostly already ported in P1/P2)

| Capability | PMO evidence | MOS status | MOS evidence | Notes |
|---|---|---|---|---|
| Deputy authorization model (caller-JWT, RLS ceiling, no `service_role` for business data) | ADR-0036 §2; ADR-0039 §2 | **HAS** | ADR-0017 D2; ADR-0018 D2; `port.ts` `DeputyContext` | Core invariant, ported intact. |
| View-composition compiler/DSL + `ENTITY_WHITELIST` (untrusted-output boundary) | ADR-0037; ADR-0039 §3 | **HAS** | P1 `viewspec/`; `compose-view/composeSpec.ts` | MOS delta: schema-scoped dispatch (`shared`/`mos`/`reporting`); entity whitelist spans OLTP + `reporting`. |
| Renderer/executor dispatch over the dashboard kit | ADR-0038 | **HAS** | P1 `viewspec/` executor + renderer | Hydrates MOS dashboard primitives. |
| Single LLM call site (edge fn, key in secrets) | ADR-0039 §1 | **HAS** | `compose-view/`, `agent-chat/` | Same shape, vendor-neutral `ModelClient` seam. |
| Model-calling action capability seam (`compose_view`) | ADR-0041 | **HAS** | `agent-chat/actions.ts` `runComposeView` + `ComposeActionDeps`; handler `composeEnabled`-gated dispatch (`handler.ts:218,248`) | The curried-deps pattern is ported; reusable for any future model-calling action (attachments vision, summarization). |
| In-app panel (Option A, drawer, transcript, approve/deny chips, artifact slot) | ADR-0040 | **HAS** | `AssistantPanel.tsx`; `mos-app/src/lib/agent/runtime/port.ts` | Re-skinned to MOS `DESIGN.md`. |
| `AgentRuntime` port + `AgentAction` contract (`{name,description,inputSchema,surfaces,confirm,run}`) | ADR-0040 (seam) | **HAS** | `port.ts` | One delta below: no `needsApproval` field (see 1d). |
| `user_views` tenant entity (agent-composed UI = a row, not a migration) | ADR-0036 §6/§7 | **HAS** | P1 `user_views` migration + repo | |

### 1b — Tool catalog (the actions the deputy can call)

| PMO tool | PMO evidence | MOS equivalent | MOS status |
|---|---|---|---|
| `query_entity` (read; whitelisted; row-capped; RLS) | `actions.ts` `queryEntityAction` | `queryEntityAction` | **HAS** (MOS delta: `.schema(entry.schema)` per-entity) |
| `create_activity` (CRM log; `confirm:true`) | `actions.ts` | — (PMO-shaped CRM) | n/a — MOS has its own write tools |
| `update_task_status` (status advance; `confirm:true`, **`needsApproval:()=>false`**) | `actions.ts` | — | n/a / see 1d |
| `notify` (in-app inbox; `confirm:false`) | ADR-0044 §5; `actions.ts` | `notifyAction` (self-only) | **HAS** (P3a) |
| `create_automation` (schedule/trigger; `confirm:true`) | ADR-0044 §1; `actions.ts` | — | **MISSING** (P3b) |
| `compose_view` (model-calling) | ADR-0041 | `composeViewAction` | **HAS** (composeEnabled-gated) |
| `ask_user` (clarifying question) | ADR-0045 §2 | `askUserAction` | **HAS** (P3a) |
| *MOS-authored write tools* | — | `create_task` (R/A people), `post_update` (weekly-update line) | **HAS** (MOS-specific; no PMO analog) |

**Net:** MOS has **6** deputy tools (`query_entity`, `create_task`, `post_update`, `notify`, `ask_user`,
`compose_view`); PMO has **7** (`query_entity`, `create_activity`, `update_task_status`, `notify`,
`create_automation`, `compose_view`, `ask_user`). The gap is `create_automation` (P3b); the CRM/status tools
are domain-shaped differently, not "missing."

### 1c — Persistence, lifecycle & transcript contracts

| Capability | PMO evidence | MOS status | MOS evidence |
|---|---|---|---|
| `agent_threads`/`agent_runs`/`agent_events` (owner-private, org-scoped, RLS) | ADR-0043 §1/§2 | **HAS** | P2 migration `20260705000003`; `persistence.ts` |
| Tool-call journal + `args-hash` durable-resume de-dupe (no double-created task on dropped SSE) | ADR-0043 §3 | **HAS** | `persistence.ts` `hashToolArgs`/`loadJournaledWrites` |
| Progress heartbeat (working-vs-stuck off heartbeat, not SSE liveness) | ADR-0043 §4 | **HAS** | `persistence.ts` `heartbeat` |
| Per-event feedback (thumbs + downvote category → PostHog/analytics) | ADR-0043 §5 | **PARTIAL** | P3a wired the client 👍/👎 path; MOS has **no analytics sink** wired (no PostHog). The DB row is recorded; the analytics feed is not. |
| Deep thread-history replay (reopen a run from DB, not client memory) | ADR-0043 (implied by persistence) | **HAS** | `replay.ts` `replayRunHistory` (P3a enrichment persisted `user` turn + `tool_calls` + `tool_call_id`) |
| `ask_user` structured question → `control('answer')` resolves the same run | ADR-0045 §2 | **HAS** | P3a `handleAnswer`; `AssistantPanel.tsx` `QuestionChips` |
| **Typed widget results** (`data_table`/`data_chart`/`data_insight`; twice-validated; registry-rendered) | ADR-0045 §1; `QUERY_ENTITY_SCHEMA.as:"table"` | **HAS** | ADR-0045 accepted; `QUERY_ENTITY_SCHEMA.as:"table"`; `widgets.ts` validates/builds; handler emits `artifact`; `AssistantWidgetSlot` renders validated payloads |
| **Live context injection** (per-turn `context:{route,entity,selection}` grounding hint) | ADR-0045 §3 | **MISSING** | `port.ts:43-45` `RunContext` carries **route only**; handler header marks `buildGroundingHint`/`narrowEntityScope` as "P3 live-context" not built |

### 1d — Approval UX

| Capability | PMO evidence | MOS status | MOS evidence |
|---|---|---|---|
| Static `confirm:boolean` approve/deny chip on every write | ADR-0040 A3 | **HAS** | `create_task`/`post_update` both `confirm:true` |
| **Conditional-approval predicate** (`needsApproval?(input,ctx)=>boolean`; auto-approve low-materiality, chip material/destructive; money threshold) | ADR-0051; `actions.ts` `AGENT_APPROVAL_MONEY_THRESHOLD` + `isDestructiveDeleteAction`; `update_task_status.needsApproval:()=>false` | **MISSING** | `port.ts:107-109` `AgentAction` has **no** `needsApproval` field; every MOS write chips uniformly |

### 1e — Automations, notifications & dispatch infra

| Capability | PMO evidence | MOS status | MOS evidence |
|---|---|---|---|
| `notifications` table + channel-adapter seam (in-app now; webhook/Slack/email slot-in later) | ADR-0044 §5 | **HAS** | P3a `mos.notifications` + `channelAdapter.ts` (in-app + PWA-push seam, push no-op until VAPID) |
| Inbox destination UI (bell + unread badge + triage list) | ADR-0044 §5 | **HAS** (MOS-authored shape) | P3a `/inbox` destination (ADR-0019 D2) |
| `agent_automations` (schedule/trigger; owner-only) | ADR-0044 §1 | **MISSING** | P3b (not built) |
| Dispatcher (`pg_cron` → edge fn) + poll-since-watermark event triggers | ADR-0044 §2 | **MISSING** | P3b |
| **Background-run minted owner-JWT** (RLS stays the ceiling; `service_role` mints, never queries business data) | ADR-0044 §3 | **MISSING** | P3b; **gated** on the `generateLink`→`custom_access_token` hook live-verify (P3 plan §3.3) |
| NL trigger conditions (cheap-tier model, memoized, fail-quiet-but-visible) | ADR-0044 §4 | **MISSING** | P3b |
| Dispatch watermark table (`agent_dispatch_watermarks`; no `org_id`; default-deny RLS; `service_role`-only) | ADR-0046 | **MISSING** | P3b |
| **Credits / usage ledger** (per-turn `agent_usage`; per-user credit balance; over-budget → no-start + notify) | ADR-0043 "credits"; ADR-0044 §6; PMO migration `0047_agent_usage_credits.sql`; `handler.ts` `recordUsage` + credit gate | **MISSING** (seam reserved) | MOS `handler.ts:97-98` reserves `rateGuard?`/`usage?` as `// P3:` comments; a deputy-invariant test (`handlerDeputyInvariant.test.ts`) **asserts the field is NOT declared today** |

### 1f — Newer PMO Tier-2 capabilities (0049–0053)

| Capability | PMO evidence | MOS status | MOS evidence |
|---|---|---|---|
| **Safe markdown rendering** (`react-markdown`+`remark-gfm`; no raw HTML; `urlTransform`; user bubble stays literal) | ADR-0049 | **HAS** | ADR-0049 accepted; `AssistantMarkdown` uses `react-markdown` + `remark-gfm`, no raw HTML, URL allowlist; user bubble stays literal; prompt now allows Markdown |
| **Layered system prompt** (charter + tool-index + progressively-disclosed skills; removes "respond in plain text"; tool-index gated to registered tools) | ADR-0050; `prompt.ts` `buildAgentSystemPrompt(...,opts)` 4-layer builder | **MISSING** | MOS `prompt.ts` remains a **flat grounding-first** builder (no `opts`, no skill layers). C2/C3 added the markdown allowance + `as:"table"` hint, but the full ADR-0050 prompt architecture is not built |
| Agent eval harness (`*.eval.ts` against deployed loop; `usesTool`/`contains`/`llmJudge` scorers; separate vitest project; nightly, not PR-gate) | ADR-0052 | **MISSING** | no `*.eval.ts`, no `vitest.eval.config.ts` |
| **Chat attachments** (per-conversation files; `agent_attachments` table + Storage bucket + provider seam; image transcode; PDF text + image vision via `ModelClient`; extracted text = untrusted input) | ADR-0053; `agent-chat/attachments.ts` | **MISSING** | no `attachments.ts`, no `agent_attachments` table, no `attachment_ids` on request |
| Product-help corpus (role-graded "how do I…" answers in the prompt) | `helpCorpus.ts` (7.5 KB) imported by PMO `prompt.ts` | **MISSING** (likely PMO-shaped) | no `helpCorpus.ts`; MOS prompt has no help section. MOS's product surface is smaller; in-agent help may be unnecessary. |

---

## §2 — Expansion candidates (synthesis)

For each MISSING/PARTIAL capability MOS should consider. Ordered in this section by **bang-for-buck for
Gordi's jobs**, not by sequencing (sequencing is §3).

### C1 — Automations (P3b: ADR-0044 §1–4 + ADR-0046) — **already planned, highest user value**

- **What it is.** Owner-created scheduled (cron) and event-triggered (status-event) deputy runs that fire the
  ordinary agent loop under a **minted owner-JWT** (RLS stays the ceiling), plus NL conditions and the dispatch
  watermark. Delivered via `mos.agent_automations` + `mos.agent_dispatch_watermarks` + a `pg_cron` →
  `agent-dispatch` edge fn.
- **User value (concrete Gordi jobs).**
  - **AR-chase reminder** — *"when an invoice/AR line sits overdue > N days, notify me"* (event trigger; the
    canonical example the task names). This is the single most-requested ops-automation for a finance/ops team.
  - **Weekly ops roll-up** — *"every Monday 8am, summarize my team's blocked tasks and overdue weekly-update
    lines"* (cron). Replaces a manual Monday-morning triage.
  - **Daily-log nudge** — *"every weekday 5pm, remind anyone who hasn't posted a daily ops update"* (cron).
- **Effort: LARGE.** The mint path is the hardest, most security-sensitive surface in the agent tier
  (owner-JWT minting under `service_role`, audited, cross-tenant gate-tested). Plus `pg_cron` scheduling, a
  dispatcher edge fn, watermark bookkeeping, and NL-condition model evaluation + memoization.
- **Dependencies (binding).** **Gated on the staging live-verify** that MOS's `custom_access_token` hook fires
  for a `generateLink({type:'magiclink'})`-minted token (P3 plan §3.3). If the hook does **not** fire, RLS
  claims (`current_org_id()`/`current_person_id()`/`has_access_role()`) won't populate → the mint path changes
  shape (fallback). **This verify must resolve before P3b build starts.**
- **MOS-applicability: HIGH.** The architecture ports cleanly (ADR-0018 D6 P3b). The mint delta is even
  *smaller* for MOS than PMO: MOS `owner_id` = `shared.people.id` and email already lives on `shared.people`, so
  the `getUserById` step PMO needs is skipped. ESB/RLS/deputy all fit — automations fire the **same** deputy
  loop MOS already runs interactively. **Recommend pairing with C8 (credits) before going live** — see §3.

### C2 — Safe markdown rendering (ADR-0049) — **cheapest high-visibility win**

- **What it is.** Render `assistant` transcript prose as GitHub-Flavored Markdown via `react-markdown` +
  `remark-gfm` (no `rehype-raw` → no raw HTML by construction; `urlTransform` scheme allowlist; element
  allowlist). User bubble stays literal.
- **User value.** The deputy's answers stop showing literal `**bold**`, `-` list dashes, and `| pipe | walls`.
  For Gordi managers, a weekly-rollup answer ("top 3 blocked tasks…") reads as a real bulleted list. Highest
  "feels less like a raw chatbot" payoff per unit effort.
- **Effort: SMALL.** One configured renderer behind the existing `SHOW_ASSISTANT` flag; a hostile-markdown gate
  test (`<script>`, `<img onerror>`, `[x](javascript:…)`, `<iframe>`) asserting nothing executes; ~40–60 KB
  gzipped client dep. No server change.
- **Dependencies.** None blocking. **Tension to resolve (owner):** MOS's current prompt **ends with "respond in
  plain text" by design** and the panel enforces plain text via `FR-P2-AP-004`. Adopting markdown reverses that
  stance exactly as PMO's ADR-0049 reversed D-A2-80. It is compatible with MOS's **grounding NFR** (grounding
  is about *where the answer comes from*, not its formatting), but the owner should consciously drop the
  plain-text rule. See OQ-1.
- **MOS-applicability: HIGH.** Pure client; no new trust surface (the renderer's fixed element set is the
  authority, mirroring MOS's `composeSpec` boundary posture); renders in MOS `DESIGN.md` tokens.

### C3 — Typed widget results (ADR-0045 §1) — **tabular answers become real tables**

- **What it is.** A zod-validated discriminated union (`data_table` / `data_chart` / `data_insight`) returned
  by `query_entity` (an `as:"table"` presentation hint), validated server-side and client-side, rendered by a
  registry into MOS's existing dashboard primitives.
- **User value (concrete Gordi jobs).** *"show my team's blocked tasks"* → a real sortable table, not prose.
  *"RACI for the roastery BU this quarter"* → a table. *"revenue trend this month"* → a chart/KPI tile. For a
  management-OS whose core entities (tasks, RACI, weekly updates, ops log) are **all tabular**, this is the
  difference between an agent that *describes* data and one that *shows* it.
- **Effort: MEDIUM.** The zod union + renderer registry in `AssistantPanel`; the `as` field on
  `QUERY_ENTITY_SCHEMA` + handler's `buildDataTableWidgetFromQueryResult` (already named-but-not-built in the
  MOS handler header); server-then-client validation (extends MOS's existing `composeSpec` boundary pattern).
  MOS already ships the dashboard primitives (DataTable/ChartFrame/KPI tiles) from P1, so the registry hydrates
  existing components — no new primitives to build.
- **Dependencies.** **Strongly pairs with C4 (layered prompt)** — the "table-not-markdown" skill needs a real
  `as:"table"` tool to steer toward, otherwise it is advice with no mechanism.
- **MOS-applicability: HIGH.** The widget carries rendered result data (ephemeral, caller-scoped) — sound under
  caller-JWT RLS. Clean fit with MOS's P1 renderer + grounding NFR (the widget data still traces to a
  `query_entity` result).

### C4 — Layered system prompt: charter + tool-index + skills (ADR-0050) — **make the built tools surface**

- **What it is.** Rewrite `buildAgentSystemPrompt` into four ordered layers: (a) small always-on **charter**
  (purpose + hard rules: deputy invariant, anti-fabrication, **verify-before-done**, grounding); (b) one-line
  **tool index** per *registered* tool (gated by `composeEnabled`/automations flags → no dangling affordance);
  (c) **skills** with explicit "Use when…" triggers (table-not-markdown, ask-user, automation, compose-view);
  (d) live-context grounding hint. **Removes "respond in plain text."**
- **User value.** The deputy finally *uses* the batteries it has. Today MOS's flat prompt never tells the model
  about `ask_user` or (once P3b lands) `create_automation`, so it defaults to prose-answering everything.
  Result: *"every Monday summarize my blocked tasks"* → the deputy offers `create_automation` instead of a
  one-shot prose answer; an ambiguous *"show my tasks"* → `ask_user` chips instead of a guess.
- **Effort: SMALL.** Pure-function rewrite (no I/O, no data rows — consistent with MOS NFR), CI-testable by
  string inspection (the structure is deterministic; only the *surfacing* behavior is model-dependent).
- **Dependencies.** Most useful **after** C2 (markdown) and ideally C3 (widgets) — the table-skill needs a real
  `as:"table"` path. The `ask_user` skill is load-bearing the moment `ask_user` exists (it already does).
  **Model-dependent risk:** ADR-0050 is explicit that prompt-steering is necessary-but-may-not-be-sufficient
  on a weak tool-selector — C6 (eval harness) is the real gate (OQ-7).
- **MOS-applicability: HIGH.** MOS should keep its **grounding NFR** as the charter's headline rule (PMO lacks
  it; MOS's D5 delta is an upgrade to fold in). Per-request tool gating (`composeEnabled`, automations) already
  exists in the MOS handler, so the index tracks registration exactly.

### C5 — Chat attachments (ADR-0053) — **deputy reads what the user is looking at**

- **What it is.** Per-conversation, owner-private files the user drops in; `mos.agent_attachments` table +
  dedicated Storage bucket + provider seam; client image transcode before upload; PDF → text extraction,
  image → vision (via the `ModelClient` seam C0 already ports). Extracted content is **untrusted input** —
  length-bounded context block, never a system instruction.
- **User value (concrete Gordi jobs).**
  - A **roaster attaches a cupping photo / green-bean bag label** → "what's the score / lot number on this?"
  - A **manager attaches a supplier PDF quote** → "summarize this vs the PO line items" or "what's the lead
    time?" (the PMO example, directly applicable to Gordi's supply chain).
  - A **finance user attaches an invoice** → "match this to the AR line."
- **Effort: MEDIUM–LARGE.** Table + RLS + pgTAP; Storage bucket + MIME/size limits (client + server); image
  transcode util; the two model paths; the request `attachment_ids` resolution under caller JWT; the boundary
  treatment of extracted text. **The Deno-compatible PDF text extractor is the load-bearing
  owner-confirmable** (supply-chain vetting; if none is acceptable, PDFs degrade to "can't read" while images
  still work via vision).
- **Dependencies.** The vision path needs a **vision-capable model** in MOS's `ModelClient` config (the same
  seam `compose_view` uses). Storage is already part of the self-hosted Supabase stack.
- **MOS-applicability: HIGH** for the image/vision path (Gordi is a coffee roaster — cupping photos, labels,
  invoices are native artifacts) and MEDIUM for PDF (supply chain). Fits RLS/deputy by construction: attachments
  resolve under the caller's JWT, a forged/foreign id → zero rows.

### C6 — Agent eval harness (ADR-0052) — **regression net for behavior quality**

- **What it is.** `*.eval.ts` suites run against the **deployed** `agent-chat` function (test-user JWT, parses
  the SSE stream), with composable scorers (`usesTool`, `contains`, `llmJudge`); a separate Vitest project run
  nightly/on-demand, **never** on the PR fast-lane.
- **User value (indirect, high-leverage).** MOS's **grounding NFR has a documented residual risk** (D5: the
  prompt's *content* is CI-tested; *live-model compliance* is a Director/live-verify, not CI). An eval suite
  closes exactly that gap: "does the deputy still query before answering? does an empty read still yield 'no
  data' not a guess? does it still choose `query_entity` for a list?" — regressions the unit/pgTAP/e2e pyramid
  structurally cannot catch.
- **Effort: MEDIUM.** `defineEvalSuite` + scorers + `vitest.eval.config.ts` + the `**/*.eval.ts` exclusion
  invariant; scorer logic is deterministically unit-tested in the normal suite.
- **Dependencies (op-provisioned).** A **deployed staging target** + a **provider key** as CI secrets (masked,
  never committed); a small cost budget; a nightly cadence the owner sets. These are the §OQ-1 provisions PMO
  flagged as owner-provisioned.
- **MOS-applicability: HIGH.** MOS's `transport.ts` already has the SSE-decode seam the harness reuses. The
  grounding-eval cases are a **MOS-specific** high-value addition PMO doesn't have an analog for.

### C7 — Conditional-approval predicate (ADR-0051) — **friction tracks materiality**

- **What it is.** An optional `needsApproval?(input,ctx)=>boolean` on `AgentAction`; auto-approve low-
  materiality writes, reserve the chip for material/destructive ones; resolution order: destructive-delete
  (always chip) → predicate → fall back to `confirm`. Auto-approve reuses the forced-dispatch path; RLS/SoD stay
  the authority.
- **User value.** Today **every** write chips identically — a trivial `post_update` line and a (future)
  money-value write both surface the same approve/deny friction. As the write catalog grows, this becomes
  annoying. The predicate reserves the chip for what actually warrants a human.
- **Effort: SMALL.** One optional field on `AgentAction` + a `resolveNeedsApproval` in the handler + a
  materiality constant. Fully backward-compatible (an action without it keeps `confirm` behavior).
- **Dependencies.** None. **Value is low today** (MOS's two writes, `create_task`/`post_update`, are both
  low-materiality; uniform chipping is acceptable). Value rises when a **money-value or destructive write** is
  added (e.g. an ESB-outbox write tool, or anything provisioning-adjacent).
- **MOS-applicability: MEDIUM–HIGH.** Ports cleanly; MOS's RLS is the real authority so the predicate is safely
  UX-only. **Deferrable** until a material write exists — see OQ-5.

### C8 — Credits / usage ledger (ADR-0043/0044 §6) — **bound runaway spend before broad rollout**

- **What it is.** A per-turn `mos.agent_usage` row (tokens + provider cost) + a per-user credit balance
  enforced server-side at the existing reserved `RateGuard` preflight seam; over-budget → no-start + a warning
  notification.
- **User value (guardrail).** At a ~15-person rollout (and especially once C1 automations run **unattended**),
  unmetered per-user spend is a real cost risk. The ledger is the SaaS metering seam; ADR-0044 §6 binds
  automation runs to the owner's balance — so **automations without credits = an unmetered cost channel.**
- **Effort: MEDIUM.** Table + RLS + the `recordUsage`/preflight wiring at the seam MOS already reserved
  (`handler.ts:97-98`). The deputy-invariant test that currently forbids the field flips to assert it's
  caller-JWT-scoped.
- **Dependencies.** The reserved seam exists. Pairs with C1: automations are the strongest argument for landing
  credits.
- **MOS-applicability: HIGH** before broad rollout / before automations go live. **Recommend landing with or
  just ahead of C1.** See OQ-2.

### C9 — Live context injection (ADR-0045 §3) — **"summarize this" just works**

- **What it is.** A small per-turn `context:{route, entity?:{type,id,label}, selection?}` block sourced from
  router/selected-entity state, treated as **untrusted grounding** (RLS unaffected; a forged entity.id → 0 rows).
- **User value.** While viewing a task, *"summarize this"* / *"what's blocking it?"* works without the user
  re-typing the task id.
- **Effort: SMALL–MEDIUM.** Extend `RunContext` (currently route-only); `buildGroundingHint` in the handler;
  the untrusted-hint posture + a deputy-invariant test (forged hint can't widen access).
- **Dependencies.** None hard. MOS already has **thread scope** + comments + Inbox deep-links giving entity
  continuity, so the marginal value is lower than on PMO.
- **MOS-applicability: MEDIUM.** Nice-to-have; lowest priority of the candidates. Defer unless "summarize this"
  surfaces as felt pain (OQ-6).

### C10 — Feedback → analytics sink (ADR-0043 §5 PARTIAL) — **close the feedback loop**

- **What it is.** MOS records 👍/👎 + downvote category on `agent_events` (P3a) but has **no analytics sink**
  (PMO pipes to PostHog; MOS has none wired).
- **User value.** A "frustration index" (downvote reasons, rephrase/retry/abandon) feeds product decisions
  about which deputy behaviors to fix — the qualitative signal the eval harness (C6) can't self-generate.
- **Effort: SMALL** once an analytics destination is chosen (MOS would need to pick one — PostHog, or a simple
  internal rollup query over `agent_events`).
- **MOS-applicability: MEDIUM.** Depends on whether MOS wants a product-analytics tool at all (OQ — not listed
  below; flag for the owner if observability is in scope). The DB signal is already captured; only the
  consumption side is missing.

---

## §3 — Recommended sequencing (synthesis)

Given MOS is at **P3a + P2.1** and **P3b (C1) is the next already-planned step**, here is the Director's
proposed order. The newer PMO capabilities (0050 skills, 0053 attachments, 0052 eval, 0049 markdown, 0041 seam)
slot in around the existing plan.

```
T0  Resolve the P3b gate
    └─ staging live-verify: does custom_access_token fire for a generateLink-minted token? (P3 plan §3.3)
       PASS  → C1 (automations) keeps its planned mint shape
       FAIL  → C1 mint path changes shape (fallback) before build

T1  C1 Automations (P3b) — ALREADY PLANNED, highest user value (AR-chase, weekly roll-up, daily nudge)
    └─ PAIR WITH: C8 Credits/usage ledger  ← land with or just ahead of C1's go-live
       (automations run unattended; without credits they are an unmetered cost channel — ADR-0044 §6)

T2  Experience layer — the "feels less like a raw chatbot" batch (three mutually-reinforcing, all cheap-ish)
    ├─ C2 Safe markdown rendering (SMALL)        ← ship first; standalone, no deps, reverses FR-P2-AP-004 (OQ-1)
    ├─ C3 Typed widget results (MEDIUM)          ← needs the dashboard primitives MOS already has
    └─ C4 Layered prompt charter+skills (SMALL)  ← ties it together; most useful once C2+C3 exist
       (the ask_user skill is load-bearing immediately; the table-skill needs C3; the automation skill needs C1)
    └─ ALT: ship C2 + a C4-without-table-skill immediately after C1 (ask_user + automation skills only),
            defer C3+C4-table-skill to T2b. Cheaper faster wins; tables later.

T3  C6 Agent eval harness (MEDIUM, tooling) — start in parallel with T2 if op-provisions exist (OQ-4)
    └─ protects the grounding NFR against every subsequent prompt/tool change; leverage compounds

T4  C5 Attachments (MEDIUM–LARGE) — its own train; needs a vision-capable model + PDF-extractor vetting (OQ-3)
    └─ high native value for a roaster (cupping photos, labels, invoices); the PDF extractor is the gate

T5  C7 Conditional approval (SMALL) — DEFER until a material/money/destructive write tool is added (OQ-5)
    └─ uniform chipping is fine for today's two low-materiality writes

T6  C9 Live context (SMALL–MEDIUM) + C10 Feedback analytics (SMALL) — nice-to-haves; defer unless felt pain
```

**Why this order:**
- **C1 stays next** — it's planned, it's the highest user value, and P3a's replay-enriched handler is exactly
  what C1's fired runs dispatch through. The only new gating item folded in is **C8 (credits)**, because
  unattended automation runs without a meter is the one cost-control gap P3b would otherwise open.
- **C2/C3/C4 form a batch** — markdown alone is a cheap win; widgets need markdown to coexist; the layered
  prompt is only as good as the tools it steers toward. They're all small-to-medium and reinforce each other.
- **C6 is off the critical path** but compounds — start it as soon as the owner can provision a deployed target
  + key, because every later prompt/tool change is safer with it (and it's the only real gate on the
  model-dependent risk C4 acknowledges).
- **C5 is the largest distinct build** — schedule it as its own train, not interleaved, because of the
  PDF-extractor vetting and the vision-model dependency.
- **C7/C9/C10 are deferrable** — small, low current pain; pick up when triggered (a material write / felt
  "summarize this" pain / an analytics decision).

---

## §4 — Open questions for the owner (flag, don't guess)

These are the decisions the owner must make in the grilling session. They are **not** pre-answered.

- **OQ-1 — Drop the plain-text rule? (gates C2/C4).** MOS's panel is plain-text-only **by design**
  (`FR-P2-AP-004`) and the prompt ends "respond in plain text." C2 (markdown) and C4 (layered prompt) both
  reverse that. It is compatible with the grounding NFR (grounding is about *sourcing*, not formatting), but
  it's a conscious posture reversal. **Does the owner want formatted deputy answers, or keep the stripped-down
  plain-text stance?**
- **OQ-2 — Credits timing.** Is per-user cost a real concern at the ~15-person rollout, or is metering
  premature? This decides whether C8 lands **with** C1 (recommended) or is deferred. (Note: C1 automations
  running unattended is the strongest argument for landing C8 first.)
- **OQ-3 — Attachments reality check.** Is the cupping-photo / invoice / quote use case real and frequent
  enough to justify the `agent_attachments` build + the PDF-extractor vetting + a Storage bucket, or is it
  aspirational? PMO framed attachments as a top user request; **Gordi's ops jobs may differ** — the owner knows
  the actual frequency. (This gates whether C5 is T4 or backlog.)
- **OQ-4 — Eval provisions.** Is the owner willing to provision a **deployed staging target + provider key +
  a nightly cost budget** so C6 can run? Without those, C6 can't ship (the harness exercises the real deployed
  loop, not a mock).
- **OQ-5 — Approval friction today.** Is current "chip on every write" friction acceptable for the two
  low-materiality writes (`create_task`/`post_update`), or does the owner want C7's conditional approval now?
  (Recommendation: defer until a money/material/destructive write exists.)
- **OQ-6 — "Summarize this" pain.** Is the live-context capability (C9) a felt need (users viewing a task want
  to ask about it without re-typing the id), or is it already covered by thread scope + Inbox deep-links +
  comments? If covered, C9 is backlog.
- **OQ-7 — Which model runs MOS's deputy?** PMO's entire C4/C6 motivation is a **weak tool-selector**
  (`deepseek-v4-flash`). If MOS's deputy runs a **stronger** tool-selector, prompt-steering (C4) is less urgent
  and the eval harness (C6) is lower-leverage; if the same weak model, both rise in priority. **What model does
  MOS deploy, and is the owner open to a model bump as a separate lever** (PMO explicitly defers this)?
- **OQ-8 — Priority by felt pain vs by plan.** C1 is *planned* but C2 is likely the highest *felt* pain
  ("feels like a raw chatbot"). Does the owner want to hold the line on P3b-next, or interleave a quick C2 win
  before/alongside C1?

---

## Appendix A — MOS-authored capabilities MOS has that PMO does not (for completeness)

These are not "gaps to close" — they're places MOS is *ahead* or shaped differently. Recorded so the grilling
has the full picture.

- **Grounding NFR (binding, test-enforced)** — ADR-0018 D5. MOS makes "every data claim traces to a tool
  result; empty read → 'no data' and stop; reporting figures cite `snapshot_as_of`" a **test-enforced**
  property. PMO's prompt has no equivalent anti-fabrication rule. (This is a charter-rule MOS should *keep* in
  any C4 layered-prompt port — it's an upgrade over PMO's charter.)
- **Schema-scoped deputy dispatch** — MOS `.schema(entry.schema)` per-entity (`shared`/`mos`/`reporting`); PMO
  is single-schema. Required by MOS's multi-schema (one shared self-hosted Supabase) topology.
- **Dual-plane read catalog** — MOS's entity whitelist spans OLTP + `reporting` read-models (ADR-0018 D4); PMO
  is single-plane.
- **Work-item comments + `@mention` → notification** — MOS-authored (ADR-0019 D4); PMO's comms is
  procurement-case comments. No port analog.
- **DB-side aggregate RPC (`mos.aggregate_compiled`, `SECURITY INVOKER`)** — P2.1; lets composed views over
  wide reporting windows aggregate DB-side (uncapped by the row limit) while base-table RLS still fires. PMO
  has no equivalent.

---

*End of capability-expansion candidate list. This document is read-only synthesis for the owner grilling
session; it authorizes no code, migration, or build.*

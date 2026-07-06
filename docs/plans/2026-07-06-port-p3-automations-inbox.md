# Plan — ADR-0018 P3 port train: automations + notifications inbox + transcript contracts

**Status:** P3a built/reviewed as PR #88; P2.1 aggregate RPC stacked as PR #89; CI-fix pass locally verified 2026-07-06 and awaiting PR rerun.
**Date:** 2026-07-06 · **Branch target:** `dev` → `feat/port-p3-automations-inbox`
**Consumes:** ADR-0018 (P3 = D6 "Batteries"), ADR-0019 (D2 Inbox destination, D4 comms+mentions, D9
notifications adapter seam + PWA push v1, D11 deputy placement), ADR-0001/0011 (org_id + RLS + access roles).
**Ports:** PMO ADR-0043 (deep-replay pattern), 0044 (automations + notifications inbox), 0045 (ask_user +
typed widgets + live context), 0046 (dispatch watermark) — copy-adapt ("Port" posture, ADR-0018 D2).
**Plan-first:** EARS FRs + Given/When/Then AC-ids are embedded below (§2); **no separate spec files** (Director
call, 2026-07-05: P3 is a port train with a settled upstream design, so the plan carries the requirements).

---

## §0 — This is too big for one plan: split P3a / P3b (proposal + sequencing)

P3 as scoped is six workstreams (~50 tasks) spanning two **qualitatively different trust surfaces**. Splitting
along the trust boundary keeps each train independently shippable + reviewable, and — critically — isolates the
one live-verify-gated decision (the background-run JWT mint, §3.3) from work that is pure caller-JWT.

| Train | Trust surface | Workstreams | Ship value |
|---|---|---|---|
| **P3a — Inbox + transcript contracts** (this plan, full detail) | **caller-JWT only** (deputy invariant unchanged from P2) | (1) deep thread-history replay · (2) `mos.notifications` + channel-adapter seam · (3) Inbox destination UI · (4) `ask_user` clarifying-question contract · (5) rating/downvote wired · (6) `notify` action · (7) work-item comments + `@mention` → notification | Inbox destination live; P2 deep-replay escalation closed; deputy can ask clarifying Qs + self-notify; conversation attaches to tasks/updates |
| **P3b — Automations (cron + event)** (sequenced outline + hard-part code, §6) | **minted owner-JWT for background runs** (the ADR-0044 §3 hardest problem) | agent-dispatch edge fn · `mos.agent_automations` + `mos.agent_dispatch_watermarks` · the mint path (§3.3 KEY design question, **gating live-verify**) · pg_cron tick · NL-condition eval · `create_automation` action | scheduled + event-triggered deputy runs |

**Sequencing rules (binding):**
1. **P3a ships first.** It is pure caller-JWT; it has no new auth surface; it closes the P2 follow-up the review
   battery already named ("Deep thread-history replay (P3)"). P3b dispatches runs *through* P3a's hardened
   `agent-chat` handler (the fired run is an ordinary run), so the replay-enriched handler must land first.
2. **P3b is gated on a staging live-verify** (§3.3): whether the MOS `custom_access_token` hook fires for a
   `generateLink({type:'magiclink'})`-minted token. P3b's task detail (§6) is written, but **P3b does not start
   build until that verify resolves** — if the hook does not fire, the mint path changes shape (§3.3 fallback).
3. **PWA push** (ADR-0019 D9) is scoped to the **channel-adapter seam only** in P3a — the in-app Inbox row is the
   v1 delivered channel; the web-push channel is wired through the seam but its send path is a no-op stub until
   VAPID keys are configured as op secrets (§3.2). This keeps the seam real without blocking P3a on op-secret setup.

**One issue per train.** P3a = this plan's detailed tasks (§5). P3b = §6 + a follow-up plan once §3.3 verifies.

---

## §1 — Inventory: port / adapt / stay (PMO → MOS)

| PMO artifact | Disposition | MOS delta |
|---|---|---|
| ADR-0043 `agent_threads/runs/events` + journal | **already PORTED (P2)** — migration `20260705000003` | P3a *enriches* events to make replay faithful (§3.1) |
| ADR-0043 §3 durable-resume (args-hash de-dupe) | **already PORTED (P2)** — `hashToolArgs` + `findJournaledWrite` | no change |
| ADR-0044 §5 `notifications` + channel seam | **PORT (P3a)** — new `mos.notifications` | schema-qualify `mos.*`; `owner_id default shared.current_person_id()`; `org_id default shared.current_org_id()`; mark-read column-pin trigger (PMO pattern) |
| ADR-0044 §1 `agent_automations` | **PORT (P3b)** — `mos.agent_automations` | owner-only RLS; `kind`/`schedule`/`trigger_on`/`condition` |
| ADR-0044 §2 dispatcher + §3 mint | **PORT-ADAPT (P3b)** — `supabase/functions/agent-dispatch/**` | **mint delta (§3.3):** MOS `owner_id` = `shared.people.id` (PMO = `profiles.id` = `auth.users.id`); email is on `shared.people` already → skip `getUserById`; **hook-claims verify is the gate** |
| ADR-0044 §4 NL-condition (cheap model) | **PORT (P3b)** — `condition.ts` | reuse `_shared/modelClient`; `AGENT_MODEL_CHEAP` op secret |
| ADR-0046 watermark table | **PORT-ADAPT (P3b)** — `mos.agent_dispatch_watermarks` | schema-qualify `mos.*`; same no-policy/default-deny posture; same `service_role`-only reach |
| ADR-0045 §1 typed widgets | **STAY (deferred)** — not in this P3 slice; the `query_entity→data_table` inline widget is a P3c/late item | Inbox first; widgets later |
| ADR-0045 §2 `ask_user` | **PORT (P3a)** — `status{kind:'question'}` + `control('answer')` + `handleAnswer` | drops onto P2's `runToolLoop` + `findTrailingUnresolvedToolUse` (already generic) |
| ADR-0045 §3 live context | **STAY (deferred)** — P2 `RunContext` carries `route` only; entity/selection injection is a later slice | not blocking |
| PMO `pg_cron` per-minute tick | **PORT (P3b)** — `cron.schedule('agent-dispatch-tick', …)` | `app.settings.dispatch_url` + `app.settings.service_role_key` GUCs (op-set) |
| ADR-0019 D4 comments + `@mention` | **MOS-AUTHORED (P3a)** — PMO has no equivalent (PMO comms is procurement-case comments) | new `mos.comments` polymorphic seam + mention parse → notification fan-out |
| ADR-0019 D9 PWA push | **MOS-AUTHORED (P3a seam, delivery deferred)** | manifest + SW registration + web-push subscribe; VAPID = op secret, never in repo |

---

## §2 — Requirements (EARS) + Acceptance Criteria (Given/When/Then)

IDs: `FR-P3-*` (functional), `NFR-P3-*`, `AC-P3-*` (acceptance). **Each behavior task names its AC.** Owning test
layer: Unit (Vitest/RTL) for logic/render; **pgTAP** (`supabase test db`) for RLS/role contracts; curated e2e
(Playwright) for cross-stack only.

### Deep thread-history replay (P3a)
- **FR-P3-RP-001** (EARS): **When** the deputy reopens a persisted run (`req.runId` present, `req.replay=true`),
  **the system shall** reconstruct the model's `ModelMessage[]` from `mos.agent_events` (seq-ordered, including
  `user`/`assistant`/`tool` turns with faithful `tool_use`↔`tool_result` pairing) **and** append only the new
  user message, **so that** `openThread` + `followUp` work from the DB, not client memory.
- **FR-P3-RP-002**: **The system shall** persist the echoed `user` turn, the assistant's `tool_calls` blocks, and
  each tool event's `tool_call_id` — the three fields P2 dropped — so replay is lossless.
- **NFR-P3-RP-001**: replay never re-executes a `tool` (replay reconstructs the *message*, never re-dispatches);
  reads are seq-ordered + row-capped (P2's `MAX_RUN_EVENTS_READ`).
- **AC-P3-RP-001** (Unit, server `replay.ts`): **Given** a run with persisted user/assistant(tool_calls)/tool(tool_call_id) events, **When** `replayRunHistory(runId)` runs, **Then** it returns a `ModelMessage[]` whose `tool_use` id on the assistant message equals the `tool_call_id` on the following `tool` message, and the order matches seq.
- **AC-P3-RP-002** (Unit, handler): **Given** a `req.replay=true` for an existing runId, **When** the handler runs, **Then** the model receives the reconstructed history + the new user message (not an empty history), and no `tool` action re-executes.
- **AC-P3-RP-003** (Unit, client `mosNativeRuntime`/`useAssistantPanel`): **Given** a reopened thread, **When** `openThread(threadId)` then `send(msg)`, **Then** the request carries `replay:true` and the rendered `transcript` is populated from the persisted events (not empty).
- **AC-P3-RP-004** (pgTAP): `mos.agent_events.type` accepts `'user'`; an owner can SELECT their own run's user events; a cross-org caller reads 0 rows (mirrors `64_mos_agent_persistence_rls`).

### Notifications table + channel-adapter seam (P3a)
- **FR-P3-NF-001**: `mos.notifications` is an owner-private tenant entity (org_id + owner_id defaults + RLS on every verb); content is immutable post-create; the only permitted UPDATE is `read_at`.
- **FR-P3-NF-002**: a **channel-adapter seam** fans a notification out to ≥1 channel; v1 channels = in-app Inbox row (always) + PWA push (best-effort, no-op without VAPID).
- **NFR-P3-NF-001**: VAPID keys/web-push secrets are **op-managed edge-function secrets, never in the repo**.
- **AC-P3-NF-001** (pgTAP): owner isolation + cross-org denial; INSERT re-pins owner_id/org_id; a user cannot INSERT a notification addressed to another owner.
- **AC-P3-NF-002** (pgTAP): a UPDATE touching any column other than `read_at` is rejected (42501) by the column-pin trigger — even by the owner.
- **AC-P3-NF-003** (Unit, `channelAdapter.ts`): **Given** a notification row insert, **When** the fan-out runs, **Then** the in-app channel is always written and the push channel is invoked (stub returns `{ok:false}` when VAPID absent) without throwing.
- **AC-P3-NF-004** (pgTAP): the unread fast-path index exists (`owner_id where read_at is null`).

### Inbox destination UI (P3a)
- **FR-P3-IB-001**: `/inbox` is the 5th nav destination (ADR-0019 D2) — a to-triage list of notifications/@mentions/approvals, each row routing to its owning entity; it is **never** a chat surface.
- **FR-P3-IB-002**: an unread badge (bell) shows the count of `read_at is null` for the viewer; marking a row read clears its badge contribution.
- **NFR-P3-IB-001**: phone-first (bottom tab) + desktop rail regrouped to the same five destinations (ADR-0019 D8).
- **AC-P3-IB-001** (RTL): **Given** SHOW_INBOX on, **When** the rail/bottom-bar render, **Then** the Inbox destination appears with its `links` populated (the destination is now "live").
- **AC-P3-IB-002** (RTL): **Given** 3 unread notifications, **When** the Inbox list renders, **Then** rows render in created_at-desc order with title/body/severity + a deep-link to `metadata.entity`; the bell badge reads `3`.
- **AC-P3-IB-003** (RTL): **Given** an unread row, **When** the user taps it, **Then** `read_at` is set optimistically + the row's deep-link navigates to the entity route.
- **AC-P3-IB-004** (RTL): **Given** SHOW_INBOX off, **When** the shell renders, **Then** no Inbox nav/badge renders (hide-first).
- **AC-P3-IB-005** (RTL): empty state renders a "nothing to triage" message (not a blank list).
- **AC-P3-IB-006** (Unit): the Inbox list is `read_at is null` first, then read (triage queue semantics).

### ask_user transcript contract (P3a)
- **FR-P3-AU-001**: the deputy may emit `status{payload:{kind:'question', questionId, prompt, options[], allowFreeText?}}`; the run pauses (stream ends) awaiting the user's answer.
- **FR-P3-AU-002**: the answer resolves **the same run** via `control('answer', {questionId, optionId?, freeText?})` — never a new turn; a duplicate/stale answer is a no-op continuation.
- **AC-P3-AU-001** (Unit, handler): **Given** a `tool_calls[0].function.name==='ask_user'`, **When** the loop runs, **Then** it emits the `question` status + ends the stream (no model re-entry); the trailing tool_use is unresolved.
- **AC-P3-AU-002** (Unit, handler `handleAnswer`): **Given** a re-POST with `req.answer` resolving the trailing `ask_user`, **When** the handler runs, **Then** it appends the chosen option's label (or freeText) as the `tool_result` and continues the SAME run with `allowCompose:true, allowProposeConfirm:true`.
- **AC-P3-AU-003** (Unit): a stale/duplicate answer (no trailing unresolved `ask_user`) is a no-op continuation (AC-ATC-010 parity).
- **AC-P3-AU-004** (RTL): the question renders inline chips (+ optional free-text box when `allowFreeText`); tapping a chip calls `answer()`.
- **AC-P3-AU-005** (Unit, `port.ts`): `AgentRuntime.control`'s command set gains `'answer'`; no existing control member changes (port stays a superset).

### Rating / downvote (P3a)
- **FR-P3-FB-001**: an owner may set `rating∈{up,down}` (+ `downvote_reason` on a downvote) on their own `type='assistant'` event; the columns already exist (P2 migration).
- **AC-P3-FB-001** (pgTAP): the existing `agent_events_feedback_only` trigger permits the feedback UPDATE on an owner `assistant` row and rejects it on a `tool`/`status`/`system` row (re-asserted; P3 adds the client path).
- **AC-P3-FB-002** (RTL): a 👍/👎 control on each assistant turn calls the feedback UPDATE; a downvote shows the reason picker.

### notify action (P3a)
- **FR-P3-NT-001**: a `notify` action (`confirm:false`) inserts a `mos.notifications` row addressed only to the caller (RLS pins owner_id/org_id via defaults) — usable by interactive deputy runs; later by minted-owner automation runs.
- **AC-P3-NT-001** (Unit, `actions.ts`): `notify({title, body?, severity?})` inserts via the caller-JWT client and never sends owner_id/org_id; returns `{ok:true}`.
- **AC-P3-NT-002** (pgTAP): the inserted row is visible only to its owner.

### Work-item comments + @mention → notification (P3a)
- **FR-P3-CM-001**: `mos.comments` attaches to an entity (`entity_type∈{task, weekly_update, daily_log, follow_up}`, `entity_id`); owner-org RLS matches the owning entity's read posture.
- **FR-P3-CM-002**: a `@mention` (`@<slug>` mapping to a person) in a comment creates a `mos.notifications` row for the mentioned person (routed to Inbox → the entity).
- **NFR-P3-CM-001**: mention extraction is best-effort + fail-quiet; an unresolvable slug produces no notification (never an error).
- **AC-P3-CM-001** (pgTAP): an org member can SELECT comments on entities they can read; a cross-org caller reads 0; INSERT re-pins org_id + author.
- **AC-P3-CM-002** (Unit, `mentions.ts`): `extractMentions('@arief @unknown')` against a person-slug index returns only resolvable person ids.
- **AC-P3-CM-003** (Unit): posting a comment with a resolvable mention inserts one notification per mentioned person (addressed to *them*, not the author).
- **AC-P3-CM-004** (RTL): the task-detail comment thread renders + posts; a typed `@` shows a person picker.
- **AC-P3-CM-005** (pgTAP): a mentioned person's notification row is visible to them, not to the comment author (cross-owner notify is the one sanctioned exception, via the fan-out helper under the *author's* write to a row pinned to the *mentionee's* owner_id — see §3.4).

### Automations (P3b) — requirements stated; task detail in §6
- **FR-P3-AM-001..006**, **FR-P3-MT-001..003** (mint), **FR-P3-WM-001..002** (watermark), **NFR-P3-AM-SEC-001** (service_role quarantined to mint + metadata only) — full EARS in §6.

---

## §3 — Design (architecture, data flow, the KEY mint question)

### 3.1 Deep thread-history replay (P3a) — enrich + reconstruct

**Why enrichment is required.** P2's `agent_events` persists `assistant` text and `tool {name,input,result}`,
but **drops** (a) the echoed `user` turn, (b) the assistant's `tool_calls` blocks, (c) each tool's
`tool_call_id`. Without these three, replay cannot rebuild the `tool_use`↔`tool_result` pairing the model API
requires (an assistant `tool_use` with id `X` must be followed by a `tool` result with `tool_call_id=X`). The
P2 review follow-up named exactly this gap.

**Design (3 changes, all additive):**

1. **Migration `20260706000001`** widens `mos.agent_events.type` to include `'user'` (and `'artifact'` for
   journal completeness). The check constraint widens; the append-only trigger + feedback-only UPDATE guard are
   unchanged (a `user`/`artifact` row is fully immutable like `tool`/`status`/`system`).

2. **Handler enrichment** (`agent-chat/handler.ts`): the `user` echo is already emitted (`emit('user', {text})`)
   — `isPersistableEvent` is widened to include `'user'` so it journals. The assistant emit gains an optional
   `tool_calls` field (the raw `resp.message.tool_calls`), and **an assistant event is now emitted even when
   `content` is empty but `tool_calls` is present** (a pure tool-call turn). The tool event payload gains
   `tool_call_id`. `withPersistence` persists these into `payload` (no new columns — `payload jsonb` already
   holds arbitrary structured data; the journal columns are untouched).

3. **`replay.ts`** (new, pure, importable in Vitest + Deno): `replayRunHistory(deps, runId)` loads the run's
   events seq-ordered (reuses `loadMaxSeq`'s index), walks them, and rebuilds `ModelMessage[]`:
   - `user` → `{role:'user', content:text}`
   - `assistant` → `{role:'assistant', content:text ?? '', ...(tool_calls?{tool_calls}:{})}`
   - `tool` → `{role:'tool', tool_call_id, name, content:JSON.stringify(result)}`
   - `status`/`system` → skipped (lifecycle, not model turns)

   The handler's `agentChatHandlerInner` gains a **replay branch**: when `req.runId && req.replay`, it calls
   `replayRunHistory` to build the base `messages`, then appends `req.messages`' last user entry as the new turn,
   then runs `runToolLoop`. `transport.ts` gains `replay?: boolean` on `AgentChatRequest`. `mosNativeRuntime`
   `openThread` stamps a `replay=true` flag consumed (then cleared) on the next `subscribe`.

**Data flow:** reopen → client sets `replay` flag → next `subscribe` POSTs `{runId, replay:true, messages:[newMsg]}` →
index.ts passes through → handler reconstructs history from `mos.agent_events` under the caller JWT (owner RLS) →
appends new msg → model sees full context. **No tool re-executes** (replay only builds messages; the loop's
existing journal de-dupe gate still guards any write).

### 3.2 Notifications + channel-adapter seam (P3a)

**`mos.notifications`** (migration `20260706000002`) mirrors PMO's shape, schema-qualified, MOS claim functions:
```
mos.notifications(
  id uuid pk default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) default shared.current_org_id(),
  owner_id uuid not null references shared.people(id) default shared.current_person_id(),  -- recipient
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null, body text, metadata jsonb,            -- {source, entity{type,id,label}, ...}
  read_at timestamptz, created_at timestamptz not null default now()
)
```
RLS: owner-only on every verb; INSERT re-pins owner_id+org_id; UPDATE is mark-read-only via a column-pin trigger
(`notifications_mark_read_only`, PMO pattern, mirrors `agent_events_feedback_only`). Index `owner_id where read_at is null`.

**Channel-adapter seam** (`mos-app/src/lib/notifications/channelAdapter.ts`): a `fanOut(row)` that writes the
in-app row (always) and invokes `dispatchPush(row)` (best-effort). `dispatchPush` is a **no-op stub** when
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` edge secrets are absent — it logs + returns `{ok:false, reason:'no-vapid'}`,
never throws. When present (op-configured), it resolves push subscriptions from `mos.push_subscriptions` and
calls the web-push API. **VAPID keys never enter the repo** (op secrets, like `AGENT_MODEL_API_KEY`).

**PWA baseline** (ADR-0019 D9): `mos-app/public/manifest.webmanifest` + a tiny `sw.ts` service worker
(Vite plugin `vite-plugin-pwa` is the lightest path; license MIT) registered in `main.tsx`. The SW's push
handler displays a notification on `push` event. Push *subscription* (the `POST /push/subscribe` that writes
`mos.push_subscriptions`) is wired but inert without VAPID — the installable-PWA + Inbox-row baseline ships now;
push delivery flips on when the op sets VAPID. (Push delivery is the one piece of P3a marked live-verify.)

### 3.3 THE KEY DESIGN QUESTION — background-run JWT mint (P3b, gating live-verify)

**The problem (ADR-0044 §3, restated for MOS):** a cron/event-triggered automation has **no live user and no live
JWT**. Naively that tempts `service_role` execution, which **bypasses RLS** and detonates the org_id seam. PMO's
answer: the dispatcher mints a short-lived, owner-scoped JWT via Supabase Auth admin
`generateLink({type:'magiclink', email})`, hands it to the standard caller-JWT deputy loop, and `service_role` is
quarantined to (a) automation-metadata enumeration + watermark bookkeeping + (b) the mint itself.

**Why MOS is different from PMO (the delta):** MOS `owner_id` is `shared.people.id` (a person UUID), **not**
`auth.users.id`. PMO's `owner_id` *was* `profiles.id` = `auth.users.id`, so `getUserById(ownerId)` worked
directly. MOS must resolve the auth identity from the person:
- `shared.people` already carries `email` **and** `user_id` (FK `auth.users`) — so the mint's metadata read is a
  single `service_role` SELECT on `shared.people` (`id`, `email`, `user_id`) — **one metadata row, never business
  data.** No `getUserById` hop needed (cleaner than PMO).

**The load-bearing uncertainty (MOS-specific, MUST be live-verified):** MOS stamps `org_id` / `person_id` /
`access_roles` into every access JWT via the `custom_access_token` hook (`[auth.hook.custom_access_token]` →
`shared.custom_access_token_hook`, migrations `…000005` + `…019000002`). RLS — `current_org_id()` /
`current_person_id()` / `has_access_role()` — reads those claims. **If a `generateLink`-minted token does NOT
route through the access-token hook, the minted token carries no org/person claims → `current_org_id()` returns
NULL → RLS denies everything → the cron run can read/write nothing.** PMO's audit #4 noted the minted token's
TTL is project-default; it did **not** confirm the hook fires for `generateLink` tokens.

**Hypothesis (to verify):** `generateLink({type:'magiclink', email})` returns `properties.access_token`, which
Supabase Auth (GoTrue) issues as a real session token through the same token-issuance path that runs
`custom_access_token` hooks. If so, the minted token carries the owner's `org_id`/`person_id`/`access_roles`
stamped from the owner's `shared.people` row — **the deputy invariant holds by construction**, identically to the
interactive path, and `service_role` never touches business data. This is the design P3b assumes.

**The live-verify gate (Director/staging, blocks P3b build start):**
1. On staging, seed a person with a known `user_id` + email; set `AGENT_MODEL_*` + `SUPABASE_SERVICE_ROLE_KEY`.
2. Call `authAdmin.generateLink({type:'magiclink', email})`, decode `properties.access_token` payload
   (`_shared/jwt.ts#decodeJwtClaims`), and **assert `org_id`, `person_id`, `access_roles` are present and match
   the owner's `shared.people` row.**
3. Build the minted client; **assert a caller-JWT read of `mos.tasks` (owner's own rows) returns rows and a
   cross-org person's rows are absent** (the deputy-invariant test extended to the minted path).
4. Record the result in `docs/decisions.md` (OD-AN-4) before P3b build starts.

**Fallback if the hook does NOT fire (P3b shape changes):** the realistic options are (i) a
`SECURITY DEFINER` mint RPC that issues a session — **rejected: Supabase does not expose JWT signing to SQL**, so
this is not buildable today; (ii) `admin.generateLink` is the only admin mint surface, so if it bypasses the
hook, **automations are blocked until Supabase exposes a hook-routed per-token mint** — P3b is shelved and P3a
ships alone (still a complete, valuable release: Inbox + replay + ask_user + comments). The plan is written to
make this fallback cheap: P3a has zero dependency on the mint.

**Other mint constraints (binding, port from ADR-0044 §3):** mint only ever for the row's `owner_id` (never
request/model-supplied); every mint audited as the run's seq-0 `system{kind:'automation_mint'}` event BEFORE any
other minted-client use; minted token never persisted/logged; `timeout_s` bounds the run's wall-clock
(`AbortController`), **not** the token's crypto lifetime (PMO audit #4 — the token is project-default-lifetime;
the deputy ceiling itself is the mitigation for a leaked minted token).

### 3.4 Cross-owner notify (the @mention sanctioned exception)

`mos.notifications.owner_id` defaults to `shared.current_person_id()` (the *recipient*, not the author). For a
`@mention`, the **author's** comment post must write a notification row whose `owner_id` is the **mentionee** —
a cross-owner INSERT. RLS `WITH CHECK (owner_id = current_person_id())` would block this. **Resolution:** a
`SECURITY DEFINER` helper `mos.create_notification(p_owner_id, p_title, p_body, p_severity, p_metadata)` that
the comment-post path calls; it asserts the mentionee is in the **same org** as the author
(`p_owner_id` org == `current_org_id()`), then INSERTs with `owner_id = p_owner_id`. This is the **one** sanctioned
cross-owner write and it is窄-scoped + org-gated + audit-traceable. (Automations' `notify` action, by contrast,
writes to the *caller* — the minted owner — so it needs no helper.)

---

## §4 — Shared conventions (all tasks)

- **Migrations:** next ts `20260706000001`+; schema-qualify `mos.*`; `org_id default shared.current_org_id()` +
  `owner_id default shared.current_person_id()` + `WITH CHECK` on every write branch; append-only triggers where
  named; manual rollback at file foot (reverse order, spelled out — no "repeat above").
- **pgTAP tests:** next no. `65`+; one file per AC-cluster; AC-id in the test title (`select plan.log('AC-P3-NF-001 …')`).
- **Edge functions:** Deno; pure logic in importable modules (handler/dispatcher/mint/replay), `index.ts` is
  integration-only (not unit-tested — D7); `service_role` only at sites the deputy-invariant source-text guard
  allows (extend `handlerDeputyInvariant.test.ts` to cover `agent-dispatch`).
- **Feature flags:** add `SHOW_INBOX` (P3a) + `SHOW_AUTOMATIONS` (P3b) to `mos-app/src/config/features.ts`;
  hide-first (ADR-0017 D6); default `false`.
- **Verify commands (CI):** `cd mos-app && npm run typecheck && npm run lint -- --max-warnings=0 && npm test`;
  `cd supabase && deno check functions/*/index.ts` (Deno); `supabase test db` (pgTAP, local Docker).
- **Live-verify (Director/staging, NOT CI):** the mint/hook verify (§3.3); real model grounding (P2 already
  owner-gated); PWA push delivery with VAPID; the pg_cron→edge-fn actual fire (PMO pattern: registration asserted
  in pgTAP, fire verified only deployed).
- **i18n:** every new string through the catalog (`dest.*`, `assistant.*`, `inbox.*`) — ADR-0019 D12.
- **Commit trailer:** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## §5 — P3a TASKS (caller-JWT; ship first)

### Phase A — Deep thread-history replay

**T1 · Migration: widen `agent_events.type` to include `user`/`artifact`.**
File: `supabase/migrations/20260706000001_mos_agent_events_replay_fields.sql`.
Widen the check to `('user','assistant','tool','artifact','status','system')`. No new columns (payload jsonb
already holds tool_calls/tool_call_id). Manual rollback: restore the 4-value check.
Verify (CI): `supabase db reset && supabase test db` green; existing `64_mos_agent_persistence_rls` still green.
ACs: AC-P3-RP-004.

**T2 · pgTAP: `agent_events` accepts `user` type; RLS unchanged.**
File: `supabase/tests/65_mos_agent_events_replay.sql`. Insert a `type='user'` row as owner (ok); cross-org
INSERT denied; cross-org SELECT 0 rows. Mirror the `64_*` assertions.
Verify: `supabase test db` → 65 green. ACs: AC-P3-RP-004.

**T3 · Handler: persist `user` echo + enrich assistant `tool_calls` + tool `tool_call_id`.**
File: `supabase/functions/agent-chat/handler.ts`.
- Widen `isPersistableEvent` to include `'user'`.
- In `runToolLoop`: emit the assistant event with `tool_calls` when present, **even when `content` is empty**:
  replace `if (resp.message.content) { yield emit('assistant', { text: resp.message.content }) }` with an
  unconditional emit carrying `{ text: resp.message.content ?? '', tool_calls: resp.message.tool_calls }` guarded
  to emit only when text or tool_calls is non-empty.
- On the tool-result emit, add `tool_call_id: toolId` to the `tool` payload (both the read-action and
  compose branches).
Verify (CI): `cd mos-app && npm test -- handler` green; new `handler.replay-enrichment.test.ts` asserts the
emitted payloads carry tool_calls/tool_call_id. ACs: AC-P3-RP-002.

**T4 · `replay.ts` — reconstruct `ModelMessage[]` from events.**
File: `supabase/functions/agent-chat/replay.ts` (pure; imports `PersistenceDeps`).
`export async function replayRunHistory(deps, runId): Promise<ModelMessage[]>` — loads events seq-ordered via
`deps.supabase.schema('mos').from('agent_events').select('type,text,payload').eq('run_id',runId).order('seq').limit(MAX_RUN_EVENTS_READ)`,
walks them per §3.1, returns messages. Skips `status`/`system`. Pairs `tool` to the preceding assistant `tool_use`
by `tool_call_id` (defensive: a tool event without a matching assistant tool_use is skipped — never a malformed
message handed to the model).
Verify: `replay.test.ts` — a fixture event stream reconstructs to the exact `ModelMessage[]` with paired ids.
ACs: AC-P3-RP-001.

**T5 · Handler replay branch + transport `replay` flag.**
Files: `supabase/functions/agent-chat/handler.ts` (branch in `agentChatHandlerInner` before the system-prompt
build), `mos-app/src/lib/agent/runtime/transport.ts` (`replay?: boolean` on `AgentChatRequest`).
When `req.runId && req.replay`: `const base = await replayRunHistory(persist.deps, req.runId)`; prepend the system
message; append the last `req.messages` user entry; run `runToolLoop` with the reconstructed `messages`.
Verify: `handler.replay.test.ts` — `req.replay=true` yields a model call whose `messages` arg includes the
reconstructed history (mock `modelClient.create` captures messages); no tool re-executes. ACs: AC-P3-RP-002.

**T6 · Client `mosNativeRuntime` + `useAssistantPanel` openThread replay.**
Files: `mos-app/src/lib/agent/runtime/mosNativeRuntime.ts` (add `replay?:boolean` to `RunState`; `openThread`
sets it; `subscribe` includes it in the body then clears), `mos-app/src/hooks/useAssistantPanel.ts`
(`openThread(threadId)` now also loads the thread's events via a `loadThreadForDisplay` fetch and populates
`transcript`/`chips` state for render).
`loadThreadForDisplay` (new helper in `mos-app/src/lib/agent/history.ts`) — fetches the thread's runs' events and
folds them into `TranscriptItem[]` (mirrors `mergeEvent`).
Verify: `mosNativeRuntime.replay.test.ts` + `useAssistantPanel.openThread.test.ts` green. ACs: AC-P3-RP-003.

**T7 · ThreadList populate (P2 follow-up: "always-empty History").**
File: `mos-app/src/components/assistant/ThreadList.tsx` (new) wired into `AssistantPanel` header.
Lists `mos.agent_threads` for the owner (updated_at desc), click → `openThread(id)`. Empty-state when none.
Verify: `ThreadList.test.tsx` — renders threads; click calls `openThread`. ACs: AC-P3-RP-003 (ThreadList no longer empty).

### Phase B — Notifications table + channel seam

**T8 · Migration: `mos.notifications` + mark-read trigger.**
File: `supabase/migrations/20260706000002_mos_notifications.sql`. Shape per §3.2; owner-only RLS all verbs;
`notifications_mark_read_only()` trigger rejects any non-`read_at` drift (PMO pattern). Index
`mos_notifications_owner_unread_idx on mos.notifications(owner_id) where read_at is null`. Manual rollback spelled out.
Verify: `supabase db reset && supabase test db`. ACs: AC-P3-NF-001/002/004.

**T9 · pgTAP: notifications RLS + mark-read-only.**
File: `supabase/tests/66_mos_notifications_rls.sql`. Owner isolation; cross-org denial; INSERT re-pin;
cross-owner INSERT denied at RLS (the mention path uses the §3.4 helper, not a direct INSERT); UPDATE touching
`title`/`severity`/`metadata` rejected (42501); UPDATE `read_at` ok.
Verify: `supabase test db` → 66 green. ACs: AC-P3-NF-001/002.

**T10 · `SECURITY DEFINER` cross-owner notify helper.**
File: `supabase/migrations/20260706000003_mos_create_notification.sql`.
`mos.create_notification(p_owner uuid, p_severity text, p_title text, p_body text, p_metadata jsonb) returns uuid`
— `SECURITY DEFINER`, `set search_path=''`; asserts `exists(select 1 from shared.people where id=p_owner and
org_id=shared.current_org_id() and archived_at is null)` (same-org, non-archived mentionee); INSERTs
`mos.notifications(owner_id=p_owner, org_id=current_org_id(), …)`; granted `execute to authenticated`.
Verify: pgTAP `67_create_notification.sql` — author in org A mentioning person in org A → row visible to
mentionee; mentionee in org B → helper raises (cross-org denied). ACs: AC-P3-CM-005, AC-P3-NF-001.

**T11 · Channel-adapter seam (`channelAdapter.ts`).**
File: `mos-app/src/lib/notifications/channelAdapter.ts` (pure; the in-app write is a caller-JWT supabase insert;
push is a stub) + edge-side `supabase/functions/_shared/pushDispatch.ts` (`dispatchPush` no-op without VAPID).
`fanOut({sb, row})` → `await sb.schema('mos').from('notifications').insert(row)` then `await dispatchPush(row)`
(swallowed). `dispatchPush` reads `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`mos.push_subscriptions`; absent →
`{ok:false, reason:'no-vapid'}`.
Verify: `channelAdapter.test.ts` — fan-out writes the row + calls push (stub) without throwing when VAPID absent.
ACs: AC-P3-NF-003.

**T12 · `notify` action.**
File: `supabase/functions/agent-chat/actions.ts` — port PMO `notifyAction` (`confirm:false`); insert via
`ctx.supabase.schema('mos').from('notifications')`; register in `BASE_ACTIONS` behind `SHOW_AUTOMATIONS`? No —
`notify` is caller-JWT (interactive deputy can self-notify); register unconditionally (gated by `SHOW_ASSISTANT`
panel flag, already the gate). Schema `NOTIFY_SCHEMA` in `schema.ts`.
Verify: `actions.notify.test.ts`; `cd supabase && deno check functions/agent-chat/index.ts`. ACs: AC-P3-NT-001/002.

### Phase C — Inbox destination UI

**T13 · Feature flag + destination wiring.**
Files: `mos-app/src/config/features.ts` (`export const SHOW_INBOX = false`), `mos-app/src/shell/destinations.tsx`
(populate the `inbox` destination's `links: [{path:'/inbox', label:'Inbox', Icon: InboxIcon}]` only when
`SHOW_INBOX`; `primaryPath:'/inbox'`).
Verify: `destinations.test.ts` updated — SHOW_INBOX true → inbox live; false → not live. ACs: AC-P3-IB-001/004.

**T14 · Route + page.**
Files: `mos-app/src/routes.tsx` (`/inbox` → `<InboxPage/>`, behind `SHOW_INBOX` redirect), `mos-app/src/pages/InboxPage.tsx`.
Verify: route renders; off-flag redirects to `/`. ACs: AC-P3-IB-001.

**T15 · `useNotifications` hook + list.**
Files: `mos-app/src/hooks/useNotifications.ts` (subscribe to `mos.notifications` for the owner, ordered
`created_at desc`, unread-first; `markRead(id)` optimistic UPDATE `read_at=now()`; unread count for the badge),
`mos-app/src/components/inbox/InboxList.tsx`, `InboxRow.tsx` (row → deep-link `navigate(metadata.entity.route)`).
Verify: `useNotifications.test.ts` + `InboxList.test.tsx` — 3 unread render, badge=3, tap marks read + navigates.
ACs: AC-P3-IB-002/003/005/006.

**T16 · Bell + unread badge in the shell.**
Files: `mos-app/src/shell/top-bar.tsx` (desktop bell with count), `mos-app/src/shell/bottom-tab-bar.tsx` (phone
badge on the inbox tab). Badge source = `useNotifications().unreadCount`.
Verify: `top-bar.test.tsx` / `bottom-tab-bar.test.tsx` — badge renders count; hidden when SHOW_INBOX off.
ACs: AC-P3-IB-002/004.

**T17 · i18n strings.**
File: `mos-app/src/i18n/locales/{en,id}.ts` — `inbox.title`, `inbox.empty`, `inbox.markRead`, `dest.inbox`,
severity labels.
Verify: `npm run typecheck`; `i18n.test.ts` keys present. ACs: ADR-0019 D12.

### Phase D — ask_user transcript contract

**T18 · Schema + action stub.**
Files: `supabase/functions/agent-chat/schema.ts` (`ASK_USER_SCHEMA`: prompt + options[{id,label}] + allowFreeText),
`actions.ts` (`askUserAction` guard stub — handler dispatches directly).
Verify: `deno check`; schema unit test. ACs: FR-P3-AU-001.

**T19 · Handler `ask_user` dispatch branch + `handleAnswer`.**
File: `supabase/functions/agent-chat/handler.ts`.
- In `runToolLoop`, before the `actionByName` lookup, branch `if (toolName==='ask_user' && allowProposeConfirm)`:
  validate input, `yield emit('status', {payload:{kind:'question', questionId:makeId(), prompt, options, allowFreeText?}})`, `return`.
- `handleAnswer(req, deps, …)` (mirrors PMO): find trailing unresolved `ask_user` via
  `findTrailingUnresolvedToolUse(req.messages, isAskUserToolUse)`; append chosen option label (or freeText) as
  the `tool_result`; continue via a `runLoopAfterAnswer` that runs with `allowCompose:true, allowProposeConfirm:true`
  (answer is non-terminal — the model may immediately propose/commit). No trailing → no-op continuation.
- `agentChatHandlerInner` gains an `if (req.answer) { yield* handleAnswer(…); return }` gate (after the
  `req.decision` gate).
Verify: `handler.askUser.test.ts` — emit question + end stream; answer resolves same run; stale answer no-op.
ACs: AC-P3-AU-001/002/003.

**T20 · Transport + port + runtime `answer`.**
Files: `transport.ts` (`answer?: AgentAnswer` on `AgentChatRequest`), `port.ts` (`AgentRuntime.control` command
set gains `'answer'` — extend the union; `QuestionPayload` type), `mosNativeRuntime.ts` (`control('answer', {questionId, optionId?, freeText?})`
stamps an `answer` on `RunState`, sent + cleared next subscribe).
Verify: `port.test.ts` (superset — no existing member changed), `mosNativeRuntime.answer.test.ts`. ACs: AC-P3-AU-005.

**T21 · Panel question chips + hook `answerQuestion`.**
Files: `useAssistantPanel.ts` (track `pendingQuestion` from `status{kind:'question'}`; `answer(qId, optionId?, freeText?)`
calls `runtime.control(runId,'answer',…)`), `AssistantPanel.tsx` (`QuestionChips` component — inline chips +
optional free-text input).
Verify: `useAssistantPanel.question.test.ts`, `AssistantPanel.test.tsx` — question renders chips; tap → answer.
ACs: AC-P3-AU-004.

### Phase E — Rating / downvote

**T22 · Hook `rateAssistant(eventId, rating, reason?)`.**
File: `useAssistantPanel.ts` — `rate(eventId, 'up'|'down', reason?)` → caller-JWT
`sb.schema('mos').from('agent_events').update({rating, downvote_reason: reason ?? null}).eq('id', eventId)`.
Verify: pgTAP `68_agent_events_feedback_owner.sql` re-asserts the P2 trigger permits owner-assistant feedback +
rejects tool/status/system (AC-P3-FB-001); `useAssistantPanel.rate.test.ts`. ACs: AC-P3-FB-001/002.

**T23 · Panel 👍/👎 control + reason picker.**
File: `AssistantPanel.tsx` — per-assistant-turn thumbs; downvote → reason menu (`inaccurate|not_helpful|wrong_tool|too_slow`).
Verify: `AssistantPanel.test.tsx` — thumbs call rate; downvote shows reasons. ACs: AC-P3-FB-002.

### Phase F — Work-item comments + @mention

**T24 · Migration: `mos.comments`.**
File: `supabase/migrations/20260706000004_mos_comments.sql`.
```
mos.comments(id uuid pk, org_id default current_org_id(), author_id default current_person_id(),
  entity_type text not null check (in ('task','weekly_update','daily_log','follow_up')),
  entity_id uuid not null, body text not null, created_at, updated_at)
```
RLS: SELECT — org member can read comments on entities they can read (delegate to the entity's own RLS via a
`SECURITY DEFINER` read-guard OR a join predicate — simplest v1: same-org + the entity exists in the viewer's
reach; for v1 use `org_id=current_org_id()` SELECT, which is correct because all four entity types are
same-org-readable by org members per existing RLS); INSERT re-pins org_id+author_id; author can UPDATE/DELETE
their own within a grace window? — v1: append-only (no UPDATE/DELETE) for simplicity + audit.
Verify: `supabase db reset`. ACs: AC-P3-CM-001.

**T25 · pgTAP: comments RLS.**
File: `supabase/tests/69_mos_comments_rls.sql` — same-org read ok; cross-org 0; INSERT re-pin; append-only.
Verify: `supabase test db` → 69. ACs: AC-P3-CM-001.

**T26 · `mentions.ts` — slug → person-id resolution.**
File: `mos-app/src/lib/comments/mentions.ts` — `extractMentions(body, personIndex): personId[]`. `@<slug>` where
slug maps to `shared.people` via a `slug`/`full_name`-derived index (build a minimal slug = lowercase-first-token
of full_name; collision → no match, fail-quiet). Best-effort, never throws.
Verify: `mentions.test.ts` — resolvable slugs return ids; unknown returns none. ACs: AC-P3-CM-002.

**T27 · Comment post → notification fan-out.**
File: `mos-app/src/lib/comments/postComment.ts` — `postComment({sb, entityType, entityId, body})`: INSERT
`mos.comments`; `const ids = extractMentions(body, await loadPersonIndex(sb))`; for each, `sb.rpc('create_notification', {p_owner: id, p_severity:'info', p_title:`@mention in ${entityType}`, p_body: body.slice(0,200), p_metadata:{source:'mention', entity:{type:entityType, id:entityId}}})`.
Verify: `postComment.test.ts` — a comment with one resolvable mention → 1 notification addressed to the mentionee.
ACs: AC-P3-CM-003/005.

**T28 · Task-detail comment thread UI.**
Files: `mos-app/src/components/tasks/CommentThread.tsx`, wired into the task detail page. List + composer; `@`
triggers a person picker (Typeahead over `loadPersonIndex`).
Verify: `CommentThread.test.tsx` — renders posts; `@` shows picker; submit calls `postComment`. ACs: AC-P3-CM-004.

### Phase G — PWA baseline (seam; delivery deferred)

**T29 · Manifest + service worker registration.**
Files: `mos-app/public/manifest.webmanifest`, `mos-app/src/sw-register.ts` (registered in `main.tsx`), vite plugin
`vite-plugin-pwa` (MIT) in `vite.config.ts`. Push handler in the SW displays a notification on `push`.
Verify: `npm run build` emits manifest + SW; RTL `main.test.tsx` asserts registration call. (Delivery = live-verify.)
ACs: FR-P3-NF-002 (seam).

**T30 · `mos.push_subscriptions` + subscribe RPC (inert without VAPID).**
File: `supabase/migrations/20260706000005_mos_push_subscriptions.sql` (owner-scoped; `endpoint`, `keys jsonb`,
`owner_id`/`org_id` defaults + RLS). Client `usePushSubscription` calls `registration.pushManager.subscribe`
with the public VAPID key (read from a non-secret `VITE_VAPID_PUBLIC_KEY` env when op-set) + POSTs to a small
`push-subscribe` edge fn. No-op when key absent.
Verify: pgTAP `70_push_subscriptions_rls.sql`; `usePushSubscription.test.ts` no-ops without key. ACs: NFR-P3-NF-001.

### Phase H — Review battery + ship (P3a)

**T31 · Deputy-invariant source guard extended.**
File: `mos-app/src/lib/agent/handlerDeputyInvariant.test.ts` — assert the P3a additions (replay, ask_user, notify)
introduce no new `service_role` site; the replay path uses the caller-JWT `persist.deps.supabase` only.
Verify: `npm test -- handlerDeputyInvariant`. ACs: NFR-P3-RP-001.

Status 2026-07-05: implemented in the current uncommitted tree. Verification: `npm test --
handlerDeputyInvariant` PASS (6 tests).

**T32 · Curated e2e (one cross-stack).**
File: `mos-app/e2e/inbox-replay.spec.ts` — deputy conversation → reload → transcript restored (replay); a `notify`
action → Inbox badge increments; mark-read clears it. (Live model = owner-gated, like P2.)
Verify: `npx playwright test inbox-replay` (live-gated). ACs: AC-P3-RP-003, AC-P3-IB-002/003.

Status 2026-07-05: spec added in the current uncommitted tree, gated by `SHOW_ASSISTANT` + `SHOW_INBOX`
and `MOS_P3A_LIVE_E2E=1`. Local default verification: `npx playwright test inbox-replay` PASS with 1 skipped
because flags/live-model gate are off.

**T33 · Pre-merge gate.**
`cd mos-app && npm run typecheck && npm run lint -- --max-warnings=0 && npm test`; `supabase test db`;
`cd supabase && deno check functions/*/index.ts`; `scripts/pre-merge-check.sh` exit 0.
Verify: all green. Director design render-verify (SHOW_INBOX on) + security review (notify cross-owner helper +
channel seam) before merge.

---

## §6 — P3b TASKS (automations; gated on §3.3 live-verify)

> **Do not start P3b build until the §3.3 mint/hook live-verify resolves and is recorded in
> `docs/decisions.md` (OD-AN-4).** Tasks below are written to the hypothesis (hook fires). The mint task (T42)
> flags the fallback explicitly.

### Phase I — Schema + actions

**T34 · Migration: `mos.agent_automations` + `mos.agent_dispatch_watermarks`.**
File: `supabase/migrations/20260706000006_mos_agent_automations.sql`. Port PMO `0048` shapes, schema-qualified
`mos.*`, MOS claim functions (`shared.current_org_id()`/`current_person_id()`), `owner_id`→`shared.people(id)`.
`agent_dispatch_watermarks`: no org_id/owner_id (ADR-0046 analog), `enable`+`force` RLS, **no policy**
(default-deny; service_role-only). `agent_automations`: owner-only RLS all verbs; kind-conditional checks.
Verify: `supabase db reset`. ACs: AC-P3-AM-001, FR-P3-WM-001.

**T35 · pgTAP: automations + watermark RLS + table-set guard.**
File: `supabase/tests/71_mos_agent_automations_rls.sql` — owner isolation; cross-org denial; INSERT re-pin;
`enabled`/`archived_at` respected. Plus an assertion (mirroring PMO `AC-AAN-018`) that the dispatcher's
`service_role` table-set is exactly `{mos.agent_automations, mos.agent_dispatch_watermarks, <trigger sources>}`.
Verify: `supabase test db` → 71. ACs: AC-P3-AM-001/002, NFR-P3-AM-SEC-001.

**T36 · `create_automation` action + `TRIGGER_SOURCES` allowlist.**
Files: `supabase/functions/agent-chat/actions.ts` (port PMO `createAutomationAction`, `confirm:true` — approve
chip), `supabase/functions/agent-dispatch/triggerSources.ts` (`TRIGGER_SOURCES = ['mos.task_events']` as const —
MOS's append-only status-event log; widen later). `validateCreateAutomation` rejects non-allowlisted source +
invalid cron (port PMO `isValidCronExpression`).
Verify: `actions.createAutomation.test.ts`. ACs: FR-P3-AM-001.

### Phase J — Dispatcher edge function (the safety core)

**T37 · `cron.ts` + `watermark.ts` + `condition.ts` (pure modules).**
Files: `supabase/functions/agent-dispatch/{cron,watermark,condition}.ts` — verbatim ports (mechanical; no MOS
delta). `watermark.ts` targets `mos.agent_dispatch_watermarks`; `condition.ts` uses `_shared/modelClient`.
Verify: unit tests for each (cronMatches; read/advance watermark; condition verdict true/false/warning).
ACs: FR-P3-AM-002, FR-P3-WM-002.

**T38 · `mint.ts` — THE mint slice (MOS delta).**
File: `supabase/functions/agent-dispatch/mint.ts`. Port PMO's shape; **MOS delta in `mintOwnerJwt`**:
```
// 1. ONE service_role metadata read: person → (user_id, email)
const { data: person } = await serviceClient.schema('shared').from('people')
  .select('user_id,email').eq('id', automation.owner_id).maybeSingle()
// 2. fail-closed if no email
// 3. generateLink({type:'magiclink', email}) → properties.access_token
// 4. buildClient(accessToken)  // the fired run's RLS ceiling = owner
```
(NB: reads `shared.people` under `service_role` — a metadata read of the owner row, not business data; add
`shared.people` to the §T35 table-set assertion's allowed metadata set.) `auditMint` writes the run's thread/run/seq-0
`system{kind:'automation_mint'}` event under the **minted** client (owner RLS) BEFORE any other use.
**Fallback flag (T42 verify):** if the decoded minted token lacks `org_id`/`person_id`, `mintOwnerJwt` throws
`'mint failed: no-claims'` (fail-closed) — the dispatcher logs `AUTOMATION_MINT_FAILED` and skips; automations
are inert until the hook question is resolved.
Verify: `mint.test.ts` — mints for `automation.owner_id` only; never logs the token; audit-before-fire ordering.
ACs: FR-P3-MT-001/002/003.

**T39 · `dispatcher.ts` — tick orchestration.**
File: `supabase/functions/agent-dispatch/dispatcher.ts`. Port PMO's `runDispatchTick` (claim-schedule-fire,
condition-before-mint, audit-before-fire, credit preflight seam, per-unit try/catch, advance-watermark-after-batch).
MOS deltas: `selectTriggerMatches` calls `select_trigger_events` RPC if added (v1: if no RPC exists, the
`mos.task_events` poll is a direct `service_role` read gated by `TRIGGER_SOURCES` allowlist + in-JS org gate —
document as the v1 belt; add the `SECURITY DEFINER` RPC as a hardening follow-up). `notifyOwner` writes
`mos.notifications` via the minted client.
Verify: `dispatcher.test.ts` — due-schedule fires; trigger watermark advances; condition false → no-fire;
condition unevaluable → warning notify; over-credit → no-start + notify. ACs: FR-P3-AM-002/003/004/005/006.

**T40 · `fire.ts` + `index.ts` (Deno entry).**
Files: `supabase/functions/agent-dispatch/{fire,index}.ts`. `fireAutomation` drives `agentChatHandler` (injected)
under the minted client, draining to terminal. `index.ts`: bearer MUST equal `SUPABASE_SERVICE_ROLE_KEY`; flag
gate `AGENT_AUTOMATIONS`; build `serviceClient` + `authAdmin`; inject `agentChatHandler`; `buildPersistence` per
PMO (startSeq=1, the audit created seq-0).
Verify: `cd supabase && deno check functions/agent-dispatch/index.ts`. ACs: NFR-P3-AM-SEC-001.

**T41 · pg_cron registration migration.**
File: `supabase/migrations/20260706000007_agent_dispatch_cron.sql` — `create extension pg_cron/pg_net`;
`cron.schedule('agent-dispatch-tick','* * * * *', $$net.http_post(url:=current_setting('app.settings.dispatch_url',true), headers:=…)$$)`.
Registration only (fire = live-verify).
Verify: `supabase db reset` (cron.job row exists); `supabase test db`. ACs: FR-P3-AM-002.

**T42 · §3.3 live-verify (Director/staging) — RECORD BEFORE MERGE.**
Run the 4-step verify (§3.3); record OD-AN-4 in `docs/decisions.md`. If the hook fires → ship P3b flag-OFF
default (op flips `SHOW_AUTOMATIONS` + `AGENT_AUTOMATIONS` per cohort). If not → P3b shelved; P3a already shipped.
ACs: FR-P3-MT-001 (the verify IS the AC).

**T43 · Deputy-invariant guard for agent-dispatch.**
File: `mos-app/src/lib/agent/dispatch/dispatcher.deputy-invariant.test.ts` — source-text assertion that
`service_role`/`serviceClient` appears only in {selection, watermark, mint-metadata, claim} sites; the fired run's
`supabase` is the minted client; no business-data `.from()` under `serviceClient` outside the allowed set.
Verify: `npm test -- dispatcher.deputy-invariant`. ACs: NFR-P3-AM-SEC-001.

**T44 · Curated e2e (automations).**
File: `mos-app/e2e/automation-fire.spec.ts` — user creates a scheduled automation via deputy (approve chip) →
simulated dispatch tick (call the fn directly with the service-role bearer) → run + notification appear; second
user sees neither.
Verify: `npx playwright test automation-fire` (live-gated). ACs: FR-P3-AM-001..006.

---

## §7 — Live-verify vs CI (matrix)

| Item | CI | Live-verify (Director/staging) |
|---|---|---|
| pgTAP RLS (notifications, comments, automations, watermark, feedback) | ✅ | — |
| Unit (replay, ask_user, notify, mentions, channelAdapter, dispatcher, mint) | ✅ | — |
| `deno check` edge fns | ✅ | — |
| Deputy-invariant source guards | ✅ | — |
| Real model (grounding, approve chips, ask_user round-trip, compose) | — | ✅ owner-gated (staging `AGENT_MODEL_*`) |
| **Mint/hook claims (§3.3)** | — | ✅ **gates P3b** |
| PWA push delivery (VAPID) | — | ✅ op sets VAPID; then push fires |
| pg_cron → edge-fn actual fire | — | ✅ deployed env only |
| `@mention` → real cross-owner notification | — | ✅ two-person staging seed |

---

## §8 — Residual risks + open questions for the Director

> **Director decisions (2026-07-05):**
> 1. **P3b GATED — owner-scheduled.** The `generateLink`→`custom_access_token` verify (§3.3) is a staging
>    activity needing the owner; P3b build does NOT start until it's recorded green. **P3a proceeds now**
>    (zero dependency on the mint). Q1 accepted as the gate.
> 2. Minted-token lifetime = project default, blast radius = owner's own RLS reach (deputy ceiling is the
>    mitigation) — **acceptable for P3b**; revisit token TTL if/when automations widen.
> 3. **In-app Inbox is the v1 deliverable; PWA push delivery is NOT a ship-blocker.** Build the subscribe
>    seam (T29–T30); delivery flips on when the owner sets VAPID op secrets. Matches ADR-0019 D9 (seam now,
>    channel later on evidence).
> 4. **Same-org comment read is acceptable for v1** (all four entity types are already same-org-readable;
>    comments inherit the entity's visibility). Task-level confidentiality is an ADR-0020 intra-BU-scoping
>    concern, deferred "only on evidence of real conflict."
> 5. **Ship v1 belt-only** (service_role poll + in-JS org gate) — the `SECURITY DEFINER` trigger-events RPC
>    is a P3b-hardening follow-up, not a blocker. Only relevant once P3b is unblocked anyway.
> 6. **Credits ledger CONFIRMED deferred** — thread the `rateGuard` seam only; the ledger is its own later
>    slice (ADR-0018 D6 leaves it separable).
> 7. **Typed widgets + live-context CONFIRMED deferred** past Inbox — the replay + Inbox + ask_user are the
>    P3a value; rich tool-result widgets and surface-aware live context are post-Inbox enhancements.
> 8. **Comments append-only for v1** — simpler + auditable; a delete-within-grace-window is a later nicety.

1. **THE gating question — does `generateLink` route through `custom_access_token`?** (§3.3). If no, P3b is
   blocked on a Supabase capability. **Director action:** schedule the staging verify before P3b build start.
2. **Minted-token crypto lifetime is project-default** (PMO audit #4): `timeout_s` bounds the run, not the token.
   A leaked minted token's blast radius = the owner's own RLS reach (the deputy ceiling is the mitigation). Acceptable?
3. **PWA push scope.** T29–T30 deliver the installable-PWA + subscribe seam; **actual push delivery** flips on
   only when the op sets VAPID. Is the in-app Inbox alone sufficient for v1 cohort, or is push a ship-blocker?
   (ADR-0019 D9 says in-app + push v1, but push can lag the seam.)
4. **`mos.comments` read posture.** v1 SELECT is same-org-only (all four entity types are same-org-readable by
   members). If task-level confidentiality is ever needed (a sensitive task), comments would leak across the
   same org. Acceptable for v1? (ADR-0020 intra-BU scoping is deferred "only on evidence of real conflict.")
5. **Trigger-source RPC.** v1 polls `mos.task_events` under `service_role` with an in-JS org gate (the belt); the
   PMO-style `SECURITY DEFINER select_trigger_events` RPC is a hardening follow-up. OK to ship v1 belt-only?
6. **Credits ledger.** ADR-0018 D6 P3 names a usage/credits ledger; this plan threads the `rateGuard` seam (P3b
   T39) but does **not** build the ledger (deferred to its own slice, PMO batteries-A item 3). Confirmed out of
   this train?
7. **Typed widgets (ADR-0045 §1) + live context (§3) deferred** — confirmed not in P3a/P3b (Inbox first). OK?
8. **Comments append-only** (no edit/delete in v1) — simpler + auditable; a delete-within-grace-window is a later
   nicety. OK?

---

## §9 — Summary (10 lines)

1. P3 is split: **P3a** (caller-JWT: replay + notifications + Inbox + ask_user + rating + notify + comments/mentions + PWA seam) ships first; **P3b** (automations cron+event) is gated on the §3.3 mint/hook live-verify.
2. **Deep replay** enriches `mos.agent_events` (persist `user` turns + assistant `tool_calls` + tool `tool_call_id`) and reconstructs `ModelMessage[]` server-side, closing the P2 review follow-up.
3. **`mos.notifications`** + a **channel-adapter seam** deliver the in-app Inbox row (v1) with PWA push wired-but-inert until VAPID is op-set (keys never in repo).
4. **Inbox** is the 5th nav destination (ADR-0019 D2) — a to-triage router, never a chat surface; phone-first + desktop-rail share one source.
5. **`ask_user`** rides P2's generic `findTrailingUnresolvedToolUse`; `control('answer')` resolves the same run (port stays a superset).
6. **Rating/downvote** wires the columns P2 already added (feedback-only trigger re-asserted).
7. **Comments + `@mention`** add a `mos.comments` seam + a `SECURITY DEFINER create_notification` helper for the one sanctioned cross-owner notify (org-gated).
8. **THE key design question (P3b):** a cron run has no JWT — MOS mints an owner token via `generateLink`; whether the MOS `custom_access_token` hook fires for that token is **unverified** and gates P3b (fallback: P3a ships alone).
9. MOS mint **delta**: `owner_id`=`shared.people.id` (not `auth.users.id`); `email` is on `shared.people` → one metadata read, no `getUserById` hop; fail-closed if the minted token lacks claims.
10. Everything is org_id+RLS, flag-gated (`SHOW_INBOX`/`SHOW_AUTOMATIONS`), Deno edge functions, 2–5-min tasks with exact paths + verify commands; live-verify items (mint, push, pg_cron fire, model) called out separately from CI.

# Plan — ADR-0018 P2 port train: panel + runtime + compose-view

- Status: **Draft** (eng-planner, 2026-07-05) — awaiting Director review
- ADR: [0018](../adr/0018-port-pmo-native-agent-stack.md) D6 **P2**; consumes [0017](../adr/0017-agent-native-user-composed-ui.md) D1–D7, D10, D11; [0019](../adr/0019-ia-north-star.md) D11/D12
- Pattern: **plan-first** (EARS FRs + G/W/T AC-ids embedded below; no separate spec files)
- Predecessor (LANDED): [P1 substrate](./2026-07-04-port-p1-substrate.md) + review `docs/reviews/feat-port-p1-substrate.md` — the `compileCompositionSpec` trust boundary compose-view re-runs server-side; the 7-entity `ENTITY_WHITELIST`; the schema-scoped executor; `mos.user_views` + RLS.
- Reference (READ-ONLY, sibling internal project, never modify): PMO ADRs 0039/0040/0041/0043 + `supabase/functions/{agent-chat,compose-view,_shared}/**`, `pmo-portal/src/{components/panel,hooks,lib/agent}/**`, migration `0046_agent_persistence.sql`.

## 0. Scope & out-of-scope

**P2 ships the first LIVE deputy.** Five net-new surfaces:

1. `supabase/functions/_shared/` — vendored, de-referenced model-client port + SSE codec + model resolution.
2. `supabase/functions/compose-view/` — single LLM call site → `CompositionSpec`, **server-side `compileCompositionSpec` re-validation before return** (P1 Sec-M1 carry-in).
3. `supabase/functions/agent-chat/` — multi-turn deputy loop (SSE), caller-JWT, tool catalog v1, approve/deny writes, thread/event persistence, **grounding system prompt**.
4. `supabase/migrations/20260705*_mos_agent_persistence.sql` — `mos.agent_threads`/`agent_runs`/`agent_events` (`org_id` + RLS, owner-private, tool-call journal columns).
5. `mos-app/src/{lib/agent,components/assistant,hooks}` — runtime port, `MosNativeRuntime` adapter, `AssistantPanel` slide-over + FAB (ADR-0019 D11), `useAssistantPanel`, i18n (en/id), feature flag.

**Tool catalog v1 (ADR-0018 D4):**
- READ (auto-execute): `query_entity` over the viewspec `ENTITY_WHITELIST` entities + `business_units` (P2 amendment, §3.1) + reporting read-models.
- WRITE (confirm:true, behind approve/deny chips): `create_task`, `post_update`.
- COMPOSE: `compose_view` (delegates to the compose-view edge function via the model-calling-action seam).

**Explicitly OUT of P2 (deferred to P3 batteries):** `agent-dispatch`, automations (cron/event), notifications inbox, `ask_user` clarifying questions + transcript widgets, the `agent_usage`/credits ledger table + `recordUsage` calls, dispatch watermark. The `agent_events` **tool-call journal columns** (D10 observability) ARE in P2; the usage/credits table is not. P2's `handler.ts` is authored WITHOUT the `ask_user`/`notify`/`create_automation` branches and WITHOUT `rateGuard`/`credits`/`usage` deps — the seam is left (optional deps) so P3 threads them without a handler rewrite.

**P1 carry-ins folded in (per review §Follow-ups):**
- **Server-side spec re-validation in compose-view** — Sec-M1 (the compile gate runs in the edge function, never trusting a client compile).
- **DB-side aggregation RPC for viewspec** — kills the 500-row truncation limit. Landed as a P2 add to the executor (§6.x, optional/stretch — see Residual Risks if cut).
- **ChartFrame binding** — frame renders with a pending note (P1 debt); P2 wires the `chart` primitive's data binding if the primitive graduates from stub. **Deferred** unless the chart primitive is live by P2 build (tracked; default defer to the primitive's own slice).
- **drill-href URL-scheme allowlist** — drills do NOT enter specs in P2 (no `drill` field in `PanelSpec` yet); **explicitly deferred** until a spec carries a drill. Tracked.

## 1. Design decisions (the D7 deltas — this port is NOT verbatim)

These are plan-level decisions; the architecturally-significant ones (D1, D2, D5) get an ADR in §9.

**D1 — orgId/personId/accessRoles resolved by DECODING THE JWT, not a `profiles` lookup.**
PMO does `supabase.from('profiles').select('org_id, role').eq('id', userId)`. MOS has NO `profiles` table — `shared.custom_access_token_hook` mints `org_id` + `person_id` + `access_roles` (array) into every access JWT (migration `20260619000002`). The edge function **decodes the JWT payload** (base64url → JSON) to read these three claims. This is (a) cleaner — no DB round-trip before the deputy can act; (b) the spike-proven invariant made concrete (the JWT claim IS the authority, ADR-0017 D9 PASS); (c) identical to how the SPA's `decodeAccessRolesClaim` already works (`mos-app/src/lib/db/viewer.ts`). The caller-JWT client carries the same claims into PostgREST, so `shared.current_org_id()`/`current_person_id()` RLS fires identically to `supabase-js` — the deputy-invariant test (AC-DI-001) proves cross-org is denied.

**D2 — Multi-schema, single-whitelist read surface.**
PMO was single-schema (`public`); MOS is multi-schema. The deputy's `query_entity` reuses the **P1 viewspec `ENTITY_WHITELIST`** as its read catalog (the SAME trust boundary the renderer compiles against) and dispatches via `supabase.schema(entry.schema).from(entry.table)` — the SAME schema-scoped dispatch the P1 executor uses (`mos-app/src/lib/viewspec/executor.ts`). There is NO separate agent-only entity whitelist. v1 `query_entity` takes `{entity, columns?, filter?, limit?}` — it does NOT expose the full QuerySpec DSL (groupBy/aggregate/timeRange) to the deputy; that expressiveness is the compose-view path. This keeps the agent's read surface small, auditable, and row-capped at `AGENT_READ_ROW_CAP = 50`.

**D3 — `service_role` ONLY for `auth.getUser(jwt)`; everything else caller-JWT.**
PMO's exact posture, inherited: the `verifierClient` (service_role) exists solely to call `auth.getUser(jwt)` and confirm the token is valid. All business data (reads, writes, persistence, profiles-equivalent claim decode) flows through the `callerClient` (anon key + caller's `Authorization: Bearer <jwt>`). No `service_role` member in the deputy path; enforce by construction (the handler interfaces take `HandlerSupabaseLike`, never a service-role client). AC-DI-002.

**D4 — Model id + base URL + API key via function secrets; source is provider-agnostic (de-reference firewall).**
Source code contains NO provider brand name and NO hardcoded model id. Three function secrets: `AGENT_MODEL_API_KEY`, `AGENT_MODEL_BASE_URL` (chat-completions endpoint), `AGENT_MODEL_DEFAULT` (model id). If `AGENT_MODEL_DEFAULT` is unset the function returns `502 MODEL_NOT_CONFIGURED` (fail-loud, not a silent fallback) — there is NO hardcoded default model constant in MOS source. The transport is a generic `ChatCompletionsClient` (OpenAI chat-completions shape) hitting `AGENT_MODEL_BASE_URL`; the PMO-specific `provider: { order: [...] }` routing body is dropped (op picks the provider via the base URL). Recommended op values (claude-sonnet-5 via the chosen gateway) live ONLY in the secrets runbook (§8), never in source. The `viewspec-firewall.test.ts` grep is extended to cover `supabase/functions/**` (no brand names).

**D5 — Grounding is prompt-bound + flow-tested; behavioral compliance is Director/live-verify.**
The system prompt (`buildAgentSystemPrompt`) carries the binding **Grounded answer** rule (CONTEXT.md): query before answering; empty/failed read → say so and stop; as-of on non-live figures. A unit test asserts the prompt string contains each rule (AC-GR-001). A handler-flow test asserts that an empty `query_entity` result (`{rowCount:0, rows:[]}`) is fed back to the model as a tool_result the model must ground on, and that the prompt instructs the "no data / read failed — I stopped" reply (AC-GR-002). The assertion that **claude-sonnet-5 actually obeys** is a Director/live-verify gate on staging (§7) — it cannot be proven in CI with a mocked model. This honest split is recorded as a residual risk (§10).

**D6 — `CompilerContext = { personId, orgId }` (MOS naming).**
PMO's `composeSpec` passes `{ userId, orgId }`; MOS's `compileCompositionSpec` (P1, landed) takes `{ personId, orgId }`. compose-view server-side re-validation passes `{ personId: decodedPersonId, orgId: decodedOrgId }`. Adapt at the seam.

**D7 — Deno handlers are pure (Vitest-testable); `index.ts` is integration-only.**
Mirrors PMO ADR-0039 decision-7. `handler.ts`, `composeSpec.ts`, `actions.ts`, `schema.ts`, `prompt.ts`, `persistence.ts`, `_shared/*` are authored importable in BOTH Deno and Node/Vitest (relative imports, no `.ts` extensions, no Deno-only globals at module scope; `node:crypto` resolves in both). **Vitest is the CI gate** (`npm test` from `mos-app/`); tests co-locate in `mos-app/src/lib/agent/*.test.ts` importing the edge-function handlers via relative path. `deno check` + `deno test` (run by release-engineer pre-deploy, NOT a merge blocker per AGENTS.md) cover the `index.ts` `Deno.serve` glue + `Deno.env` gates. Live SSE round-trip = Director/live-verify on staging.

## 2. Embedded spec — EARS requirements (FR) + acceptance criteria (AC)

IDs: `FR-P2-<area>-###` / `AC-P2-<area>-###`. Areas: RT (read tool), WT (write tool), CV (compose-view), DI (deputy invariant), PS (persistence), OB (observability), AP (assistant panel), CF (config/flag), GR (grounding).

### Functional requirements (EARS)

**Read tool**
- **FR-P2-RT-001:** WHEN the deputy receives a data question, THE SYSTEM SHALL invoke a read tool before answering; the deputy SHALL NOT answer a data question from memory.
- **FR-P2-RT-002:** WHERE a read returns zero rows or errors, THE SYSTEM SHALL surface an explicit "no data available / read failed" outcome to the model and the deputy SHALL stop rather than estimate.
- **FR-P2-RT-003:** THE SYSTEM SHALL restrict `query_entity` to `ENTITY_WHITELIST` entities and their `allowedColumns`; an off-whitelist entity or column SHALL return a structured `{error}`, never a raw query.
- **FR-P2-RT-004:** THE SYSTEM SHALL dispatch reads via a schema-scoped caller-JWT Supabase client; every read SHALL be bounded by the caller's RLS.
- **FR-P2-RT-005:** THE SYSTEM SHALL row-cap each read at `AGENT_READ_ROW_CAP` (50).
- **FR-P2-RT-006:** WHERE the entity is a reporting read-model, THE SYSTEM SHALL include `snapshot_as_of` among the citable columns.

**Write tool**
- **FR-P2-WT-001:** THE SYSTEM SHALL expose exactly two write tools in v1 — `create_task` and `post_update` — each `confirm:true`; no write SHALL auto-execute.
- **FR-P2-WT-002:** WHEN the deputy proposes a write, THE SYSTEM SHALL emit a `needs-approval` event carrying a server-composed human summary and the validated structured args, then end the stream.
- **FR-P2-WT-003:** UPON user approval, THE SYSTEM SHALL re-validate args, re-derive authorization from the caller JWT, and execute the write through the caller-JWT client under RLS; UPON denial, it SHALL inject a rejection `tool_result` and continue the run.
- **FR-P2-WT-004:** THE SYSTEM SHALL attribute `create_task.createdBy` and `post_update` authorship to the caller's `person_id` (from the JWT), never to a model-supplied value.
- **FR-P2-WT-005:** THE SYSTEM SHALL never invoke a privileged provisioning / `SECURITY DEFINER` RPC; the catalog SHALL contain no such tool.

**Compose-view**
- **FR-P2-CV-001:** THE compose-view edge function SHALL be the single LLM call site producing a `CompositionSpec`.
- **FR-P2-CV-002:** THE SYSTEM SHALL re-run `compileCompositionSpec(spec, {personId, orgId})` server-side before returning a spec; a spec that fails compile SHALL NOT be returned to the client.
- **FR-P2-CV-003:** WHERE compile fails, THE SYSTEM SHALL run a bounded repair loop (≤2 retries) feeding the `ValidationError` back; on exhaustion it SHALL return `422 REPAIR_EXHAUSTED`.
- **FR-P2-CV-004:** THE SYSTEM SHALL reject (`400`) a request whose `body.orgId` does not equal the `org_id` decoded from the caller JWT.

**Deputy invariant**
- **FR-P2-DI-001:** THE deputy runtime SHALL carry only the caller's JWT; it SHALL NEVER be handed `service_role` or a `BYPASSRLS` connection.
- **FR-P2-DI-002:** `service_role` SHALL be used ONLY for `auth.getUser(jwt)`; all business-data queries SHALL use the caller-JWT client.
- **FR-P2-DI-003:** `org_id`, `person_id`, and `access_roles` SHALL be resolved by decoding the caller JWT claims, not via a `profiles` lookup.

**Persistence**
- **FR-P2-PS-001:** THE SYSTEM SHALL persist threads/runs/events in the `mos` schema with `org_id` + `owner_id` defaulted server-side (`shared.current_org_id()` / `shared.current_person_id()`) and `WITH CHECK`.
- **FR-P2-PS-002:** `agent_events` SHALL be append-only except a narrow feedback `UPDATE` (`rating`/`downvote_reason`) on the owner's own `type='assistant'` row; a column-pin trigger SHALL reject all other drift.
- **FR-P2-PS-003:** THE SYSTEM SHALL assign a monotonic `seq` per run; `(run_id, seq)` SHALL be unique and `seq` SHALL be the transcript order.
- **FR-P2-PS-004:** RLS SHALL make the three tables owner-private (`owner_id = shared.current_person_id() AND org_id = shared.current_org_id()`); no admin cross-owner read policy SHALL exist.

**Observability**
- **FR-P2-OB-001:** THE SYSTEM SHALL persist a tool-call journal (`tool_name`, `tool_args_hash` of canonicalized **validated** args, `tool_status`) in the SAME `INSERT` as the tool event.

**Assistant panel**
- **FR-P2-AP-001:** THE deputy SHALL be a global slide-over panel available on every authenticated surface; it SHALL NOT be a route or destination.
- **FR-P2-AP-002:** ON desktop (≥1024px) a top-bar button SHALL open the panel; ON phone a FAB above the bottom tab bar SHALL open it.
- **FR-P2-AP-003:** THE panel SHALL be keep-mounted and `inert` when closed; transcript state SHALL survive close→open.
- **FR-P2-AP-004:** THE panel SHALL render plain-text assistant content only; it SHALL NEVER use `dangerouslySetInnerHTML`.
- **FR-P2-AP-005:** EVERY user-facing string SHALL pass through the i18n catalog; both `en` and `id` messages SHALL ship.

**Config / flag**
- **FR-P2-CF-001:** THE model id SHALL be resolved from the `AGENT_MODEL_DEFAULT` function secret; source code SHALL NOT hardcode a model id.
- **FR-P2-CF-002:** THE model API key + base URL SHALL be Supabase function secrets (op-managed); they SHALL NEVER appear in the repo or env files.
- **FR-P2-CF-003:** THE deputy capability SHALL be feature-flagged (`SHOW_ASSISTANT`); flag-off SHALL remove the panel, FAB, top-bar button, and the edge-function config blocks stay `verify_jwt=false` (handler enforces).

**Grounding (binding NFR, D5)**
- **FR-P2-GR-001:** THE system prompt SHALL bind the deputy to **grounded answers** (query before answering; empty/failed read → say so and stop; `as-of` on non-live reporting figures).
- **FR-P2-GR-002:** A test SHALL assert the prompt contains each grounding rule; a test SHALL assert an empty read yields a tool_result the model must ground on (behavioral compliance is Director/live-verify).

### Acceptance criteria (Given/When/Then) — each owned by ONE test at the lowest layer

- **AC-P2-RT-001 (Unit, Vitest):** GIVEN a `query_entity` call for `tasks` with `columns:['title']`, WHEN the caller-JWT client returns 3 rows, THEN the action returns `{rowCount:3, rows:[...]}`. — FR-RT-003/004/005
- **AC-P2-RT-002 (Unit):** GIVEN `query_entity` called with `entity:'not_real'`, WHEN run, THEN it returns `{error:'unknown entity: not_real'}` without calling `ctx.supabase`. — FR-RT-003
- **AC-P2-RT-003 (Unit):** GIVEN a `query_entity` call with `columns:['secret_col']` not in `allowedColumns`, WHEN run, THEN it returns `{error:'unknown column: secret_col ...'}`. — FR-RT-003
- **AC-P2-RT-004 (Unit):** GIVEN `limit:9999`, WHEN run, THEN the dispatched `.limit()` receives `50` (the cap). — FR-RT-005
- **AC-P2-RT-005 (pgTAP):** GIVEN two same-org people, WHEN person B's caller-JWT queries `tasks`, THEN RLS returns only rows B may see (never A's owner-private rows); cross-org returns 0. — FR-RT-004 (proven via the deputy-invariant test AC-DI-001 over the same RLS).

- **AC-P2-WT-001 (Unit):** GIVEN a `create_task` tool-call with valid args, WHEN the handler dispatches, THEN it emits `status{status:'needs-approval', pendingId, humanSummary, structuredArgs}` and ENDS the stream (no insert). — FR-WT-001/002
- **AC-P2-WT-002 (Unit):** GIVEN a `decision{verdict:'approve'}` re-POST for a pending `create_task`, WHEN the caller is authorized, THEN the handler inserts a `mos.tasks` row + a `created` `mos.task_events` row via the caller-JWT client with `created_by = <caller person_id>`, and emits `tool` + `system{event:'write_resolved', decision:'approved'}`. — FR-WT-003/004
- **AC-P2-WT-003 (Unit):** GIVEN a `decision{verdict:'reject'}`, WHEN handled, THEN no insert occurs and a rejection `tool_result` is appended. — FR-WT-003
- **AC-P2-WT-004 (Unit):** GIVEN a `create_task` approve where the model supplied `createdBy:'<forged>'`, WHEN executed, THEN the persisted row's `created_by` is the JWT `person_id`, not the forged value. — FR-WT-004
- **AC-P2-WT-005 (Unit):** GIVEN the tool catalog, WHEN enumerated, THEN it contains exactly `query_entity`, `create_task`, `post_update`, `compose_view` — no provisioning tool. — FR-WT-005

- **AC-P2-CV-001 (Unit):** GIVEN a compose request with a valid prompt, WHEN the mocked model returns a valid spec, THEN the handler returns `200` with `{spec, repairAttempts:0, tokensUsed}` AND `compileCompositionSpec` was called server-side (spy). — FR-CV-001/002
- **AC-P2-CV-002 (Unit):** GIVEN the mocked model returns a spec that throws `ValidationError('UNKNOWN_ENTITY')`, WHEN repair attempt 1 succeeds, THEN the handler returns `200` with `repairAttempts:1`. — FR-CV-003
- **AC-P2-CV-003 (Unit):** GIVEN the mocked model returns invalid specs for all 3 attempts, WHEN run, THEN the handler returns `422 REPAIR_EXHAUSTED` with the validation error code. — FR-CV-003
- **AC-P2-CV-004 (Unit):** GIVEN `body.orgId !== <jwt org_id>`, WHEN the handler runs, THEN it returns `400` before any model call. — FR-CV-004

- **AC-P2-DI-001 (pgTAP):** GIVEN a caller-JWT bound to org X person P, WHEN the deputy reads any agent/business table, THEN a cross-org (org Y) row is invisible and a same-org other-owner row is invisible; the deputy path is structurally caller-JWT only (no `service_role` symbol reachable from `handler.ts`). — FR-DI-001/002/003
- **AC-P2-DI-002 (Unit):** GIVEN the handler `HandlerDeps`, WHEN typechecked, THEN there is no `service_role`/`verifierClient` field on `HandlerDeps` or `DeputyContext` (grep assertion in a test). — FR-DI-001/002

- **AC-P2-PS-001 (pgTAP):** GIVEN an authenticated caller, WHEN they INSERT into `mos.agent_threads`, THEN the row is stamped `org_id`/`owner_id` from the JWT (client sends neither) and a cross-org caller cannot select it. — FR-PS-001/004
- **AC-P2-PS-002 (pgTAP):** GIVEN an owner's `agent_events` row, WHEN a non-owner (same org, incl. admin) attempts SELECT, THEN 0 rows. — FR-PS-004
- **AC-P2-PS-003 (pgTAP):** GIVEN an owner's assistant event, WHEN they UPDATE any column other than `rating`/`downvote_reason`, THEN the trigger raises `42501`. — FR-PS-002
- **AC-P2-PS-004 (pgTAP):** GIVEN two events inserted with the same `(run_id, seq)`, THEN the second INSERT fails (unique constraint). — FR-PS-003

- **AC-P2-OB-001 (Unit):** GIVEN a `type:'tool'` event with payload `{name:'query_entity', input:{...}, result:{rowCount:3,...}}`, WHEN persisted via `withPersistence`, THEN the `agent_events` INSERT payload carries `tool_name='query_entity'`, a non-empty `tool_args_hash`, and `tool_status='completed'` in the SAME insert (mock spy asserts all three fields on one `.insert({...})` call). — FR-OB-001

- **AC-P2-AP-001 (Unit/RTL):** GIVEN `SHOW_ASSISTANT=true` and an authenticated shell, WHEN rendered, THEN a top-bar button (desktop) and a FAB (narrow) both appear; clicking either opens the slide-over. — FR-AP-001/002
- **AC-P2-AP-002 (RTL):** GIVEN the panel open then closed, WHEN reopened, THEN the prior transcript is still present (keep-mounted). — FR-AP-003
- **AC-P2-AP-003 (RTL):** GIVEN an assistant reply, WHEN rendered, THEN the DOM contains no `dangerouslySetInnerHTML` artifact (no `<div dangerouslySetInnerHTML>`; text is in a text node). — FR-AP-004
- **AC-P2-AP-004 (Unit):** GIVEN the i18n catalog, WHEN `locale:'id'`, THEN every assistant-panel key resolves to an `id` string (no missing-key fallback to the key itself for the panel's keys). — FR-AP-005
- **AC-P2-AP-005 (Unit):** GIVEN `SHOW_ASSISTANT=false`, WHEN the shell renders, THEN neither the button, the FAB, nor the panel mounts. — FR-CF-003

- **AC-P2-CF-001 (Unit):** GIVEN `AGENT_MODEL_DEFAULT` unset, WHEN `index.ts` resolves the model, THEN the function returns `502 MODEL_NOT_CONFIGURED`; AND `grep -RIn 'claude-sonnet-5\|deepseek\|openrouter\|anthropic' supabase/functions` returns only the secrets-runbook doc (no source literal). — FR-CF-001/002/D4
- **AC-P2-CF-002 (Unit):** GIVEN the viewspec firewall test extended to `supabase/functions/**`, WHEN run, THEN zero external vendor brand names appear in ported artifacts. — D4 firewall.

- **AC-P2-GR-001 (Unit):** GIVEN `buildAgentSystemPrompt(...)`, WHEN its output is inspected, THEN it contains the substrings anchoring each grounding rule: "query", "no data", "as-of"/"snapshot_as_of", and "do not" recall from memory. — FR-GR-001
- **AC-P2-GR-002 (Unit):** GIVEN a handler run where `query_entity` returns `{rowCount:0, rows:[]}`, WHEN the round completes, THEN a `role:'tool'` message carrying the empty result was appended to `messages` (the model's next turn must ground on it); the system prompt already instructs the "say so + stop" reply. — FR-GR-002
- **AC-P2-GR-003 (Director/live-verify, NOT CI):** GIVEN a real `claude-sonnet-5` deputy on staging, WHEN asked "what was our revenue last week?" with NO prior tool call, THEN the deputy calls `query_entity` on `sales_daily_revenue` and cites the `snapshot_as_of`; WHEN the read returns empty, THEN the deputy replies it has no data and stops. — FR-GR-001/002 (residual risk §10).

---

## 3. Tasks

Conventions: every task names exact paths, the real code/changes, the ACs it satisfies, and the verify command. "Port `<PMO path>` adapting `<deltas>`" is a concrete instruction — the PMO file is READ-ONLY reference the implementer reads in full; only the deltas are inlined here. Run Vitest/pgTest from `mos-app/` and `supabase/` respectively unless noted.

### Phase A — Edge-function shared substrate (`supabase/functions/_shared/`)

**T1 — `supabase/functions/deno.json` (import map) + `supabase/config.toml` function blocks**
Create `supabase/functions/deno.json`:
```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@^2.108.0"
  }
}
```
(MOS uses bare relative imports to `mos-app/src/lib/viewspec/**` and the function-local modules; NO `@/` alias — Deno has no Vite alias. No `zod` — PMO used plain JSON Schema objects, MOS keeps that.)
Append to `supabase/config.toml` (after the `[analytics]` block):
```toml
[functions.agent-chat]
verify_jwt = false   # handler verifies JWT to return a typed 401 + stream a typed terminal status
[functions.compose-view]
verify_jwt = false   # handler verifies JWT to return a typed 401/400/422
```
- ACs: — (infra). Verify: `supabase functions list` (local) shows both; `deno check supabase/functions/agent-chat/index.ts` typechecks (pre-deploy gate).
- Verify: `cat supabase/functions/deno.json && grep -A2 'functions.agent-chat' supabase/config.toml`.

**T2 — `_shared/modelClient.ts` (vendor-neutral port — types only)**
Port verbatim from `PMO/supabase/functions/_shared/modelClient.ts` (`ModelMessage`, `ModelToolCall`, `ModelTool`, `ModelClientParams`, `ModelUsage`, `ModelResponse`, `ModelClient`). No changes — it is already provider-neutral (OpenAI chat-completions shape). Pure types; importable in Vitest.
- ACs: supports AC-CV-001..004, AC-RT-*. Verify: `npx vitest run src/lib/agent/modelClient.shape.test.ts` (a shape test asserting `ModelClient.create` is the only member).

**T3 — `_shared/modelResolution.ts` (NO hardcoded default model — D4/FR-CF-001)**
```ts
// Pure: takes a plain object, not Deno.env. Importable in Vitest.
export interface ModelEnv { AGENT_MODEL_DEFAULT?: string }
/** Returns the configured model id, or '' when unset (caller fails loud with 502 MODEL_NOT_CONFIGURED). */
export function resolveDefaultModel(env: ModelEnv): string {
  return env.AGENT_MODEL_DEFAULT ?? '';
}
/** compose-view may override; falls back to the default (still '' when neither is set). */
export function resolveComposeModel(env: ModelEnv & { AGENT_MODEL_COMPOSE?: string }): string {
  return env.AGENT_MODEL_COMPOSE ?? resolveDefaultModel(env);
}
```
(Contrast PMO which hardcodes `DEFAULT_MODEL = 'deepseek/deepseek-v4-flash'`. MOS hardcodes NOTHING — D4.)
- ACs: AC-CF-001. Verify: `npx vitest run src/lib/agent/modelResolution.test.ts` (asserts unset → `''`, set → echoed).

**T4 — `_shared/chatCompletionsClient.ts` (generic transport — D4 firewall)**
Port `PMO/_shared/openRouterModelClient.ts` adapting: (1) rename class `OpenRouterModelClient` → `ChatCompletionsClient`; (2) replace hardcoded `OPENROUTER_URL` with `baseUrl` from ctor; (3) drop the `provider: { order: ['DeepInfra'], allow_fallbacks: true }` body field (MOS does no provider routing); (4) keep the `AbortController` 30s timeout, `isValidChoice` shape guard, and the "never surface raw parse error/body" scrubbing. Ctor:
```ts
export interface ChatCompletionsClientOptions { apiKey: string; baseUrl: string }
export class ChatCompletionsClient implements ModelClient {
  constructor(private readonly opts: ChatCompletionsClientOptions) {}
  async create(params: ModelClientParams): Promise<ModelResponse> { /* POST ${opts.baseUrl}/chat/completions */ }
}
```
- ACs: supports AC-CF-002. Verify: `npx vitest run src/lib/agent/chatCompletionsClient.test.ts` (fetch mocked: 200 → ModelResponse; non-2xx → `Error('...: <status>')`; malformed body → `Error('response malformed')`; request includes `Authorization: Bearer <key>`).

**T5 — `_shared/errorLog.ts`**
Port verbatim from `PMO/_shared/errorLog.ts` (`logStructuredError({fn, errorCode})` → `console.error` with structured shape). Used only by `index.ts` glue.
- Verify: `npx vitest run src/lib/agent/errorLog.test.ts`.

### Phase B — compose-view edge function (single LLM call site + server-side re-validation)

**T6 — `compose-view/schema.ts` — `COMPOSITION_SPEC_SCHEMA`**
Port `PMO/compose-view/schema.ts`. Adapt: the entity enum is built from the MOS `ENTITY_WHITELIST` keys (`tasks|weekly_updates|objectives|work_lines|people|business_units|sales_daily_revenue|sales_margin_daily`) — import `ENTITY_WHITELIST` from `../../../mos-app/src/lib/viewspec/types.ts` and derive `Object.keys(...)` (do NOT hand-list; the firewall test guards drift). Keep the `compose_view` tool-forcing schema shape PMO uses.
- ACs: supports AC-CV-001. Verify: `npx vitest run src/lib/agent/composeViewSchema.test.ts` (enum matches `Object.keys(ENTITY_WHITELIST)`).

> **Director build-note (2026-07-04): Deno-compatibility trap on the registry import.** `registry.ts`
> imports React primitive components (and transitively their CSS) — importing it from a Deno edge
> function (`registry.keys()` in T7) will fail `deno check`/bundle. Before T7: split a pure
> **registry-manifest** module (`viewspec/registry-manifest.ts` — names + descriptor metadata only,
> zero React/CSS imports); `registry.ts` re-exports from it and binds components; edge functions
> import ONLY the manifest. Same discipline for anything else the functions pull from `viewspec/`
> (types/compiler/schema are already pure — keep them that way; the firewall/vitest gates should
> assert the manifest stays React-free via an import-graph test).

**T7 — `compose-view/prompt.ts` — `buildSystemPrompt(whitelist, primitives, orgId, maxPanels)`**
Port `PMO/compose-view/prompt.ts` adapting: reference MOS entity names/columns from the imported `ENTITY_WHITELIST` (schema metadata only — no data rows, NFR-AS-SEC-004), MOS primitive names from `registry.keys()`, and the MOS `$current_person`/`$current_org`/`$today` tokens (NOT PMO's `$current_user`). Pure.
- Verify: `npx vitest run src/lib/agent/composePrompt.test.ts` (output contains each entity key + the token list; no PMO brand).

**T8 — `compose-view/composeSpec.ts` — the compose+repair loop + SERVER-SIDE re-validation (FR-CV-002, Sec-M1 carry-in)**
Port `PMO/compose-view/composeSpec.ts` adapting ONE line: the compile call uses the MOS compiler + MOS context naming:
```ts
import { compileCompositionSpec } from '../../../mos-app/src/lib/viewspec/compiler.ts';
import { ValidationError, ENTITY_WHITELIST, MAX_PANELS_PER_VIEW } from '../../../mos-app/src/lib/viewspec/types.ts';
import { registry } from '../../../mos-app/src/lib/viewspec/registry.ts';
// ...
const ctx = { personId: deps.personId, orgId };   // MOS naming (PMO used userId)
// ...
compileCompositionSpec(spec, ctx);   // THE server-side re-validation — P1 Sec-M1 carry-in
```
Keep `MAX_REPAIR_ATTEMPTS = 2`, the `ComposeSpecError{code:'REPAIR_EXHAUSTED'|'UPSTREAM_ERROR'}`, the tool-forcing `callModel`, and the bounded repair loop feeding `err.detail` back as a single `role:'user'` turn. `ComposeSpecDeps = { modelClient, personId, model }` (rename PMO's `userId` → `personId`).
- ACs: AC-CV-001/002/003. Verify: `npx vitest run src/lib/agent/composeSpec.test.ts` (mocked ModelClient: valid-first-try → repairAttempts 0; invalid-then-valid → 1; always-invalid → throws `REPAIR_EXHAUSTED` with code; the `compileCompositionSpec` spy is called).

**T9 — `compose-view/handler.ts` — pure HTTP-gate handler**
Port `PMO/compose-view/handler.ts` adapting: (1) drop the `profiles` org-match gate — replace with a JWT-decoded org match (the `index.ts` decodes `org_id` from the JWT and passes it as `deps.orgId`-equivalent; the handler compares `req.orgId` to the deps-supplied caller org). Concretely the gate becomes:
```ts
// Gate (3): org match — caller org from the JWT (decoded by index.ts), NOT a profiles lookup (D1)
if (req.orgId !== deps.callerOrgId) {
  return { status: 400, body: { status: 400, error: 'BAD_REQUEST', detail: 'orgId' } };
}
```
Add `callerOrgId: string` to `HandlerDeps`. Drop `rateGuard` + `usage` deps for P2 (P3 threads them; leave a `// P3:` comment). Keep the 401/400/422/502 mapping + logging discipline (log only `{errorCode, repairAttempts, tokensUsed}`, never prompt/spec).
- ACs: AC-CV-001..004. Verify: `npx vitest run src/lib/agent/composeViewHandler.test.ts` (empty userId → 401; empty prompt → 400; org mismatch → 400 before model; valid → 200; REPAIR_EXHAUSTED → 422; model throw → 502).

**T10 — `compose-view/index.ts` — Deno.serve glue (integration-only, D7)**
Port `PMO/compose-view/index.ts` adapting: (1) JWT verification stays `verifierClient.auth.getUser(jwt)` (service_role, FR-DI-002); (2) **decode org_id + person_id from the JWT payload** (D1) via a `decodeJwtClaims(jwt)` helper (base64url-decode payload segment → `{org_id?, person_id?, access_roles?}`); (3) build `callerClient` (anon + `Bearer <jwt>`); (4) read `AGENT_MODEL_API_KEY` + `AGENT_MODEL_BASE_URL` + `AGENT_MODEL_DEFAULT` from `Deno.env`; (5) if `AGENT_MODEL_DEFAULT===''` OR key/baseUrl missing → return `502 MODEL_NOT_CONFIGURED` / `502 UPSTREAM_ERROR` (fail loud, FR-CF-001); (6) `new ChatCompletionsClient({apiKey, baseUrl})`; (7) delegate to `composeViewHandler(body, {modelClient, model, supabase: callerClient, userId, callerOrgId: decodedOrgId})`. CORS preflight identical. NOT unit-tested (D7).
```ts
function decodeJwtClaims(jwt: string): { org_id?: string; person_id?: string; access_roles?: string[] } {
  try {
    const payload = jwt.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
    return { org_id: json.org_id, person_id: json.person_id, access_roles: json.access_roles };
  } catch { return {}; }
}
```
- ACs: supports AC-CF-001 (the unset-model 502 path). Verify (pre-deploy, deno): `deno check supabase/functions/compose-view/index.ts`; live-verify: POST with a real JWT on staging.

### Phase C — agent-chat edge function (deputy loop + grounding + approve/deny)

**T11 — `mos-app/src/lib/viewspec/types.ts` — add `business_units` (8th entity, §3.1)**
Add to `WhitelistedEntity` union: `| 'business_units'`. Add to `ENTITY_WHITELIST`:
```ts
business_units: {
  schema: 'shared', table: 'business_units', repositoryMethod: 'directory.listBusinessUnits',
  allowedColumns: new Set(['id', 'name', 'created_at', 'updated_at']),
  numericColumns: new Set<string>(),
  dateColumns: new Set(['created_at', 'updated_at']),
  groupableColumns: new Set<string>(),
  requiresTimeRange: false,
},
```
(The deputy needs to resolve a BU id for `create_task`; exposing `shared.business_units` as a read entity is the honest, single-whitelist answer — D2. `org_id` stays absent from `allowedColumns`.)
- ACs: supports AC-RT-003/WT-002. Verify: `npx vitest run src/lib/viewspec/` (compiler/registry/firewall tests green with 8 entities; the firewall test asserts `Object.keys(ENTITY_WHITELIST)` has no `org_id` in any `allowedColumns`).

**T12 — `agent-chat/readEntities.ts` (leaf module, cycle-breaker)**
Port `PMO/agent-chat/readEntities.ts` adapting: `AGENT_READ_ENTITIES` is derived from the MOS whitelist, NOT hand-listed:
```ts
import { ENTITY_WHITELIST } from '../../../mos-app/src/lib/viewspec/types.ts';
export const AGENT_READ_ENTITIES = Object.keys(ENTITY_WHITELIST) as readonly string[]; // 8 MOS entities
export const AGENT_READ_ROW_CAP = 50;
export type AgentReadEntity = string; // validated against ENTITY_WHITELIST at runtime
```
(Dependency-free leaf — keeps the PMO cycle-break reason.)
- ACs: AC-RT-003/005. Verify: `npx vitest run src/lib/agent/readEntities.test.ts` (equals `Object.keys(ENTITY_WHITELIST)`; cap is 50).

**T13 — `agent-chat/schema.ts` — tool input schemas**
Port `PMO/agent-chat/schema.ts` keeping ONLY: `QUERY_ENTITY_SCHEMA` (built from `AGENT_READ_ENTITIES`), `CREATE_TASK_SCHEMA`, `POST_UPDATE_SCHEMA`, `COMPOSE_VIEW_INPUT_SCHEMA`. DROP `NOTIFY_SCHEMA`, `CREATE_AUTOMATION_SCHEMA`, `ASK_USER_SCHEMA` (P3). `CREATE_TASK_SCHEMA`:
```ts
export const CREATE_TASK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title','businessUnitId','responsiblePersonId','accountablePersonId'],
  properties: {
    title: { type: 'string', maxLength: 300 },
    businessUnitId: { type: 'string', description: 'UUID of a shared.business_units row (the caller may query it).' },
    responsiblePersonId: { type: 'string', description: 'UUID of a shared.people row (R person).' },
    accountablePersonId: { type: 'string', description: 'UUID of a shared.people row (A person).' },
    dueDate: { type: 'string', description: 'ISO date; optional.' },
    objectiveId: { type: 'string' }, workLineId: { type: 'string' },
    description: { type: 'string', maxLength: 2000 },
  },
};
export const POST_UPDATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['label','progress'],
  properties: {
    label: { type: 'string', maxLength: 300, description: 'One update line — what was worked on.' },
    progress: { type: 'string', enum: ['done','in_progress','blocked'] },
    weekStart: { type: 'string', description: 'ISO Monday date; defaults to current week (Asia/Jakarta).' },
  },
};
```
(`createdBy`/author are NEVER model inputs — FR-WT-004.)
- ACs: AC-WT-001/005. Verify: `npx vitest run src/lib/agent/agentSchema.test.ts`.

**T14 — `agent-chat/prompt.ts` — GROUNDING system prompt (FR-GR-001, the D5 delta)**
Write fresh (PMO's prompt lacks grounding). `buildAgentSystemPrompt(entities, rowCap): string` returns:
```
You are a deputy assistant for the Gordi management operating system. You act only within what
this user can see — your reads are scoped by their own permissions (Postgres RLS); you cannot
read other organisations' data.

## GROUNDED ANSWERS (binding)
1. A data question MUST be answered from a query_entity tool result returned in THIS conversation.
   NEVER answer a data question from memory/training data — always query first.
2. If a query_entity result has rowCount 0 OR returns {error}, you MUST say you have no data
   (or that the read failed) and STOP. NEVER estimate, infer, or fill the gap.
3. Any figure from a reporting entity (sales_daily_revenue, sales_margin_daily) is a snapshot,
   NOT live data — you MUST cite its snapshot_as_of date when you quote it. Never present a
   reporting figure as current.

## TOOLS
- query_entity: { entity, columns?, filter?:{column,op:'eq'|'in',value}, limit? }. Entities/columns
  are restricted to the whitelist below; row cap is <rowCap>. Returns {rowCount, rows} or {error}.
- create_task / post_update: PROPOSE a write; the user approves or denies. Never claim a write succeeded
  until the user has approved and the system confirms it.

## AVAILABLE ENTITIES (schema metadata only — no data rows)
<entityDescriptions: key, table, allowed columns, requiredFilter?>

When you have enough to answer, respond in plain text.
```
(The `<entityDescriptions>` block is built from `ENTITY_WHITELIST` like PMO's `prompt.ts`, but the MOS entity set + the grounding block are the deltas.) Pure.
- ACs: AC-GR-001. Verify: `npx vitest run src/lib/agent/agentPrompt.test.ts` — assert the output contains "query", "rowCount 0", "snapshot_as_of", "do not"/"NEVER answer a data question from memory".

**T15 — `agent-chat/persistence.ts` — caller-JWT persistence helpers + tool-arg hash**
Port `PMO/agent-chat/persistence.ts` adapting: the supabase calls go to `mos.`-schema tables via the schema-scoped client. The `HandlerSupabaseLike` interface must add a `.schema(s)` layer (MOS delta — the deputy client is schema-pinned to `shared` by default; persistence writes to `mos`). Concretely the interface gains:
```ts
from(table: string): { /* as PMO, for shared-schema reads */ ... }
// PLUS a schema selector for mos-schema writes:
schema(s: string): { from(t: string): { insert(r: object): { select(): { single(): PromiseLike<...> } }; update(p: object): { eq(c:string,v:string): PromiseLike<...> }; select(c:string): { eq(...)...; limit(...)... } } }
```
(The real `@supabase/supabase-js` client satisfies this — `.schema()` is its native method.) Port `canonicalize` + `hashToolArgs` (sha-256 of sorted-key JSON, prototype-pollution-safe) VERBATIM — they are the OB-001 authority. Port `createThreadAndRun`, `insertEvent`, `heartbeat`, `setRunStatus`, `loadMaxSeq`, `loadJournaledWrites` adapting each `.from('agent_threads')` → `.schema('mos').from('agent_threads')` etc. Keep the fail-safe error swallowing (NFR-AGP-SEC-005). `ownerId`/`orgId` come from the decoded JWT (passed in `PersistenceDeps` by `index.ts`).
- ACs: AC-OB-001, AC-PS-*. Verify: `npx vitest run src/lib/agent/persistence.test.ts` (hashToolArgs determinism + proto-pollution safety; insertEvent spy asserts `tool_name`/`tool_args_hash`/`tool_status` on the SAME insert; schema-scoped calls).

**T16 — `agent-chat/actions.ts` — the tool catalog v1 (query_entity + create_task + post_update + compose_view)**
Port `PMO/agent-chat/actions.ts` adapting each action:

(a) `queryEntityAction` (confirm:false): port `runQueryEntity` adapting dispatch to schema-scoped:
```ts
const entry = ENTITY_WHITELIST[entityKey];
// schema-scoped read (MOS delta vs PMO single-schema)
let query = ctx.supabase.schema(entry.schema).from(entry.table).select(colsStr);
// ...filter/limit/timeout as PMO...
```
Keep the 5 validation steps (entity whitelist, column whitelist, filter-column whitelist, requiredFilter, row cap). `DeputyContext.supabase` must expose `.schema()` (the port's `SupabaseLike` gains it).

(b) `createTaskAction` (confirm:true): `validate` against `CREATE_TASK_SCHEMA`; `summarize(args)` returns a server-composed string e.g. ``Create task "${args.title}" (R: <person>, A: <person>, BU: <bu>)`` — NEVER model-generated (FR-WT-002). `run(validatedArgs, ctx)`:
```ts
// createdBy = caller person_id (FR-WT-004) — never the model's
const { data, error } = await ctx.supabase.schema('mos').from('tasks')
  .insert({ title, business_unit_id, responsible_person_id, accountable_person_id, created_by: ctx.personId,
            due_date, objective_id, work_line_id, description, consulted_person_ids: [], informed_person_ids: [] })
  .select('id').single();
if (error) return { error: 'write_failed' };
const id = data.id;
await ctx.supabase.schema('mos').from('task_events')
  .insert({ task_id: id, actor: ctx.personId, event_type: 'created' });   // mirrors createTask DAL
return { id };
```
(`ctx` gains `personId` — the JWT-decoded person_id.)

(c) `postUpdateAction` (confirm:true): `validate` against `POST_UPDATE_SCHEMA`; `summarize` → ``Add update line "${args.label}" (${args.progress}) to your week of <weekStart>``. `run`:
```ts
const weekStart = args.weekStart ?? currentMondayJakarta();
// ensure a draft weekly_update exists for (personId, weekStart)
let { data: upd } = await ctx.supabase.schema('mos').from('weekly_updates')
  .select('id,status').eq('person_id', ctx.personId).eq('week_start', weekStart).maybeSingle();
let updateId;
if (!upd) {
  const ins = await ctx.supabase.schema('mos').from('weekly_updates')
    .insert({ person_id: ctx.personId, week_start: weekStart, summary: '', status: 'draft', created_by: ctx.personId })
    .select('id').single();
  updateId = ins.data.id;
} else { updateId = upd.id; }   // RLS requires it be the caller's own + draft
const { data, error } = await ctx.supabase.schema('mos').from('weekly_update_items')
  .insert({ weekly_update_id: updateId, label: args.label, progress: args.progress, position: nextPosition })
  .select('id').single();
```
(Mirrors `weekly-updates.ts` addLine + upsertDraft; `created_by` = personId.)

(d) `composeViewAction` + `runComposeView`: port `PMO/actions.ts`'s `runComposeView` adapting it to call MOS `composeSpec` (T8) with `{ modelClient, personId: ctx.personId, model }`; emit `artifact{kind:'compose_view', spec, ...}` on success. Registered only when `deps.composeEnabled`.

Export `BASE_ACTIONS = [queryEntityAction, createTaskAction, postUpdateAction]` (NO notify/create_automation — P3).
- ACs: AC-RT-001..004, AC-WT-001/002/004/005, AC-OB-001 (via journal). Verify: `npx vitest run src/lib/agent/actions.test.ts` (read whitelist errors; create_task inserts w/ created_by=personId; post_update creates draft then item; compose delegates).

**T17 — `agent-chat/handler.ts` — the deputy loop (pure async generator)**
Port `PMO/agent-chat/handler.ts` SLIMMED to P2 scope:
- Keep: `HandlerDeps` (drop `rateGuard`, `usage` — leave `persistence`, `can`, `composeEnabled`); `MAX_TOOL_ROUNDS=8`; `runToolLoop` (single shared loop with the 3 divergences); `withPersistence` (journal in same insert — OB-001); `dispatchAction`/`dispatchActionForced`; `handleDecision` (stateless approve/deny); `agentChatHandler` gate order (401 → cancel → decision → tool loop).
- DROP: `handleAnswer` (ask_user is P3), `buildDataTableWidgetFromQueryResult` (ADR-0045 widget is P3), `buildGroundingHint`/`narrowEntityScope` for `entity` context (ADR-0045 live-context is P3 — keep `RunContext.route` only, no entity prompt injection in P2).
- Adapt `DeputyContext`: add `personId`; org from JWT decode. The org/role gate (PMO gate 2 profiles lookup) becomes a **JWT-claim assertion** (D1): the handler receives `orgId`/`personId`/`accessRoles` in `HandlerDeps` (decoded by `index.ts`) — no DB lookup:
```ts
// Gate (2): deputy context from JWT claims (D1 — no profiles lookup)
const deputyCtx: DeputyContext = { jwt:'', userId: deps.userId, personId: deps.personId, orgId: deps.orgId, accessRoles: deps.accessRoles, supabase: deps.supabase };
```
- `getPermissionCheck`: map `create_task` → `{action:'create', entity:'task'}`; `post_update` → `{action:'create', entity:'weekly_update'}`; `can` is injected (P2 default `can = () => true` — RLS is the enforcement authority; `can` is a UX preflight seam for P3 role-gating).
- The `compose_view` dispatch branch + the read dispatch + the propose (needs-approval) branch + the decision (approve/deny + journal de-dupe) all port as-is, adapted to the MOS `DeputyContext.personId`.
- ACs: AC-WT-001/002/003, AC-GR-002, AC-DI-002, AC-OB-001. Verify: `npx vitest run src/lib/agent/handler.test.ts` + `handlerDecision.test.ts` + `handlerPersistence.test.ts` + `handlerDeputyInvariant.test.ts` (the last asserts no `service_role`/`verifierClient` field exists on `HandlerDeps`/`DeputyContext` via a typed grep).

**T18 — `agent-chat/index.ts` — Deno.serve glue + SSE stream (integration-only)**
Port `PMO/agent-chat/index.ts` adapting: (1) JWT verify via `verifierClient.auth.getUser` (FR-DI-002); (2) **decode claims** (D1) via the same `decodeJwtClaims` from T10 (extract to `_shared/jwt.ts` and reuse); (3) `callerClient` (anon + Bearer); (4) read `AGENT_MODEL_API_KEY`/`AGENT_MODEL_BASE_URL`/`AGENT_MODEL_DEFAULT` → `502` if any missing/empty; (5) `persistenceEnabled = Deno.env.get('AGENT_PERSISTENCE') !== 'false'` (default ON); (6) `HandlerDeps` WITHOUT `rateGuard`/`usage` (P3); (7) pipe `agentChatHandler` → SSE `ReadableStream` (`text/event-stream`), keep the dropped-socket continuation (enqueue error swallowed, loop drains to completion for persistence). NOT unit-tested.
- ACs: supports AC-CF-001. Verify (pre-deploy): `deno check supabase/functions/agent-chat/index.ts`.

### Phase D — Persistence migration + pgTAP

**T19 — `supabase/migrations/20260705000001_mos_agent_persistence.sql`**
Port `PMO/0046_agent_persistence.sql` adapting to MOS: (a) schema-qualify `mos.agent_threads`/`mos.agent_runs`/`mos.agent_events`; (b) `org_id ... default shared.current_org_id()` and `owner_id ... default shared.current_person_id()` (NOT PMO's `auth_org_id()`/`auth.uid()`/`profiles(id)` — MOS uses people, `references shared.people(id)` for owner_id, no profiles FK); (c) seed-org default removed (MOS has real orgs — `default shared.current_org_id()` with `not null` + `WITH CHECK`); (d) policies use `shared.current_org_id()`/`shared.current_person_id()`; (e) keep the `(run_id, seq)` unique constraint, the three hot-path indexes, and the `agent_events_feedback_only` column-pin trigger + `42501` raise. NO admin cross-owner read policy (FR-PS-004). `GRANT select, insert, update ON mos.agent_* TO authenticated` (no delete — events are append-only; threads/runs soft-archive via a future `archived_at`; for P2 runs are owner-updateable for status only). Include a manual-rollback block at the foot (mirrors the P1 migration style).
- ACs: AC-PS-001..004. Verify: `supabase db reset` (local) clean; then pgTAP below.

**T20 — pgTAP `supabase/migrations/20260705000001_mos_agent_persistence.test.sql`**
Write pgTAP tests (run via `supabase test db`) covering:
- AC-PS-001: caller INSERT into `mos.agent_threads` without sending `org_id`/`owner_id` → row stamped from JWT; a second org's caller SELECT → 0 rows.
- AC-PS-002: owner's `agent_events` row → same-org admin SELECT → 0 rows (owner-private).
- AC-PS-003: owner UPDATE of `text`/`payload`/`seq` on their assistant event → `42501`; UPDATE of `rating` only → ok.
- AC-PS-004: two inserts same `(run_id, seq)` → second fails (unique).
- AC-DI-001: a caller-JWT bound to org X querying `mos.agent_events` for an org-Y row → 0 rows (the deputy-invariant: RLS denies cross-org under the caller JWT).
(Mirror the P1 `mos_user_views` pgTAP style — `tests.begin`, `set role`, `set_config('request.jwt.claims', ...)`, `lives_ok`/`throws_ok`.)
- Verify: `supabase test db` green for the new file (and the full suite still green).

### Phase E — Client runtime port + adapter

**T21 — `mos-app/src/lib/agent/runtime/port.ts` — pure type seam**
Port `PMO/pmo-portal/src/lib/agent/runtime/port.ts` slimmed to P2: keep `AgentRunStatus`, `AgentRun`, `AgentEventType`, `AgentEvent`, `RunContext` (route only — drop `entity`/`selection` for P3), `SupabaseLike` (+ `.schema()` for the deputy), `DeputyContext` (+ `personId`, `accessRoles`), `AgentAction`, `AgentRuntime`, `RunStatusPayload`, `NeedsApprovalPayload`, `WriteResolvedPayload`, `AgentAnswer`, `SupabaseLikeWithWrites`. DROP `QuestionPayload` (P3). Pure types.
- ACs: supports AP-* (the panel consumes these). Verify: `npx vitest run src/lib/agent/runtime/port.test.ts` (type/shape compile test).

**T22 — `mos-app/src/lib/agent/runtime/transport.ts` — SSE codec + request shapes**
Port `PMO/.../transport.ts` slimmed: keep `ConversationMessage`, `ContentBlock`, `AgentDecision`, `AgentCancel`, `AgentChatRequest`, `AgentChatError`, `encodeSse`, `decodeSseStream`. DROP `AgentAnswer`-carry (P3 ask_user). Pure.
- ACs: supports AP-*. Verify: `npx vitest run src/lib/agent/runtime/transport.test.ts` (encodeSse round-trips; decodeSseStream splits on `\n\n`, skips malformed).

**T23 — `mos-app/src/lib/agent/runtime/mosNativeRuntime.ts` — the adapter**
Port `PMO/.../pmoNativeRuntime.ts` adapting the endpoint URLs to MOS edge-function names (`/functions/v1/agent-chat`, no compose-view direct call from the panel — compose_view is a deputy tool). The adapter implements `AgentRuntime`: `createRun` (POST agent-chat with `{messages:[{role:'user',content:goal}], context?}`), `followUp` (POST with `runId` + appended user message), `control(runId,'approve'|'reject'|'cancel', payload?)`, `subscribe(runId)` (POST agent-chat → `decodeSseStream(reader)`). Uses the MOS `supabase` client's session token in the `Authorization` header. The SSE stream is consumed via `fetch` + `response.body.getReader()` (NOT EventSource — POST/auth).
- ACs: supports AP-*. Verify: `npx vitest run src/lib/agent/runtime/mosNativeRuntime.test.ts` (fetch mocked; createRun POSTs the right body; subscribe decodes a 2-event SSE stream into an array).

**T24 — `mos-app/src/lib/agent/runtime/AgentRuntimeContext.tsx` + `AgentRuntimeProvider.tsx`**
Port the PMO context + provider adapting: the provider holds `{runtime, open, openPanel, closePanel, togglePanel}`; `runtime` is a singleton `MosNativeRuntime` (or `null` when `SHOW_ASSISTANT=false`); `open` persisted to `localStorage` ('mos.assistant.open') mirroring the locale-toggle pattern. Wrap in `AppShell` (T29).
- ACs: AC-AP-002/005. Verify: `npx vitest run src/lib/agent/runtime/AgentRuntimeProvider.test.tsx`.

### Phase F — `useAssistantPanel` hook

**T25 — `mos-app/src/hooks/useAssistantPanel.ts`**
Port `PMO/.../useAssistantPanel.ts` SLIMMED to P2: keep `RunPhase` (drop `'out-of-credits'` — credits are P3; map RATE_LIMITED to `'error'` for P2), `transcript`, `phase`, `runId`, `chipStateMap`, `send`/`stop`/`retry`/`newConversation`/`approve`/`deny`/`openThread`, `drain` (the SSE consumer that updates transcript + chip state + persists `lastProgressAt`), `isStuck` + the 5s heartbeat poll, `mergeAssistantEvent`. DROP `answerQuestion`/`answeredMap`/`hasPendingQuestion` (P3 ask_user), the analytics/PostHog calls (MOS has no analytics SDK — drop or stub), and the credits branch. Keep the drain's handling of `status{needs-approval}` → `chipStateMap[pid]='pending'`, `tool{pendingId}` → `'approved'`, `system{write_resolved}` → approved/denied.
- ACs: AC-AP-002, AC-WT-001/002 (chip flow). Verify: `npx vitest run src/hooks/useAssistantPanel.test.ts` (mocked runtime: send → running → needs-approval → approve → tool+write_resolved → idle; transcript survives across phases).

### Phase G — AssistantPanel UI (slide-over + FAB, i18n, phone-first)

**T26 — i18n keys (en + id) — `mos-app/src/i18n/messages.ts`**
Add an `assistant` namespace with keys for: panel title, history button, new conversation, close, composer placeholder, send, stop, retry, empty-state suggestion chips (×3), streaming indicator ("Working…" / "Memproses…"), approval header ("A write action awaits your decision"), approval approve/deny button labels, the create_task/post_update summary templates (server-composed but the chip labels localize), error card title/cta, stuck-run banner. Every key in BOTH `en` and `id`.
- ACs: AC-AP-004/005. Verify: `npx vitest run src/i18n/messages.test.ts` (every `assistant.*` key present in both locales; no key resolves to itself under `id`).

**T27 — `mos-app/src/components/assistant/AssistantPanel.tsx` (slide-over)**
Port `PMO/.../AssistantPanel.tsx` adapting: (1) re-skin to MOS `DESIGN.md` tokens (One-Blue, DM Sans — NO PMO tailwind classes that leak PMO look; use MOS's existing `bg-card`/`border-border`/`text-foreground` design tokens already in the app); (2) desktop = right-side non-modal drawer `role="complementary"` w-400px; phone = full-screen modal sheet `role="dialog" aria-modal` with scrim + focus-trap + body-scroll-lock + background `inert`; (3) keep-mounted + `inert` when closed (FR-AP-003); (4) Esc closes (never cancels); (5) plain-text rendering — NO `dangerouslySetInnerHTML` (FR-AP-004); (6) all strings via `useT()` (T26). Sub-components: `Transcript`, `Composer`, `EmptyState`, `ApprovalChip`, `StuckRunBanner`, `ThreadList` (port + slim each; drop `QuestionChips`).
- ACs: AC-AP-001/002/003/004. Verify: `npx vitest run src/components/assistant/AssistantPanel.test.tsx` (opens on `open=true`; plain-text node assert; keep-mounted: close→open preserves transcript; Esc closes).

**T28 — `mos-app/src/components/assistant/AssistantFab.tsx` + top-bar button**
- `AssistantFab.tsx`: a circular FAB positioned `fixed bottom: calc(var(--tabbar-h) + 1rem); right: 1rem; z-[45]` (above the bottom tab bar — ADR-0019 D11 phone placement), shown only when `useIsNarrow()` AND `SHOW_ASSISTANT`. Calls `openPanel()`.
- Top-bar button: add to `mos-app/src/shell/top-bar.tsx` a button next to the search affordance (desktop only — `!isNarrow`), `aria-label={t('assistant.open')}`, calls `openPanel()`. Hidden when `SHOW_ASSISTANT=false`.
Both gate on `SHOW_ASSISTANT` (import from `config/features`).
- ACs: AC-AP-001/005, AC-CF-003. Verify: `npx vitest run src/shell/top-bar.test.tsx` + `src/components/assistant/AssistantFab.test.tsx` (button present desktop / FAB present narrow / both absent when flag off).

**T29 — wire into `AppShell` + flag**
In `mos-app/src/shell/app-shell.tsx`: wrap the shell tree in `<AgentRuntimeProvider>` (conditionally — only when `SHOW_ASSISTANT`, else a no-op provider so the rest is unchanged); render `<AssistantPanel />` once at the shell root (it self-gates visibility on `open`); render `<AssistantFab />` (self-gates on narrow+flag). Add `export const SHOW_ASSISTANT = false` to `mos-app/src/config/features.ts` (hide-first, FR-CF-003).
- ACs: AC-AP-001/005, AC-CF-003. Verify: `npx vitest run src/shell/app-shell.test.tsx` (panel + provider absent when flag off; present when on).

### Phase H — Grounding test harness (D5, binding)

**T30 — `mos-app/src/lib/agent/grounding.test.ts` (FR-GR-001/002, AC-GR-001/002)**
Two tests:
1. **Prompt contract (AC-GR-001):** assert `buildAgentSystemPrompt(AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP)` contains each anchoring substring: `"query_entity"`, `"rowCount 0"`, `"snapshot_as_of"`, and `"NEVER answer a data question from memory"`.
2. **Empty-read flow (AC-GR-002):** drive `agentChatHandler` with a mocked `ModelClient` whose first call returns a `query_entity` tool_call for `tasks` (empty timeRange → the deputy queries), the `ctx.supabase` mock returns `{data:[], error:null}` (rowCount 0); assert the handler appends a `role:'tool'` message whose content JSON includes `rowCount:0` (the model's next turn MUST ground on it), and that a second model call is made (the deputy continues to answer — and the prompt already binds it to say "no data"). Document in the test header that the model's textual compliance is AC-GR-003 (Director/live-verify).
- ACs: AC-GR-001/002. Verify: `npx vitest run src/lib/agent/grounding.test.ts`.

### Phase I — Firewall + final verification

**T31 — extend `viewspec-firewall.test.ts` to `supabase/functions/**` (D4)**
Extend the existing `mos-app/src/lib/viewspec/viewspec-firewall.test.ts` (or add a sibling `agent-firewall.test.ts`) that walks `supabase/functions/**` + `mos-app/src/lib/agent/**` and asserts zero source lines match a forbidden-brand pattern, plus the existing `service_role` code-usage + fixture-UUID guards. **Self-leak hazard (the existing test already documents this):** writing the brand names literally inside the test file is itself a leak — encode the forbidden patterns WITHOUT spelling them out (char-rotate / split-and-join / a base64 blob the test decodes internally), exactly as the existing test's header explains it deliberately does NOT name brands. Assert hits may appear only under `docs/`.
- ACs: AC-CF-002, D4. Verify: `npx vitest run src/lib/viewspec/viewspec-firewall.test.ts`.

**T32 — `mos-app/src/lib/agent/agentCatalog.test.ts` (FR-WT-005, AC-WT-005)**
Assert `BASE_ACTIONS.map(a=>a.name)` equals `['query_entity','create_task','post_update']` and that NO action's `run` calls a `SECURITY DEFINER`/`shared.admin_*` RPC (static scan of the action source strings).
- Verify: `npx vitest run src/lib/agent/agentCatalog.test.ts`.

**T33 — full suite + gates**
- `cd mos-app && npm run typecheck` (0 errors)
- `cd mos-app && npm run lint:ci` (0 errors, 0 warnings)
- `cd mos-app && npm test` (all green, incl. new agent tests; changed-file coverage ≥80%)
- `supabase db reset && supabase test db` (pgTAP green)
- `deno check supabase/functions/agent-chat/index.ts supabase/functions/compose-view/index.ts` (pre-deploy gate; run locally)
- Verify: all of the above exit 0.

### Phase J (stretch / carry-in) — DB-side aggregation RPC

**T34 (stretch) — `mos.aggregate_compiled(jsonb) RETURNS table` RPC + executor wiring**
Address the P1 truncation carry-in: a `mos.aggregate_compiled(compiled jsonb)` `SECURITY INVOKER` RPC that takes a `CompiledQuery`, builds a parameterized `SELECT <groupBy>, <agg>(<col>) ... WHERE <filters> GROUP BY <groupBy>`, and returns the reduced rows (uncapped by the 500 row limit). Wire `executor.ts`'s `executeCompiledQuery` to call it when `resolvedAggregate || resolvedGroupBy` is present (fall back to in-memory for non-aggregate). RLS: `SECURITY INVOKER` means base-table RLS still fires. **If cut for P2 scope:** move to a P2.1 follow-up; the in-memory reduction stays with its documented lower-bound caveat (P1 review item 6). Flag in Residual Risks.
- ACs: (new) AC-P2-RT-006 (aggregate over full predicate, not capped). Verify: pgTAP `aggregate_compiled.test.sql` (sum over 10k rows == uncapped total) + Vitest executor test.

---

## 4. AC → Task traceability

| AC | Owning task(s) | Layer |
|---|---|---|
| AC-RT-001..005 | T16, T12, T20 | Unit + pgTAP |
| AC-WT-001..005 | T16, T17, T32 | Unit |
| AC-CV-001..004 | T8, T9, T10 | Unit (+live) |
| AC-DI-001 | T20 (pgTAP) | pgTAP |
| AC-DI-002 | T17, T32 | Unit (typed grep) |
| AC-PS-001..004 | T19, T20 | pgTAP |
| AC-OB-001 | T15, T17 | Unit (insert spy) |
| AC-AP-001..005 | T27, T28, T29, T26 | Unit/RTL |
| AC-CF-001..003 | T3, T4, T10, T18, T29, T31 | Unit |
| AC-GR-001..002 | T14, T30 | Unit |
| AC-GR-003 | (Director/live-verify §7) | NOT CI |

## 5. Test strategy — what CI proves vs. what needs a live LLM

**CI (merge blockers, per AGENTS.md):**
- **Vitest (`npm test`):** every pure handler/adapter/panel/hook/prompt. Handlers imported from `mos-app/src/lib/agent/*.test.ts` via relative path to `supabase/functions/**` (D7 — they're authored dual-Deno/Node). Mocked `ModelClient` + mocked Supabase.
- **pgTAP (`supabase test db`):** RLS for `mos.agent_*` (AC-PS-*, AC-DI-001).
- **typecheck + lint:ci:** 0 errors.
- **Changed-file coverage ≥80%.**

**Local pre-deploy (release-engineer, NOT a merge blocker):**
- `deno check` on both `index.ts` files (the Deno.serve glue).
- `deno test` (optional, if we add Deno-native tests for the JWT-decode gate extracted into `_shared/jwt.ts` — T10/T18 share it).

**Director/live-verify (staging, owner-gated — CANNOT be CI):**
- **AC-GR-003 (grounding behavior):** real `claude-sonnet-5` obeys the no-guess + as-of rules. CI proves the prompt says so + the flow feeds the model the right tool_result; only a live run proves compliance.
- **Compose quality:** a real NL prompt produces a valid, useful `CompositionSpec` (CI proves the loop + compile gate; quality is live).
- **End-to-end SSE round-trip** through the real provider + real PostgREST (CI proves the codec; the full path is live).
- **The deputy-invariant in the real stack:** a live caller-JWT run is denied a cross-tenant read (CI proves it via pgTAP under the same RLS; the live run confirms the JWT claim wiring end-to-end).

## 6. Observability (ADR-0017 D10) — what lands in P2

- **(b) Generation log:** `mos.agent_events` rows are the replayable transcript (every assistant/tool/status/system event, seq-ordered). Tool-call journal columns (`tool_name`, `tool_args_hash`, `tool_status`) make every tool call attributable + de-dupable on resume. (a) action/write audit: the `create_task`/`post_update` writes go through the SAME `mos.tasks`/`mos.weekly_updates` tables the UI uses, so existing task_events / weekly_update_items already attribute the write to the caller `person_id`. **(c) Telemetry (per-call LLM cost/latency/errors + injection attempts):** the `agent_usage` table + `recordUsage` are **P3**; P2 logs upstream errors to `console.error` (structured, scrubbed) only. Tracked: P3 adds the usage ledger + injection-attempt signal (RLS-blocked cross-org tries surfaced via the journal's `tool_status='errored'`).

## 7. Director/live-verify checklist (run on staging before ship sign-off)

1. Set function secrets: `AGENT_MODEL_API_KEY`, `AGENT_MODEL_BASE_URL`, `AGENT_MODEL_DEFAULT=claude-sonnet-5` (§8).
2. Flip `SHOW_ASSISTANT=true` (local/staging only).
3. **Grounding (AC-GR-003):** ask "what was our revenue last week?" → deputy calls `query_entity` on `sales_daily_revenue`, cites `snapshot_as_of`. Ask a question whose read returns empty → deputy says it has no data and stops (no guess).
4. **Approve/deny:** ask the deputy to create a task → needs-approval chip → approve → `mos.tasks` row appears with `created_by = <me>`; deny → no row, deputy acknowledges.
5. **Compose:** ask the deputy to build a sales view → `compose_view` artifact → a `mos.user_views`-shaped spec that compiles server-side and renders in the P1 harness.
6. **Deputy invariant:** confirm (via the pgTAP + a live cross-org probe) no cross-org leak.
7. **i18n:** toggle to `id` → every panel string is Indonesian.
8. **Phone:** open the FAB → full-screen sheet, focus-trapped, Esc closes.

## 8. Secrets / config runbook (op-managed; NEVER in repo)

Set as Supabase function secrets (staging + self-hosted prod) via `supabase secrets set ...` (Cloud) or the edge-runtime container env (self-hosted):
- `AGENT_MODEL_API_KEY` — the provider/gateway API key.
- `AGENT_MODEL_BASE_URL` — the chat-completions base URL (no trailing slash). Recommended: the OpenRouter endpoint `https://openrouter.ai/api/v1` (op choice; source is provider-agnostic).
- `AGENT_MODEL_DEFAULT` — the default model id. Recommended: `claude-sonnet-5` (or the provider-specific slug that resolves to it). **Required** — unset → `502 MODEL_NOT_CONFIGURED`.
- `AGENT_MODEL_COMPOSE` (optional) — per-action override for compose-view; falls back to `AGENT_MODEL_DEFAULT`.
- `AGENT_PERSISTENCE` — set `'false'` to disable thread/event persistence (default ON).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — standard Supabase function env (auto-injected on Cloud; set manually on self-hosted).

**None of these appear in `mos-app/.env*`, repo files, or the deployed bundle source.** A test (T31) greps the ported artifacts for brand names and fails on any hit.

## 9. ADRs to record (planner writes during/after build)

- **ADR-0020 — Agent stack P2 port: JWT-decoded org/person + single-whitelist reads + provider-agnostic transport.** Records D1 (JWT decode not profiles), D2 (single ENTITY_WHITELIST read surface, schema-scoped), D4 (no hardcoded model/provider in source), D5 (grounding prompt-bound + flow-tested, behavioral = live-verify). Supersedes-nothing; consumes ADR-0018 P2 + ADR-0017 D2/D3/D5. Write after T1–T5 land (the substrate shape is stable).

## 10. Residual risks (explicit)

1. **Grounding is prompt-bound, not cryptographically enforced (D5).** CI proves the prompt + the empty-read flow; only a live LLM run proves `claude-sonnet-5` obeys. Mitigation: AC-GR-003 Director/live-verify gate (§7) blocks ship sign-off; the prompt is explicit + tested; a future hardening could add a server-side "no tool call before a data claim → reject" guard, but that needs claim-classification (out of P2).
2. **P3 features deferred but the handler is authored to accept them.** `HandlerDeps` leaves `rateGuard?`/`usage?` optional; `AgentChatRequest` keeps the `decision`/`cancel` shapes; `AgentAction` keeps `confirm`. P3 threads ask_user/notify/automations/credits without a handler rewrite — but a reviewer must confirm no P2 branch silently assumes a P3 dep. (Test T32 + the deputy-invariant test guard this.)
3. **`business_units` added to the P1 `ENTITY_WHITELIST` (T11).** This is a P1-boundary extension (7→8 entities). Justified: the deputy needs BU ids for `create_task`, and a single read whitelist is the honest design (D2). Risk: a composer could now build a view over `business_units` — review confirms that is desirable (it is a legitimate read entity). The firewall test still passes (no `org_id` in `allowedColumns`).
4. **DB-side aggregation (T34) may slip to P2.1.** If cut, the P1 in-memory aggregate's lower-bound caveat (review item 6) remains for agent-composed views over wide reporting windows. The deputy's `query_entity` v1 doesn't expose aggregate anyway (D2), so this only affects `compose_view` output — acceptable for P2.
5. **`create_task`/`post_update` replicate the DAL insert in the edge function (not a shared RPC).** RLS bounds them identically, but a future schema change to `createTask` (e.g. a new required column) must be mirrored in `actions.ts`. Mitigation: a test (T16) asserts the action's insert columns match `tasks.ts`'s `createTask` input; tracked for a future shared-RPC refactor (ADR-0017 D4's "same RPC path" ideal).
6. **`deno check`/`deno test` is a pre-deploy gate, not a merge blocker.** A Deno-only type error in `index.ts` could slip past CI (which is tsc/Vitest). Mitigation: the handlers are dual-environment (D7); the `index.ts` glue is small + reviewed; release-engineer runs `deno check` before deploy.
7. **No per-user budget cap in P2 (credits are P3).** A runaway deputy loop is bounded only by `MAX_TOOL_ROUNDS=8` + the provider's own limits. Mitigation: the 8-round cap is tested; P3 adds the credit ledger. Acceptable for a staged rollout behind `SHOW_ASSISTANT` to a small cohort.

## 11. Open questions for the Director

1. **Model choice confirmation:** the constraint fixes `claude-sonnet-5` as the default via config. Confirm the provider/gateway (OpenRouter? direct?) so the `AGENT_MODEL_BASE_URL` + the exact model slug are set correctly at ship. (Source stays agnostic either way.)
2. **`post_update` scope:** v1 adds a line to the caller's CURRENT week draft. Should the deputy also be able to `submit` a weekly update (a second write tool), or is "add a line" the entire P2 write surface for updates? (Plan assumes add-line only; submit stays a UI action.)
3. **Panel history/thread list in P2?** PMO ships a ThreadList region. For MOS P2 (hide-first, small cohort), is a thread-history dropdown in scope, or defer to P3 with the notifications inbox? (Plan includes a minimal ThreadList in T27; easy to cut.)
4. **T34 DB-side aggregation:** include in P2 or defer to P2.1? (Plan marks it stretch.)

> **Director decisions (2026-07-04):**
> 1. **Direct Anthropic API**, default slug `claude-sonnet-5`; `AGENT_MODEL_BASE_URL` = the Anthropic
>    endpoint; key is an op-managed edge-function secret set at deploy (owner-gated). Source stays
>    config-agnostic as planned.
> 2. **Add-line only.** Submit stays a human UI action — the deputy drafts, the person owns the send
>    (matches ADR-0018 D4 lean-writes posture). A submit tool is a P3 candidate on evidence.
> 3. **Keep the minimal ThreadList (T27)** — durable transcripts without any way to reopen them
>    would make ADR-0043-analog persistence useless to the user. Minimal = recent list in-panel,
>    no dedicated surface.
> 4. **T34 defers to P2.1**, binding condition: it lands **before `SHOW_USER_VIEWS` un-gates for any
>    cohort** (truncated aggregates must not reach real users composing wide reporting windows).

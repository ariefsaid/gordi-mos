# Plan — ADR-0018 Port Train P1: the view-composition substrate (2026-07-04)

- **Feature:** the **P1 port train** of ADR-0018 — the view-composition **substrate** that is
  **shippable with zero conversational agent**: a declarative **view-spec schema**, a primitive
  **REGISTRY** over the 5 MOS dashboard kit primitives (+ 2 planned stubs), a **query-DSL + compiler**
  with the MOS **`ENTITY_WHITELIST`** (mos OLTP entities + 2 `reporting` read-models), a
  **renderer/executor** that hydrates registered primitives from RLS-scoped queries, the
  **`mos.user_views`** table (org_id + owner-only + manager-share RLS per ADR-0017 D5/D6) + its DAL,
  and a **dev-gated harness route** that renders a saved user view end-to-end — the zero-agent proof.
- **Authority:** `docs/adr/0018-port-pmo-native-agent-stack.md` (D1 port max, D2 no shared package,
  D4 tool catalog + DSL entity whitelist spanning both planes, D6 P1 = substrate shippable with zero
  agent, D7 MOS deltas baked in); `docs/adr/0017-agent-native-user-composed-ui.md` **D1–D7 survive**
  (D2 deputy = caller JWT, D3 dual-plane reach, D5 declarative-artifact + `user_views` ordinary row +
  trusted-renderer degrades-to-error, D6 `/views/*` behind a feature flag + manager-share via
  `is_manager_of` chain, D7 compiler ceilings); `docs/adr/0019-ia-north-star.md` **D3** (Home v2 =
  org-default user view — the consumer P1 enables) + **D6** (the 2 planned vendored primitives
  `doc-editor`/`data-grid`); `CONTEXT.md` (**Port**, **deputy agent**, **user view**, **read-model**,
  **Grounded answer**, **OLTP/OLAP**); `docs/product-expectations.md` (org_id seam not bypassable,
  RLS on every business table, ≥80% coverage, typecheck/lint zero errors).
- **Ported from** the sibling internal project's ADRs **0037/0038/0039** (compiler/DSL +
  `ENTITY_WHITELIST`; renderer/executor dispatch; untrusted-output validation boundary = the
  compiler) and its implementing source (`pmo-portal/src/lib/viewspec/*`,
  `pmo-portal/src/lib/db/userViews.ts`, `supabase/functions/compose-view/schema.ts`,
  `supabase/migrations/0045_user_views.sql` + `0053_user_views_owner_org_gate.sql`). **Copy-adapt,
  MOS owns the fork outright — no shared package, no auto-sync (ADR-0018 D2).**
- **Do NOT touch:** the conversational deputy (P2: `agent-chat` + `AssistantPanel` + threads/events),
  approve/deny writes (P2), automations/notifications/credits (P3), Home v2 itself (ADR-0019 D3
  consumes this substrate later), and **anything under `/Users/ariefsaid/Coding/PMO`** (read-only
  reference). This plan lands the **trust boundary** (the compiler) that P2's `compose-view` LLM will
  later cross — but **no LLM, no edge function, no Anthropic key ships in P1**.

## 0. Scope, non-goals, the D6 re-scope note

**In scope (one train):**
1. **View-spec schema** — declarative versioned JSON (`CompositionSpec { version: 1, panels[] }`) +
   a JSON-Schema (`COMPOSITION_SPEC_SCHEMA`) whose enums are derived from the registry + the
   whitelist (the future trust surface P2's LLM crosses; used now by the harness + tests).
2. **Primitive REGISTRY** — registers the 5 MOS dashboard primitives (`KPITile`, `ChartFrame`,
   `CutToggle`, `DataTable`, `FreshnessLabel`) as `status: 'live'` + the 2 planned vendored
   primitives (`doc-editor`, `data-grid` per ADR-0019 D6) as `status: 'stub'` descriptors (registry
   stubs — **not** implementations; the renderer degrades them to a "planned" placeholder).
3. **Query-DSL + compiler** with the MOS `ENTITY_WHITELIST` = **7 entities** spanning both planes:
   `tasks` · `weekly_updates` · `objectives` · `work_lines` (projects/processes) · `people`
   (mos/shared OLTP) + `sales_daily_revenue` · `sales_margin_daily` (`reporting` read-models). RLS
   does row security; the whitelist does the **entity/column ceiling**.
4. **Renderer/executor** — `compileCompositionSpec` (the boundary) → `executeCompiledQuery` (under
   the viewer's own JWT, RLS-scoped, schema-dispatched) → hydrate the registered primitive;
   degrades to an error state on any `ValidationError` (ADR-0017 D5).
5. **`mos.user_views`** migration (org_id default + `WITH CHECK` + owner-only private + manager-share
   `shared_team` RLS via a new `shared.is_managed_by` helper — the reverse of `is_manager_of`) + DAL.
6. **Dev-gated harness** at `/dev/views/:viewId?` (DEV-only + feature-flagged + auth-gated): a
   hand-composer (JSON-spec editor → Save → reopen → render) — the **zero-agent proof**.
7. **Full test pyramid mapping** — Vitest unit (schema/compiler/renderer/executor/DAL), pgTAP
   (`user_views` RLS), one curated integration/e2e (compose → save → reopen → render → second user
   cannot see it). AC-ids tagged in owning tests.

**Out of scope (explicit):**
- **The `compose-view` Edge Function + any LLM/Anthropic call** (ADR-0018 D6 names it in P1; this
  plan **defers it to P2** — see the re-scope note below). P1 ships the **compiler boundary** the
  LLM will cross, not the LLM.
- A polished visual builder (P1's builder is a dev-grade JSON editor; the real builder UI is a later
  issue). The deputy panel (P2). Approve/deny writes (P2). Automations + notifications + credits (P3).
- Promoting a user view to a coded Module / org-default (ADR-0017 D6 promotion — a maintainer gate,
  no UI in P1). Home v2 reading the org-default user view (ADR-0019 D3 — consumes this later).
- Adding new `reporting` read-models (the whitelist references the **two that exist**;
  `sales_margin_daily` already landed 2026-07-04). Adding `ops.log_entries` to the whitelist (the
  Daily Log — a natural 8th entity but not in the brief's named set; flagged as a trivial follow-up).
- Retrofitting the existing 50 surfaces onto the registry (P1 only registers the dashboard kit).

**D6 re-scope note (for the Director — surface before build):**
ADR-0018 **D6** lists P1 as "substrate … + **one-shot compose** (`compose-view`)". `compose-view` is
the **Supabase Edge Function that makes the only LLM call** (sibling ADR-0039). This plan **defers
`compose-view` to P2** because (a) the brief mandates **P1 ships with ZERO conversational agent**, and
(b) the **trust boundary is the compiler** (`compileCompositionSpec`) — shipping it first means the
LLM's first output crosses a boundary that already exists and is already tested, rather than landing
both at once. **The substrate is independently shippable** (ADR-0018 Reversibility: "P1 alone ships a
manual composer with zero conversational agent"). **Director must confirm** this slice is acceptable;
if the owner wants `compose-view` in P1, it is an additive issue grafted onto this plan's Task J-end
(same handler, same schema) — but it pulls in a Deno edge-function toolchain + an API-key secret, which
is why this plan keeps it out.
> **Director decision (2026-07-04): CONFIRMED — `compose-view` moves to P2.** P1 is the zero-LLM
> substrate; the compiler trust boundary ships tested before any LLM output crosses it. **Residual risk:** PMO's ADR-0039 handler is the reference for P2's
`compose-view`; the boundary semantics must be re-asserted (not assumed) when P2 lands.

## 1. Design decisions (brainstorm output)

### 1.1 The executor is **schema-scoped** (the critical MOS delta vs the sibling's single-schema port)
The sibling's executor called `supabase.from(table)` against one `public` schema. **MOS is
multi-schema** (`shared` / `mos` / `ops` / `reporting`) and every DAL already reaches its table via
`supabase.schema('mos'|'ops'|'reporting').from(table)` (see `tasks.ts`, `ops-log.ts`,
`reporting.ts`). **The ported executor MUST dispatch by schema.** So `ENTITY_WHITELIST` gains a
`schema: 'mos' | 'ops' | 'shared' | 'reporting'` field per entity, and the executor calls
`supabase.schema(entry.schema).from(entry.table).select(...)`. This keeps the executor on the
**same caller-JWT client the rest of the DAL uses** — RLS scopes every row, `org_id` is never sent,
no second client, no `service_role` (ADR-0017 D2; ADR-0018 D2). The `repositoryMethod` field from the
sibling port becomes **informational only** (documented, unused by the executor) — consistent with the
sibling's own ADR-0038 which had the executor bypass repositories and call PostgREST directly.

### 1.2 `ENTITY_WHITELIST` = 7 MOS entities; `org_id` is **never** a whitelisted column
The 7 entities and their schemas (columns audited verbatim from the live migrations —
`20260611000007_mos_tasks.sql`, `20260624000001_mos_cascade_lookups.sql`, `20260612000001_mos_weekly_updates.sql`,
`20260611000002_shared_directory.sql`, `20260701000001_reporting_sales_daily_revenue.sql`,
`20260704000002_reporting_sales_margin_daily.sql`):

| entity | schema | table | kind | `requiresTimeRange` |
|---|---|---|---|---|
| `tasks` | `mos` | `tasks` | OLTP | **true** |
| `weekly_updates` | `mos` | `weekly_updates` | OLTP | **true** |
| `objectives` | `mos` | `objectives` | OLTP (catalog) | false |
| `work_lines` | `mos` | `work_lines` | OLTP (catalog) | false |
| `people` | `shared` | `people` | OLTP (catalog) | false |
| `sales_daily_revenue` | `reporting` | `sales_daily_revenue` | read-model | **true** |
| `sales_margin_daily` | `reporting` | `sales_margin_daily` | read-model | **true** |

**`org_id` is excluded from every entity's `allowedColumns`** — mirroring the standing DAL rule
("the client NEVER sends `org_id`"; RLS is the authority). Exposing `org_id` in the whitelist would
invite spec-authors to filter on it (redundant + misleading); RLS already ceilings it. This is a
**MOS convention the sibling port did not need** (the sibling's single-org-per-query model differed).

### 1.3 The D7 compiler ceilings — row cap on ALL; time-range on **time-bearing** entities only
ADR-0017 **D7** mandates "compiler ceilings on EVERY compiled query: a statement timeout, a row cap,
and a **required time-range bound**." Taken literally that would reject any spec over the catalog
entities (`objectives`, `work_lines`, `people`) — which are small, org-bounded, and have no
meaningful time axis. **This plan honours the *intent* of D7 (bound resource abuse + schema probing)
with a pragmatic split**, recorded here so the Director can overrule:
> **Director decision (2026-07-04): CONFIRMED — pragmatic split adopted.** Row cap on every query;
> time-range required on the 4 time-bearing entities only (a time bound on `people` is meaningless);
> statement-timeout tracked as a DB/role-config follow-up (§7), not a compiler field.
- **Row cap (1–500)** on **every** compiled query (inherited from the sibling port + D7). Default 500
  when `aggregate`/`groupBy` is present and no explicit limit (sibling OD-3). Bounds memory + scan.
- **Required time-range** on the **4 time-bearing entities** (`tasks`, `weekly_updates`, and both
  `reporting` read-models) via a new per-entity `requiresTimeRange: true` flag + a new
  `MISSING_TIME_RANGE` error code. Catalog entities are exempt.
- **Statement timeout** is a **PostgREST/DB-level setting, not a compiler field** — PostgREST applies
  `statement_timeout` per role; the executor cannot set it per-call over the REST surface. **Residual
  risk:** the row cap is the practical bound; a true statement-timeout belongs to a DB/role config
  task (flagged §7), not this compiler. If the Director wants literal D7 (time-range on EVERY entity),
  it is a one-line whitelist change + an updated AC-UV-004 — but it makes catalog views un-composable.

### 1.4 The required-filter machinery stays, but is **empty** for MOS in P1
The sibling port's `requiredFilter: 'project_id'` rule (its ADR-0037 OD-2) exists because the
sibling's `tasks` were project-scoped, not org-scoped. **MOS tasks are org-scoped by RLS** (no
mandatory project/work-line filter — `work_line_id`/`objective_id` are nullable seams). So the
`requiredFilter` **mechanism is ported** (good machinery, future-proof) but **no MOS entity sets it
in P1**. `MISSING_REQUIRED_FILTER` error code is ported for completeness.

### 1.5 `$current_*` tokens adapted to MOS identity (`person_id`, not `user_id`)
MOS's meaningful identity for composition is the **person** (`shared.current_person_id()` — tasks
key off `responsible_person_id`/`accountable_person_id` = `people.id`; weekly_updates key off
`person_id`). The token set is **pruned + MOS-renamed**:
- `$current_person` → `ctx.personId` (MOS analog of the sibling's `$current_user`).
- `$current_org` → `ctx.orgId`.
- `$today`, `$start_of_month`, `$end_of_month` → date tokens (ported verbatim).
- **Dropped:** `$current_team` (no MOS analog — BUs aren't "teams" in this sense) and
  `$current_project` (sibling-specific). `UNRESOLVABLE_TOKEN` semantics ported for `$current_person`
  / `$current_org` when context lacks the value (fail loud, never emit a null filter — sibling OD-4).

### 1.6 `user_views` RLS — owner-only private + manager-share `shared_team` via a NEW reverse helper
ADR-0017 **D6**: "Share-to-team = the team's **manager**, gated by the derived **`is_manager_of`**
chain … the same union-over-roles manager relation the upward-only weekly-update rule already uses."
The weekly-update RLS (`mos.can_read_weekly_update`) reads "manager M reads report R's update" as
`is_manager_of(R.person_id)` from M's session — i.e. **current person manages the target**. For
`user_views.shared_team`, the **owner (a manager) shares TO their reports**: a viewer V sees owner O's
shared view iff **O manages V** — the **reverse direction** of `is_manager_of` (which always treats
`current_person_id()` as the potential manager). So this plan adds **`shared.is_managed_by(manager_person_id)`**:
"true iff `manager_person_id` manages the current person" (recursive CTE mirroring `is_manager_of`,
swapped source/target). It lands in the **`user_views` migration** (its first consumer), in the
`shared` schema next to `is_manager_of` (same lineage, same audit story). The RLS SELECT policy:
`org_id = current_org_id() AND (owner_id = current_person_id() OR (scope = 'shared_team' AND
shared.is_managed_by(owner_id)))`. INSERT/UPDATE `WITH CHECK` pin `org_id = current_org_id()` AND
`owner_id = current_person_id()` (an owner can never hand a view to another person; the browser holds
a valid JWT + anon key, so the post-image predicate is required, not optional — mirrors
`weekly_updates_insert_author` + the sibling's SEC-HIGH-1 org-gate lesson `0053`). `scope` CHECK =
`('private','shared_team')`. **Residual risk:** `is_managed_by` is a new recursive helper — pgTAP must
prove the share direction (owner's reports see it; peers/other-org/unrelated-manager do not).

### 1.7 The renderer degrades; stubs degrade to a "planned" placeholder; nothing renders unvalidated
ADR-0017 **D5**: a spec that fails validation at render "degrades to an error state, **never a crash
and never an unvalidated render**." `<UserViewRenderer>` wraps `compileCompositionSpec` in try/catch:
on `ValidationError` it renders a whole-view error panel (with the code/detail); on a per-panel
**executor** error it renders that one panel's error state (the kit primitives already have
`state="error"` + `onRetry`). **Stub primitives** (`status: 'stub'`) render a styled "Planned
primitive — not yet implemented" panel (a graceful degradation, consistent with D5's philosophy — a
stub is known-to-the-registry but not-yet-hydratable). **No spec is ever rendered without crossing
the compiler boundary** — the harness calls `compileCompositionSpec` on save AND on render
(double-gate, mirroring the sibling ADR-0039 boundary enforced server- and client-side).

### 1.8 The harness is DEV-only + feature-flagged + auth-gated (hide-first, ADR-0017 D6)
Route `/dev/views/:viewId?` mounts inside `AppShell` children, gated by `import.meta.env.DEV` (bare
route → `<Navigate to="/" replace />` in prod builds, matching the existing `/dev/ui` UiGallery
pattern) **AND** a new `SHOW_USER_VIEWS` flag in `config/features.ts` (default `false`; the whole
capability sits behind a flag per ADR-0017 D6). It is auth-gated by being inside `ProtectedRoute` (it
reads/writes `user_views` via the viewer's JWT). The builder is a **dev-grade JSON editor** (textarea
+ "Save" + "Render" + a list of the owner's saved views) — enough to prove compose → save → reopen →
render end-to-end with **zero agent**. A polished builder is a later issue.

### 1.9 De-reference firewall — no sibling/upstream brand strings in any MOS artifact
Every ported file header uses **exactly** the phrase *"Ported from the sibling internal project"* (or
*"Adapted from the sibling internal project's …"*) — **never** the sibling's name, never the upstream
agent-native framework's name, never vendor brands. The `CONTEXT.md` **Port** posture is the canonical
reference. A grep gate (AC-UV-019) asserts no sibling/upstream brand string leaks into `mos-app/src`
or the migration.

## 2. Architecture / files touched (map)

**New files (MOS-owned — the fork):**
- `mos-app/src/lib/viewspec/types.ts` — DSL types, `ENTITY_WHITELIST` (7 MOS entities, schema-scoped),
  `ValidationError` + `ValidationErrorCode` (adds `MISSING_TIME_RANGE`), `MAX_PANELS_PER_VIEW`.
- `mos-app/src/lib/viewspec/registry.ts` — primitive registry: 5 `live` + 2 `stub` descriptors.
- `mos-app/src/lib/viewspec/compiler.ts` — `compileQuerySpec` + `compileCompositionSpec` (the boundary).
- `mos-app/src/lib/viewspec/executor.ts` — `executeCompiledQuery` (schema-scoped, RLS, in-mem aggregate).
- `mos-app/src/lib/viewspec/schema.ts` — `COMPOSITION_SPEC_SCHEMA` (JSON Schema; enums from registry + whitelist).
- `mos-app/src/lib/viewspec/renderer.tsx` — `<UserViewRenderer>` + `buildCompilerContext()` + `RenderError`.
- `mos-app/src/lib/db/user-views.ts` — DAL (`list`/`get`/`create`/`update`/`archive`; never sends org_id/owner_id).
- `mos-app/src/pages/dev-views-page.tsx` — the dev harness (JSON editor + save + render + list).
- `mos-app/src/pages/dev-views-page.css` — harness styles (DESIGN.md tokens, phone-first).
- `supabase/migrations/20260705000001_mos_user_views.sql` — table + `shared.is_managed_by` + RLS.
- `supabase/tests/62_mos_user_views_rls.sql` — pgTAP (AC-UV-010..013).
- Unit tests: `mos-app/src/lib/viewspec/{types,registry,compiler,executor,schema}.test.ts`,
  `mos-app/src/lib/db/user-views.test.ts`, `mos-app/src/lib/viewspec/renderer.test.tsx`,
  `mos-app/src/pages/dev-views-page.test.tsx`.

**Edited files:**
- `mos-app/src/config/features.ts` — add `SHOW_USER_VIEWS = false`.
- `mos-app/src/router.tsx` — mount `/dev/views/:viewId?` (DEV + flag gated, inside AppShell).
- `mos-app/src/i18n/messages.ts` — add the `views.*` + `dev.views.*` string catalog (en + id).
- `mos-app/vite.config.ts` — add `src/lib/viewspec/**`, `src/lib/db/user-views.ts`,
  `src/pages/dev-views-page.tsx` to `coverage.include`.

**Inventory — port / adapt / stay (sibling → MOS):**
| sibling file | disposition | MOS destination |
|---|---|---|
| `viewspec/types.ts` | **adapt** (MOS entities, `schema` field, `MISSING_TIME_RANGE`, drop `$current_team`/`$current_project`, rename `$current_user`→`$current_person`) | `viewspec/types.ts` |
| `viewspec/compiler.ts` | **adapt** (token set, `requiresTimeRange` enforcement, empty `requiredFilter`) | `viewspec/compiler.ts` |
| `viewspec/executor.ts` | **adapt heavily** (schema-scoped dispatch; MOS error convention `throw new Error`) | `viewspec/executor.ts` |
| `viewspec/registry.ts` | **rewrite** (MOS's 5 kit primitives + 2 stubs; MOS prop types) | `viewspec/registry.ts` |
| `viewspec/paletteItems.ts` | **stay** (sibling builder-helper — not needed; P1 harness is JSON-editor) | — |
| `compose-view/schema.ts` | **adapt** (imports MOS registry + whitelist; same JSON-Skeleton) | `viewspec/schema.ts` |
| `db/userViews.ts` | **adapt** (MOS schema-scoped client; `owner_id`; MOS error convention) | `db/user-views.ts` |
| `migrations/0045_user_views.sql` + `0053_…_gate.sql` | **adapt** (mos schema, `owner_id`, `shared_team`, `is_managed_by`, org-gate baked in from day 1) | `migrations/20260705000001_mos_user_views.sql` |
| `compose-view/{handler,index,prompt,composeSpec}.ts` | **stay** (P2 — the LLM edge function; explicitly deferred, §0) | — |
| `agent/*` (deputy, dispatch, runtime, credits) | **stay** (P2/P3) | — |

## 3. EARS requirements (embedded — plan-first; specs backfilled later)

- **FR-UV-001** The system SHALL store a user-composed surface as a declarative `CompositionSpec`
  (versioned JSON: `{ version: 1, panels: PanelSpec[] }`) in `mos.user_views.spec`, never as executable code.
- **FR-UV-002** The primitive registry SHALL expose exactly the 5 live MOS dashboard primitives
  (`KPITile`, `ChartFrame`, `CutToggle`, `DataTable`, `FreshnessLabel`) + the 2 stub primitives
  (`doc-editor`, `data-grid`); no primitive name is hard-coded outside `registry.ts`.
- **FR-UV-003** The query-DSL `ENTITY_WHITELIST` SHALL enumerate exactly the 7 MOS entities
  (`tasks`, `weekly_updates`, `objectives`, `work_lines`, `people`, `sales_daily_revenue`,
  `sales_margin_daily`), each with its `schema`, `table`, and audited `allowedColumns`;
  `org_id` SHALL NOT appear in any entity's `allowedColumns`.
- **FR-UV-004** `compileQuerySpec` SHALL reject (via `ValidationError`, never silent coercion) an
  unknown entity, column, op, token, non-numeric aggregate, invalid limit, or — for time-bearing
  entities — a missing time-range; it SHALL resolve `$current_*` tokens only from the supplied context.
- **FR-UV-005** `compileCompositionSpec` SHALL be the untrusted-output validation boundary: it SHALL
  reject `version !== 1` and any panel whose `primitive` is not in the registry; an off-registry
  primitive or entity SHALL never produce a `CompiledPanel`.
- **FR-UV-006** `executeCompiledQuery` SHALL dispatch via `supabase.schema(entry.schema).from(entry.table)`
  on the caller-JWT client (never `service_role`), apply validated filters/order/limit, and apply
  in-memory `groupBy`/`aggregate` when present.
- **FR-UV-007** `mos.user_views` SHALL live in the `mos` schema with `org_id` defaulted server-side +
  `WITH CHECK`, RLS enabled + forced, owner-only `private` reads, and `shared_team` reads gated by
  `shared.is_managed_by(owner_id)` within the same org.
- **FR-UV-008** The user-views DAL SHALL never send `org_id` or `owner_id` (RLS stamps both) and SHALL
  throw on any non-null PostgREST error.
- **FR-UV-009** `<UserViewRenderer>` SHALL compile the spec through the boundary on every render, and
  on any `ValidationError` SHALL degrade to an error state (never crash, never render unvalidated).
- **FR-UV-010** The dev harness SHALL let an authenticated viewer hand-compose a spec, save it, and
  reopen + render it end-to-end with **no LLM / no agent** in the path.
- **NFR-UV-SEC-001** No ported artifact SHALL contain `service_role`, a bypass-RLS path, or any
  sibling/upstream brand string (de-reference firewall).
- **NFR-UV-LAYER-001** `types.ts` / `registry.ts` / `compiler.ts` / `schema.ts` SHALL be pure
  TypeScript (no Supabase, no React import); only `executor.ts` imports the supabase client; only
  `renderer.tsx` imports React.
- **NFR-UV-I18N-001** Every new user-facing string in the harness/renderer SHALL resolve through the
  `messages.ts` catalog (en + id parity).

## 4. Acceptance criteria (Given/When/Then — embedded; owning test layer marked)

- **AC-UV-001** (unit, `types.test.ts`) — **GIVEN** the whitelist, **WHEN** its keys are enumerated,
  **THEN** it is exactly the 7 MOS entities, each carrying the correct `schema`/`table`, and `org_id`
  is absent from every `allowedColumns`.
- **AC-UV-002** (unit, `compiler.test.ts`) — **GIVEN** a `QuerySpec` with an unknown entity / column /
  op / non-numeric aggregate / invalid limit, **WHEN** compiled, **THEN** it throws the matching
  `ValidationError` code and never returns a `CompiledQuery`.
- **AC-UV-003** (unit, `compiler.test.ts`) — **GIVEN** a filter value of `$current_person` /
  `$current_org` / `$today`, **WHEN** compiled with a context that has the value, **THEN** the token
  is resolved into `resolvedFilters`; **AND** an unknown `$…` throws `UNKNOWN_TOKEN`, **AND** a known
  token whose context value is absent throws `UNRESOLVABLE_TOKEN`; **AND** no `$` token appears in the
  compiled output.
- **AC-UV-004** (unit, `compiler.test.ts`) — **GIVEN** a query over a `requiresTimeRange` entity
  with no `timeRange`, **WHEN** compiled, **THEN** it throws `MISSING_TIME_RANGE`; **AND** a catalog
  entity (no `requiresTimeRange`) compiles without a time-range; **AND** every compiled query carries
  a limit in `[1, 500]`.
- **AC-UV-005** (unit, `compiler.test.ts`) — **GIVEN** a `CompositionSpec` with `version !== 1` or a
  panel whose `primitive` is not registered, **WHEN** compiled, **THEN** it throws
  `UNSUPPORTED_VERSION` / `UNKNOWN_PRIMITIVE` and yields no `CompiledPanel`.
- **AC-UV-006** (unit, `compiler.test.ts`) — **GIVEN** a spec referencing an off-registry primitive
  **and** an off-whitelist entity, **WHEN** compiled, **THEN** both are rejected — the boundary never
  lets an unknown name through (the trust surface for P2's LLM output).
- **AC-UV-007** (unit, `registry.test.ts`) — **GIVEN** the registry, **WHEN** queried, **THEN** it
  returns the 5 `live` + 2 `stub` descriptors; `validatePrimitive` is true for all 7 and false for an
  unknown name; `keys()` lists exactly the 7 names.
- **AC-UV-008** (unit, `executor.test.ts`) — **GIVEN** a `CompiledQuery` for `tasks`, **WHEN**
  executed, **THEN** it calls `supabase.schema('mos').from('tasks')` with the resolved select/filters/
  order/limit on the mocked caller-JWT client (never `service_role`).
- **AC-UV-009** (unit, `executor.test.ts`) — **GIVEN** a compiled query with `groupBy` + `sum`
  aggregate, **WHEN** executed over mocked rows, **THEN** the executor returns one reduced row per group.
- **AC-UV-010** (pgTAP, `62_mos_user_views_rls.sql`) — **GIVEN** `mos.user_views`, **WHEN** inspected,
  **THEN** RLS is enabled + forced, `org_id` defaults to `current_org_id()`, and INSERT/UPDATE carry
  `WITH CHECK`.
- **AC-UV-011** (pgTAP) — **GIVEN** a private view owned by person P, **WHEN** a different same-org
  person or a cross-org person SELECTs, **THEN** both get 0 rows; only P sees it.
- **AC-UV-012** (pgTAP) — **GIVEN** a `shared_team` view owned by manager M, **WHEN** M's report R
  SELECTs, **THEN** R sees it; **AND** a peer of R (not M's report) and an unrelated manager and a
  cross-org person all get 0 rows.
- **AC-UV-013** (pgTAP) — **GIVEN** a hand-crafted INSERT/UPDATE with a spoofed `org_id` or
  `owner_id`, **WHEN** run under a valid JWT, **THEN** it is rejected (RLS `WITH CHECK`).
- **AC-UV-014** (unit, `user-views.test.ts`) — **GIVEN** the DAL, **WHEN** its calls are recorded,
  **THEN** no call sends `org_id` or `owner_id`; **AND** a PostgREST error is re-thrown.
- **AC-UV-015** (unit/RTL, `renderer.test.tsx`) — **GIVEN** a valid saved spec, **WHEN** rendered,
  **THEN** the renderer compiles → executes (mocked) → hydrates the registered primitive.
- **AC-UV-016** (unit/RTL) — **GIVEN** a spec with an off-registry primitive or off-whitelist entity,
  **WHEN** rendered, **THEN** the renderer shows the error state and never renders unvalidated / crashes.
- **AC-UV-017** (unit/RTL) — **GIVEN** a panel whose primitive is `status: 'stub'`, **WHEN** rendered,
  **THEN** it shows the "Planned primitive — not yet implemented" placeholder (never crashes).
- **AC-UV-018** (integration/e2e, `dev-views-page.test.tsx`) — **GIVEN** the dev harness, **WHEN** a
  viewer pastes a valid spec → Save → reopens it, **THEN** it renders end-to-end with no LLM in the
  path; a second viewer cannot see the first's private view (DAL returns null).
- **AC-UV-019** (grep gate, `viewspec-firewall.test.ts`) — **WHEN** the ported tree is grepped,
  **THEN** no sibling/upstream brand string and no `service_role` literal appear.
- **AC-UV-020** (unit, `schema.test.ts`) — **GIVEN** `COMPOSITION_SPEC_SCHEMA`, **WHEN** its
  `panels.items.properties.primitive.enum` and `querySpec.entity.enum` are read, **THEN** they equal
  `registry.keys()` and `Object.keys(ENTITY_WHITELIST)` respectively (single source of truth).

---

# 5. Tasks (TDD, 2–5 min each; every behavior task names its AC + the failing test first)

> Conventions: run all JS inside `mos-app/`. Each task's **verify** command is the exact one to run.
> Coverage gate: add the new globs to `coverage.includes` (Task A0) so ≥80% is enforced on changed code.
> De-reference firewall: every new file's header uses *"Ported/Adapted from the sibling internal project"*.

## Task A0 — wire coverage + feature flag (no behavior; scaffolding)
**Files:** `mos-app/vite.config.ts`, `mos-app/src/config/features.ts`.
**Edit `vite.config.ts`** — in `coverage.includes`, append:
```ts
        // View-composition substrate (ADR-0018 P1 port)
        'src/lib/viewspec/**',
        'src/lib/db/user-views.ts',
        'src/pages/dev-views-page.tsx',
```
**Edit `config/features.ts`** — add after `SHOW_DAILY_LOG`:
```ts
// ADR-0018 P1 — view-composition substrate (user views). Hide-first (ADR-0017 D6): the dev harness
// route redirects to / when off. Flip true to enable /dev/views for a rollout cohort.
export const SHOW_USER_VIEWS = false
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors. `npm test -- --run src/i18n/messages.test.ts` (sanity, still green).

## Task A1 — `viewspec/types.ts`: DSL types + MOS `ENTITY_WHITELIST` + `ValidationError`  (AC-UV-001)
**Write** `mos-app/src/lib/viewspec/types.ts` (pure TS — no supabase, no React). Header: `// View-Composition Trusted Core — DSL types, entity whitelist, ValidationError. Adapted from the sibling internal project's ADR-0037 (compiler/DSL + ENTITY_WHITELIST). ADR-0018 D6 P1 port. Pure TypeScript; no Supabase client import; no React import.`
Full content:
```ts
// ── Token values (FR-UV-004; pruned + MOS-renamed vs the sibling port) ──────────
export type TokenValue =
  | '$current_person'
  | '$current_org'
  | '$today'
  | '$start_of_month'
  | '$end_of_month'

export const VALID_TOKENS = new Set<string>([
  '$current_person', '$current_org', '$today', '$start_of_month', '$end_of_month',
])

// ── Filter operator ────────────────────────────────────────────────────────────
export type FilterOp =
  | 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'date-range'
export const VALID_FILTER_OPS = new Set<string>([
  'eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'date-range',
])

// ── Aggregate ──────────────────────────────────────────────────────────────────
export type AggregateFn = 'count' | 'sum' | 'avg' | 'min' | 'max'
export const NUMERIC_AGGREGATE_FNS = new Set<AggregateFn>(['sum', 'avg', 'min', 'max'])
export interface AggregateSpec { fn: AggregateFn; column: string; alias: string }

// ── Filter / TimeRange ─────────────────────────────────────────────────────────
export interface FilterClause {
  column: string
  op: FilterOp
  value: string | number | boolean | string[] | number[]
}
export interface TimeRangeSpec { column: string; from: string; to: string }

// ── Whitelisted entity key (the 7 MOS entities, both planes) ───────────────────
export type ViewSchema = 'mos' | 'ops' | 'shared' | 'reporting'
export type WhitelistedEntity =
  | 'tasks' | 'weekly_updates' | 'objectives' | 'work_lines' | 'people'
  | 'sales_daily_revenue' | 'sales_margin_daily'

// ── QuerySpec ──────────────────────────────────────────────────────────────────
export interface QuerySpec {
  entity: WhitelistedEntity
  select: string[]
  filters?: FilterClause[]
  groupBy?: string
  aggregate?: AggregateSpec
  timeRange?: TimeRangeSpec
  limit?: number
  orderBy?: { column: string; dir: 'asc' | 'desc' }
}

// ── Panel / CompositionSpec (FR-UV-001) ────────────────────────────────────────
export interface LayoutHint { colSpan?: number; rowSpan?: number }
export interface PanelSpec {
  id: string
  primitive: string
  querySpec: QuerySpec
  layout?: LayoutHint
  props?: Record<string, unknown>
}
export interface CompositionSpec { version: 1; panels: PanelSpec[] }

// ── Compiler context (FR-UV-004) ───────────────────────────────────────────────
export interface CompilerContext { personId: string; orgId: string }

// ── Compiled output ────────────────────────────────────────────────────────────
export interface ResolvedFilter {
  column: string; op: FilterOp
  value: string | number | boolean | string[] | number[]
}
export interface ResolvedAggregate { fn: AggregateFn; column: string; alias: string }
export interface ResolvedTimeRange { column: string; from: string; to: string }
export interface CompiledQuery {
  entity: WhitelistedEntity
  schema: ViewSchema
  table: string
  resolvedFilters: ResolvedFilter[]
  resolvedSelect: string[]
  resolvedGroupBy?: string
  resolvedAggregate?: ResolvedAggregate
  resolvedTimeRange?: ResolvedTimeRange
  resolvedOrderBy?: { column: string; dir: 'asc' | 'desc' }
  limit?: number
}
export interface CompiledPanel {
  id: string
  primitive: string
  compiledQuery: CompiledQuery
  layout?: LayoutHint
  props?: Record<string, unknown>
}

// ── Entity whitelist entry ─────────────────────────────────────────────────────
export interface EntityWhitelistEntry {
  schema: ViewSchema
  table: string
  /** Informational only — the executor dispatches by schema+table, not via a repository method. */
  repositoryMethod: string
  allowedColumns: ReadonlySet<string>
  numericColumns: ReadonlySet<string>
  dateColumns: ReadonlySet<string>
  groupableColumns: ReadonlySet<string>
  /** D7 ceiling: a time-range is required for time-bearing entities. Catalog entities set false. */
  requiresTimeRange?: boolean
  /** Ported mechanism; no MOS entity sets it in P1 (tasks are org-scoped by RLS, not project-scoped). */
  requiredFilter?: string
}

/**
 * The trust boundary (FR-UV-003). Columns audited verbatim from the live MOS migrations.
 * `org_id` is DELIBERATELY ABSENT from every allowedColumns — the client never sends org_id
 * (RLS is the authority); exposing it would invite redundant + misleading filters.
 */
export const ENTITY_WHITELIST: Readonly<Record<WhitelistedEntity, EntityWhitelistEntry>> =
  Object.freeze({
    tasks: {
      schema: 'mos', table: 'tasks', repositoryMethod: 'tasks.list',
      allowedColumns: new Set([
        'id', 'title', 'business_unit_id', 'status', 'responsible_person_id',
        'accountable_person_id', 'due_date', 'last_activity_at', 'archived_at',
        'created_at', 'updated_at', 'objective_id', 'work_line_id',
      ]),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['due_date', 'last_activity_at', 'created_at', 'updated_at']),
      groupableColumns: new Set(['status', 'business_unit_id', 'responsible_person_id', 'objective_id', 'work_line_id']),
      requiresTimeRange: true,
    },
    weekly_updates: {
      schema: 'mos', table: 'weekly_updates', repositoryMethod: 'weeklyUpdates.list',
      allowedColumns: new Set(['id', 'person_id', 'week_start', 'status', 'submitted_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['week_start', 'submitted_at', 'created_at', 'updated_at']),
      groupableColumns: new Set(['status', 'person_id']),
      requiresTimeRange: true,
    },
    objectives: {
      schema: 'mos', table: 'objectives', repositoryMethod: 'objectives.list',
      allowedColumns: new Set(['id', 'name', 'archived_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['created_at', 'updated_at']),
      groupableColumns: new Set<string>(),
      requiresTimeRange: false,
    },
    work_lines: {
      schema: 'mos', table: 'work_lines', repositoryMethod: 'workLines.list',
      allowedColumns: new Set(['id', 'name', 'type', 'archived_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['created_at', 'updated_at']),
      groupableColumns: new Set(['type']),
      requiresTimeRange: false,
    },
    people: {
      schema: 'shared', table: 'people', repositoryMethod: 'directory.list',
      allowedColumns: new Set(['id', 'full_name', 'email', 'archived_at', 'created_at', 'updated_at']),
      numericColumns: new Set<string>(),
      dateColumns: new Set(['created_at', 'updated_at']),
      groupableColumns: new Set<string>(),
      requiresTimeRange: false,
    },
    sales_daily_revenue: {
      schema: 'reporting', table: 'sales_daily_revenue', repositoryMethod: 'reporting.listSalesDailyRevenue',
      allowedColumns: new Set([
        'revenue_date', 'channel', 'esb_code', 'branch_code', 'branch_name',
        'transactions', 'clean_revenue', 'snapshot_as_of',
      ]),
      numericColumns: new Set(['transactions', 'clean_revenue']),
      dateColumns: new Set(['revenue_date', 'snapshot_as_of']),
      groupableColumns: new Set(['channel', 'esb_code', 'branch_code']),
      requiresTimeRange: true,
    },
    sales_margin_daily: {
      schema: 'reporting', table: 'sales_margin_daily', repositoryMethod: 'reporting.listSalesMarginDaily',
      allowedColumns: new Set([
        'margin_date', 'esb_code', 'branch_code', 'branch_name', 'revenue',
        'cogs_interim_sm', 'cogs_budget_bom', 'margin_interim', 'margin_interim_pct',
        'bom_coverage_pct', 'snapshot_as_of',
      ]),
      numericColumns: new Set(['revenue', 'cogs_interim_sm', 'cogs_budget_bom', 'margin_interim', 'margin_interim_pct']),
      dateColumns: new Set(['margin_date', 'snapshot_as_of']),
      groupableColumns: new Set(['esb_code', 'branch_code']),
      requiresTimeRange: true,
    },
  })

export const MAX_PANELS_PER_VIEW = 20

// ── ValidationError (FR-UV-004/005) ────────────────────────────────────────────
export type ValidationErrorCode =
  | 'UNKNOWN_ENTITY' | 'UNKNOWN_COLUMN' | 'UNKNOWN_OP' | 'NON_NUMERIC_AGGREGATE'
  | 'INVALID_LIMIT' | 'UNKNOWN_TOKEN' | 'UNRESOLVABLE_TOKEN' | 'MISSING_REQUIRED_FILTER'
  | 'MISSING_TIME_RANGE'   // MOS delta (D7 ceiling) — not in the sibling port
  | 'NOT_GROUPABLE_COLUMN' | 'UNKNOWN_PRIMITIVE' | 'UNSUPPORTED_VERSION'

export class ValidationError extends Error {
  readonly code: ValidationErrorCode
  readonly detail?: string
  constructor(code: ValidationErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ValidationError'
    this.code = code
    this.detail = detail
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task A2 — failing test `types.test.ts` (AC-UV-001) — RED
**Write** `mos-app/src/lib/viewspec/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ENTITY_WHITELIST, VALID_TOKENS, MAX_PANELS_PER_VIEW } from './types'

describe('ENTITY_WHITELIST — AC-UV-001', () => {
  it('enumerates exactly the 7 MOS entities', () => {
    expect(Object.keys(ENTITY_WHITELIST).sort()).toEqual([
      'objectives', 'people', 'sales_daily_revenue', 'sales_margin_daily',
      'tasks', 'weekly_updates', 'work_lines',
    ])
  })
  it('each entity carries schema + table (AC-UV-001)', () => {
    expect(ENTITY_WHITELIST.tasks).toMatchObject({ schema: 'mos', table: 'tasks' })
    expect(ENTITY_WHITELIST.people).toMatchObject({ schema: 'shared', table: 'people' })
    expect(ENTITY_WHITELIST.sales_daily_revenue).toMatchObject({ schema: 'reporting', table: 'sales_daily_revenue' })
    expect(ENTITY_WHITELIST.sales_margin_daily).toMatchObject({ schema: 'reporting', table: 'sales_margin_daily' })
  })
  it('org_id is absent from every allowedColumns (never sent by the client)', () => {
    for (const [entity, entry] of Object.entries(ENTITY_WHITELIST)) {
      expect(entry.allowedColumns.has('org_id'), `${entity} must not expose org_id`).toBe(false)
    }
  })
  it('requiresTimeRange is true only for the 4 time-bearing entities', () => {
    expect(ENTITY_WHITELIST.tasks.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.weekly_updates.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.sales_daily_revenue.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.sales_margin_daily.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.objectives.requiresTimeRange).toBeFalsy()
    expect(ENTITY_WHITELIST.work_lines.requiresTimeRange).toBeFalsy()
    expect(ENTITY_WHITELIST.people.requiresTimeRange).toBeFalsy()
  })
  it('token set is the MOS-pruned set (no $current_team / $current_project)', () => {
    expect([...VALID_TOKENS].sort()).toEqual(
      ['$current_org', '$current_person', '$end_of_month', '$start_of_month', '$today']
    )
  })
  it('MAX_PANELS_PER_VIEW is 20', () => {
    expect(MAX_PANELS_PER_VIEW).toBe(20)
  })
})
```
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/types.test.ts` → GREEN (A1 already satisfies it; the test pins the contract). `npm run typecheck` → 0 errors.

## Task B1 — `viewspec/registry.ts`: 5 live + 2 stub descriptors (AC-UV-007)
**Write** `mos-app/src/lib/viewspec/registry.ts` (pure TS; type-only imports from the kit primitives). Header: `// Primitive Registry. Adapted from the sibling internal project's ADR-0036 §4a. Registers the MOS dashboard kit primitives (ADR-0018 D6 P1) + the 2 planned vendored primitives (ADR-0019 D6) as stubs.`
Full content:
```ts
// Type-only imports bind each descriptor's literal unions to the REAL component types via `satisfies`,
// so a future rename fails tsc here — keeping the manifest honest without pulling React into this pure module.
import type { KPITileDelta } from '@/components/dashboard/kpi-tile'

export type PrimitiveStatus = 'live' | 'stub'
export type PropSchemaDescriptor = Record<string, unknown>
export type DataShapeDescriptor = Record<string, unknown>

export interface PrimitiveDescriptor {
  name: string
  status: PrimitiveStatus
  description: string
  propSchema: PropSchemaDescriptor
  dataShape: DataShapeDescriptor
}

class PrimitiveRegistryImpl {
  private readonly entries: ReadonlyMap<string, PrimitiveDescriptor>
  constructor(entries: PrimitiveDescriptor[]) { this.entries = new Map(entries.map((e) => [e.name, e])) }
  get(name: string): PrimitiveDescriptor | undefined { return this.entries.get(name) }
  keys(): string[] { return Array.from(this.entries.keys()) }
}

// Compile-time guard binding the KPITile delta tone union to the descriptor (rename-safe).
const KPI_DELTA_TONES = ['success', 'destructive', 'neutral'] as const satisfies readonly KPITileDelta['tone'][]

// ── LIVE primitives (the 5 MOS dashboard kit primitives, verbatim from their prop types) ──
const KPI_TILE: PrimitiveDescriptor = {
  name: 'KPITile', status: 'live',
  description: 'KPI tile — label, pre-formatted value, optional delta/sub, ready/loading/empty state.',
  propSchema: { label: 'string', value: 'string', delta: 'KPITileDelta | undefined', sub: 'string | undefined', state: "'ready'|'loading'|'empty' | undefined", help: 'string | undefined' },
  dataShape: { value: 'string', delta: '{ text: string; tone: "success"|"destructive"|"neutral"; dot?: boolean } | undefined', sub: 'string | undefined' },
}
const CHART_FRAME: PrimitiveDescriptor = {
  name: 'ChartFrame', status: 'live',
  description: 'Titled chart surface with an injected chart body + MANDATORY a11y table fallback.',
  propSchema: { title: 'string', ariaLabel: 'string', state: "'ready'|'loading'|'empty'|'error' | undefined" },
  dataShape: { children: 'ReactNode (the chart body)', tableFallback: 'ReactNode (MANDATORY a11y table)' },
}
const CUT_TOGGLE: PrimitiveDescriptor = {
  name: 'CutToggle', status: 'live',
  description: 'Segmented control over an enum (arrow-key navigable tablist).',
  propSchema: { ariaLabel: 'string | undefined' },
  dataShape: { options: 'string[]', value: 'string' },
}
const DATA_TABLE: PrimitiveDescriptor = {
  name: 'DataTable', status: 'live',
  description: 'Sortable, reflowing table — desktop table + phone card reflow; ready/loading/empty/error.',
  propSchema: { caption: 'string', isDesktop: 'boolean', emptyLabel: 'string | undefined', state: "'ready'|'loading'|'empty'|'error' | undefined" },
  dataShape: { columns: 'DataTableColumn<Row>[]', rows: 'Row[]' },
}
const FRESHNESS_LABEL: PrimitiveDescriptor = {
  name: 'FreshnessLabel', status: 'live',
  description: 'The reusable "as of {timestamp}" chip — every reporting figure carries one (D11).',
  propSchema: { prefix: 'string | undefined' },
  dataShape: { asOf: 'string | Date' },
}

// ── STUB primitives (ADR-0019 D6 — vendored later; registry-known, render-degraded) ──
const DOC_EDITOR: PrimitiveDescriptor = {
  name: 'doc-editor', status: 'stub',
  description: 'Block editor — content stored as structured block JSON (ADR-0019 D6). Planned; not yet implemented.',
  propSchema: {},
  dataShape: { blocks: 'unknown[]' },
}
const DATA_GRID: PrimitiveDescriptor = {
  name: 'data-grid', status: 'stub',
  description: 'Editable spreadsheet-like grid (ADR-0019 D6). Planned; not yet implemented.',
  propSchema: {},
  dataShape: { rows: 'unknown[]', columns: 'unknown[]' },
}

export const registry = new PrimitiveRegistryImpl([
  KPI_TILE, CHART_FRAME, CUT_TOGGLE, DATA_TABLE, FRESHNESS_LABEL, DOC_EDITOR, DATA_GRID,
])

export function validatePrimitive(name: string): boolean { return registry.get(name) !== undefined }
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task B2 — failing test `registry.test.ts` (AC-UV-007) — RED→GREEN
**Write** `mos-app/src/lib/viewspec/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { registry, validatePrimitive } from './registry'

describe('registry — AC-UV-007', () => {
  it('exposes exactly the 5 live + 2 stub primitives', () => {
    expect(registry.keys().sort()).toEqual(['ChartFrame', 'CutToggle', 'DataTable', 'FreshnessLabel', 'KPITile', 'data-grid', 'doc-editor'])
  })
  it('5 live primitives have status "live"', () => {
    for (const n of ['KPITile', 'ChartFrame', 'CutToggle', 'DataTable', 'FreshnessLabel']) {
      expect(registry.get(n)?.status).toBe('live')
    }
  })
  it('2 stub primitives have status "stub"', () => {
    expect(registry.get('doc-editor')?.status).toBe('stub')
    expect(registry.get('data-grid')?.status).toBe('stub')
  })
  it('validatePrimitive is true for all 7, false for unknown', () => {
    for (const n of registry.keys()) expect(validatePrimitive(n)).toBe(true)
    expect(validatePrimitive('NotARealPrimitive')).toBe(false)
  })
  it('get returns undefined for unknown (never throws)', () => {
    expect(registry.get('nope')).toBeUndefined()
  })
})
```
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/registry.test.ts` → GREEN.

## Task C1 — `viewspec/compiler.ts`: `compileQuerySpec` + `compileCompositionSpec` (AC-UV-002..006)
**Write** `mos-app/src/lib/viewspec/compiler.ts` (pure TS). Header: `// View-Composition Compiler. Adapted from the sibling internal project's ADR-0037. The untrusted-output validation boundary (sibling ADR-0039 decision 3): every spec — hand- or agent-composed — crosses compileCompositionSpec before it can render or save.`
Full content:
```ts
import {
  ENTITY_WHITELIST, VALID_FILTER_OPS, VALID_TOKENS, NUMERIC_AGGREGATE_FNS, ValidationError,
} from './types'
import type {
  QuerySpec, CompilerContext, CompiledQuery, CompositionSpec, CompiledPanel,
  FilterClause, ResolvedFilter, ResolvedAggregate, ResolvedTimeRange, TokenValue,
} from './types'
import { validatePrimitive } from './registry'

function startOfMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function endOfMonth(d: Date): string {
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`
}
function todayISO(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Resolves a $-token (scalar or array element). Throws UNKNOWN_TOKEN / UNRESOLVABLE_TOKEN. */
function resolveValue(raw: FilterClause['value'], ctx: CompilerContext): ResolvedFilter['value'] {
  if (typeof raw === 'string' && raw.startsWith('$')) {
    if (!VALID_TOKENS.has(raw)) throw new ValidationError('UNKNOWN_TOKEN', raw)
    const token = raw as TokenValue
    const now = new Date()
    switch (token) {
      case '$current_person': return ctx.personId
      case '$current_org': return ctx.orgId
      case '$today': return todayISO()
      case '$start_of_month': return startOfMonth(now)
      case '$end_of_month': return endOfMonth(now)
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      typeof item === 'string' && item.startsWith('$') ? (resolveValue(item, ctx) as string) : item
    ) as ResolvedFilter['value']
  }
  return raw as ResolvedFilter['value']
}

export function compileQuerySpec(spec: QuerySpec, ctx: CompilerContext): CompiledQuery {
  if (!Object.prototype.hasOwnProperty.call(ENTITY_WHITELIST, spec.entity)) {
    throw new ValidationError('UNKNOWN_ENTITY', String(spec.entity))
  }
  const e = ENTITY_WHITELIST[spec.entity]
  const { allowedColumns, numericColumns, groupableColumns, dateColumns, requiresTimeRange, requiredFilter } = e

  if (spec.limit !== undefined && (spec.limit < 1 || spec.limit > 500)) {
    throw new ValidationError('INVALID_LIMIT', String(spec.limit))
  }
  const effectiveLimit: number | undefined =
    spec.limit !== undefined ? spec.limit
    : (spec.aggregate !== undefined || spec.groupBy !== undefined ? 500 : undefined)

  for (const col of spec.select) if (!allowedColumns.has(col)) throw new ValidationError('UNKNOWN_COLUMN', col)

  const resolvedFilters: ResolvedFilter[] = []
  for (const f of spec.filters ?? []) {
    if (!allowedColumns.has(f.column)) throw new ValidationError('UNKNOWN_COLUMN', f.column)
    if (!VALID_FILTER_OPS.has(f.op)) throw new ValidationError('UNKNOWN_OP', String(f.op))
    resolvedFilters.push({ column: f.column, op: f.op, value: resolveValue(f.value, ctx) })
  }

  if (spec.groupBy !== undefined) {
    if (!allowedColumns.has(spec.groupBy)) throw new ValidationError('UNKNOWN_COLUMN', spec.groupBy)
    if (!groupableColumns.has(spec.groupBy)) throw new ValidationError('NOT_GROUPABLE_COLUMN', spec.groupBy)
  }
  if (spec.orderBy !== undefined && !allowedColumns.has(spec.orderBy.column)) {
    throw new ValidationError('UNKNOWN_COLUMN', spec.orderBy.column)
  }

  let resolvedAggregate: ResolvedAggregate | undefined
  if (spec.aggregate !== undefined) {
    const { fn, column, alias } = spec.aggregate
    if (!allowedColumns.has(column)) throw new ValidationError('UNKNOWN_COLUMN', column)
    if (NUMERIC_AGGREGATE_FNS.has(fn) && !numericColumns.has(column)) throw new ValidationError('NON_NUMERIC_AGGREGATE', column)
    resolvedAggregate = { fn, column, alias }
  }

  let resolvedTimeRange: ResolvedTimeRange | undefined
  if (spec.timeRange !== undefined) {
    const { column, from, to } = spec.timeRange
    if (!allowedColumns.has(column) || !dateColumns.has(column)) throw new ValidationError('UNKNOWN_COLUMN', column)
    const rFrom = resolveValue(from, ctx) as string
    const rTo = resolveValue(to, ctx) as string
    resolvedFilters.push({ column, op: 'date-range', value: [rFrom, rTo] })
    resolvedTimeRange = { column, from: rFrom, to: rTo }
  }

  // D7 ceiling — time-bearing entities require a time-range (MOS delta; catalog entities exempt).
  if (requiresTimeRange && resolvedTimeRange === undefined) {
    throw new ValidationError('MISSING_TIME_RANGE', `entity ${spec.entity} requires a timeRange`)
  }
  if (requiredFilter) {
    const has = resolvedFilters.some((f) => f.column === requiredFilter && (f.op === 'eq' || f.op === 'in'))
    if (!has) throw new ValidationError('MISSING_REQUIRED_FILTER', `entity ${spec.entity} requires a ${requiredFilter} filter (eq or in)`)
  }

  const compiled: CompiledQuery = {
    entity: spec.entity, schema: e.schema, table: e.table, resolvedFilters, resolvedSelect: spec.select,
    ...(spec.groupBy !== undefined && { resolvedGroupBy: spec.groupBy }),
    ...(resolvedAggregate !== undefined && { resolvedAggregate }),
    ...(resolvedTimeRange !== undefined && { resolvedTimeRange }),
    ...(spec.orderBy !== undefined && { resolvedOrderBy: spec.orderBy }),
    ...(effectiveLimit !== undefined && { limit: effectiveLimit }),
  }
  return compiled
}

/** The untrusted-output validation boundary (FR-UV-005/006). Fail-fast: throws on first invalid panel. */
export function compileCompositionSpec(spec: CompositionSpec, ctx: CompilerContext): CompiledPanel[] {
  const version = (spec as { version: unknown }).version
  if (version !== 1) throw new ValidationError('UNSUPPORTED_VERSION', String(version))
  if (spec.panels.length === 0) throw new ValidationError('UNSUPPORTED_VERSION', 'spec has no panels')
  if (spec.panels.length > 20) throw new ValidationError('UNSUPPORTED_VERSION', `spec has ${spec.panels.length} panels (max 20)`)

  return spec.panels.map((panel): CompiledPanel => {
    if (!validatePrimitive(panel.primitive)) throw new ValidationError('UNKNOWN_PRIMITIVE', panel.id)
    let compiledQuery: CompiledQuery
    try {
      compiledQuery = compileQuerySpec(panel.querySpec, ctx)
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ValidationError(err.code, err.detail != null ? `${err.detail} (panel: ${panel.id})` : `panel: ${panel.id}`)
      }
      throw err
    }
    return {
      id: panel.id, primitive: panel.primitive, compiledQuery,
      ...(panel.layout !== undefined && { layout: panel.layout }),
      ...(panel.props !== undefined && { props: panel.props }),
    }
  })
}
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task C2 — failing test `compiler.test.ts` (AC-UV-002..006) — RED→GREEN
**Write** `mos-app/src/lib/viewspec/compiler.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { compileQuerySpec, compileCompositionSpec } from './compiler'
import { ValidationError } from './types'
import type { QuerySpec, CompositionSpec } from './types'

const ctx = { personId: 'p1', orgId: 'o1' }
const taskQuery = (extra: Partial<QuerySpec> = {}): QuerySpec => ({
  entity: 'tasks', select: ['id', 'title', 'status'],
  timeRange: { column: 'due_date', from: '$start_of_month', to: '$end_of_month' },
  ...extra,
})

describe('compileQuerySpec — AC-UV-002', () => {
  it('rejects unknown entity / column / op / non-numeric aggregate / bad limit', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrow() // ok path
    expect(() => compileQuerySpec({ entity: 'nope' as never, select: [], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_ENTITY/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['secret'], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_COLUMN/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], filters: [{ column: 'status', op: 'matches' as never, value: 'x' }], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_OP/)
    expect(() => compileQuerySpec({ entity: 'sales_daily_revenue', select: ['clean_revenue'], aggregate: { fn: 'sum', column: 'branch_name', alias: 'x' }, timeRange: { column: 'revenue_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/NON_NUMERIC_AGGREGATE/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], limit: 0, timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/INVALID_LIMIT/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], limit: 999, timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/INVALID_LIMIT/)
  })
  it('rejects a non-groupable column in groupBy with NOT_GROUPABLE_COLUMN', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], groupBy: 'title', timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/NOT_GROUPABLE_COLUMN/)
  })
})

describe('compileQuerySpec — AC-UV-003 (tokens)', () => {
  it('resolves $current_person / $current_org / date tokens', () => {
    const c = compileQuerySpec({ entity: 'tasks', select: ['id'], filters: [{ column: 'responsible_person_id', op: 'eq', value: '$current_person' }], timeRange: { column: 'due_date', from: '$start_of_month', to: '$end_of_month' } }, ctx)
    expect(c.resolvedFilters[0].value).toBe('p1')
    expect(c.resolvedFilters[1].value).toEqual([expect.any(String), expect.any(String)])
  })
  it('rejects unknown $ token and unresolvable-known token (none in P1 set, but guard holds)', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], filters: [{ column: 'status', op: 'eq', value: '$bogus' }], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_TOKEN/)
  })
  it('never emits a $ token in the compiled output', () => {
    const c = compileQuerySpec(taskQuery({ filters: [{ column: 'responsible_person_id', op: 'eq', value: '$current_person' }] }), ctx)
    const json = JSON.stringify(c)
    expect(json).not.toMatch(/\$current/)
  })
})

describe('compileQuerySpec — AC-UV-004 (D7 ceilings)', () => {
  it('requires a timeRange for tasks (requiresTimeRange)', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'] }, ctx)).toThrowError(/MISSING_TIME_RANGE/)
  })
  it('does NOT require a timeRange for catalog entities (objectives)', () => {
    expect(() => compileQuerySpec({ entity: 'objectives', select: ['id', 'name'] }, ctx)).not.toThrow()
  })
  it('always carries a limit in [1,500] (explicit or defaulted for aggregate)', () => {
    const withAgg = compileQuerySpec({ entity: 'sales_daily_revenue', select: ['clean_revenue'], aggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' }, timeRange: { column: 'revenue_date', from: 'a', to: 'b' } }, ctx)
    expect(withAgg.limit).toBe(500)
  })
})

describe('compileCompositionSpec — AC-UV-005/006 (boundary)', () => {
  const spec = (panels: CompositionSpec['panels']): CompositionSpec => ({ version: 1, panels })
  const goodPanel = { id: 'p1', primitive: 'DataTable', querySpec: taskQuery() }
  it('rejects version !== 1', () => {
    expect(() => compileCompositionSpec({ version: 2 as 1, panels: [goodPanel] }, ctx)).toThrowError(/UNSUPPORTED_VERSION/)
  })
  it('rejects an off-registry primitive', () => {
    expect(() => compileCompositionSpec(spec([{ id: 'p1', primitive: 'Bogus', querySpec: taskQuery() }]), ctx)).toThrowError(/UNKNOWN_PRIMITIVE/)
  })
  it('rejects an off-whitelist entity (boundary never lets unknown through)', () => {
    expect(() => compileCompositionSpec(spec([{ id: 'p1', primitive: 'DataTable', querySpec: { entity: 'nope' as never, select: ['id'], timeRange: { column: 'due_date', from: 'a', to: 'b' } } }]), ctx)).toThrowError(/UNKNOWN_ENTITY/)
  })
  it('compiles a valid spec to CompiledPanels with schema+table', () => {
    const out = compileCompositionSpec(spec([goodPanel]), ctx)
    expect(out).toHaveLength(1)
    expect(out[0].compiledQuery).toMatchObject({ schema: 'mos', table: 'tasks' })
  })
  it('rejects an empty panel array', () => {
    expect(() => compileCompositionSpec(spec([]), ctx)).toThrow()
  })
})
```
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/compiler.test.ts` → GREEN.

## Task D1 — `viewspec/executor.ts`: schema-scoped dispatch + in-mem aggregate (AC-UV-008, AC-UV-009)
**Write** `mos-app/src/lib/viewspec/executor.ts`. Header: `// View-renderer executor. Adapted from the sibling internal project's ADR-0038. MOS delta: dispatch is SCHEMA-SCOPED (supabase.schema(entry.schema).from(entry.table)) — MOS is multi-schema; the sibling was single-schema. Uses the caller-JWT client; never service_role.`
Full content:
```ts
import { supabase } from '@/lib/supabase'
import { ENTITY_WHITELIST } from './types'
import type { CompiledQuery, ResolvedFilter } from './types'

type Row = Record<string, unknown>

function applyGroupByAggregate(rows: Row[], groupBy: string | undefined, aggregate: { fn: string; column: string; alias: string } | undefined): Row[] {
  if (!aggregate) return rows
  if (!groupBy) return [{ [aggregate.alias]: reduceAggregate(rows, aggregate) }]
  const groups = new Map<unknown, Row[]>()
  for (const row of rows) {
    const key = row[groupBy]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  return Array.from(groups.entries()).map(([key, g]) => ({ [groupBy]: key, [aggregate.alias]: reduceAggregate(g, aggregate) }))
}
function reduceAggregate(rows: Row[], agg: { fn: string; column: string; alias: string }): number {
  const vals = rows.map((r) => Number(r[agg.column] ?? 0))
  switch (agg.fn) {
    case 'count': return rows.length
    case 'sum': return vals.reduce((a, b) => a + b, 0)
    case 'avg': return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length
    case 'min': return vals.length === 0 ? 0 : Math.min(...vals)
    case 'max': return vals.length === 0 ? 0 : Math.max(...vals)
    default: return 0
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(chain: any, filter: ResolvedFilter): any {
  const { column, op, value } = filter
  switch (op) {
    case 'eq': return chain.eq(column, value)
    case 'neq': return chain.neq(column, value)
    case 'in': return chain.in(column, value as (string | number)[])
    case 'gt': return chain.gt(column, value)
    case 'gte': return chain.gte(column, value)
    case 'lt': return chain.lt(column, value)
    case 'lte': return chain.lte(column, value)
    case 'between':
    case 'date-range': {
      const [from, to] = value as [string | number, string | number]
      return chain.gte(column, from).lte(column, to)
    }
    default: return chain
  }
}

/**
 * Executes a CompiledQuery under the current viewer's JWT (the same RLS-scoped client the DAL uses).
 * Dispatch is SCHEMA-SCOPED (MOS delta). Never service_role. Row cap (≤500) applied as .limit().
 * Throws Error on PostgREST failure (MOS DAL convention). In-memory groupBy/aggregate when present.
 */
export async function executeCompiledQuery(compiled: CompiledQuery): Promise<unknown[]> {
  const entry = ENTITY_WHITELIST[compiled.entity]
  // The supabase client is schema-pinned to `shared` by default; .schema() re-points it per call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { schema: (s: string) => { from: (t: string) => any } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chain: any = db.schema(entry.schema).from(entry.table).select(compiled.resolvedSelect.join(','))
  for (const f of compiled.resolvedFilters) chain = applyFilter(chain, f)
  if (compiled.resolvedOrderBy) chain = chain.order(compiled.resolvedOrderBy.column, { ascending: compiled.resolvedOrderBy.dir === 'asc' })
  chain = chain.limit(compiled.limit ?? 500)
  const { data, error } = await chain
  if (error) throw new Error(`executeCompiledQuery failed — ${error.message}`)
  const rows: Row[] = (data as Row[]) ?? []
  if (compiled.resolvedAggregate || compiled.resolvedGroupBy) {
    return applyGroupByAggregate(rows, compiled.resolvedGroupBy, compiled.resolvedAggregate)
  }
  return rows
}
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task D2 — failing test `executor.test.ts` (AC-UV-008, AC-UV-009) — RED→GREEN
**Write** `mos-app/src/lib/viewspec/executor.test.ts` (mock `@/lib/supabase` with `{ supabase: { schema } }` — the MOS DAL test pattern):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { executeCompiledQuery } from './executor'
import { supabase } from '@/lib/supabase'
import type { CompiledQuery } from './types'

const schemaMock = vi.mocked(supabase.schema)
let recordedSchema: string | undefined
let recordedCalls: Record<string, unknown[]> = {}

function chainable(finalData: unknown[] = [], finalError: unknown = null) {
  recordedCalls = {}
  const mk = (): unknown => {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get: (_t, prop) => {
        if (prop === 'then') return undefined // not a thenable until awaited via the terminal object
        return (...args: unknown[]) => {
          ;(recordedCalls[prop as string] ??= []).push(args)
          return mk()
        }
      },
    }
    // The awaited terminal: define a thenable returning the final result.
    const terminal = { __isTerminal: true }
    Object.defineProperty(terminal, 'then', {
      value: (resolve: (v: unknown) => void) => Promise.resolve({ data: finalData, error: finalError }).then(resolve),
      configurable: true,
    })
    // Every method returns a Proxy that records + chains, except awaiting resolves the terminal.
    const proxy = new Proxy(terminal, handler)
    return proxy
  }
  return mk()
}

function mkCompiled(over: Partial<CompiledQuery> = {}): CompiledQuery {
  return {
    entity: 'tasks', schema: 'mos', table: 'tasks',
    resolvedSelect: ['id', 'title'], resolvedFilters: [],
    limit: 50, ...over,
  } as CompiledQuery
}

beforeEach(() => { recordedSchema = undefined; schemaMock.mockReset() })

describe('executeCompiledQuery — AC-UV-008 (schema-scoped dispatch)', () => {
  it('dispatches via supabase.schema("mos").from("tasks")', async () => {
    schemaMock.mockReturnValue({ from: () => chainable() })
    await executeCompiledQuery(mkCompiled())
    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(recordedCalls.from).toEqual([['tasks']])
    expect(recordedCalls.select).toEqual([['id,title']])
    expect(recordedCalls.limit).toEqual([[50]])
  })
  it('dispatches reporting via supabase.schema("reporting").from("sales_daily_revenue")', async () => {
    schemaMock.mockReturnValue({ from: () => chainable() })
    await executeCompiledQuery(mkCompiled({ entity: 'sales_daily_revenue', schema: 'reporting', table: 'sales_daily_revenue' }))
    expect(schemaMock).toHaveBeenCalledWith('reporting')
    expect(recordedCalls.from).toEqual([['sales_daily_revenue']])
  })
  it('throws on a PostgREST error (MOS DAL convention)', async () => {
    schemaMock.mockReturnValue({ from: () => chainable([], { message: 'boom' }) })
    await expect(executeCompiledQuery(mkCompiled())).rejects.toThrow(/executeCompiledQuery failed — boom/)
  })
})

describe('executeCompiledQuery — AC-UV-009 (in-mem aggregate)', () => {
  it('applies groupBy + sum over the returned rows', async () => {
    const rows = [
      { branch_code: 'BGR', clean_revenue: 100 },
      { branch_code: 'BGR', clean_revenue: 50 },
      { branch_code: 'KMG', clean_revenue: 200 },
    ]
    schemaMock.mockReturnValue({ from: () => chainable(rows) })
    const out = await executeCompiledQuery(mkCompiled({
      resolvedGroupBy: 'branch_code',
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
    }))
    expect(out).toEqual([
      { branch_code: 'BGR', total: 150 },
      { branch_code: 'KMG', total: 200 },
    ])
  })
})
```
> **Note:** the chainable proxy above is intricate; if it proves flaky, fall back to the explicit recorder builder used in `src/lib/db/tasks.test.ts` (`makeSchema`). The assertion contract (schema arg, from arg, select/limit/eq calls, returned aggregate) is what matters. Adjust the recorder mechanics to taste; keep AC-UV-008/009's assertions.
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/executor.test.ts` → GREEN. `npm run typecheck` → 0 errors.

## Task E1 — `viewspec/schema.ts`: `COMPOSITION_SPEC_SCHEMA` (AC-UV-020)
**Write** `mos-app/src/lib/viewspec/schema.ts` (pure TS). Header: `// COMPOSITION_SPEC_SCHEMA. Adapted from the sibling internal project's compose-view/schema.ts (ADR-0039). Enum source-of-truth = registry.keys() + ENTITY_WHITELIST. Used now by the harness for JSON-validation + by tests; P2's compose-view edge function will reuse it as the tool input_schema.`
Full content:
```ts
import { registry } from './registry'
import { ENTITY_WHITELIST, MAX_PANELS_PER_VIEW } from './types'

export const COMPOSITION_SPEC_SCHEMA = {
  type: 'object' as const,
  required: ['version', 'panels'] as string[],
  additionalProperties: false,
  properties: {
    version: { type: 'integer' as const, const: 1 },
    panels: {
      type: 'array' as const,
      maxItems: MAX_PANELS_PER_VIEW,
      items: {
        type: 'object' as const,
        required: ['id', 'primitive', 'querySpec'] as string[],
        additionalProperties: false,
        properties: {
          id: { type: 'string' as const },
          primitive: { type: 'string' as const, enum: registry.keys() }, // FR-UV-002 single source of truth
          querySpec: {
            type: 'object' as const,
            required: ['entity', 'select'] as string[],
            additionalProperties: false,
            properties: {
              entity: { type: 'string' as const, enum: Object.keys(ENTITY_WHITELIST) }, // FR-UV-003
              select: { type: 'array' as const, items: { type: 'string' as const } },
              filters: {
                type: 'array' as const,
                items: {
                  type: 'object' as const, required: ['column', 'op', 'value'] as string[],
                  properties: {
                    column: { type: 'string' as const },
                    op: { type: 'string' as const, enum: ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'date-range'] },
                    value: {},
                  },
                },
              },
              groupBy: { type: 'string' as const },
              aggregate: {
                type: 'object' as const, required: ['fn', 'column', 'alias'] as string[],
                properties: {
                  fn: { type: 'string' as const, enum: ['count', 'sum', 'avg', 'min', 'max'] },
                  column: { type: 'string' as const }, alias: { type: 'string' as const },
                },
              },
              timeRange: {
                type: 'object' as const, required: ['column', 'from', 'to'] as string[],
                properties: { column: { type: 'string' as const }, from: { type: 'string' as const }, to: { type: 'string' as const } },
              },
              limit: { type: 'integer' as const, minimum: 1 },
              orderBy: {
                type: 'object' as const, required: ['column', 'dir'] as string[],
                properties: { column: { type: 'string' as const }, dir: { type: 'string' as const, enum: ['asc', 'desc'] } },
              },
            },
          },
          layout: { type: 'object' as const, properties: { colSpan: { type: 'integer' as const, minimum: 1 }, rowSpan: { type: 'integer' as const, minimum: 1 } } },
          props: { type: 'object' as const },
        },
      },
    },
  },
}
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task E2 — failing test `schema.test.ts` (AC-UV-020) — RED→GREEN
**Write** `mos-app/src/lib/viewspec/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { COMPOSITION_SPEC_SCHEMA } from './schema'
import { registry } from './registry'
import { ENTITY_WHITELIST } from './types'

describe('COMPOSITION_SPEC_SCHEMA — AC-UV-020', () => {
  it('primitive enum = registry.keys()', () => {
    const primEnum = (COMPOSITION_SPEC_SCHEMA.properties.panels.items.properties.primitive.enum as unknown as string[])
    expect([...primEnum].sort()).toEqual([...registry.keys()].sort())
  })
  it('entity enum = Object.keys(ENTITY_WHITELIST)', () => {
    const entEnum = (COMPOSITION_SPEC_SCHEMA.properties.panels.items.properties.querySpec.properties.entity.enum as unknown as string[])
    expect([...entEnum].sort()).toEqual([...Object.keys(ENTITY_WHITELIST)].sort())
  })
  it('maxItems = MAX_PANELS_PER_VIEW (20)', () => {
    expect(COMPOSITION_SPEC_SCHEMA.properties.panels.maxItems).toBe(20)
  })
})
```
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/schema.test.ts` → GREEN.

## Task F1 — migration `20260705000001_mos_user_views.sql` (AC-UV-010..013)
**Write** `supabase/migrations/20260705000001_mos_user_views.sql`. (Confirm `20260705000001` is the next free timestamp; if `20260704000003+` is taken, use the next free `YYYYMMDDNNNNNN`.) Header comment: `-- mos.user_views — declarative user-composed surfaces (ADR-0018 D6 P1 / ADR-0017 D5/D6). Adapted from the sibling internal project's user_views migration; MOS deltas: mos schema (not public), owner_id (person), shared_team via NEW shared.is_managed_by, org-gate baked in from day 1 (sibling SEC-HIGH-1 lesson).`
Full content:
```sql
-- mos.user_views — declarative user-composed surfaces (ADR-0018 D6 P1 / ADR-0017 D5/D6).
-- Adapted from the sibling internal project's user_views migration; MOS deltas: mos schema
-- (not public), owner_id (person_id), shared_team via NEW shared.is_managed_by (the reverse of
-- shared.is_manager_of — owner shares TO their reports), org-gate baked in from day 1
-- (sibling SEC-HIGH-1 lesson: org_id must be the wall on EVERY SELECT branch).
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot.

-- ── shared.is_managed_by(manager_person_id): true iff manager manages the current person ──
-- The reverse of shared.is_manager_of (which answers "does current manage target"). For
-- user_views.shared_team: the OWNER (a manager) shares TO their reports, so a viewer V sees owner
-- O's shared view iff O manages V — i.e. is_managed_by(O) from V's session. Recursive CTE mirrors
-- is_manager_of (cycle-safe via UNION); source/target swapped.
create or replace function shared.is_managed_by(p_manager_person_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  current_roles as (
    select pr.role_id from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  ),
  ancestor_roles as (
    select r.id, r.reports_to_role_id
    from shared.roles r
    join current_roles cr on cr.role_id = r.id
    union
    select parent.id, parent.reports_to_role_id
    from shared.roles parent
    join ancestor_roles a on a.reports_to_role_id = parent.id
  ),
  manager_roles as (
    select pr.role_id from shared.person_roles pr
    where pr.person_id = p_manager_person_id
  )
  select exists (
    select 1
    from ancestor_roles a
    join manager_roles mr on mr.role_id = a.id
    where a.id not in (select role_id from current_roles)
  )
$$;
comment on function shared.is_managed_by(uuid) is
  'True iff p_manager_person_id manages the current person (reverse of is_manager_of). Backs user_views.shared_team (ADR-0017 D6 manager-share).';

-- ── mos.user_views table ──────────────────────────────────────────────────────
create table mos.user_views (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  owner_id    uuid not null references shared.people(id)
                default shared.current_person_id(),
  name        text not null check (btrim(name) <> ''),
  spec        jsonb not null default '{}'::jsonb,
  scope       text not null default 'private' check (scope in ('private','shared_team')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- Hot-path indexes: per-org listing + live-only fast path + owner-list fast path.
create index mos_user_views_org_idx   on mos.user_views (org_id);
create index mos_user_views_live_idx  on mos.user_views (org_id) where archived_at is null;
create index mos_user_views_owner_idx on mos.user_views (owner_id) where archived_at is null;

alter table mos.user_views enable row level security;
alter table mos.user_views force  row level security;

grant select, insert, update on mos.user_views to authenticated; -- no delete (soft-archive)

-- SELECT (SEC-HIGH-1 org-gate on EVERY branch): org must match FIRST, then owner OR shared_team
-- (owner manages the viewer via is_managed_by). A private row owned by another person is invisible
-- even to same-org members/admin. A cross-org row of ANY scope/owner is 0 rows.
create policy user_views_select on mos.user_views
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      owner_id = shared.current_person_id()
      or (scope = 'shared_team' and shared.is_managed_by(owner_id))
    )
  );

-- INSERT: org + owner pinned to the caller (defaults + WITH CHECK). A browser holds a valid JWT +
-- anon key, so the post-image predicate is required, not optional (sibling 0045/0053 lesson).
create policy user_views_insert on mos.user_views
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- UPDATE: owner-only; org + owner re-pinned on the post-image (cannot reassign ownership).
create policy user_views_update on mos.user_views
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- No delete policy (soft-archive via archived_at, the ADR-0001/0004 archive discipline).

-- ── Manual rollback ───────────────────────────────────────────────────────────
-- drop policy if exists user_views_update on mos.user_views;
-- drop policy if exists user_views_insert on mos.user_views;
-- drop policy if exists user_views_select on mos.user_views;
-- alter table mos.user_views disable row level security;
-- drop index if exists mos_user_views_owner_idx;
-- drop index if exists mos_user_views_live_idx;
-- drop index if exists mos_user_views_org_idx;
-- drop table if exists mos.user_views;
-- drop function if exists shared.is_managed_by(uuid);
```
**Verify (local Supabase reset — pgTAP runs in Task F3):** `cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset` → exits 0 (migration applies clean). **Do NOT run against staging/prod.**

## Task F2 — seed-helper for the pgTAP test (if missing)
**Check:** `grep -rn "_test_seed_role_tree\|_test_seed_access_roles" supabase/migrations/ | head`. If a role-tree + access-role seed helper exists (it does — used by `60_reporting_sales_daily_rels.sql`), reuse it. If the manager/report relationship you need isn't seeded by those, add a tiny `mos._test_seed_manager_chain()` in a new migration OR inline the role rows in the pgTAP test (preferred — keep migrations clean). **Decision for this plan:** inline the role tree in the pgTAP test (Task F3) to avoid a new migration.
**Verify:** `grep -rn "_test_seed_role_tree" /Users/ariefsaid/Coding/gordi-mos/supabase/migrations/` → shows the helper exists + its signature.

## Task F3 — pgTAP `62_mos_user_views_rls.sql` (AC-UV-010..013)
**Write** `supabase/tests/62_mos_user_views_rls.sql` (mirror `60_reporting_sales_daily_rls.sql` structure: `begin; create extension pgtap; select plan(N); … select finish();`). It must:
1. Seed an org, a manager person `M`, a report person `R` (M manages R via a role tree: M holds an ancestor role of R's role), a peer person `P` (unrelated), and a foreign-org person `F`.
2. **AC-UV-010:** `select ok(relrowsecurity AND relforcerowsecurity … 'mos.user_views', …)` + assert `column default` on `org_id` is `shared.current_org_id()` + assert INSERT/UPDATE policies have `WITH CHECK` (query `pg_policies`).
3. **AC-UV-011:** as `M`, insert a `private` view owned by M; assert M sees it (count 1); as `R`, assert 0 rows; as `F` (cross-org), assert 0 rows.
4. **AC-UV-012:** as `M`, insert a `shared_team` view owned by M; assert `R` sees it (count 1); assert `P` (peer, not M's report) sees 0; assert an unrelated manager sees 0; assert `F` (cross-org) sees 0.
5. **AC-UV-013:** as `R`, attempt an INSERT with a spoofed `owner_id = M.id` (R claiming M's ownership) → expect rejection (RLS `WITH CHECK`); assert the row was not inserted. Repeat with a spoofed `org_id` (foreign org) → rejected.
> Use `set local role authenticated; set local request.jwt.claims = '{"org_id":"…","person_id":"…","access_roles":["member"]}';` per persona (the exact claim shape MOS RLS reads — see `60_reporting_sales_daily_rls.sql`). `select throws_ok($$ INSERT …$$, '42501', …)` for the WITH-CHECK rejections.
**Verify:** `cd /Users/ariefsaid/Coding/gordi-mos && supabase test db -- 62_mos_user_views_rls.sql` → all `ok`/`is` pass (or `supabase db reset && supabase test db` to run the whole suite — slower). 

## Task G1 — `lib/db/user-views.ts` DAL (AC-UV-014)
**Write** `mos-app/src/lib/db/user-views.ts`. Header: `// DAL for mos.user_views (ADR-0018 D6 P1 / ADR-0017 D5). Adapted from the sibling internal project's db/userViews.ts; MOS deltas: mos schema (supabase.schema('mos')), owner_id (person), MOS error convention (throw new Error). RLS stamps org_id + owner_id — NEVER sent by the client.`
Full content:
```ts
import { supabase } from '@/lib/supabase'
import type { CompositionSpec } from '@/lib/viewspec/types'

const mos = () => supabase.schema('mos')

export type UserViewScope = 'private' | 'shared_team'

export interface UserViewRow {
  id: string
  name: string
  spec: CompositionSpec
  scope: UserViewScope
  created_at: string
  updated_at: string
  archived_at: string | null
  // org_id / owner_id are RLS-stamped; not selected back (caller does not need them).
}

export interface UserViewInput {
  name: string
  spec: CompositionSpec
  scope?: UserViewScope
}

const SELECT = 'id,name,spec,scope,created_at,updated_at,archived_at'

export async function listUserViews(): Promise<UserViewRow[]> {
  const { data, error } = await mos()
    .from('user_views').select(SELECT).is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listUserViews failed — ${error.message}`)
  return (data ?? []) as unknown as UserViewRow[]
}

export async function getUserView(id: string): Promise<UserViewRow | null> {
  const { data, error } = await mos().from('user_views').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`getUserView failed — ${error.message}`)
  return (data ?? null) as unknown as UserViewRow | null
}

export async function createUserView(input: UserViewInput): Promise<UserViewRow> {
  // org_id + owner_id are NEVER sent — defaults + WITH CHECK pin them (RLS authority).
  const { data, error } = await mos()
    .from('user_views').insert({ name: input.name, spec: input.spec, scope: input.scope ?? 'private' })
    .select(SELECT).single()
  if (error) throw new Error(`createUserView failed — ${error.message}`)
  return data as unknown as UserViewRow
}

export async function updateUserView(id: string, input: UserViewInput): Promise<void> {
  const { error } = await mos()
    .from('user_views').update({
      name: input.name, spec: input.spec, scope: input.scope ?? 'private',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  if (error) throw new Error(`updateUserView failed — ${error.message}`)
}

export async function archiveUserView(id: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await mos().from('user_views').update({ archived_at: now, updated_at: now }).eq('id', id)
  if (error) throw new Error(`archiveUserView failed — ${error.message}`)
}
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task G2 — failing test `user-views.test.ts` (AC-UV-014) — RED→GREEN
**Write** `mos-app/src/lib/db/user-views.test.ts` (mock `../supabase` with `{ supabase: { schema } }`, the `tasks.test.ts` recorder pattern). Assert:
- `listUserViews()` calls `schema('mos').from('user_views')`, `.is('archived_at', null)`, `.order('updated_at', …)`, and the select string contains no `org_id`/`owner_id`.
- `createUserView({ name, spec, scope })` inserts an object whose keys are **exactly** `{ name, spec, scope }` — **never** `org_id`/`owner_id`.
- `updateUserView` sends `{ name, spec, scope, updated_at }` — never `org_id`/`owner_id`.
- A PostgREST error (`error: { message: 'x' }`) is re-thrown as `Error(/… failed — x/)`.
- `getUserView` returns `null` on `{ data: null, error: null }`.
Use a small recorder (copy the `makeSchema` shape from `tasks.test.ts` — 2 queue entries: one for the list, one for the create). Keep it focused; ~6 assertions.
**Verify:** `cd mos-app && npm test -- --run src/lib/db/user-views.test.ts` → GREEN.

## Task H1 — `viewspec/renderer.tsx`: `<UserViewRenderer>` + `buildCompilerContext` (AC-UV-015..017)
**Write** `mos-app/src/lib/viewspec/renderer.tsx`. Header: `// UserViewRenderer — the trusted renderer (ADR-0017 D5). Compiles the spec through the boundary on every render, executes each CompiledQuery under the viewer's JWT, and hydrates the registered primitive. Degrades to an error state on ValidationError (never crash, never render unvalidated).`
Full content:
```tsx
import { useEffect, useState } from 'react'
import { compileCompositionSpec, type CompiledPanel } from './compiler' // re-export below
import { compileCompositionSpec as _compile } from './compiler'
import { executeCompiledQuery } from './executor'
import { registry } from './registry'
import { ValidationError, type CompositionSpec, type CompilerContext, type CompiledPanel as CP } from './types'
import { useT } from '@/i18n/use-t'

export type { CompilerContext }
export type CompiledPanel = CP

export class RenderError extends Error {
  readonly code: string
  readonly detail?: string
  constructor(code: string, detail?: string) { super(detail ? `${code}: ${detail}` : code); this.code = code; this.detail = detail }
}

/** Build a CompilerContext from the viewer + session (personId from viewer.person.id; orgId decoded from the JWT). */
export function buildCompilerContext(personId: string, orgId: string): CompilerContext {
  return { personId, orgId }
}

type PanelState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'stub'; name: string } | { kind: 'ready'; data: unknown[]; compiled: CP }

function useCompiledPanels(spec: CompositionSpec, ctx: CompilerContext) {
  const [panels, setPanels] = useState<CompiledPanel[] | null>(null)
  const [compileErr, setCompileErr] = useState<RenderError | null>(null)
  useEffect(() => {
    try {
      setPanels(_compile(spec, ctx))
      setCompileErr(null)
    } catch (e) {
      const code = e instanceof ValidationError ? e.code : 'COMPILE_ERROR'
      const detail = e instanceof Error ? e.message : String(e)
      setPanels(null)
      setCompileErr(new RenderError(code, detail))
    }
  }, [spec, ctx.personId, ctx.orgId])
  return { panels, compileErr }
}

export function UserViewRenderer({ spec, ctx, onRetry }: { spec: CompositionSpec; ctx: CompilerContext; onRetry?: () => void }) {
  const t = useT()
  const { panels, compileErr } = useCompiledPanels(spec, ctx)

  if (compileErr) {
    return (
      <section className="uv-render uv-render--error" role="alert">
        <h2 className="uv-render__title">{t('views.render.error.title')}</h2>
        <p className="uv-render__body">{t('views.render.error.body')}</p>
        <p className="uv-render__code" data-testid="uv-render-error-code">{compileErr.code}</p>
        {onRetry && <button type="button" className="uv-render__retry" onClick={onRetry}>{t('views.render.retry')}</button>}
      </section>
    )
  }
  if (!panels) {
    return <section className="uv-render uv-render--loading" aria-busy="true">{t('views.render.loading')}</section>
  }
  return (
    <section className="uv-render" aria-label={t('views.render.aria')}>
      {panels.map((p) => <PanelHost key={p.id} compiled={p} />)}
    </section>
  )
}

function PanelHost({ compiled }: { compiled: CompiledPanel }) {
  const t = useT()
  const desc = registry.get(compiled.primitive)
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    // Stub primitives never execute — degrade to the planned placeholder (ADR-0017 D5 philosophy).
    if (desc?.status === 'stub') { setState({ kind: 'stub', name: compiled.primitive }); return }
    executeCompiledQuery(compiled.compiledQuery)
      .then((data) => { if (!cancelled) setState({ kind: 'ready', data, compiled }) })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ kind: 'error', message })
      })
    return () => { cancelled = true }
  }, [compiled, desc?.status])

  if (state.kind === 'loading') return <div className="uv-panel uv-panel--loading" aria-busy="true">{t('views.render.loading')}</div>
  if (state.kind === 'stub') {
    return (
      <div className="uv-panel uv-panel--stub" role="status" data-testid={`uv-stub-${compiled.primitive}`}>
        <p className="uv-panel__stub-title">{t('views.stub.title')}</p>
        <p className="uv-panel__stub-body">{t('views.stub.body', { name: state.name })}</p>
      </div>
    )
  }
  if (state.kind === 'error') {
    return <div className="uv-panel uv-panel--error" role="alert">{t('views.panel.error')}</div>
  }
  // READY — hydrate the live primitive with the executed data + the spec's static props.
  // (Full per-primitive hydration — DataTable columns from props, KPITile value formatting — is a
  // thin mapping layer; P1 ships a faithful "primitive name + row count" render that proves the
  // compile→execute→hydrate loop end-to-end. Rich hydration lands with the polished builder.)
  return (
    <div className="uv-panel uv-panel--ready" data-testid={`uv-panel-${compiled.primitive}`}>
      <p className="uv-panel__name">{compiled.primitive}</p>
      <p className="uv-panel__rows" data-testid="uv-panel-row-count">{t('views.panel.rows', { n: state.data.length })}</p>
    </div>
  )
}

export { compileCompositionSpec }
```
> **Note on hydration depth:** P1 ships the **loop proof** (compile → execute → hydrate with primitive-name + row-count + stub/error states). Full per-primitive data-binding (DataTable column descriptors from `props`, KPITile value formatting, ChartFrame child injection) is a **thin additive layer** that lands with the polished builder issue — it does not change the boundary, the executor, or the registry. This keeps P1 to its "zero-agent proof" scope and avoids over-building hydration the agent (P2) will also drive. **Residual risk:** a reviewer may expect a fully-rendered DataTable; the row-count proof is the documented P1 bar (AC-UV-015 asserts the loop, not the cosmetics).
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task H2 — failing test `renderer.test.tsx` (AC-UV-015..017) — RED→GREEN
**Write** `mos-app/src/lib/viewspec/renderer.test.tsx`. Mock `./executor` (`vi.mock('./executor', () => ({ executeCompiledQuery: vi.fn() }))`) + wrap in `I18nProvider`. Cases:
- **AC-UV-015:** valid spec → `executeCompiledQuery` called once per panel; panel renders with `data-testid="uv-panel-DataTable"` + a non-zero row count when the mock resolves `[{id:1},{id:2}]`.
- **AC-UV-016:** spec with primitive `'Bogus'` → renderer shows `views.render.error.title` + `UNKNOWN_PRIMITIVE` in `[data-testid="uv-render-error-code"]`; `executeCompiledQuery` **not** called.
- **AC-UV-016b:** spec with entity `'nope'` → `UNKNOWN_ENTITY` error state; executor not called.
- **AC-UV-017:** panel primitive `'doc-editor'` (stub) → `data-testid="uv-stub-doc-editor"`; executor **not** called.
- Error path: `executeCompiledQuery` rejects → panel shows `views.panel.error`.
Use `waitFor`/`findByTestId` for the async ready/stub states. Provide a `wrapper` with `I18nProvider` (copy the `messages.test.tsx` wrapper pattern). ~5 it-blocks.
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/renderer.test.tsx` → GREEN.

## Task I1 — i18n strings (en + id parity) for harness + renderer (NFR-UV-I18N-001)
**Edit** `mos-app/src/i18n/messages.ts` — append to **both** `en` and `id` (identical key sets; the `messages.test.ts` parity test enforces this):
```ts
    // en block (append before the closing brace of en)
    'views.render.aria': 'User view',
    'views.render.loading': 'Loading…',
    'views.render.error.title': 'This view could not be rendered',
    'views.render.error.body': 'The composition spec references something unknown. Edit the spec and try again.',
    'views.render.retry': 'Try again',
    'views.panel.error': 'This panel could not be loaded.',
    'views.panel.rows': '${n} rows',
    'views.stub.title': 'Planned primitive',
    'views.stub.body': '${name} is on the roadmap and not yet implemented.',
    'dev.views.title': 'User Views',
    'dev.views.subtitle': 'Compose + render a user view by hand — no agent',
    'dev.views.json': 'Composition spec (JSON)',
    'dev.views.name': 'View name',
    'dev.views.scope.private': 'Private',
    'dev.views.scope.shared_team': 'Shared with my team',
    'dev.views.save': 'Save',
    'dev.views.render': 'Render',
    'dev.views.empty': 'No saved views yet',
    'dev.views.saved': 'Saved',
    'dev.views.invalid': 'Invalid JSON — fix and try again',
```
```ts
    // id block (append before the closing brace of id) — SAME keys, Indonesian strings
    'views.render.aria': 'Tampilan pengguna',
    'views.render.loading': 'Memuat…',
    'views.render.error.title': 'Tampilan ini tidak dapat dirender',
    'views.render.error.body': 'Spec komposisi merujuk sesuatu yang tidak dikenal. Perbaiki spec lalu coba lagi.',
    'views.render.retry': 'Coba lagi',
    'views.panel.error': 'Panel ini tidak dapat dimuat.',
    'views.panel.rows': '${n} baris',
    'views.stub.title': 'Primitif rencana',
    'views.stub.body': '${name} ada di peta jalan dan belum diimplementasikan.',
    'dev.views.title': 'Tampilan Pengguna',
    'dev.views.subtitle': 'Susun + render tampilan pengguna secara manual — tanpa agen',
    'dev.views.json': 'Spec komposisi (JSON)',
    'dev.views.name': 'Nama tampilan',
    'dev.views.scope.private': 'Pribadi',
    'dev.views.scope.shared_team': 'Bagikan ke tim saya',
    'dev.views.save': 'Simpan',
    'dev.views.render': 'Render',
    'dev.views.empty': 'Belum ada tampilan tersimpan',
    'dev.views.saved': 'Tersimpan',
    'dev.views.invalid': 'JSON tidak valid — perbaiki lalu coba',
```
**Verify:** `cd mos-app && npm test -- --run src/i18n/messages.test.ts` → GREEN (the parity test `AC-I01` enforces en==id keys). `npm run typecheck` → 0 errors.

## Task I2 — `pages/dev-views-page.tsx` + css (AC-UV-018)
**Write** `mos-app/src/pages/dev-views-page.tsx`. Header: `// Dev harness — the zero-agent proof (ADR-0018 D6 P1). Hand-compose a spec, save, reopen, render. DEV-only + feature-flagged + auth-gated.`
Behavior (phone-first, DESIGN.md tokens via `dev-views-page.css`):
- On mount: `listUserViews()` → render the owner's saved views as a tappable list (`dev.views.empty` when none).
- A JSON `<textarea>` (seeded with a valid sample spec — a `DataTable` panel over `tasks` with a `due_date` timeRange) + a name `<input>` + a scope `<select>` (private/shared_team) + **Save** (parse JSON → if invalid, show `dev.views.invalid`; else `createUserView` → toast `dev.views.saved` → refresh list) + **Render** (parse JSON → if valid, set local `spec` state → `<UserViewRenderer spec=… ctx=… />`).
- Read the viewer for `buildCompilerContext`: `personId` from `useAuth().user` → the person id (resolve via the existing viewer hook the app uses — confirm the exact hook in `src/auth/` during build; if the session only exposes `user.id` (auth uid), `personId` must come from `resolveViewer(user.id)` which the app already calls — reuse its result). `orgId`: decode the `org_id` claim from the session access token (parallel to `decodeAccessRolesClaim` in `viewer.ts`; add a tiny `decodeOrgIdClaim` local helper, or extend the existing decoder). **Build note:** confirm the auth/viewer hook name in `src/auth/` + `src/lib/db/viewer.ts` before wiring — the plan assumes a `useAuth()`/`useViewer()`-style hook exists; adapt the import to the real name.
- Route param: if `/dev/views/:viewId`, `getUserView(viewId)` → load its spec into the editor + render it.
```tsx
// Sketch — wire to the real auth/viewer hook during build (see note above).
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { UserViewRenderer, buildCompilerContext } from '@/lib/viewspec/renderer'
import { listUserViews, getUserView, createUserView, type UserViewRow } from '@/lib/db/user-views'
import type { CompositionSpec } from '@/lib/viewspec/types'
import './dev-views-page.css'

const SAMPLE: CompositionSpec = {
  version: 1,
  panels: [{
    id: 'p1', primitive: 'DataTable',
    querySpec: { entity: 'tasks', select: ['id', 'title', 'status', 'due_date'], timeRange: { column: 'due_date', from: '$start_of_month', to: '$end_of_month' } },
  }],
}

export function DevViewsPage({ viewId }: { viewId?: string }) {
  const t = useT()
  const [views, setViews] = useState<UserViewRow[]>([])
  const [name, setName] = useState('My view')
  const [text, setText] = useState(JSON.stringify(SAMPLE, null, 2))
  const [parsed, setParsed] = useState<CompositionSpec | null>(SAMPLE)
  const [msg, setMsg] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ personId: string; orgId: string } | null>(null)
  // TODO(build): wire ctx from the real viewer/auth hook (person.id + decoded org_id claim).

  const refresh = async () => setViews(await listUserViews().catch(() => []))
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    if (!viewId) return
    getUserView(viewId).then((v) => { if (v) { setName(v.name); setText(JSON.stringify(v.spec, null, 2)); setParsed(v.spec) } })
  }, [viewId])

  const parse = (): CompositionSpec | null => { try { return JSON.parse(text) as CompositionSpec } catch { return null } }
  const onRender = () => { const p = parse(); setParsed(p); setMsg(p ? null : t('dev.views.invalid')) }
  const onSave = async () => {
    const p = parse(); if (!p) { setMsg(t('dev.views.invalid')); return }
    await createUserView({ name, spec: p, scope: 'private' })
    setMsg(t('dev.views.saved')); refresh()
  }

  return (
    <div className="dev-views">
      <header className="dev-views__head"><h1>{t('dev.views.title')}</h1><p className="dev-views__sub">{t('dev.views.subtitle')}</p></header>
      <section className="dev-views__list">{views.length === 0 ? <p>{t('dev.views.empty')}</p> : views.map((v) => <a key={v.id} href={`/mos/dev/views/${v.id}`} className="dev-views__list-item">{v.name}</a>)}</section>
      <section className="dev-views__editor">
        <label className="dev-views__field">{t('dev.views.name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="dev-views__field">{t('dev.views.json')}<textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="dev-views__actions">
          <button type="button" onClick={onSave}>{t('dev.views.save')}</button>
          <button type="button" onClick={onRender}>{t('dev.views.render')}</button>
        </div>
        {msg && <p className="dev-views__msg" role="status">{msg}</p>}
      </section>
      <section className="dev-views__render">{parsed && ctx && <UserViewRenderer spec={parsed} ctx={buildCompilerContext(ctx.personId, ctx.orgId)} />}</section>
    </div>
  )
}
```
**Write** `mos-app/src/pages/dev-views-page.css` — phone-first single column, DESIGN.md tokens (`--surface`, `--text`, `--border`, etc. — confirm exact token names in `DESIGN.md` / `index.css` during build); `@media (min-width: 920px)` widens editor + render side-by-side. Use the existing `.kt-*`/dashboard class grammar as the style reference.
**Verify:** `cd mos-app && npm run typecheck` → 0 errors.

## Task I3 — failing test `dev-views-page.test.tsx` (AC-UV-018) — RED→GREEN
**Write** `mos-app/src/pages/dev-views-page.test.tsx`. Mock `@/lib/db/user-views` (`vi.mock`) + `@/lib/viewspec/renderer` (render a stub marker to isolate the harness from the renderer's async) + wrap in `I18nProvider`. Cases:
- Renders the title + the seeded sample spec in the textarea.
- **Save** → `createUserView` called with `{ name, spec: <parsed>, scope: 'private' }`; "Saved" status appears; `listUserViews` re-called.
- Invalid JSON + **Render** → "Invalid JSON" status; renderer not invoked.
- Valid JSON + **Render** → `<UserViewRenderer>` (the mock) invoked with the parsed spec.
- A `viewId` prop → `getUserView(viewId)` called; editor prefilled.
~5 it-blocks. (Do not assert the second-user-cannot-see here — that is a pgTAP/DAL concern already covered by AC-UV-011/014; the e2e layer in Task J3 can add a cross-user assertion if a Playwright harness is desired.)
**Verify:** `cd mos-app && npm test -- --run src/pages/dev-views-page.test.tsx` → GREEN.

## Task J1 — mount the route (DEV + flag gated)
**Edit** `mos-app/src/router.tsx` — add the import + the route inside `AppShell` children (next to the kitchen/admin block), before the `path: '*'` catch-all:
```tsx
import { DevViewsPage } from './pages/dev-views-page'
import { SHOW_USER_VIEWS } from './config/features'
// …inside AppShell children, before '*':
          // ADR-0018 P1 — view-composition dev harness (zero-agent proof). DEV-only + feature-flagged;
          // redirects to / otherwise. Auth-gated by ProtectedRoute (reads/writes user_views via viewer JWT).
          { path: 'dev/views', element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace /> },
          { path: 'dev/views/:viewId', element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace /> },
```
**Verify:** `cd mos-app && npm run typecheck` → 0 errors. `npm test -- --run src/router.test.tsx` → GREEN (the existing router test must still pass; add an assertion there that `/dev/views` redirects when the flag is off — optional, the gate is exercised in J3).

## Task J2 — the de-reference firewall grep gate (AC-UV-019)
**Write** `mos-app/src/lib/viewspec/viewspec-firewall.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs' // or use a tiny readdirSync walk
import { resolve } from 'node:path'

const ROOT = resolve(__dirname)
const files: string[] = []
;(() => { // collect .ts/.tsx under viewspec/ + db/user-views.ts + pages/dev-views-page.tsx
  const { readdirSync, statSync } = require('node:fs')
  const walk = (d: string) => readdirSync(d).forEach((f: string) => {
    const p = resolve(d, f); if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f)) files.push(p)
  })
  walk(resolve(__dirname))
  files.push(resolve(__dirname, '../db/user-views.ts'), resolve(__dirname, '../../pages/dev-views-page.tsx'))
})()

describe('de-reference firewall — AC-UV-019', () => {
  const FORBIDDEN = ['service_role', 'SERVICE_ROLE', 'supabase.service_role', '00000000-0000-0000-0000-000000000001']
  // NOTE: the sibling's name + upstream agent-native framework name are intentionally NOT written here;
  // this test only guards what MUST NOT appear. A human review confirms no brand string leaks (the
  // 'Ported from the sibling internal project' phrasing is the ONLY allowed reference).
  it('no forbidden literal in any ported artifact', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const needle of FORBIDDEN) {
        expect(src, `${f} must not contain "${needle}"`).not.toContain(needle)
      }
    }
  })
})
```
> **Refinement at build:** replace the `require`/walk with `fast-glob` if it's already a dep, else the `readdirSync` walk above works (it's synchronous + test-only). The forbidden list intentionally omits brand names (writing them would itself be a leak); a human review (code-quality-reviewer) confirms no sibling/upstream brand string appears and that *"Ported/Adapted from the sibling internal project"* is the only provenance phrase.
**Verify:** `cd mos-app && npm test -- --run src/lib/viewspec/viewspec-firewall.test.ts` → GREEN.

## Task J3 — curated e2e (AC-UV-018 end-to-end) — OPTIONAL but recommended
If a Playwright harness is wired (`e2e/` exists): add `e2e/dev-views.spec.ts` — log in as a seeded user, visit `/mos/dev/views`, paste the sample spec, Save, reopen from the list, assert the panel renders. This is the ADR-0017 "one curated e2e" (compose → save → reopen). If no Playwright harness exists yet, **skip** — the RTL integration test (Task I3) + the pgTAP RLS proof (F3) cover the contract; note the e2e as a follow-up. **Decision:** implement only if `e2e/` is already set up; otherwise defer + record in §7.
**Verify:** `cd mos-app && npx playwright test e2e/dev-views.spec.ts` (only if implemented) → GREEN.

## Task J4 — full verification gate (Definition of Done)
Run the complete gate (must be green before PR):
```bash
cd mos-app
npm run typecheck          # 0 errors
npx eslint 'src/lib/viewspec/**' 'src/lib/db/user-views.ts' 'src/pages/dev-views-page.tsx' --max-warnings=0
npm test -- --run          # all unit/RTL green; coverage ≥80% on changed globs
cd ..
supabase db reset && supabase test db   # pgTAP green (incl. 62_mos_user_views_rls.sql)
```
**Verify:** all four green. Coverage report shows `src/lib/viewspec/**`, `src/lib/db/user-views.ts`, `src/pages/dev-views-page.tsx` ≥80% lines.

---

## 6. Test pyramid map (AC → owning layer → file)

| AC | Layer | Owning test | PygRationale |
|---|---|---|---|
| AC-UV-001 | Unit | `viewspec/types.test.ts` | pure data contract |
| AC-UV-002 | Unit | `viewspec/compiler.test.ts` | pure logic |
| AC-UV-003 | Unit | `viewspec/compiler.test.ts` | pure logic (token resolution) |
| AC-UV-004 | Unit | `viewspec/compiler.test.ts` | pure logic (D7 ceilings) |
| AC-UV-005 | Unit | `viewspec/compiler.test.ts` | the boundary (pure) |
| AC-UV-006 | Unit | `viewspec/compiler.test.ts` | the boundary (pure) |
| AC-UV-007 | Unit | `viewspec/registry.test.ts` | pure manifest |
| AC-UV-008 | Unit | `viewspec/executor.test.ts` | mocked supabase client (dispatch shape) |
| AC-UV-009 | Unit | `viewspec/executor.test.ts` | pure in-mem aggregate over fixture rows |
| AC-UV-010 | pgTAP | `tests/62_mos_user_views_rls.sql` | RLS is a DB property — lowest sufficient layer |
| AC-UV-011 | pgTAP | `tests/62_mos_user_views_rls.sql` | tenancy is a DB contract |
| AC-UV-012 | pgTAP | `tests/62_mos_user_views_rls.sql` | manager-share is a DB contract (is_managed_by) |
| AC-UV-013 | pgTAP | `tests/62_mos_user_views_rls.sql` | WITH CHECK is a DB contract |
| AC-UV-014 | Unit | `db/user-views.test.ts` | mocked supabase (call shape, never sends org_id/owner_id) |
| AC-UV-015 | Unit/RTL | `viewspec/renderer.test.tsx` | component loop (mocked executor) |
| AC-UV-016 | Unit/RTL | `viewspec/renderer.test.tsx` | degradation (mocked executor) |
| AC-UV-017 | Unit/RTL | `viewspec/renderer.test.tsx` | stub degradation |
| AC-UV-018 | Integration/RTL | `pages/dev-views-page.test.tsx` (+ optional e2e J3) | the zero-agent loop |
| AC-UV-019 | Unit (grep gate) | `viewspec/viewspec-firewall.test.ts` | static guard |
| AC-UV-020 | Unit | `viewspec/schema.test.ts` | single-source-of-truth contract |

## 7. Residual risks & open questions (for the Director)

1. **D6 re-scope (BLOCKING confirmation):** ADR-0018 D6 lists `compose-view` (the LLM edge function) in P1; this plan **defers it to P2** to honour "P1 ships with zero agent" + to land the trust boundary first. **Director must confirm.** If the owner wants it in P1, it grafts onto Task J-end (same `COMPOSITION_SPEC_SCHEMA`, the sibling's handler as reference) but pulls in a Deno edge-function toolchain + an API-key secret + the ADR-0039 deputy-invariant tests.
2. **D7 literal-vs-pragmatic (confirmation):** ADR-0017 D7 says "time-range bound on EVERY query." This plan exempts catalog entities (`objectives`/`work_lines`/`people`) via `requiresTimeRange: false`, else they'd be un-composable. If the Director wants literal D7, it is a one-line whitelist flip + an AC-UV-004 update — but catalog views become impossible without a bogus time filter. **Recommendation:** accept the pragmatic split (this plan).
3. **`is_managed_by` is a NEW recursive helper** (the reverse of `is_manager_of`). pgTAP (F3/AC-UV-012) proves the share direction, but it is net-new security-sensitive SQL — the security-auditor should review it alongside the RLS policies (STRIDE: a cycle in `reports_to_role_id` must not grant unintended share reach; the `UNION` dedupe + `not in current_roles` guard inherited from `is_manager_of` mitigate, but audit confirms).
4. **`buildCompilerContext` viewer wiring:** the plan assumes a `useAuth()`/`useViewer()` hook exposing `person.id`; `orgId` is decoded from the JWT (parallel to `decodeAccessRolesClaim`). **Build must confirm the exact hook name** in `src/auth/` + that the person id is resolvable in-session (the app already calls `resolveViewer`). If only `user.id` (auth uid) is in-session, an extra `people` lookup is needed — small, but flag it.
5. **Sibling schema-shape mismatches (port friction):** the sibling's `user_views` used `user_id`/`profiles`-derived org + a `public` schema + `shared_org` scope; MOS uses `owner_id`/`person_id` + `current_org_id()` claim + `mos` schema + `shared_team`. The DAL + migration are **adapted, not copied** — a mechanical copy would leak the sibling's auth model. Reviewers must check provenance comments, not just diff.
6. **React version / Vitest proxy recorder:** the executor test's chainable proxy is intricate; if flaky, fall back to the explicit `makeSchema` recorder from `tasks.test.ts`. The assertion contract is what matters (AC-UV-008/009), not the recorder mechanics.
7. **Statement-timeout (D7) is not a compiler field** — PostgREST applies it per role; the row cap is the practical bound. A true statement-timeout belongs to a DB/role config task (out of P1 scope). Flag for the platform/DBA track if runaway queries are a concern before P2.
8. **Hydration depth (H1 note):** P1 ships the compile→execute→hydrate **loop proof** (primitive-name + row-count + stub/error), not full per-primitive data-binding. Rich hydration (DataTable columns from `props`, KPITile value formatting) is additive + lands with the polished builder. A reviewer expecting a fully-rendered DataTable should read AC-UV-015 (asserts the loop, not cosmetics).
9. **`ops.log_entries` (Daily Log) is NOT in the P1 whitelist** (the brief named tasks/updates/objectives/projects-processes/people + 2 reporting). It is a trivial 8th-entity addition (one whitelist entry) when a Daily-Log user view is wanted — tracked, not blocked.
10. **e2e (J3) conditional:** only if `e2e/` is wired; otherwise the RTL integration test + pgTAP cover the contract. Confirm whether a Playwright journey is required for P1 acceptance or can defer to P2 (when the deputy makes the compose flow user-facing).

## 8. Sequencing (build order — dependencies)

```
A0 (scaffolding) → A1,A2 (types) → B1,B2 (registry) → C1,C2 (compiler)
                                  → D1,D2 (executor)   ─┐
                                  → E1,E2 (schema)      ─┤
F1,F2,F3 (migration + pgTAP) ─────────────────────────── ─┤
G1,G2 (DAL) ← depends on F1 (table) + A1 (CompositionSpec type)
H1,H2 (renderer) ← depends on C1 (compile), D1 (execute), B1 (registry), I1 (i18n)
I1 (i18n) ← no dep; do early (H1 + I2 need it)
I2,I3 (harness page) ← depends on G1 (DAL), H1 (renderer), I1 (i18n)
J1 (route) ← depends on I2
J2 (firewall gate) ← after all viewspec/db/page files exist
J4 (full gate) ← last
```
Critical path: **A1 → C1 → H1 → I2 → J1** (the loop); F1/F3 (migration/pgTAP) + G1/G2 (DAL) run in parallel once A1 lands; D1/D2 + E1/E2 are independent of F/G. A single implementer can do A→B→C→E (pure TS, fast), then F→G (DB), then H→I→J (UI) — ~2–3 focused sessions.

## 9. Out-of-train follow-ups (recorded, NOT in P1)
- **P2:** `compose-view` edge function (the LLM) + `AssistantPanel` + threads/events + approve/deny writes (`create-task`/`post-update`). Reuses `COMPOSITION_SPEC_SCHEMA` + `compileCompositionSpec` (the boundary this train ships) verbatim.
- **P3:** automations + notifications + credits + dispatch watermark.
- **Polished builder UI** (visual primitive palette + live preview) — replaces the dev JSON editor.
- **`ops.log_entries`** as an 8th whitelist entity (Daily Log user views).
- **Home v2** reads the org-default user view (ADR-0019 D3) — consumes this substrate.
- **Statement-timeout** DB/role config (D7 literal-timeout, if wanted).

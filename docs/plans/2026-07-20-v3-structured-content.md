# V3 Issue 10 — Structured authored content implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, versioned authored-content document for real V3 Task records; persist it
through one RLS-gated optimistic-concurrency RPC; render and edit it with one shared panel/page
component; and expose only typed, RLS-backed references to normalized Task/Signal data. Prove the
contract without inventing a Standard/SOP runtime, migrating routes, or duplicating operational
state.

**Architecture:** `mos.record_contents` is a typed content adjunct, not a universal record table.
The V1 persisted owner is `task`. A pure TypeScript validator, migration registry, Object Contract
registry, URL policy, renderer, editor, and embed registry form one trust boundary. A Task surface
adapter supplies the existing Task record identity and legacy-description fallback. A live Task
checklist embed delegates mutations to the existing normalized Task checklist DAL. A Task-to-Signal
reference resolves through the existing Signal DAL under the current viewer's RLS. Process/Process
Run and Standard/SOP remain explicit extension points and are rejected until their live adapters
exist.

**Tech Stack:** React 19, TypeScript, Vitest/React Testing Library, Playwright, self-hosted
Supabase/Postgres, pgTAP, existing `@/lib/supabase` schema client, existing `mos.tasks`,
`mos.task_checklist_items`, `mos.signals`, Task/Signal DALs, and the V3 E7 tokens in `DESIGN.md`.

## Global Constraints

- This document is a future implementation plan. The current planning task changes no app code,
  migration, seed, test, environment, database, browser state, or server state.
- Work only after the owner-approved Issue 2–9 checkpoints are present in the implementation
  worktree. The current checkout has the Issue 3 and Issue 4 plans but no committed Issue 5–8 plans;
  the preflight below must stop rather than infer missing contracts.
- Do not use subagents for this issue. Build one issue at a time in the already isolated visible
  worktree, with red tests before production code.
- Run npm commands from `mos-app/`. Run Supabase commands from `supabase/` and only against the
  ephemeral local stack. Never point `supabase db reset` or `supabase test db` at staging or
  production. Do not start a dev server in the planning task.
- Do not create `mos.standards`, `standard_steps`, a Standard/SOP TypeScript model, a Standard
  fixture, a Standard route, or a Standard measurement/evidence/sign-off embed. A future Standard
  adapter may be named as an extension point, but Issue 10 must prove only real Task/Signal paths.
- Do not create a universal `mos.records` table, custom-field builder, arbitrary block/plugin schema,
  Markdown/HTML blob, raw HTML renderer, user-authored code, raw SQL/query block, duplicated Task
  checklist state, or duplicated Signal body/state.
- Do not modify the shared overlay host, RecordCollection engine, Inbox, Café Team selection, Issue 9
  owner acceptance, or Issue 11 route migration. The Task integration uses the existing V3
  RecordViewer/Task surface seam delivered by Issues 5–9 and changes only its content section.
- Do not repurpose any master `AC-V3-001` through `AC-V3-014` identifier. The ownership table below
  is the complete source of truth for master-criterion usage in this plan. Lower-level tests use
  the correct `FR-V3-*`/`NFR-V3-*` requirement or a descriptive test name.
- Every changed-code line must have behavior-focused coverage at or above 80%. Typecheck, lint,
  build, security review, four-lens design review, and rendered browser proof are merge gates.
- Future implementation commits remain small and checkpointed. The final issue checkpoint pauses
  for owner approval before push, merge, or deploy; this planning task itself commits only the ADR
  and this plan.

---

## 1. Authority, dependency gate, and domain boundary

### 1.1 Read order already applied

The implementation session must re-read these before touching a file, because the plan is subordinate
to current owner law and the actual rebased contracts:

- `CLAUDE.md`, `AGENTS.md`, `docs/agent-context.md`, `docs/requirements-evolution.md`,
  `CONTEXT.md`, `DESIGN.md`, `docs/experience-contract.md`, `docs/interaction-contract.md`, and
  `docs/jtbd.md`.
- `docs/specs/v3-redesign.spec.md` §6.3, §6.6, §6.7, §9–§12.
- `docs/decisions.md` OD-REDESIGN-72..79, especially OD-REDESIGN-74, OD-REDESIGN-77, and
  OD-REDESIGN-78.
- `docs/adr/0052-structured-authored-content.md`, ADR-0017 D5/D6, ADR-0019 D6, ADR-0025
  D3/D6/D13/D16, ADR-0045, and ADR-0049.
- The current Task/Signal/Process migrations and types, `TaskSurface`/`SignalRecordHost`, the
  `mos.user_views` RLS/DAL, and the viewspec compiler/renderer trust boundary.

### 1.2 Hard preflight before implementation

The first implementation task runs from the rebased Issue 10 worktree. It must leave the worktree
untouched and exit non-zero if any dependency or contract is missing.

- [ ] **Preflight A (3 min):** Confirm the worktree is isolated, based on the approved V3
  checkpoint, and clean except for Issue 10 files.

  **Paths:** repository root, `docs/agent-context.md`, `docs/reviews/v3-redesign.md`,
  `docs/plans/2026-07-20-v3-page-families.md`, and `docs/plans/2026-07-20-v3-overlay-host.md`.

  **Commands:**

  ```bash
  git status --short --branch
  git worktree list
  git log --oneline --decorate -12
  test "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)"
  test -f docs/reviews/v3-redesign.md
  test -f docs/plans/2026-07-20-v3-page-families.md
  test -f docs/plans/2026-07-20-v3-overlay-host.md
  ```

  **Expected result:** the worktree is the visible isolated Issue 10 checkout; the log identifies
  the approved Issue 2–9 base; and no unrelated app/SQL changes are present. If the current commit
  is still the pre-Issue 5 state shown in `docs/agent-context.md`, stop and record the dependency
  block in the future review ledger; do not begin the next task.

- [ ] **Preflight B (5 min):** Prove the owner/review evidence for Issues 2–9 exists before using
  their interfaces.

  **Commands:**

  ```bash
  rg -n "Issue 2|Issue 3|Issue 4|Issue 5|Issue 6|Issue 7|Issue 8|Issue 9" \
    docs/agent-context.md docs/reviews/v3-redesign.md
  rg -n "owner|approved|approval|Verified completion|rendered|driven|checkpoint" \
    docs/agent-context.md docs/reviews/v3-redesign.md
  rg -n "RecordViewer|RecordCollection|Task adapter|Signal adapter|Café|Inbox|Deputy" \
    docs/agent-context.md docs/reviews/v3-redesign.md
  ```

  **Expected result:** the evidence names an approved/verified checkpoint for each of Issues 2, 3,
  4, 5, 6, 7, 8, and the Issue 9 owner-rendered/driven acceptance. A missing Issue 5–8 plan or
  review section is a hard stop, not permission to derive an interface from the current legacy
  component.

- [ ] **Preflight C (4 min):** Verify the exact post-Issue-5/6 content seam and keep Issue 10
  inside it.

  **Current paths to inspect:**

  - `mos-app/src/components/tasks/task-surface.tsx`
  - `mos-app/src/components/tasks/record-feed.tsx`
  - `mos-app/src/components/tasks/checklist-card.tsx`
  - `mos-app/src/components/signals/signal-record-host.tsx`
  - `mos-app/src/lib/db/tasks.ts`
  - `mos-app/src/lib/db/signals.ts`
  - the actual RecordViewer and Task/Signal adapter files delivered by Issues 5–6.

  **Commands:**

  ```bash
  rg -n "content|ContentSection|readOnly|permission|mode.*panel|mode.*page|TaskSurface|SignalRecord" \
    mos-app/src/components mos-app/src/lib/db
  rg -n "RecordViewer|RecordCollection|Task adapter|Signal adapter" \
    docs/plans docs/reviews docs/agent-context.md
  rg -n -i --glob '!docs/**' --glob '!*.md' \
    "mos\.standards|standard_steps|StandardRecord|SOPRecord|standard_step" \
    mos-app supabase scripts || true
  ```

  **Expected result:** the existing Task surface can receive one content section in both panel/page
  modes, the Signal DAL can resolve a reference under the current JWT/RLS, and the normalized Task
  checklist DAL remains the only checklist writer. If the dependency work moved these paths, update
  the dependency contract in the Issue 10 review ledger and stop; do not create a second viewer or
  adapter. If a real Standard model now exists, stop and re-run the domain grill before adding it to
  this plan; this plan's V1 allow-list remains `task` until the ADR is amended.

- [ ] **Preflight D (3 min):** Confirm the database and renderer security conventions have not
  changed.

  **Commands:**

  ```bash
  rg -n "enable row level security|force row level security|security definer|security invoker|revoke execute|grant.*authenticated|no delete" \
    supabase/migrations/20260611000009_mos_rls.sql \
    supabase/migrations/20260716000003_mos_signals_rls.sql \
    supabase/migrations/20260705000001_mos_user_views.sql
  rg -n "compileCompositionSpec|ValidationError|never render unvalidated|UNKNOWN_PRIMITIVE|INVALID_SPEC_SHAPE" \
    mos-app/src/lib/viewspec mos-app/src/pages/dev-views-page.tsx
  ```

  **Expected result:** the migration uses forced RLS, org-first predicates, explicit grants/revokes,
  and a narrowly justified RPC; the TypeScript validator supplies fast save/render feedback, the
  PostgreSQL validator is authoritative for writes, shared golden fixtures prove parity, and invalid
  data degrades rather than reaching a raw renderer.

### 1.3 Supported domain matrix

| Domain | Live evidence | Issue 10 treatment | Not claimed |
|---|---|---|---|
| Task | `mos.tasks`, `mos.task_checklist_items`, `tasks.types.ts`, `tasks.ts`, `TaskSurface`, `RecordFeed` | V1 authored-content owner; legacy `description` is an in-memory fallback; Task checklist is a live normalized embed. | No Task lifecycle, status, permission, or route rewrite. |
| Signal | `mos.signals`, `signal_revisions`, `signals.ts`, `SignalRecordHost` | V1 typed reference target; reference cards resolve current Signal data under RLS. | No JSONB Signal body, authoring, correction, visibility, or capture change. |
| Process/Process Run | `mos.work_lines`, `mos.process_task_defs`, `mos.process_runs` and existing process DAL | Future typed target only after the actual V3 adapter/route contract exists. | No Process authored document or fake Process content editor. |
| Standard/SOP | No live Standard table, type, renderer, route, or adapter in this tree | Reserved extension point; unknown/unsupported kind is rejected. | No Standard step, measurement, evidence, validation, sign-off, or runtime claim. |

### 1.4 Real Gordi content used by proof

The test and browser proof uses the existing authorized E2E Task fixture
`mos-app/e2e/fixtures/tasks.ts` (`TASKS.VIEWER_ACCOUNTABLE`, an existing test constant whose name
must never become UI/domain copy) and the existing Signal flow/loader.
The authored document uses realistic café operations content without creating a new domain record:

- Heading: `Opening checks`.
- Paragraph: `Calibrate the grinder before the 07:00 café opening and leave the station ready for the first rush.`
- Bulleted list: `Wipe the group head`; `Run a three-second flush`; `Check the water filter seal`.
- Numbered list: `Pull one test shot`; `Taste and record the adjustment`; `Hand over only after the shot is stable`.
- Callout: `If the freezer is warmer than -18°C, stop handover and raise the freezer temperature Signal.`
- Content-only checklist: `Station wiped` and `Test shot approved`, owned by the document.
- Live Task checklist embed: the normalized checklist for the current Task, toggled through the
  existing Task DAL.
- Signal reference: the existing Signal created/loaded by the current Signal journey, rendered as
  a typed card with no copied body or attention state in JSONB.

The browser journey never uses a hand-built fake record or a Standard/SOP fixture. It uses the
existing seeded Task/account and a real RLS-backed Signal reference. Test-only database rows remain
transactional pgTAP fixtures, following the existing guarded seed pattern.

---

## 2. Immutable master acceptance ownership

The following table copies the exact master Given/When/Then goals from
`docs/specs/v3-redesign.spec.md` §11. No master ID is assigned to a different behavior anywhere
else in this plan.

| Master ID | Exact master Given/When/Then goal | One master owner | Issue 10 contribution/deferred note |
|---|---|---|---|
| `AC-V3-001` | **Given** the representative routes at desktop and phone widths, **when** computed styles are compared across page heads, body type, controls, rows, panels, dialogs, and states, **then** each semantic role uses the same V3 values and the rendered result matches the E7 visual reference. | Issue 9 | Issue 10 supplies content-component evidence under `NFR-V3-005`; it does not claim this master criterion. |
| `AC-V3-002` | **Given** Tasks, Signals, Inbox, and Café, **when** each collection opens a record, **then** the same panel side, width family, focus entry, Escape/Close/Back behavior, and page-escalation outcome occur. | Issue 9 | Issue 10 consumes the approved host/viewer seam for content proof; no content test is tagged with this master criterion. |
| `AC-V3-003` | **Given** a record panel already open, **when** Deputy or another record is opened, **then** the shared host stacks or replaces content according to the journey and never renders two overlapping side panels. | Issue 9 | Issue 10 does not change overlay host behavior. |
| `AC-V3-004` | **Given** a Task in Work and the same Task in Café, **when** each is opened, **then** both resolve to the same record identity and RecordViewer while preserving the source collection on close. | Issue 8 | Issue 10 uses the canonical Task identity delivered by the approved dependency; it does not add Café integration. |
| `AC-V3-005` | **Given** a Signal Feed saved view, **when** presentation changes to Table and the page is refreshed, **then** supported filters, sort, grouping, and saved-view identity persist. | Issue 6 | Issue 10 resolves a typed Signal reference only and does not change saved views. |
| `AC-V3-006` | **Given** Inbox on desktop, **when** the bell is invoked, **then** quick triage opens in the shared host; opening a notification pushes its canonical record; Back returns to triage; Close returns focus to the bell. **Given** phone, the bell opens the full Inbox route. | Issue 7 | Issue 10 has no Inbox, bell, notification, or Deputy integration. |
| `AC-V3-007` | **Given** a multi-Team viewer entering Café, **when** more than one valid Team exists, **then** the system requires an explicit context choice and never silently chooses the first Team. | Issue 8 | Issue 10 has no Team-selection behavior. |
| `AC-V3-008` | **Given** an authorized user editing a property, **when** they commit or cancel, **then** every RecordViewer consumer follows the same save/discard feedback contract. | Issue 5 | Issue 10 contributes the authored content-block branch through `FR-V3-009`; Issue 5 owns the master property contract. |
| `AC-V3-009` | **Given** an unauthorized viewer, **when** the same record opens, **then** its information hierarchy remains readable while edit and lifecycle actions are absent or honestly explained. | Issue 5 | Issue 10 contributes the Task content-section read-only branch through `FR-V3-008`; Issue 5 owns the master RecordViewer state. |
| `AC-V3-010` | **Given** authored JSONB content containing valid paragraph/list/link/content-checklist blocks, **when** saved and reopened in panel and page modes, **then** block identity, order, and content are preserved and rendered by the same components. | Issue 10 | Issue 10 owns this exact master criterion through the real Task content owner and approved panel/page seam. |
| `AC-V3-011` | **Given** a typed Task checklist or Standard measurement embed, **when** its state changes, **then** the normalized domain row changes and the JSONB document retains only the reference. | Issue 10 | Issue 10 owns this exact master criterion through the real Task-checklist alternative only, and only when both normalized-row mutation and reference-only JSONB assertions pass. The Standard measurement alternative is deferred because no live Standard model exists. |
| `AC-V3-012` | **Given** a first-time floor member, **when** asked to find and complete today's Café work, **then** they start unaided, complete the goal without entering configuration, and encounter no internal system nouns. The journey records steps, hesitation/misclicks, outcome, and duration. | Issue 9 | Issue 10 uses realistic content but does not claim a floor-member Café journey. |
| `AC-V3-013` | **Given** a manager triaging work, **when** filtering, grouping, switching presentations, and opening consecutive records, **then** the workflow remains keyboard-operable and retains collection context without repeated full-page navigation. | Issue 6 | Issue 10 tests editor keyboard behavior only under `NFR-V3-001`; it does not claim this collection journey. |
| `AC-V3-014` | **Given** every live route at the end of migration, **when** the route/component inventory is checked, **then** no route uses an unapproved bespoke page shell or superseded component/style family. | Issue 12 | Issue 10 does not migrate routes or close the inventory. |

Issue 10 lower-level ownership is therefore:

| Requirement | Issue 10 proof |
|---|---|
| `FR-V3-003` | Task content adapter consumes the typed RecordViewer contract; no domain table is converted. |
| `FR-V3-008` | Read-only content section has no disabled-input masquerade and no write calls. |
| `FR-V3-009` | Editor state tests cover commit/cancel, Saving/Saved, validation, retry, conflict, focus, and read-only. |
| `FR-V3-010` | TypeScript fast validation and the authoritative database/RPC validator implement one canonical schema/version/contract boundary; shared golden fixtures and deterministic parity tests detect drift. |
| `FR-V3-011` | Typed references contain only kind/ID/presentation; Task checklist mutations hit normalized rows. |
| `NFR-V3-001` | RTL and Playwright cover names/roles/states, focus-visible, keyboard save/cancel, and 44px controls. |
| `NFR-V3-003` | Changed-line coverage report is at least 80%. |
| `NFR-V3-004` | `npm run typecheck`, `npm run lint`, and `npm run build` are clean. |
| `NFR-V3-005` | Rendered Task content proof at 1280×900, 1024×900, and 390×844. |
| `NFR-V3-006` | No horizontal overflow at 390px; visible content controls meet the Experience Contract target. |
| `NFR-V3-007` | One content viewer/editor/typed-embed implementation; old Task Notes rendering is removed from the owned content slot. |
| `NFR-V3-008` | Additive reversible migration, forced RLS, RPC-only writes, unknown-kind/version rejection, and pgTAP negatives. |
| `NFR-V3-009` | All future verification uses local fixtures/local Supabase; no staging or production data mutation. |

---

## 3. Exact implementation surface

The following paths are the complete intended Issue 10 implementation surface after the dependency
preflight. A path not listed here is out of scope unless a test failure proves a minimal import or
token change is required and the review ledger records it.

### New pure content modules

- `mos-app/src/lib/structured-content/content-types.ts`
- `mos-app/src/lib/structured-content/content-validator.ts`
- `mos-app/src/lib/structured-content/content-migrations.ts`
- `mos-app/src/lib/structured-content/content-url-policy.ts`
- `mos-app/src/lib/structured-content/content-contracts.ts`
- `mos-app/src/lib/structured-content/content-embeds.ts`
- `supabase/tests/fixtures/record-content-golden.json`: canonical shared valid/invalid fixtures
  with expected stable validation outcomes.
- `scripts/record-content-schema-parity.mjs`: local-only parity runner that reads the shared fixture
  file and executes the SQL validator; it never connects to staging or production.
- `mos-app/src/lib/structured-content/content-validator.test.ts`
- `mos-app/src/lib/structured-content/content-golden-fixtures.test.ts`
- `mos-app/src/lib/structured-content/content-migrations.test.ts`
- `mos-app/src/lib/structured-content/content-url-policy.test.ts`
- `mos-app/src/lib/structured-content/content-contracts.test.ts`
- `mos-app/src/lib/structured-content/content-embeds.test.ts`

### New data and UI modules

- `mos-app/src/lib/db/record-content.ts`
- `mos-app/src/lib/db/record-content.test.ts`
- `mos-app/src/components/structured-content/record-content-viewer.tsx`
- `mos-app/src/components/structured-content/record-content-editor.tsx`
- `mos-app/src/components/structured-content/record-content-embed.tsx`
- `mos-app/src/components/structured-content/record-content.css`
- `mos-app/src/components/structured-content/record-content-viewer.test.tsx`
- `mos-app/src/components/structured-content/record-content-editor.test.tsx`
- `mos-app/src/components/structured-content/record-content-embed.test.tsx`
- `mos-app/src/components/tasks/task-content-section.tsx`
- `mos-app/src/components/tasks/task-content-section.test.tsx`

### Existing app paths with narrow content-slot changes

- `mos-app/src/components/tasks/task-surface.tsx`: load/save content state alongside the existing
  Task detail and pass the same content props in panel/page mode. Do not change Task lifecycle or
  route calculations.
- `mos-app/src/components/tasks/record-feed.tsx`: replace only the current Notes body with the
  shared content section; preserve Activity and Checklist tabs and their normalized data.
- `mos-app/src/components/tasks/TaskSurface.css`: replace only the owned Notes/content styling with
  the named E7 content tokens; do not add a second editor style family.
- `mos-app/src/components/tasks/record-feed.test.tsx` and
  `mos-app/src/components/tasks/task-surface.test.tsx`: preserve existing Task behavior and add
  content-slot coverage.

The actual RecordViewer/Task adapter path delivered by Issue 5 is a dependency, not an Issue 10
creation target. The preflight must prove that `TaskSurface`'s existing content slot is the same
RecordViewer document in panel/page mode. If Issue 5 moved the slot, the implementation uses the
landed path recorded in its approved review evidence and changes no unrelated viewer contract.

### New migration and pgTAP ownership

- `supabase/migrations/20260720000001_mos_record_content.sql`: tables, checks, target/permission
  helpers, RPC, history trigger, grants/revokes, forced RLS, and manual down comments.
- `supabase/tests/101_mos_record_content_rls.sql`: all new RLS, RPC, schema-boundary, history, and
  optimistic-concurrency assertions. This file is numbered after the existing `100_cafe_opening_checklist_vs_def.sql`.

### New browser proof

- `mos-app/e2e/v3-structured-content.spec.ts`: one curated real-Task journey with panel/page,
  content save/reopen, typed Task checklist mutation, Signal reference resolution, permission
  state, keyboard/focus, and 1280/1024/390 viewports.

---

## 4. TDD implementation tasks

Each task is intended to take 2–5 minutes. The implementation worker writes the test first, runs the
red command, adds the smallest production change, and runs the same command green. A red command may
fail because the named module/export/migration is absent; it must fail for the intended reason rather
than because of an unrelated dependency failure.

### Task 1 — Lock the pure document shape and limits

**Files:** `mos-app/src/lib/structured-content/content-types.ts`,
`supabase/tests/fixtures/record-content-golden.json`, and
`mos-app/src/lib/structured-content/content-validator.test.ts`.

- [ ] Write tests with descriptive titles: `accepts a realistic Task document with every V1
  authored block`, `preserves block and nested item IDs during reorder`, and `rejects unknown
  properties, duplicate IDs, over-limit text, over-limit items, and over-limit documents`. The
  fixture must use the Gordi café content from §1.4 and only `task`/`signal` embed targets.
- [ ] Run the red command:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content/content-validator.test.ts
  ```

  Expected: FAIL because the module and `RecordContentDocument`/`RecordContentBlock` exports do not
  exist.
- [ ] Add the exact discriminated unions from ADR-0052, `CONTENT_SCHEMA_VERSION = 1`, and the
  numeric limits. Keep `schemaVersion` literal `1`, `RecordContentKind = 'task'`, and
  `EmbedRecordKind = 'task' | 'signal'`; do not add Standard, Process, or arbitrary string escape
  hatches.
- [ ] Add `supabase/tests/fixtures/record-content-golden.json` as the shared fixture source. It
  contains named valid/invalid documents, expected stable issue codes, the realistic café document,
  hostile text/URL cases, unknown block/version cases, and the Task checklist embed. It is data for
  tests only, not a production seed or a second schema definition.
- [ ] Run the same command and expect PASS. Run `git diff --check` before moving on.

### Task 2 — Implement the fail-closed client validator

**Files:** `mos-app/src/lib/structured-content/content-validator.ts`,
`mos-app/src/lib/structured-content/content-validator.test.ts`,
`mos-app/src/lib/structured-content/content-golden-fixtures.test.ts`, and
`scripts/record-content-schema-parity.mjs`.

- [ ] Add red tests for null/top-level shape, `schemaVersion !== 1`, unknown block type, unknown
  embed kind, unknown record kind, malformed IDs, duplicate nested IDs, invalid heading level,
  non-boolean checklist state, excessive limits, unsupported `standard_step`, `javascript:`/`data:`
  links, and an otherwise valid literal `<script>` text value. The test must prove invalid input
  returns structured validation errors instead of throwing a raw TypeError.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content/content-validator.test.ts src/lib/structured-content/content-golden-fixtures.test.ts
  ```

  Expected: FAIL on the missing `validateRecordContentDocument` export and the missing shared
  fixture/parity harness.
- [ ] Implement:

  ```ts
  export interface ContentValidationIssue { path: string; code: string; message: string }
  export type ContentValidationResult =
    | { ok: true; document: RecordContentDocument }
    | { ok: false; issues: ContentValidationIssue[] }
  export function validateRecordContentDocument(input: unknown): ContentValidationResult
  ```

  Validate every object with `additionalProperties` semantics, collect bounded issues, enforce all
  limits and unique IDs, validate target kinds, and return a canonical typed document only on
  success. Do not coerce unknown values into a valid block.
- [ ] Run the same test green. Confirm no production file imports React, Supabase, Markdown, HTML
  parsing, or `dangerouslySetInnerHTML`.
- [ ] Make `content-golden-fixtures.test.ts` read the canonical JSON file and execute every valid and
  invalid case through the TypeScript validator, comparing the returned stable issue code to the
  fixture expectation. Implement `scripts/record-content-schema-parity.mjs` to read that same JSON
  file, obtain the local `DB_URL`, invoke `mos.validate_record_content_document(jsonb)` through
  `psql`, and compare the SQL outcome/code with the fixture expectation. The script must fail if no
  local DB is available or if the SQL result differs; it must never fall back to a cloud URL.
- [ ] Run the TypeScript tests green. Defer the parity script's green run until the migration task;
  its intended red result is a missing SQL function, not a skipped parity check.

### Task 3 — Add migration and legacy Task-description conversion

**Files:** `mos-app/src/lib/structured-content/content-migrations.ts` and
`mos-app/src/lib/structured-content/content-migrations.test.ts`.

- [ ] Write red tests for V1 identity migration, legacy Task description conversion to one
  paragraph with ID `legacy-description-v1`, unknown lower version rejection, unknown higher version
  rejection, and preservation of all stable IDs/order/content. Include an empty legacy description
  path that yields an empty V1 block array.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content/content-migrations.test.ts
  ```

  Expected: FAIL because the migration registry and conversion function do not exist.
- [ ] Implement:

  ```ts
  export function legacyTaskDescriptionToDocument(description: string | null): RecordContentDocument
  export function migrateRecordContentDocument(input: unknown): RecordContentDocument
  ```

  The migration registry may return V1 unchanged and convert only the explicit legacy Task string;
  it must throw a typed `UnsupportedContentVersionError` for unknown versions. It must not parse
  Markdown/HTML or silently drop blocks.
- [ ] Run the same test green. Keep `mos.tasks.description` untouched; this module is an adapter,
  not a data backfill.

### Task 4 — Centralize the URL policy

**Files:** `mos-app/src/lib/structured-content/content-url-policy.ts` and its test.

- [ ] Write red tests for `http`, `https`, `mailto`, and app-relative URLs; reject `javascript:`,
  `data:`, `vbscript:`, `file:`, protocol-relative, whitespace/control-character, malformed, and
  over-2,048-character URLs. Test that an external link receives safe `target`/`rel` metadata from
  the helper.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content/content-url-policy.test.ts
  ```

  Expected: FAIL on the missing policy exports.
- [ ] Implement:

  ```ts
  export type SafeContentLink = { href: string; external: boolean }
  export function normalizeContentLink(raw: string): SafeContentLink | null
  ```

  Reuse ADR-0049's safe protocol decision without importing the Markdown renderer. The viewer must
  render only a returned `SafeContentLink`.
- [ ] Run the same test green and inspect the source for dynamic HTML or unsanitized `href` use.

### Task 5 — Define Object Contract capabilities and the typed embed registry

**Files:** `mos-app/src/lib/structured-content/content-contracts.ts`,
`mos-app/src/lib/structured-content/content-embeds.ts`, and their tests.

- [ ] Write red tests proving the V1 `task` content contract allows the eight authored block
  families, `signal` is a reference target but not a persisted content owner, `task_checklist` is
  allowed only for a Task target, `record_reference` accepts Task/Signal targets, and `standard`,
  `standard_step`, Process content, and arbitrary embed kinds are rejected.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content/content-contracts.test.ts src/lib/structured-content/content-embeds.test.ts
  ```

  Expected: FAIL because no contract/registry exists.
- [ ] Implement the code-owned contract shape:

  ```ts
  export interface RecordContentContract {
    recordKind: RecordContentKind
    canAuthor: boolean
    allowedBlocks: ReadonlySet<RecordContentBlock['type']>
    referenceKinds: ReadonlySet<EmbedRecordKind>
  }
  export const RECORD_CONTENT_CONTRACTS: Readonly<Record<RecordContentKind, RecordContentContract>>
  export function getRecordContentContract(kind: string): RecordContentContract | null
  export function getTypedEmbedKind(block: RecordContentBlock): 'record_reference' | 'task_checklist' | null
  ```

  Keep the registry pure and free of database/React imports. The validator consumes the registry;
  the renderer later dispatches only registry-known `embed.kind` values.
- [ ] Run both tests green. Add a source guard that the registry contains no `standard` string until
  a future ADR adds a real Standard contract.

### Task 6 — Write the pgTAP contract first

**Files:** `supabase/tests/101_mos_record_content_rls.sql` only for this task.

- [ ] Add a plan-counted pgTAP suite using the existing local role/task fixture conventions. The
  test titles must name the real requirement, not a repurposed master AC. Cover at least:
  forced RLS on both tables; V1 columns/checks and unique index; no authenticated DELETE; no direct
  authenticated INSERT/UPDATE; same-org Task read; cross-org read zero; cross-org target write
  rejection; non-editor write rejection; editor save success; malformed/unknown block rejection;
  unsupported schema rejection; unknown `record_kind` rejection; history append-only; same-org
  history read; cross-org history zero; stale revision conflict; unauthorized conflict has no current
  document; and no JSONB duplicate checklist state.
- [ ] Run the red database command from the local stack:

  ```bash
  cd supabase && supabase test db
  ```

  Expected: FAIL because `mos.record_contents`, the RPC, and the new helper functions do not exist.
  Do not run this command during the current planning task.
- [ ] Keep the test transaction-scoped and use the existing guarded test seed functions. The
  realistic JSONB payload uses `Opening checks`, the freezer callout, a content-only checklist, and
  a Task checklist reference. It must not seed a Standard/SOP row or alter staging data.

### Task 7 — Add the reversible storage/RLS/RPC migration

**Files:** `supabase/migrations/20260720000001_mos_record_content.sql`.

- [ ] Add `mos.record_contents` and `mos.record_content_revisions` with the exact columns/checks and
  unique indexes in ADR-0052. Use defaults from `shared.current_org_id()` and
  `shared.current_person_id()` only for server-side inserts; callers do not supply either identity.
  Do not add a foreign key to a universal table. Add a guarded same-org Task target check.
- [ ] Add forced RLS and org-first SELECT policies. Grant authenticated SELECT only; grant no direct
  table INSERT/UPDATE/DELETE. Grant the authenticated role only the named save RPC. Revoke public and
  anon EXECUTE on all helper/RPC functions, then grant the minimum authenticated EXECUTE needed by
  RLS or the DAL. Every `SECURITY DEFINER` helper, RPC, and history trigger pins
  `search_path = ''`.
- [ ] Add `mos.validate_record_content_document(jsonb)` as the database-side structural trust
  boundary. It must reject unknown versions, properties, blocks, embed kinds, IDs, limits, and URL
  schemes with a stable validation error; it must not accept a client-supplied validation result.
  Its accepted/rejected outcomes must match every case in
  `supabase/tests/fixtures/record-content-golden.json`; the TypeScript and SQL implementations may
  differ internally but must not differ in result or stable issue code.
- [ ] Add `mos.can_read_record_content(text, uuid)` and
  `mos.can_edit_record_content(text, uuid)` with the V1 `task` mapping. Unknown kinds return false
  or raise the same unsupported-kind error; they never fall through to broad org access.
- [ ] Add `mos.save_record_content(text, uuid, jsonb, bigint)` as the only browser write. It must
  set `search_path = ''`, derive org/person from the JWT, verify the same-org target and the
  canonical PIC/Supervisor/relevant-manager permission contract from Issues 5–9, validate the
  document, lock the current row, compare `p_expected_revision`, and return `status = 'saved'` or
  `status = 'conflict'`. Include the current revision/document only after rechecking the caller's
  content read permission; otherwise return no current document or target details. It must not use
  a service-role secret or dynamic SQL. If the existing helper reads `responsible_person_id` or
  `accountable_person_id`, keep those legacy storage names inside the DAL/SQL translation boundary
  and never expose them as UI/domain guidance.
- [ ] Add an after-write trigger that writes a full bounded snapshot to
  `mos.record_content_revisions` with actor and operation. No authenticated history write policy
  exists.
- [ ] Add manual down comments in dependency order: RPC/trigger, policies/grants, helpers, indexes,
  revisions, current table. Do not run the down SQL.
- [ ] Run the shared-fixture SQL parity check against the local database before the full pgTAP run:

  ```bash
  node scripts/record-content-schema-parity.mjs
  ```

  Expected: every canonical valid/invalid fixture has the same stable outcome in TypeScript and
  PostgreSQL. A missing local DB URL or any mismatch is a hard failure, never a skip.
- [ ] Run the same database command green:

  ```bash
  cd supabase && supabase test db
  ```

  Expected: the full local pgTAP suite passes, including `101_mos_record_content_rls.sql`, with no
  regression in Task/Signal/Process RLS. Record the exact file/test counts in the future review
  ledger.

### Task 8 — Add the typed data-access layer

**Files:** `mos-app/src/lib/db/record-content.ts` and
`mos-app/src/lib/db/record-content.test.ts`.

- [ ] Write red DAL tests proving reads use `supabase.schema('mos').from('record_contents')`,
  writes use only `.rpc('save_record_content', ...)`, and neither path sends `org_id`, `owner_id`,
  `updated_by`, or a raw JSONB validation flag. Test typed `saved`, `conflict`, and error results.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/lib/db/record-content.test.ts
  ```

  Expected: FAIL because no DAL exists.
- [ ] Implement:

  ```ts
  export interface RecordContentRow {
    id: string; record_kind: 'task'; record_id: string; schema_version: 1
    document: RecordContentDocument; revision: number; updated_at: string
  }
  export type SaveRecordContentResult =
    | { status: 'saved'; row: RecordContentRow }
    | { status: 'conflict'; row: RecordContentRow | null }
  export async function getRecordContent(recordId: string): Promise<RecordContentRow | null>
  export async function saveRecordContent(input: {
    recordId: string; document: RecordContentDocument; expectedRevision: number
  }): Promise<SaveRecordContentResult>
  ```

  Validate with `validateRecordContentDocument` before the RPC, map the server result without
  trusting a client version, and surface a typed error that preserves the draft in the editor.
- [ ] Run the same test green and run `cd mos-app && npm run typecheck` for this module.

### Task 9 — Build the safe viewer

**Files:** `mos-app/src/components/structured-content/record-content-viewer.tsx`,
`mos-app/src/components/structured-content/record-content.css`, and
`mos-app/src/components/structured-content/record-content-viewer.test.tsx`.

- [ ] Write red RTL tests for every V1 block using the Gordi document: semantic paragraph/heading
  elements, real list elements, safe links, callout tone, content-only checklist, and the two typed
  embed dispatches. Add tests that malformed documents show `Content unavailable`, unknown blocks
  never render, `<script>` is literal text, and a forbidden link has no anchor.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/components/structured-content/record-content-viewer.test.tsx
  ```

  Expected: FAIL because the viewer and CSS do not exist.
- [ ] Implement:

  ```ts
  export interface RecordContentViewerProps {
    document: unknown
    mode: 'panel' | 'page'
    readOnly: boolean
    embeds: TypedEmbedRenderers
  }
  export function RecordContentViewer(props: RecordContentViewerProps): JSX.Element
  ```

  Validate/migrate before rendering; return a labelled safe error state on failure. Render text as
  React text children, links only through `normalizeContentLink`, and embed blocks only through the
  registry. An unreadable target gets `Reference unavailable` without target data leakage.
- [ ] Use `DESIGN.md` tokens: one border, 12px content card only where a card is semantically needed,
  32px desktop controls, 44px phone targets, visible `:focus-visible`, Plus Jakarta headings and DM
  Sans body. The viewer owns no overlay, router, collection, or domain lifecycle code.
- [ ] Run the same test green and inspect the component source for `dangerouslySetInnerHTML`,
  `remark`, `rehype-raw`, dynamic component imports, and raw target IDs in unavailable states.

### Task 10 — Add normalized typed embeds

**Files:** `mos-app/src/components/structured-content/record-content-embed.tsx`,
`mos-app/src/components/structured-content/record-content-embed.test.tsx`, and the existing
`mos-app/src/lib/db/tasks.ts`/`mos-app/src/lib/db/signals.ts` imports only.

- [ ] Write red tests for a live Task reference, live Signal reference, unavailable/forbidden
  reference, and live Task checklist. The Task checklist test must assert that toggling calls the
  existing normalized checklist DAL with the Task/checklist IDs and that the authored document sent
  to `saveRecordContent` is byte-for-byte unchanged. Test that a `standard_step` target is rejected
  before any loader call.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/components/structured-content/record-content-embed.test.tsx
  ```

  Expected: FAIL because typed embed renderers do not exist.
- [ ] Implement:

  ```ts
  export interface TypedEmbedRenderers {
    recordReference(target: { recordKind: 'task' | 'signal'; recordId: string }): ReactNode
    taskChecklist(target: { recordId: string }): ReactNode
  }
  export function RecordContentEmbed(props: { block: TypedEmbedBlock; renderers: TypedEmbedRenderers }): JSX.Element
  ```

  The renderer receives data only from the existing RLS-backed Task/Signal DAL. A Task checklist
  action uses the normalized checklist functions and preserves the authored document. Do not copy
  labels, status, `is_done`, attention, or body into JSONB.
- [ ] Run the same test green. Confirm the embed module has no direct Supabase client and no
  Standard/Process string registry entry.

### Task 11 — Build the shared editor state machine

**Files:** `mos-app/src/components/structured-content/record-content-editor.tsx`,
`mos-app/src/components/structured-content/record-content-editor.test.tsx`, and
`mos-app/src/components/structured-content/record-content.css`.

- [ ] Write red RTL tests for: adding/editing/reordering a paragraph/list/link/callout/content-only
  checklist while preserving IDs; Save; `Saving` then `Saved`; validation message with draft kept;
  RPC failure with `Retry`; stale revision conflict with draft kept; Escape restoring the last saved
  document; `readOnly` rendering text with no edit controls; Tab/click-outside commit; and
  Ctrl/Cmd+S save. Include focus-visible toolbar controls and `aria-live` save status.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/components/structured-content/record-content-editor.test.tsx
  ```

  Expected: FAIL because no editor/state implementation exists.
- [ ] Implement:

  ```ts
  export interface RecordContentEditorProps {
    initialDocument: RecordContentDocument
    mode: 'panel' | 'page'
    readOnly: boolean
    revision: number
    onSave: (document: RecordContentDocument, expectedRevision: number) => Promise<SaveRecordContentResult>
  }
  export function RecordContentEditor(props: RecordContentEditorProps): JSX.Element
  ```

  Keep draft and saved documents separate. `Saving` disables duplicate saves but does not remove the
  draft. `Saved` is announced; validation and RPC errors retain focus in the editor and expose
  Retry. A conflict offers explicit reload/discard, never silent last-write-wins. Escape restores
  the saved snapshot. Panel/page changes measure and toolbar density only; they do not change the
  document shape or save semantics.
- [ ] Run the same test green and verify the editor has no nested physical panel/drawer and no
  editor-specific route.

### Task 12 — Replace the Task Notes body with the shared content section

**Files:** `mos-app/src/components/tasks/task-content-section.tsx`, its test,
`mos-app/src/components/tasks/task-surface.tsx`, `mos-app/src/components/tasks/record-feed.tsx`,
`mos-app/src/components/tasks/record-feed.test.tsx`, `mos-app/src/components/tasks/task-surface.test.tsx`,
and the owned rules in `mos-app/src/components/tasks/TaskSurface.css`.

- [ ] Write red tests for an authorized real Task with no content row (legacy description renders as
  an in-memory paragraph), a Task with a content row (JSONB takes precedence and legacy description
  is not shown twice), panel/page receiving the same document/IDs, and Activity/Checklist tabs
  remaining unchanged. Add an unauthorized viewer test that keeps the content readable and removes
  edit/save controls without disabled-input styling.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/components/tasks/task-content-section.test.tsx src/components/tasks/record-feed.test.tsx src/components/tasks/task-surface.test.tsx
  ```

  Expected: FAIL because the Task content section and props do not exist.
- [ ] Implement `TaskContentSection` as the domain adapter:

  ```ts
  export interface TaskContentSectionProps {
    taskId: string
    legacyDescription: string | null
    mode: 'panel' | 'page'
    readOnly: boolean
  }
  export function TaskContentSection(props: TaskContentSectionProps): JSX.Element
  ```

  Load `getRecordContent(taskId)`, use `legacyTaskDescriptionToDocument` only when the row is
  absent, pass the same document to viewer/editor in both modes, and call `saveRecordContent` with
  the row revision. Keep the canonical PIC/Supervisor/relevant-manager permission contract delivered
  by Issues 5–9 authoritative; do not infer permission from a hidden button. Keep
  `mos.tasks.description` writes for legacy create compatibility, but do not dual-write it from
  authored saves.
- [ ] Replace only the current `RecordFeed` Notes body with this section. Preserve the current
  normalized Task `ChecklistCard`, its toggle/reorder/delete actions, Activity history, and Task
  status/archive/permission behavior. Remove the superseded free-text Notes renderer from this
  owned slot.
- [ ] Run the same test green and run `cd mos-app && npm run typecheck`.

### Task 13 — Prove the content editor’s panel/page keyboard and focus contract

**Files:** `mos-app/src/components/tasks/task-content-section.test.tsx`,
`mos-app/src/components/tasks/record-feed.test.tsx`, and the existing V3 host/viewer tests only
where the Issue 5–9 contract requires a content-slot assertion.

- [ ] Add descriptive tests mapped to `FR-V3-008`, `FR-V3-009`, `NFR-V3-001`, and `NFR-V3-006`:
  focus enters the first editable block; Tab/click-outside saves; Escape restores; Ctrl/Cmd+S
  saves; Saving keeps focus and blocks duplicate submission; validation and error states retain the
  draft; read-only has no disabled fake affordance; Return focus goes to the owning Task control
  when the existing host closes. Do not label these tests `AC-V3-002`, `AC-V3-003`, or
  `AC-V3-013`; those master goals belong to other issues.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/components/tasks/task-content-section.test.tsx src/components/tasks/record-feed.test.tsx
  ```

  Expected: red for each missing interaction oracle; implement the smallest content-slot fix and
  rerun green.
- [ ] Verify with Testing Library that buttons have accessible names, save status is announced, and
  unavailable references do not expose cross-org IDs in visible text.

### Task 14 — Add the curated browser proof at all required widths

**Files:** `mos-app/e2e/v3-structured-content.spec.ts`, using existing
`mos-app/e2e/fixtures/tasks.ts`, `mos-app/e2e/fixtures/users.ts`, and
`mos-app/e2e/helpers/login.ts`.

- [ ] Write the red Playwright test named exactly for the master goal:
  `AC-V3-010: authorized Task authored blocks save and reopen identically in panel and page modes`.
  It must log in as `VIEWER`, use `TASKS.VIEWER_ACCOUNTABLE`, open the real Task from `/work/tasks`,
  save the Gordi `Opening checks` document, assert `Saving`→`Saved`, close/reopen the panel, open the
  canonical Task page through the existing explicit page action, reload, and assert the same block
  IDs/order/text and the same content renderer. The test may use the existing Issue 4–9 host route
  markers only as setup/transport; its goal oracle is content persistence and identity.
- [ ] Add a separate descriptive test mapped to `AC-V3-011`’s Task branch:
  `typed Task checklist embed changes the normalized checklist row without changing the authored document`.
  Click the live Task checklist embed, assert the normalized checklist state through the existing
  Task UI/DAL, reopen the content, and assert the embed contains only its typed target/presentation.
  Do not write or mention a Standard measurement test in this file.
- [ ] Add descriptive tests mapped to `FR-V3-008`/`FR-V3-009` for unauthorized/read-only state,
  keyboard Escape/Save/error/retry, and a forbidden Signal reference. Use a real Signal reference
  returned by the existing Signal journey/loader, not a hand-built Signal row.
- [ ] Use three viewport projects/describe blocks:

  ```ts
  test.use({ viewport: { width: 1280, height: 900 } })
  test.use({ viewport: { width: 1024, height: 900 } })
  test.use({ viewport: { width: 390, height: 844 } })
  ```

  At 1280px assert the content measure and readable panel composition without changing the host
  width contract; at 1024px assert the reachable content/save controls in the intermediate panel
  regime; at 390px assert full-screen content has no horizontal overflow and visible controls are at
  least 44×44px. These are `NFR-V3-005`/`NFR-V3-006` proofs, not claims for AC-V3-002 or AC-V3-003.
- [ ] Run the red command:

  ```bash
  cd mos-app && npx playwright test e2e/v3-structured-content.spec.ts
  ```

  Expected: FAIL until the content slot and persistence path exist. Implement only the named content
  behavior, then run the same command green. Save screenshots/trace evidence in the future Issue 10
  review ledger; do not treat jsdom as rendered proof.

### Task 15 — Add security and malformed-content regression coverage

**Files:** the content unit tests, `supabase/tests/101_mos_record_content_rls.sql`, and a pure
source guard test at `mos-app/src/lib/structured-content/content-security.test.ts`.

- [ ] Write red tests scanning production content modules for `dangerouslySetInnerHTML`,
  `rehype-raw`, `marked`, dynamic `import()` from a block value, raw Supabase writes outside the
  DAL, `service_role`, and Standard/SOP runtime entries. Add runtime tests for literal hostile text,
  unsafe URLs, malformed JSON, unknown block types, unknown future version, retired target, cross-org
  target, and stale revision.
- [ ] Run:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content/content-security.test.ts src/lib/structured-content/content-validator.test.ts src/components/structured-content/record-content-viewer.test.tsx
  cd ../supabase && supabase test db
  ```

  Expected: red on every unimplemented guard; fix the production boundary, not the assertion. The
  database suite must prove direct table writes are denied and the RPC does not leak cross-org data.
- [ ] Run the same commands green. Have the security reviewer trace the SECURITY DEFINER RPC,
  current org/person derivation, target guard, RLS policies, history trigger, grants, and SQLSTATE
  behavior before any merge decision.

### Task 16 — Run the complete Issue 10 quality battery

**Files:** no new production path; only the named Issue 10 implementation/test files may be changed
to fix a failing gate.

- [ ] Run unit tests and changed-line coverage:

  ```bash
  cd mos-app && npm test -- src/lib/structured-content src/lib/db/record-content.test.ts src/components/structured-content src/components/tasks/task-content-section.test.tsx src/components/tasks/record-feed.test.tsx src/components/tasks/task-surface.test.tsx
  npm run test:coverage -- src/lib/structured-content src/lib/db/record-content.test.ts src/components/structured-content src/components/tasks/task-content-section.test.tsx
  ```

  Expected: all targeted tests pass and the changed-line report is at least 80%. Tests must assert
  saved content, unchanged normalized embeds, permission/read-only, error/retry/conflict, and
  keyboard/focus outcomes rather than only snapshots or class names.
- [ ] Run static/build gates:

  ```bash
  npm run typecheck
  npm run lint
  npm run build
  ```

  Expected: zero TypeScript errors, zero ESLint/stylelint errors or warnings, and a successful Vite
  production build.
- [ ] Run the clean local database gate:

  ```bash
  cd ../supabase && supabase db reset && supabase test db
  ```

  Expected: all existing pgTAP files plus `101_mos_record_content_rls.sql` pass from a clean local
  database. No cloud/staging connection is permitted.
- [ ] Run the curated browser gate:

  ```bash
  cd ../mos-app && npx playwright test e2e/v3-structured-content.spec.ts
  ```

  Expected: the Task content journey passes at 1280×900, 1024×900, and 390×844 with no 390px
  horizontal overflow and all required content controls at least 44×44px.

### Task 17 — Complete the four-lens and acceptance review

**Files:** future review evidence in `docs/reviews/v3-redesign.md`; no new app/schema files.

- [ ] Request the spec review against this plan, ADR-0052, and the exact AC ownership table. The
  reviewer must explicitly reject any accidental use of AC-V3-001..007 or AC-V3-012..014 for Issue
  10 behavior and confirm that only AC-V3-010 and the fully proven Task alternative of AC-V3-011
  are claimed by this issue.
- [ ] Request the code-quality review for changed paths, type boundaries, error handling, test
  behavior, and changed-line coverage.
- [ ] Request the security review for XSS/URL policy, JSONB trust boundaries, RLS/org isolation,
  RPC privilege, concurrency, history access, limits, malformed/unknown/future documents, and
  service-role absence.
- [ ] Request the four-lens design review:
  - Visual: E7 typography, spacing, borders, callouts, lists, links, content checklist, panel/page
    measure, 390px controls, and no visual second editor.
  - IxD: keyboard/focus, Save/Saved/error/retry/conflict, Escape restore, read-only honesty,
    reference unavailable state, and live checklist action.
  - IA: content section sits in the existing Task RecordViewer/Notes job; no new route, rail,
    overlay, or universal record abstraction.
  - Product/Intent JTBD: real Gordi opening checks are easy to write/read; Task checklist truth is
    actionable; Signal references preserve factual visibility; no Standard/SOP claim is implied.
    Use `docs/jtbd.md` as the oracle.
- [ ] Record exact commands, exit codes, changed paths, coverage, RLS test count, viewport evidence,
  unresolved technical defects, and the explicit Standard/SOP deferral in the Issue 10 review ledger.

### Task 18 — Future documentation checkpoint and owner pause

**Files:** after implementation and reviews, update only the Issue 10 section in
`docs/agent-context.md`, the V3 pointer in `docs/backlog.md`, and the Issue 10 section in
`docs/reviews/v3-redesign.md`. This planning task does not edit them.

- [ ] Record **Verified**: ADR-0052 ratified; additive `record_contents`/revision migration and
  forced RLS; client/database validators; Task authored content; typed Task checklist and Task/Signal
  references; panel/page same document; keyboard/focus/save/error/read-only states; local pgTAP;
  1280/1024/390 rendered proof; and all quality gates.
- [ ] Record **Not done**: Standard/SOP runtime and Standard measurement branch of AC-V3-011,
  Process/Process Run authored content, Signal body migration, Issue 9 owner acceptance if not yet
  recorded, and Issue 11 route migration.
- [ ] Record **Next action** exactly as the owner-approved sequence dictates: complete any deferred
  Standard/domain design only after a live model exists, or proceed to Issue 11 without reopening
  the Issue 9 gate. Do not state that Issue 10 closes AC-V3-001..007 or AC-V3-012..014.
- [ ] Commit the implementation checkpoint only after all reviews and owner/Director gates using
  the issue-specific message and trailer:

  ```bash
  git add <only the reviewed Issue 10 implementation and test paths>
  git commit -m "feat: implement V3 structured authored content" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

  Pause before push, PR merge, or deploy. The current planning commit is separate and contains only
  ADR-0052 and this plan.

---

## 5. Reversibility, serialization, and boundary checklist

### Storage and rollback

- [ ] Forward migration is additive and has a manual down section; no existing Task, Signal,
  Process, or Process Run row is rewritten.
- [ ] Legacy Task `description` remains the rollback surface until all old writers are retired.
- [ ] Revision snapshots are exported before any destructive rollback; table drops are never used as
  a casual cleanup command.
- [ ] No Standard/SOP migration is bundled or implied.

### Single-Supabase serialization

The self-hosted Supabase instance is shared by MOS and future Gordi ops applications through schema
separation, not project separation. Every content read/write carries the same JWT-derived
`org_id`/person boundary. The save RPC locks one `record_contents` row and compares its revision in
one database transaction; concurrent editors receive an explicit conflict rather than silently
overwriting one another. A typed Task checklist embed uses the existing normalized Task DAL and
RLS; it never tries to serialize a checklist mutation inside the authored JSONB document. No second
content store, client-side service role, or staging data path is permitted.

### Final scope check

- [ ] One content document union with stable IDs, explicit schema version, allow-list, limits, and
  migration registry.
- [ ] Paragraph, heading, bulleted list, numbered list, link, callout, content-only checklist, and
  typed embed all have validator, renderer, and editor coverage.
- [ ] Task checklist completion remains normalized; future Standard steps/measurements/evidence/
  sign-off remain normalized extension points, never JSONB duplicates.
- [ ] Task is the only V1 persisted content owner; Signal is a typed reference target; no fake
  Standard/SOP runtime exists.
- [ ] RLS, RPC, target guard, URL policy, XSS safety, malformed/unknown/future behavior, conflict,
  audit history, permission/read-only, keyboard/focus/save/error, and responsive states are tested.
- [ ] The exact master AC-V3 ownership table remains unchanged after implementation. Any new lower-
  level proof uses its FR/NFR mapping or a descriptive test title.

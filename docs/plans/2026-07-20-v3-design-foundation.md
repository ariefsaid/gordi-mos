# V3 Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Issue 1 of `docs/specs/v3-redesign.spec.md` by making the live route/component/style inventory reproducible, reconciling `DESIGN.md` to the V3/E7 visual and interaction contract, and recording the evidence without migrating application components.

**Architecture:** A dependency-free Node inventory command reads the live `mos-app/src/router.tsx`, source files, CSS files, and a checked-in classification manifest. It emits deterministic JSON/Markdown evidence and fails when a live route, referenced source file, canonical primitive, or inventory entry is missing. `DESIGN.md` remains the normative visual/interaction contract; a separate AC-tagged test guards its V3 conformance anchors, and the inventory is evidence of current conformance/debt, not a replacement design system.

**Tech Stack:** Node.js built-ins (`node:fs`, `node:path`, `node:test`), React 19 + Vite + TypeScript source inspection, Markdown/JSON documentation, existing Vitest/ESLint/stylelint commands inside `mos-app/`.

## Global Constraints

- **AC-V3-001:** Given the representative routes at desktop and phone widths, when computed styles are compared across page heads, body type, controls, rows, panels, dialogs, and states, then each semantic role uses the same V3 values and the rendered result matches the E7 visual reference.
- **AC-V3-014:** Given every live route at the end of migration, when the route/component inventory is checked, then no route uses an unapproved bespoke page shell or superseded component/style family.
- **FR-V3-001:** When any live route renders, the system shall use exactly one declared V3 page family.
- **FR-V3-002:** When analogous controls or states render across routes, the system shall use the same V3 primitive and semantic visual tokens.
- **NFR-V3-003:** Changed-code line coverage remains at least 80%; tests assert user outcomes.
- **NFR-V3-004:** Typecheck and ESLint complete with zero errors/warnings at each issue gate.
- **NFR-V3-005:** Rendered review covers at least 1280px, an intermediate panel regime, and 390px.
- **NFR-V3-006:** No horizontal page overflow at 390px; touch targets are at least 44×44px where required by the Experience Contract.
- **NFR-V3-007:** One canonical component implementation per interaction/component job; migrations remove superseded consumers and styles within the same issue.
- **NFR-V3-009:** V3 changes never mutate production/staging data during review.
- Use the authority order in `docs/specs/v3-redesign.spec.md` §2: owner decisions OD-REDESIGN-72..79, current domain/ADR law, JTBD/Experience/Interaction Contracts, lost-good evidence, then E7 visual styling.
- E7 owns visual language only. Current owner law owns IA and interaction behavior.
- Keep separate typed database models. Shared UI is a grammar over those models, not a universal records table.
- Do not create standalone mockups, Storybook work, or Issue 2 application component migration in this issue.
- Do not run Supabase commands, migrations, a Supabase-dependent dev server, cloud/staging queries, push, PR, merge, or deploy.
- Preserve unrelated worktree changes. Use `apply_patch` for edits. Commit locally with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Files and interfaces

Create these files:

- `scripts/v3-live-inventory.mjs` — exports `buildInventory(repoRoot)`, `collectRouteDeclarations(routerText)`, `validateInventory(inventory, repoRoot)`, `renderInventoryMarkdown(inventory)`, and `main(argv)`; CLI modes are `--write` and `--check`.
- `scripts/v3-live-inventory.test.mjs` — Node built-in tests for AC-V3-014 route coverage, source references, canonical primitive evidence, deterministic rendering/CLI behavior, and the `DESIGN.md` V3 anchor/conformity guard.
- `docs/reference/v3-live-inventory.json` — deterministic machine-readable route/component/style inventory generated from the live source tree.
- `docs/reference/v3-live-inventory.md` — deterministic human-readable rendering of that JSON, including totals and explicit current debt/deferred Issue 2 work.
- `docs/reviews/v3-redesign.md` — Issue 1 evidence-of-record ledger for authority, plan, inventory, design reconciliation, checks, and owner gates.

Modify these files:

- `DESIGN.md` — preserve the token foundation and replace the stale three archetypes/deleted-route examples with V3 page families, RecordViewer, RecordCollection, overlay/navigation/focus/Back, direct-edit feedback, responsive grammar, state matrix, and anti-slop limits.
- `docs/backlog.md` — add the current V3 Issue 1 status, artifact links, exact verification commands, and the Issue 2 unlock condition above historical strata.
- `docs/agent-context.md` — move the current V3 state from “plan/spec pending” to “Issue 1 implementation evidence recorded; owner sign-off still required before Issue 2”; point to the plan and inventory paths.

The inventory schema is fixed before implementation:

~~~js
{
  schemaVersion: 1,
  sourceCommit: null,
  sources: { router, design, appRoot },
  routes: [{
    path, kind: 'page' | 'redirect' | 'dev-only', status: 'canonical' | 'conditional' | 'redirect',
    auth: 'public' | 'protected' | 'capability-gated' | 'role-gated' | 'dev',
    component, file, symbol, pageFamily: 'workspace' | 'focused-record' | 'management' | 'not-applicable',
    frame: 'shared-page-frame' | 'bespoke-or-missing' | 'not-applicable',
    head: 'shared-page-head' | 'bespoke-or-missing' | 'not-applicable',
    typographySpacing: { source, localCssFiles, literalKinds },
    collection: { grammar, presentations, ownsViewState },
    recordOpen: { default, direct, phone },
    overlays: [], states: [], cssFamilies: [], notes: []
  }],
  sharedComponents: [{ job, canonical: [{ file, symbol }], rawOrDuplicate: [], stateCoverage, tokenSources }],
  literals: { filesScanned, countsByKind, examples },
  summary: { routeCount, pageRouteCount, redirectCount, devRouteCount, cssFileCount, componentCount, duplicateJobCount }
}
~~~

The `sourceCommit` field is always `null` so two runs from the same tree remain comparable without embedding mutable Git state. Route paths and source paths are POSIX-normalized. Array entries are sorted by path/job/file; JSON is two-space formatted with a trailing newline.

---

### Task 1: Lock the red test for the missing reproducible inventory guard

**Files:**
- Create: `scripts/v3-live-inventory.test.mjs`
- Read: `mos-app/src/router.tsx`, `mos-app/src/shell/page-frame.tsx`, `mos-app/src/shell/page-head.tsx`, `mos-app/src/components/ui/button.tsx`, `mos-app/src/components/ui/select.tsx`, `mos-app/src/components/ui/state-kit.tsx`, `mos-app/src/components/dashboard/data-table.tsx`, `mos-app/src/shell/record-panel-host.tsx`, `DESIGN.md`

**Interfaces:**
- Consumes: the future exports from `scripts/v3-live-inventory.mjs`.
- Produces: a failing AC-V3-014 guard that names required route paths and canonical interaction jobs before any collector implementation exists.

- [ ] **Step 1: Write the failing test**

Add this test shape to `scripts/v3-live-inventory.test.mjs`; it deliberately imports the not-yet-created collector and specifies the user-facing route contract:

~~~js
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { buildInventory, validateInventory } from './v3-live-inventory.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('AC-V3-014: live route inventory covers canonical, conditional, redirect, and dev branches', () => {
  const inventory = buildInventory(repoRoot)
  const errors = validateInventory(inventory, repoRoot)
  assert.deepEqual(errors, [])
  const paths = new Set(inventory.routes.map((route) => route.path))
  for (const path of [
    '/', '/work/tasks', '/work/tasks/:taskId', '/work/signals', '/work/signals/:signalId',
    '/inbox', '/cafe', '/cafe/log', '/money', '/profile', '/admin/people',
    '/login', '/recovery', '/updates', '/ops', '/kitchen/log', '/dashboard',
  ]) assert.equal(paths.has(path), true, `missing route ${path}`)
})

test('AC-V3-014: inventory records canonical primitive jobs', () => {
  const inventory = buildInventory(repoRoot);
  assert.ok(inventory.routes.length >= 40, 'route inventory must cover the complete live route tree');
  assert.ok(inventory.sharedComponents.length >= 10, 'shared-component inventory must name the live primitive set');
  assert.ok(inventory.cssFamilies.length >= 10, 'style inventory must cover the surviving CSS families');
  for (const job of ['search', 'filter', 'sort', 'group', 'saved views', 'wide right panel', 'full page', 'phone full-screen']) {
    assert.ok(inventory.canonicalJobs.includes(job), `missing canonical job: ${job}`);
  }
});
~~~

- [ ] **Step 2: Run the new test to verify the correct failure**

Run from the repository root:

~~~bash
node --test scripts/v3-live-inventory.test.mjs
~~~

Expected: FAIL before test collection because `scripts/v3-live-inventory.mjs` does not exist (`ERR_MODULE_NOT_FOUND`). This is the intended red state proving the guard has no implementation yet.

- [ ] **Step 3: Commit the red test checkpoint**

~~~bash
git add scripts/v3-live-inventory.test.mjs
git commit -m "test: define V3 live inventory guard"
~~~

Expected: one local commit containing only the failing guard test and the required co-author trailer.

### Task 2: Implement the deterministic collector and validator

**Files:**
- Create: `scripts/v3-live-inventory.mjs`
- Read: `mos-app/src/router.tsx`, `mos-app/src/config/features.ts`, `mos-app/src/pages/*.tsx`, `mos-app/src/components/**/*.tsx`, `mos-app/src/shell/*.tsx`, `mos-app/src/**/*.css`, `DESIGN.md`
- Test: `scripts/v3-live-inventory.test.mjs`

**Interfaces:**
- Consumes: `repoRoot` and the current checked-in source tree.
- Produces: `buildInventory(repoRoot)`, `validateInventory(inventory, repoRoot)`, deterministic Markdown rendering, and a CLI that exits `0` only when validation has no errors.

- [ ] **Step 1: Add the route parser and explicit classification map**

Implement `collectRouteDeclarations(routerText)` to capture every `path: '...'` literal, `index: true` page, redirect, DEV-only branch, and nested record path from `mos-app/src/router.tsx`. Normalize the nested paths to the concrete entries below and retain route conditions from the surrounding source text:

~~~text
Public: /login, /recovery.
Canonical protected: /, /work/tasks, /work/tasks/new, /work/tasks/:taskId, /work/signals, /work/signals/:signalId, /work/projects, /work/objectives, /events, /money, /money/detail, /money/budget, /money/pricing, /money/follow-ups, /inbox, /cafe, /cafe/log, /cafe/plan, /cafe/stock, /cafe/review, /cafe/pushes, /ecommerce, /roastery, /profile, /admin/people, /work/follow-ups/:id.
Redirects: /work, /work/projects-processes, /work/cascade, /work/follow-ups, /admin, /tasks, /tasks/new, /tasks/:taskId, /updates, /ops, /ops/new, /ops/:id/edit, /kitchen, /kitchen/log, /kitchen/plan, /kitchen/stock, /kitchen/review, /kitchen/pushes, /objectives, /projects-processes, /dashboard, /dashboard/detail, /sales, /plan/budget, /plan/pricing.
DEV-only: /dev/ui, /__home-stacked, /dev/views, /dev/views/:viewId.
~~~

Join each page path to its existing symbol/file from `router.tsx`; do not invent route files. Classify page families using this Issue 1 contract: Home, collection pages, operational modules, and analytical/triage surfaces are `workspace`; Task/Signal canonical record modes are `focused-record`; Projects/Processes, Objectives, People, and Profile are `management`; public/auth/redirect/dev rows use `not-applicable`.

- [ ] **Step 2: Add source-derived style/state/interaction evidence**

Implement `scanSourceEvidence(repoRoot, pageFile, routeText)` with Node regular expressions that report, per page file: `PageFrame`/ `PageHead` imports and JSX use, local `*.css` imports, `EmptyState`/ `ErrorState`/ `SkeletonRows`/ `LoadingShell`, `DataTable`/ `TasksWorkspace`/ feed/list/table symbols, `TaskDrawer`/ `RecordPanelHost`/ `CommandMenu`/ dialog/panel symbols, `useIsDesktop`/ `useIsNarrow`/ `useIsPhone`, and literal `font-size`, `line-height`, `padding`, `margin`, `gap`, `width`, and `height` values in local CSS. Record missing shared primitives as current conformance debt; do not alter source files to make the scan look green.

- [ ] **Step 3: Add the canonical-job inventory and validator**

Define these canonical job rows from actual existing files/symbols and list all discovered consumers plus raw/bespoke alternatives:

~~~text
button → mos-app/src/components/ui/button.tsx :: Button
select → mos-app/src/components/ui/select.tsx :: Select
menu → mos-app/src/components/command/command-menu.tsx :: CommandMenu; mos-app/src/components/tasks/row-menu.tsx :: RowMenu
dialog → mos-app/src/components/ui/confirm-dialog.tsx :: ConfirmDialog; mos-app/src/components/admin/confirm-dialog.tsx :: ConfirmDialog
drawer-or-panel → mos-app/src/shell/record-panel-host.tsx :: RecordPanelHost; mos-app/src/components/tasks/task-drawer.tsx :: TaskDrawer; mos-app/src/components/assistant/AssistantPanel.tsx :: AssistantPanel
table-or-list → mos-app/src/components/dashboard/data-table.tsx :: DataTable; mos-app/src/components/tasks/tasks-workspace.tsx :: TasksWorkspace; mos-app/src/components/admin/user-table.tsx :: UserTable; mos-app/src/components/inbox/InboxList.tsx :: InboxList
page-head → mos-app/src/shell/page-head.tsx :: PageHead
page-frame → mos-app/src/shell/page-frame.tsx :: PageFrame
record-renderer → mos-app/src/components/tasks/task-surface.tsx :: TaskSurface; mos-app/src/components/signals/signal-record-host.tsx :: SignalRecordHost
state-kit → mos-app/src/components/ui/state-kit.tsx :: EmptyState, ErrorState, SkeletonRows, LoadingShell
typography-and-spacing → mos-app/src/index.css :: @layer base and semantic tokens; DESIGN.md :: typography/spacing
~~~

`validateInventory` must fail for missing files/symbols, a route without a family, an inventory page without a source path, a canonical job without a source, or an unlisted `*.css` file under `mos-app/src/pages`, `mos-app/src/components`, or `mos-app/src/shell`. The separate DESIGN conformance test owns V3 anchor assertions. The validator must return human-readable errors rather than swallowing filesystem or parser failures.

- [ ] **Step 4: Run the test to verify the minimal implementation is green**

Run:

~~~bash
node --test scripts/v3-live-inventory.test.mjs
~~~

Expected: PASS for both AC-tagged tests, with no unhandled warnings. If a route/source/parser error appears, fix the collector or classification map, not the test oracle.

- [ ] **Step 5: Commit the collector checkpoint**

~~~bash
git add scripts/v3-live-inventory.mjs scripts/v3-live-inventory.test.mjs
git commit -m "feat: add deterministic V3 inventory collector"
~~~

Expected: local checkpoint contains the passing guard and no application component migration.

### Task 3: Generate and inspect the route/component/style inventory

**Files:**
- Create: `docs/reference/v3-live-inventory.json`
- Create: `docs/reference/v3-live-inventory.md`
- Modify: `scripts/v3-live-inventory.mjs` only if deterministic output or a missing live source is exposed
- Test: `scripts/v3-live-inventory.test.mjs`

**Interfaces:**
- Consumes: `buildInventory(repoRoot)` and `renderInventoryMarkdown(inventory)`.
- Produces: reproducible inventory artifacts used by `AC-V3-014`, the review ledger, backlog, and Issue 2.

- [ ] **Step 1: Write the inventory artifacts with the CLI**

Run:

~~~bash
node scripts/v3-live-inventory.mjs --write
~~~

Expected: the command writes only `docs/reference/v3-live-inventory.json` and `docs/reference/v3-live-inventory.md`; both have stable ordering and no current timestamp.

- [ ] **Step 2: Inspect all route and primitive totals**

Run:

~~~bash
node -e "const x=require('./docs/reference/v3-live-inventory.json'); console.log(JSON.stringify(x.summary,null,2))"
sed -n '1,260p' docs/reference/v3-live-inventory.md
~~~

Expected: the Markdown names every canonical, conditional, redirect, and DEV route; every row includes family/frame/head/typography-spacing/collection/record-open/overlay/state/CSS evidence; the component section includes canonical and duplicate jobs; the literal section lists raw type/spacing sources.

- [ ] **Step 3: Run the guard against the generated artifacts**

Run:

~~~bash
node scripts/v3-live-inventory.mjs --check
node --test scripts/v3-live-inventory.test.mjs
~~~

Expected: both commands exit `0`. `--check` must also fail when the JSON or Markdown is stale relative to a fresh `--write` result.

- [ ] **Step 4: Commit the inventory checkpoint**

~~~bash
git add docs/reference/v3-live-inventory.json docs/reference/v3-live-inventory.md scripts/v3-live-inventory.mjs
git commit -m "docs: record V3 live route and component inventory"
~~~

Expected: checkpoint contains the reproducible evidence and the guard implementation only.

### Task 4: Reconcile the binding V3 design grammar

**Files:**
- Modify: `DESIGN.md:622-793` (replace stale Page Archetypes/Empty States section)
- Modify: `DESIGN.md:395-411` (update rail/header/overlay and responsive geometry clauses that contradict E7/V3)
- Test: `scripts/v3-live-inventory.test.mjs`

**Interfaces:**
- Consumes: `docs/specs/v3-redesign.spec.md` §§2, 6, 9–13; `docs/decisions.md` OD-REDESIGN-72..79; `docs/experience-contract.md` Rules 1–12; `docs/interaction-contract.md` I1–I10; `docs/reference/twenty-ixd-patterns.md`; `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md`; E7 tokens in `e7-prototype.css`.
- Produces: one normative `DESIGN.md` V3 foundation that the Issue 2 Storybook matrix and later app migration can consume.

- [ ] **Step 1: Write the failing DESIGN conformance guard**
  Add the DESIGN-only assertions to `scripts/v3-live-inventory.test.mjs`: the E7 anchors (type, spacing, surfaces, controls, `RecordViewer`, `RecordCollection`, `Focused record`, right-side panel, direct-edit Escape behavior, and `390px` responsive behavior) must be present, while the deleted `Write-Review`, `Catalog-Manage`, `/updates`, `/ops`, and `/kitchen` route examples must be absent. Run `node --test scripts/v3-live-inventory.test.mjs`. Expected result: FAIL on the current stale DESIGN.md.

- [ ] **Step 2: Replace stale route examples and archetype vocabulary**

Remove references in the replaced section to `/updates`, `/ops`, `/tasks`, `/dashboard`, `/kitchen/*`, `Write-Review`, and `Catalog-Manage` as current archetypes. Use current route examples: `/`, `/work/tasks`, `/work/signals`, `/events`, `/money`, `/inbox`, `/cafe`, `/work/projects`, `/work/objectives`, `/admin/people`, and `/profile`. Mark the current mixed implementation as inventory evidence, not acceptance.

- [ ] **Step 3: Add the E7 visual foundation and conformance boundary**

State that E7 owns composed visual styling: warm near-black/warm near-white surfaces, One Blue action, navy structural weight, restrained orange sprinkle, Plus Jakarta Sans/DM Sans/Inter-tabular/SF Mono roles, 12px cards/overlays, 8px controls, 32px controls, 44px phone targets, 52px E7 rows, 1180px content measure, E7 shadow/gradient limits, single border, tinted statuses, and visible `:focus-visible`. Keep app token names (`--ds-*`, `--brand-*`, `--status-*`) as the implementation seam; `--e7-*` names remain mockup-only.

- [ ] **Step 4: Add the three V3 page families and shared frame grammar**

Define exactly `{Workspace, Focused record, Management}`. Workspace owns scanning/filtering/grouping/acting on collections and specialized module bodies; Focused record owns one record in panel or page mode; Management owns people, definitions, catalogs, profile, and administration. Require `PageFrame` + `PageHead` as the shared frame/head target, with one `<main>` and one `<h1>` per route; specialized content may vary while shell/spacing/type/states stay shared.

- [ ] **Step 5: Add RecordViewer and RecordCollection contracts**

RecordViewer must list identity/type, ordered typed metadata/relations, content sections/allow-listed blocks, activity/history, actions/permission state, shared field display/edit, save/error feedback, read-only state, panel/page modes, focus, keyboard, Back, and canonical URL behavior. RecordCollection must own search/filter/sort/group/saved views/selection/loading/error/empty/URL state/record opening; Feed/Table/Triage Queue/Board/Calendar/Library are adapters. State explicitly that Task, Standard/SOP, Signal, Process, Project, Money, and People retain separate typed models and object-specific layouts.

- [ ] **Step 6: Add overlay, navigation, focus, direct-edit, and responsive grammar**

Normatively specify: centered temporary Search/⌘K; wide right panel for collection record clicks; one panel host with internal stack and Back; explicit `Open full page` plus direct URL/refresh/bookmark/new-tab as canonical full page; no near-full centered record popup; Deputy shares the host; centered blocking confirmation; anchored menus/pickers; phone panel becomes full-screen; focus enters the panel/page and returns to the opener; Escape closes the current overlay or restores a saved field value; Enter/Tab/click-outside commits supported inline edits; visible Saving/Saved/validation/retry feedback; honest read-only permissions; desktop ≥1280, intermediate 768–1279, phone 390/≤767, no horizontal overflow, and ≥44px phone targets.

- [ ] **Step 7: Add the state matrix and anti-slop limits**

Add a matrix covering page family × default/loading/empty/filtered-empty/error/permission/read-only/saving/saved/validation/retry/archived-retracted. Add the conformance limits: no new visual identity, no generic font/Tailwind direction, no new component family, no shadow soup/glass/neon/purple gradients/perpetual motion/oversized rounding, no decorative metrics, no emoji, no fake records, and no internal system nouns in floor-member defaults. Explicitly state that the Taste skill is a checklist only and yields to E7, owner law, accessibility, and the existing React/CSS architecture.

- [ ] **Step 8: Run the design-anchor guard**

Run:

~~~bash
node --test scripts/v3-live-inventory.test.mjs
~~~

Expected: PASS, including the checks for `RecordViewer`, `RecordCollection`, `Focused record`, right-side panel, Escape restore, and 390px in `DESIGN.md`.

- [ ] **Step 9: Commit the design contract checkpoint**

~~~bash
git add DESIGN.md scripts/v3-live-inventory.test.mjs
git commit -m "docs: reconcile DESIGN.md to V3 grammar"
~~~

Expected: checkpoint changes documentation and the guard only; no `.tsx`, application `.css`, route, database, or dependency migration appears in the commit.

### Task 5: Tie Issue 1 evidence into state and review records

**Files:**
- Modify: `docs/backlog.md` top current-state banner
- Modify: `docs/agent-context.md` current-workstream and current-state sections
- Create: `docs/reviews/v3-redesign.md`
- Read: `docs/specs/v3-redesign.spec.md`, `docs/plans/2026-07-20-v3-design-foundation.md`, `docs/reference/v3-live-inventory.md`

**Interfaces:**
- Consumes: generated inventory totals, exact local commit hashes, command output, and the reconciled `DESIGN.md` sections.
- Produces: no orphaned Issue 1 plan, a review ledger keyed to `v3-redesign`, and an explicit owner gate for Issue 2.

- [ ] **Step 1: Update the backlog current-state block**

Record Issue 1 as “implementation evidence complete locally; owner review pending,” link the plan, inventory JSON/Markdown, `DESIGN.md`, and ledger, map the issue to AC-V3-001 and AC-V3-014, and state that Issue 2 unlocks only after owner approval of the Issue 1 documentation/conformance foundation. Keep historical E7 strata unchanged below the banner.

- [ ] **Step 2: Update agent context without moving rules into state**

Change only the E8 current-workstream/current-state pointers: identify Issue 1 as the active local checkpoint, point to the exact plan and inventory, state that no application component migration occurred, and state the remaining owner decision as approval of the foundation before Issue 2. Preserve the standing rules and cold-start reading order.

- [ ] **Step 3: Create the v3-redesign review ledger**

Use these headings and evidence fields: Scope and exclusions; authority read; plan self-review; inventory totals; route/component/style findings; contradiction register; AC-V3-001 evidence boundary; AC-V3-014 guard evidence; exact commands and exit codes; changed files; local commit hashes; Issue 2 deferrals; owner gate. State plainly that Issue 1 has no rendered application acceptance because UI migration is deferred.

- [ ] **Step 4: Run orphan/path checks**

Run:

~~~bash
rg -n "2026-07-20-v3-design-foundation|v3-live-inventory|v3-redesign" docs/backlog.md docs/agent-context.md docs/reviews/v3-redesign.md docs/plans/2026-07-20-v3-design-foundation.md
~~~

Expected: every new artifact is referenced by the current-state docs or the review ledger, and no new document is reachable only through an unlinked path.

- [ ] **Step 5: Commit the evidence checkpoint**

~~~bash
git add docs/backlog.md docs/agent-context.md docs/reviews/v3-redesign.md
git commit -m "docs: record V3 Issue 1 evidence and gate"
~~~

Expected: checkpoint contains state/ledger updates only.

### Task 6: Verify Issue 1 and prepare the local handoff

**Files:**
- Read: all changed files from Tasks 1–5
- Test: `scripts/v3-live-inventory.test.mjs`, `mos-app/src/shell/sections.test.ts`, `mos-app/src/shell/destinations.test.ts`, `mos-app/src/shell/page-frame.test.tsx`, `mos-app/src/shell/page-head.test.tsx`, `mos-app/src/components/ui/state-kit.test.tsx`, `mos-app/src/components/ui/primitives.test.tsx`

**Interfaces:**
- Consumes: all local checkpoints and the final inventory artifacts.
- Produces: fresh verification evidence and a local commit range ready for the parent Director; no push or merge.

- [ ] **Step 1: Run the exact inventory and documentation guards**

Run from the repository root:

~~~bash
node scripts/v3-live-inventory.mjs --check
node --test scripts/v3-live-inventory.test.mjs
node --experimental-test-coverage --test --test-coverage-include=scripts/v3-live-inventory.mjs scripts/v3-live-inventory.test.mjs
git diff --check HEAD~5..HEAD
~~~

Expected: all commands exit `0`; `--check` reports the manifest is current; all AC-tagged tests pass; Node reports at least 80% changed-script line coverage; Git reports no whitespace errors. If the checkpoint count differs from five because a prior commit was coalesced, use `git diff --check $(git merge-base HEAD HEAD~1)..HEAD` and record the exact range instead of hiding the failure.

- [ ] **Step 2: Run the app static gates inside `mos-app/`**

Run:

~~~bash
npm run typecheck
npm run lint
npm test -- --run src/shell/sections.test.ts src/shell/destinations.test.ts src/shell/page-frame.test.tsx src/shell/page-head.test.tsx src/components/ui/state-kit.test.tsx src/components/ui/primitives.test.tsx
~~~

Expected: typecheck exits `0`; ESLint and stylelint exit `0` with zero warnings; the targeted Vitest suite exits `0`. These checks do not require Supabase.

- [ ] **Step 3: Run the full non-Supabase Vitest suite if time remains**

Run:

~~~bash
npm test
~~~

Expected: exit `0` with all existing tests passing. Do not start Playwright, Supabase, or a dev server for Issue 1.

- [ ] **Step 4: Inspect final diff for scope and contradictions**

Run:

~~~bash
git status --short
git diff --stat HEAD~5..HEAD
git diff --check HEAD~5..HEAD
git diff HEAD~5..HEAD -- DESIGN.md docs/backlog.md docs/agent-context.md docs/reviews/v3-redesign.md docs/reference/v3-live-inventory.md scripts/v3-live-inventory.mjs scripts/v3-live-inventory.test.mjs
~~~

Expected: only the plan, inventory guard/artifacts, `DESIGN.md`, backlog/context/ledger documentation are changed; no `mos-app/src/*.tsx`, application `.css`, package dependency, route, schema, or generated environment file changes appear.

- [ ] **Step 5: Record exact results and local hashes in the ledger**

Append the actual command outputs summarized with exit codes, inventory totals, contradiction resolutions, Issue 2 deferrals, owner decision still required, and `git log --oneline` hashes to `docs/reviews/v3-redesign.md`.

- [ ] **Step 6: Commit the verification record**

~~~bash
git add docs/reviews/v3-redesign.md
git commit -m "test: verify V3 Issue 1 foundation"
~~~

Expected: the final local commit has the required co-author trailer. Do not push, open a PR, merge, or deploy.

## Self-review before implementation

- [x] **Spec coverage:** AC-V3-001 is mapped to Tasks 1, 3, 4, and 6 as a contract/evidence boundary; rendered computed-style acceptance remains deferred to Issue 2 and the representative-slice gate. AC-V3-014 is mapped to Tasks 1–3 and 6. FR-V3-001/002 and NFR-V3-003/004/005/006/007/009 are mapped to the collector, design contract, and verification tasks. The Issue 1 delivery decomposition item is covered by Tasks 1–5.
- [x] **Scope boundary:** Issue 1 does not implement Storybook, page-family primitives, shared overlay host migration, RecordViewer code, RecordCollection code, JSONB schema/ADR, route migration, rendered browser acceptance, owner IA ratification, or any Issue 2 application component migration. The gate unlocking Issue 2 is owner approval of this plan's evidence, the reconciled `DESIGN.md`, and the reproducible inventory/guard; the owner still must approve the representative rendered slice later.
- [x] **Placeholder scan:** the plan contains no unresolved placeholder or unbounded test step; every executable step names a file, symbol, command, and expected exit/result.
- [x] **Path/interface consistency:** every created artifact appears in the Files sections and the state/ledger task; the test imports the exact exports defined in Task 2; CLI modes and generated paths are consistent across Tasks 2–6.
- [x] **Risk review:** route parsing is source inspection only, so the guard reports parser/source failures loudly; it does not execute app code, touch Supabase, or claim browser style parity. Existing mixed route shells are recorded as debt for later migration instead of being silently marked conformant.

## Issue 2 handoff gate

Issue 1 is complete only when the final local verification is recorded and the owner can review:

1. `docs/reference/v3-live-inventory.json` and `.md` as the reproducible baseline;
2. `DESIGN.md` as the binding E7 visual + V3 page/record/collection/overlay/focus/navigation/responsive grammar;
3. `docs/reviews/v3-redesign.md` as the evidence ledger; and
4. the exact local commits and zero-exit static checks.

Issue 2 may start only after the owner approves this foundation. No Issue 1 evidence is a rendered application acceptance claim.

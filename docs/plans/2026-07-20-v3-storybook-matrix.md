# V3 Storybook Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reconciled E7 visual contract inspectable in Storybook through canonical production components, explicit state coverage, responsive viewport proof, and runnable browser accessibility checks while preserving the existing Vitest 3.2.6 suite and configuration behavior.

**Architecture:** Add an isolated Storybook 10.5.2 workbench under `.storybook/` that imports the app's existing runtime CSS/fonts and canonical primitives. Use Storybook's external Playwright/Jest test-runner with the official a11y addon, while leaving the existing Vite/Vitest project untouched. A Node-only matrix guard derives the Issue 2/3/9 boundary from the master spec, scans story metadata/imports, and emits deterministic evidence artifacts.

**Tech Stack:** React 19, Vite 7, TypeScript, Storybook 10.5.2, `@storybook/react-vite` 10.5.2, `@storybook/addon-a11y` 10.5.2, `@storybook/test-runner` 0.24.4, existing Playwright, Node `node:test`, and existing Vitest 3.2.6.

## Global Constraints

- V3 Issue 2 only: Storybook component/state/responsive proof; no route migration, page-family production refactor, shared overlay host, RecordViewer/RecordCollection behavior, representative app rendering, or Supabase operation.
- `docs/specs/v3-redesign.spec.md` §12 is the delivery-sequence authority; §10 owns NFR-V3-001 through NFR-V3-007; §11 owns AC-V3-001.
- E7 owns visual styling; `DESIGN.md` and existing runtime tokens are the styling authority; current owner law owns IA and interaction behavior.
- Use one canonical production component per job; stories may compose canonical components but may not create a competing production vocabulary or mask a component gap with story-only CSS.
- Preserve the existing `mos-app/package.json` `test`, `test:coverage`, and `test:watch` scripts, the existing `mos-app/vite.config.ts` Vitest block, and its include/exclude behavior. The recorded pre-change baseline is 2,868 tests; the post-change count is expected to increase legitimately because canonical ViewTabs, StatusPill, and CommandMenu locking tests remain in normal discovery.
- Pin Storybook packages exactly; do not install `@storybook/addon-vitest`, `@vitest/browser`, `@vitest/browser-playwright`, Vitest 4, a second CSS framework, or a component library.
- Realistic Gordi data only: no generic names, lorem ipsum, emoji, fake-perfect metrics, or decorative dashboard filler.
- No standalone design mockups; Storybook is the approved in-code workbench for this issue.
- Do not push, open a PR, merge, deploy, run Supabase, start a Supabase-dependent app server, run migrations, or mutate application data.

---

## Authority and compatibility decisions

- `docs/specs/v3-redesign.spec.md` §12 is the delivery-sequence authority; §10 owns NFR-V3-001
  through NFR-V3-007; §11 owns AC-V3-001.
- `DESIGN.md`, E7 assets, `SALVAGE-INVENTORY.md`, `docs/jtbd.md`,
  `docs/experience-contract.md`, and `docs/interaction-contract.md` are the visual, product,
  and interaction authorities already reconciled in Issue 1. No new aesthetic or standalone
  mockup is introduced here.
- Use the current canonical sources: `mos-app/src/components/ui/button.tsx`,
  `text-input.tsx`, `select.tsx`, `checkbox.tsx`, `toggle.tsx`, `pill.tsx`, `state-kit.tsx`,
  `state-pill.tsx`, `mos-app/src/components/tasks/status-pill.tsx`,
  `mos-app/src/components/kitchen/plan-qty-stepper.tsx`/`plan-qty-cell.tsx`,
  `mos-app/src/components/dashboard/data-table.tsx`, `mos-app/src/shell/page-frame.tsx`,
  `page-head.tsx`, `record-panel-host.tsx`, `mos-app/src/components/command/command-menu.tsx`,
  `mos-app/src/components/ui/confirm-dialog.tsx`, `mos-app/src/components/tasks/row-menu.tsx`,
  and `mos-app/src/components/ui/view-tabs.tsx`. Stories may compose
  these components, but may not create a competing production component vocabulary.
- The latest stable official Storybook release checked during planning is `10.5.2`. Its
  `@storybook/react-vite@10.5.2` peer range supports React 19 and Vite 7. The official
  `@storybook/addon-vitest@10.5.2` peer range accepts Vitest 3 but also requires
  `@vitest/browser-playwright@^4.0.0`; that path would force a Vitest 4/browser-runner change and
  is rejected by the Director constraint.
- Use the isolated official `@storybook/test-runner@0.24.4` instead. Its peer range supports
  Storybook 10.5, it is a standalone framework-agnostic Playwright/Jest utility rather than a
  Storybook addon, and current Storybook 10.5 docs explicitly say that installing
  `@storybook/addon-a11y` and setting `parameters.a11y.test` to a non-`'off'` value includes
  accessibility tests in the external test-runner. Do not add `@storybook/test-runner` to
  `main.ts`'s `addons` array. Do not add `@storybook/addon-vitest`, `@vitest/browser`, or
  `@vitest/browser-playwright`.
- The current official test-runner hook is `postVisit(page, context)`, which runs after the story
  and its play function; there is no `postRender` hook in the current API. Configure `postVisit` only
  for `waitForPageReady(page)`/render-readiness evidence. Do not add the historical
  `axe-playwright` injection recipe unless the installed 10.5 runner fails to execute the official
  addon-backed checks; if it does, stop for Director review rather than silently changing the
  a11y mechanism.
- Pin Storybook packages exactly at `10.5.2`, pin `@storybook/test-runner` exactly at `0.24.4`,
  and leave `vitest: ^3.2.0` and `@vitest/coverage-v8: ^3.2.6` untouched. The lockfile must retain
  the current Vitest 3.2.6 resolution. No second CSS framework or component library is allowed.

Official references used for the decision:

- [Storybook install documentation](https://storybook.js.org/docs/get-started/install)
- [Storybook 10.5 addon installation](https://storybook.js.org/docs/10.5/addons/install-addons)
- [Storybook 10.5 accessibility testing](https://storybook.js.org/docs/10.5/writing-tests/accessibility-testing)
- [Storybook 10.5 test-runner integration](https://storybook.js.org/docs/10.5/writing-tests/integrations/test-runner)
- [Storybook test-runner package metadata](https://www.npmjs.com/package/@storybook/test-runner)
- [Storybook React/Vite package metadata](https://www.npmjs.com/package/@storybook/react-vite)

## Exact file/symbol map

### Existing files to preserve or minimally extend

- `mos-app/package.json`: add Storybook scripts and exact dev dependencies; preserve the existing
  `test`, `test:coverage`, and `test:watch` commands verbatim.
- `mos-app/package-lock.json`: generated only by the pinned `npm install`; verify Vitest remains
  3.2.6 and no Vitest 4 package is introduced.
- `mos-app/vite.config.ts`: leave the existing Vitest `test` block and all include/exclude rules
  unchanged. Storybook gets its own config and never reuses or edits this test project.
- `mos-app/src/components/ui/view-tabs.test.tsx`, `mos-app/src/components/tasks/status-pill.test.tsx`,
  and `mos-app/src/components/command/command-menu.test.tsx`: extend these existing canonical
  suites for production behavior locks; do not create per-issue parallel test files.
- `mos-app/src/components/ui/view-tabs.tsx`, `mos-app/src/components/tasks/status-pill.tsx`,
  `mos-app/src/components/command/command-menu.tsx`, `command-menu.css`, `mos-app/src/i18n/messages.ts`,
  `mos-app/src/components/ui/Button.css`, and `CardHead.css`: only narrow E7/interaction/a11y
  corrections proven by a failing rendered or RTL assertion may be changed.
- `mos-app/tsconfig.app.json` and `mos-app/tsconfig.node.json`: include only the new Storybook
  config/setup files required by typecheck; do not broaden application source inclusion beyond
  `src`.
- `scripts/v3-live-inventory.mjs`: extend `buildInventory`, `validateInventory`, and
  `renderInventoryMarkdown` with a derived `storybookMatrix` summary and artifact links. Keep all
  Issue 1 route/component/CSS counts and delivery-sequence checks intact.
- `docs/backlog.md`, `docs/agent-context.md`, and `docs/reviews/v3-redesign.md`: update the current
  V3 checkpoint from Issue 1 local evidence to Issue 2 local evidence, retain the owner approval
  pause, and state the Issue 3 unlock condition. Do not rewrite historical strata.
- `docs/reference/v3-live-inventory.json` and `.md`: regenerate with the deterministic inventory
  script after Storybook evidence is wired.

### Exact new files

- `mos-app/.storybook/main.ts`: `StorybookConfig` for `@storybook/react-vite`, only the curated
  `src/stories/v3/**/*.stories.@(ts|tsx)` glob, and the actual addon `@storybook/addon-a11y`;
  expose `../public` as the existing static directory and resolve the existing `@` alias/Tailwind
  Vite plugin without adding another styling system. The standalone `@storybook/test-runner` is
  invoked by a package script, never listed in `addons`.
- `mos-app/.storybook/preview.tsx`: `Preview` with the global `MemoryRouter` and `I18nProvider`
  decorators, the runtime font/token setup, custom viewport presets named `desktop1280`,
  `intermediate`, and `phone390`, and project-level `parameters.a11y.test: 'error'`.
- `mos-app/.storybook/test-runner.ts`: official `TestRunnerConfig` with a `postVisit(page, context)`
  hook that awaits `waitForPageReady(page)` after story rendering; the a11y enforcement itself is
  provided by the installed `@storybook/addon-a11y` plus `parameters.a11y.test: 'error'` according
  to the current official Storybook 10.5 test-runner docs. It must not start Supabase or import
  application bootstrap/auth side effects.
- `mos-app/src/storybook/setup.ts`: import the same runtime font and global CSS entrypoints as
  `src/main.tsx` (`@fontsource-variable/dm-sans`, Plus Jakarta weights, Inter variable,
  `src/index.css`, `Button.css`, `Pill.css`, `styles/drawer.css`, and the existing task row-menu
  stylesheet where its canonical class is defined). This file is setup only; it does not import
  `main.tsx`.
- `mos-app/src/storybook/mocks/tasks.ts` and `mos-app/src/storybook/mocks/supabase.ts`: Storybook-only
  service-boundary replacements for overlay stories. They must be reached only through
  `.storybook/main.ts` aliases and must not be imported by the production Vite graph.
- `mos-app/src/stories/v3/storybook.css`: token-based workbench layout only (`v3-story-frame`,
  token grids, responsive frame labels, and realistic specimen spacing). It may not restyle a
  canonical component, replace its state, hard-code new colors, or hide overflow defects.
- The repo-level `scripts/` directory gets `v3-storybook-matrix.mjs`,
  `v3-storybook-matrix.test.mjs`, and `run-v3-storybook-tests.mjs`.
  `v3-storybook-matrix.mjs` exports `buildStorybookMatrix`, `validateStorybookMatrix`,
  `renderStorybookMatrixMarkdown`, and `main`; `run-v3-storybook-tests.mjs` starts a temporary
  Storybook server, waits for its health URL, runs the isolated `test-storybook` CLI, and always
  terminates the child process.
- `docs/reference/v3-storybook-matrix.json` and `.md`: generated deterministic proof artifacts.
  The markdown must include Storybook version, runner choice, story/export totals, state/responsive
  totals, canonical imports, exact gaps/owners, viewport evidence, and explicit false claims for
  application migration and Issue 9 acceptance.
- `mos-app/src/stories/v3/foundation.stories.tsx`: `Foundation/RuntimeTypography`,
  `Foundation/TokenRoles`, `Foundation/ResponsiveFrames`, and `Foundation/FocusSurface`.
- `mos-app/src/stories/v3/controls.stories.tsx`: `Controls/ButtonStateMatrix`,
  `Controls/FieldStateMatrix`, `Controls/SelectionAndStatus`, and `Controls/KeyboardFocus`.
- `mos-app/src/stories/v3/feedback.stories.tsx`: `Feedback/EmptyStateVariants`,
  `Feedback/ErrorAndRetry`, `Feedback/LoadingShells`, and `Feedback/SavingAndSaved`.
- `mos-app/src/stories/v3/page-compositions.stories.tsx`: `PageComposition/Workspace`,
  `PageComposition/FocusedRecord`, and `PageComposition/Management`.
- `mos-app/src/stories/v3/dense-collections.stories.tsx`:
  `DenseCollection/ReadyDesktop`, `DenseCollection/ReadyIntermediate`,
  `DenseCollection/ReadyPhone`, `DenseCollection/Loading`, `DenseCollection/Empty`,
  `DenseCollection/FilteredEmpty`, and `DenseCollection/Error`.
- `mos-app/src/stories/v3/overlays.stories.tsx`: `Overlays/CommandSearch`,
  `Overlays/Confirmation`, `Overlays/AnchoredMenu`, and `Overlays/CurrentRecordPanelShell`.
- `mos-app/src/stories/v3/accessibility-responsive.stories.tsx`:
  `AccessibilityResponsive/RuntimeAndViewport` and `AccessibilityResponsive/KeyboardJourneys`.

## TDD and implementation sequence

### Task 1: Capture the unchanged Vitest baseline before package/config edits

**Files:**
- Read: `mos-app/package.json`, `mos-app/package-lock.json`, `mos-app/vite.config.ts`
- Produce temporary evidence: `/tmp/gordi-mos-v3-vitest-before.json`, `/tmp/gordi-mos-v3-vitest-config-before.txt`

**Produces:** A before-report with `numTotalTests: 2868`, zero failed tests, and a hash of the unchanged Vitest scripts/config.

- [ ] From `mos-app/`, run `npm ci` using the pre-change lockfile.
- [ ] Run the existing command exactly: `npm test -- --reporter=json --outputFile=/tmp/gordi-mos-v3-vitest-before.json`.
- [ ] Parse the report with `node -e "const r=require('/tmp/gordi-mos-v3-vitest-before.json'); console.log(JSON.stringify({numTotalTests:r.numTotalTests,numPassedTests:r.numPassedTests,numFailedTests:r.numFailedTests,numTotalTestSuites:r.numTotalTestSuites},null,2))"`.
- [ ] Record the expected baseline as `2,868` tests, zero failures, and the current suite count in the
  implementation notes. If the report is not 2,868 or the pre-change command is not green, stop
  and report the environment discrepancy before adding Storybook.
- [ ] Hash the exact `test` block in `mos-app/vite.config.ts` and the `test`/`test:coverage`/`test:watch`
  script values in `mos-app/package.json` into `/tmp/gordi-mos-v3-vitest-config-before.txt`.
  This is the comparison oracle; no equivalent file is committed.

Expected result: the existing Vitest 3.2.6 project is green at 2,868 tests, and the pre-change
config/script hash is captured before any Storybook dependency or config file is touched.

### Task 2: Write the deterministic guard tests first

**Files:**
- Create: `scripts/v3-storybook-matrix.test.mjs`
- Read: `docs/specs/v3-redesign.spec.md`

**Produces:** A Node-only red test that consumes `buildStorybookMatrix(repoRoot)` and `validateStorybookMatrix(matrix)`.

- [ ] Add `scripts/v3-storybook-matrix.test.mjs` using Node's built-in `node:test` and
  `node:assert/strict`.
- [ ] First red assertion: import `buildStorybookMatrix` from `./v3-storybook-matrix.mjs` and assert
  that the current repo produces the required Issue 2 boundary, seven curated story files, all
  canonical job symbols, the exact viewport names, and the required state/job keys. Run
  `node --test scripts/v3-storybook-matrix.test.mjs`; it must fail because the guard module and
  story sources do not yet exist.
- [ ] Add red fixture checks that call `validateStorybookMatrix` on a copy with one required story
  file, one canonical import, one viewport, or one `parameters.a11y.test: 'error'` marker removed;
  each must return a named failure. The canonical-import fixture must remove the actual production
  import from story source evidence, not merely delete duplicated metadata. Add a scope-claim fixture proving a manifest that says
  `applicationMigration: true` or `representativeAcceptance: true` is rejected.
- [ ] Keep this guard independent of React, Vite, Storybook, and Supabase so it can run in a clean
  Node environment.

Expected initial result: the test command fails for missing guard/stories, proving the test is red
before implementation.

### Task 3: Implement the guard and generated matrix contract

**Files:**
- Create: `scripts/v3-storybook-matrix.mjs`
- Generate: `docs/reference/v3-storybook-matrix.json`, `docs/reference/v3-storybook-matrix.md`

**Interfaces:** `buildStorybookMatrix(repoRoot): StorybookMatrix`, `validateStorybookMatrix(matrix): string[]`, `renderStorybookMatrixMarkdown(matrix): string`, and `main(argv, repoRoot): number`.

- [ ] Add `scripts/v3-storybook-matrix.mjs` with explicit constants for the Issue 2 name parsed from
  `docs/specs/v3-redesign.spec.md` §12, the Issue 3 and Issue 9 names, the seven exact story files,
  canonical production import paths/symbols, viewport names, and matrix dimensions.
- [ ] Make `buildStorybookMatrix(repoRoot)` statically inspect each story source's named imports and
  `.storybook/preview.tsx`; it must derive the delivery sequence from the master spec, not from a
  duplicated free-standing issue list. Each story file must contain a typed/static `v3Matrix`
  metadata object with `jobs`, `states`, `responsive`, `canonicalImports`, and `scope` fields, and
  `excludeStories: /^v3Matrix$/` so only the metadata export is excluded from CSF indexing.
- [ ] Require these matrix jobs and states:
  - Foundation: E7 typography roles, spacing rhythm, colors, borders, radii, elevation, icons,
    focus-visible, runtime fonts/background, and responsive frames.
  - Controls: Button default/hover-doc/focus-visible/active/disabled/loading-debt; TextInput
    default/focus-visible/disabled/error; Select default/focus-visible/disabled/error; Checkbox
    default/checked/indeterminate/disabled; Toggle and status/badge semantic tones.
  - Feedback: EmptyState `quiet`, `next-step`, `awaiting`, `blank`; ErrorState retry; SkeletonRows;
    LoadingShell; saving/saved; validation/retry treatment.
  - Page composition: Workspace, Focused record, Management reference compositions.
  - Dense collection: realistic Gordi rows; desktop 1280, intermediate, phone 390; ready,
    loading, empty, filtered-empty, error.
  - Overlay: command/search, confirmation, anchored menu, and the current RecordPanelHost shell;
    desktop/intermediate/phone entries; explicit `futureIssue4Host: false` debt.
  - Accessibility/responsive: runnable a11y error mode, runtime font/background proof, viewport
    names 1280/intermediate/390, and keyboard/focus interaction stories.
- [ ] Reject missing canonical imports, story/export markers, state entries, responsive entries,
  `parameters.a11y.test !== 'error'`, missing Issue 2/3/9 delivery names, and any positive claim of
  application migration or representative rendered acceptance. Include exact debt/owner strings
  for Button loading (Issue 3), current RecordPanelHost/future host behavior (Issue 4), and any
  visual/a11y gap discovered by the browser gate.
- [ ] Add `--check` and `--write` modes. `--write` produces the JSON/Markdown artifacts; `--check`
  fails if artifacts are absent or stale. Add exact `storyCount`, `stateEntryCount`, and
  `responsiveEntryCount` fields so totals are deterministic.
- [ ] Run `node --test scripts/v3-storybook-matrix.test.mjs`; it remains red until all story source
  metadata is present, then turns green once the full matrix is implemented.

Expected result: the guard is the source of truth for Issue 2 completeness and cannot be satisfied
by a story-only claim that Issue 2 migrated routes or completed Issue 9.

### Task 4: Add the isolated Storybook package/config path without touching Vitest

**Files:**
- Modify: `mos-app/package.json`, `mos-app/package-lock.json`, `mos-app/tsconfig.app.json`, `mos-app/tsconfig.node.json`
- Create: `mos-app/.storybook/main.ts`, `mos-app/.storybook/preview.tsx`, `mos-app/.storybook/test-runner.ts`, `mos-app/src/storybook/setup.ts`, `scripts/run-v3-storybook-tests.mjs`
- Preserve unchanged: `mos-app/vite.config.ts`, existing Vitest scripts

**Interfaces:** The package script invokes `scripts/run-v3-storybook-tests.mjs`; that wrapper invokes
the exact `mos-app/node_modules/.bin/test-storybook` binary with its runtime `--url` and
`--maxWorkers=1` arguments, never `npm run test-storybook`.

- [ ] In `mos-app/`, install exact dev dependencies with `npm install --save-dev --save-exact
  storybook@10.5.2 @storybook/react-vite@10.5.2 @storybook/addon-a11y@10.5.2
  @storybook/test-runner@0.24.4`.
- [ ] Verify `npm ls vitest @vitest/coverage-v8 @vitest/browser-playwright` reports Vitest 3.2.6
  and no Vitest 4/browser addon. If npm attempts to change the Vitest major, revert the package
  edit with `apply_patch`, preserve the lockfile, and stop for Director review rather than
  accepting the broadening.
- [ ] Add package scripts without editing the existing test scripts:
  `storybook: "storybook dev -p 6006 --no-open"`,
  `build-storybook: "storybook build"`,
  `test-storybook: "node ../scripts/run-v3-storybook-tests.mjs"`, and
  `storybook:matrix: "node ../scripts/v3-storybook-matrix.mjs --check"`.
- [ ] Add `.storybook/main.ts` with the React/Vite framework, curated V3 stories glob, the actual
  `@storybook/addon-a11y` addon, existing public static assets, and existing `@`/Tailwind Vite
  integration. Keep `@storybook/test-runner` out of the `addons` array.
  Do not include all `src/**/*.stories.*`; Issue 2's taxonomy is deliberately curated.
- [ ] Add `.storybook/preview.tsx` with the `MemoryRouter`/`I18nProvider` decorator and exact
  viewport presets: `desktop1280` (1280×900), `intermediate` (1024×900), and `phone390` (390×844).
  Set `layout: 'fullscreen'` and `parameters.a11y.test: 'error'` globally.
- [ ] Add `.storybook/test-runner.ts` with the current official `postVisit(page, context)` hook;
  await `waitForPageReady(page)` there and leave a11y enforcement to the addon-backed runner path.
- [ ] Add `scripts/run-v3-storybook-tests.mjs`; start Storybook on a temporary port, wait for the
  server health response, then invoke the exact binary
  `mos-app/node_modules/.bin/test-storybook` with the runtime `--url` and `--maxWorkers=1` arguments. Never call
  `npm run test-storybook` from this wrapper. Pass its exit code through and terminate the server
  in success and failure paths.
- [ ] Add `src/storybook/setup.ts` and import it from Storybook preview. It must mirror runtime font
  and token CSS imports from `src/main.tsx` without bootstrapping the app or Supabase.
- [ ] Extend only the TypeScript config includes required for `.storybook` files; leave
  `mos-app/vite.config.ts`'s Vitest block byte-for-byte unchanged.

Expected result: `npm run build-storybook` can compile the empty/partial configuration without a
Supabase env; `npm test` still invokes the same Vitest 3.2.6 project and no Storybook story becomes a
Vitest test through an include-pattern change.

### Task 5: Build the Foundation and Controls story matrix

**Files:**
- Create: `mos-app/src/stories/v3/storybook.css`, `mos-app/src/stories/v3/foundation.stories.tsx`, `mos-app/src/stories/v3/controls.stories.tsx`
- Consume: `mos-app/src/components/ui/button.tsx`, `text-input.tsx`, `select.tsx`, `checkbox.tsx`, `toggle.tsx`, `pill.tsx`, `state-pill.tsx`, `mos-app/src/components/tasks/status-pill.tsx`, `mos-app/src/components/ui/view-tabs.tsx`

**Produces:** Four Foundation and four Controls CSF exports with static `v3Matrix` metadata and play assertions for focus/keyboard behavior.

- [ ] Add `src/stories/v3/foundation.stories.tsx` importing runtime tokens through actual CSS and
  canonical `Button`, `TextInput`, and icons. Render E7 typography roles, spacing values, color /
  border / radius / elevation swatches from `getComputedStyle`, and `desktop1280`/`intermediate`/
  `phone390` frame labels. Mark `RuntimeTypography` with a play assertion that the document has
  the DM Sans/Plus Jakarta runtime font family and a non-transparent token-backed background.
- [ ] Add `Foundation/FocusSurface` with a real `Button` and keyboard play interaction that tabs to
  it and asserts `:focus-visible`/outline behavior through the rendered DOM, not a CSS-only label.
- [ ] Add `src/stories/v3/controls.stories.tsx` using actual `Button`, `TextInput`, `Select`,
  `Checkbox`, `Toggle`, `Pill`, `StatusPill`, and `ViewTabs` imports. Render each meaningful state
  in a labeled matrix, with hover and active documented as native pseudo-state behavior in the
  story docs rather than faked by story CSS.
- [ ] Extend the existing `view-tabs.test.tsx` first with the red roving-focus assertion, then make
  the narrow `ViewTabs` ref/focus correction governed by `DESIGN.md`/`interaction-contract.md`.
  Extend the existing `status-pill.test.tsx` first with red E7 semantic-text token assertions,
  then make the narrow `StatusPill` token correction; normal `npm test` must discover both suites.
- [ ] Keep `Button.css` only if the rendered axe failure proves the old red base fails contrast;
  make its hover derive from the corrected `--ds-color-red12` base and prove default, hover, and
  focus in a real browser. Keep `CardHead.css` only if the rendered ErrorState contrast failure
  and E7 status-lost token require it; record the exact failure and locking evidence.
- [ ] If `Button` has no canonical loading prop, do not add a fake spinner in story CSS. Record
  `Button.loading` as a precise matrix debt owned by Issue 3 (canonical primitive/migration pass),
  and show the real disabled/`aria-busy` semantics only if the existing primitive already exposes
  them. If a narrowly scoped loading prop is demonstrably governed by `DESIGN.md`, write its
  failing component test first, implement the smallest canonical change in `Button.tsx`/`Button.css`,
  and include its test in the changed-code coverage calculation.
- [ ] Add `Controls/KeyboardFocus` play assertions for `ViewTabs` arrow navigation and
  `Checkbox` Space/Enter behavior; do not invent route behavior.
- [ ] Run `node --test scripts/v3-storybook-matrix.test.mjs` and `npm run storybook:matrix`; expected
  result is red only for the unimplemented feedback/page/collection/overlay matrix keys.

### Task 6: Build Feedback/state and Page composition stories

**Files:**
- Create: `mos-app/src/stories/v3/feedback.stories.tsx`, `mos-app/src/stories/v3/page-compositions.stories.tsx`
- Consume: `mos-app/src/components/ui/state-kit.tsx`, `mos-app/src/components/kitchen/plan-qty-stepper.tsx`, `plan-qty-cell.tsx`, `mos-app/src/shell/page-frame.tsx`, `page-head.tsx`, `mos-app/src/components/dashboard/data-table.tsx`

**Produces:** Four Feedback and three PageComposition CSF exports using canonical state and page primitives.

- [ ] Add `src/stories/v3/feedback.stories.tsx` using `EmptyState` for all four canonical variants,
  `ErrorState` with an actual retry callback, `SkeletonRows`, `LoadingShell`, and the existing
  `PlanQtyStepper`/`PlanQtyCell` saving/saved behavior. Use real Gordi operational copy and record
  any unsupported validation/retry state with an owner issue instead of making a parallel state kit.
- [ ] Add play assertions that the error retry action is reachable and that the saving/saved copy
  transitions using the canonical component callback; use fake timers only if the component already
  owns timing, never a story-only delayed visual.
- [ ] Add `src/stories/v3/page-compositions.stories.tsx` composing the real `PageFrame`, `PageHead`,
  and `DataTable` components into Workspace, Focused record, and Management reference compositions.
  Keep these static compositions; no router route, data fetch, mutation, or new page family is added.
- [ ] Use realistic records such as Gordi tasks, owners, operational notes, and current statuses;
  do not use lorem ipsum, generic “John Doe”, emoji, or fake-perfect KPI filler.
- [ ] Re-run the guard; expected result is red only for dense collection, overlays, and remaining
  responsive/a11y matrix keys.

### Task 7: Build Dense collection, Overlay, and Accessibility/responsive stories

**Files:**
- Create: `mos-app/src/stories/v3/dense-collections.stories.tsx`, `overlays.stories.tsx`, `accessibility-responsive.stories.tsx`
- Consume: `mos-app/src/components/dashboard/data-table.tsx`, `mos-app/src/components/command/command-menu.tsx`, `mos-app/src/components/ui/confirm-dialog.tsx`, `mos-app/src/components/tasks/row-menu.tsx`, `mos-app/src/shell/record-panel-host.tsx`

**Produces:** Seven DenseCollection, four Overlays, and two AccessibilityResponsive CSF exports with viewport and future-Issue debt metadata.

- [ ] Add `src/stories/v3/dense-collections.stories.tsx` around the canonical `DataTable` with one
  realistic Gordi record fixture and the actual `useIsDesktop` viewport branch. Export desktop,
  intermediate, and phone-ready stories plus loading, empty, filtered-empty, and error states.
  Do not reproduce table CSS or use a story-only overflow fix. Set the table caption and card labels
  so phone cards remain understandable to screen readers.
- [ ] Add `src/stories/v3/overlays.stories.tsx` with `CommandMenu`, `ConfirmDialog`, `RowMenu`, and
  `RecordPanelHost` under the global `MemoryRouter`/`I18nProvider`. Use current behavior honestly:
  `RecordPanelHost` is labeled as the current shell, with no claim of the future Issue 4 host.
  Keep desktop/intermediate/phone viewport entries; do not implement the future host or route
  navigation in a story. Isolate only the `@/lib/db/tasks` and `@/lib/supabase` service boundary in
  Storybook config; do not import/mutate Supabase or add a production mock branch.
- [ ] Preserve the CommandMenu composite contract in the existing RTL suite: `aria-controls` must
  resolve to the listbox in populated/loading/error/empty states; options must have names and no
  interactive descendants; mouse activation, Arrow/Enter/Escape, Tab containment, active-descendant
  focus, and active-option `scrollIntoView({ block: 'nearest' })` must remain tested. Localize any
  new loading status in both en/id; do not add a Tab stop solely to satisfy axe.
- [ ] Add `src/stories/v3/accessibility-responsive.stories.tsx` with runtime font/background proof,
  exact viewport metadata, and keyboard journey plays over canonical `Button`, `ViewTabs`, and
  `RecordPanelHost` behavior. The story meta must carry `parameters.a11y.test: 'error'` or inherit
  the project-level value; no story may silently turn a11y off.
- [ ] Add only token/layout helper CSS to `src/stories/v3/storybook.css`; inspect all changes for
  hard-coded colors, oversized radii, generic Tailwind additions, decorative animation, and
  component-state masking.
- [ ] Run `npm run storybook:matrix`; expected result is green with the full story/state/responsive
  manifest and explicit debt/ownership entries.

### Task 8: Wire deterministic inventory/evidence artifacts

**Files:**
- Modify: `scripts/v3-live-inventory.mjs`
- Regenerate: `docs/reference/v3-live-inventory.json`, `docs/reference/v3-live-inventory.md`
- Consume: `scripts/v3-storybook-matrix.mjs`

**Produces:** Inventory JSON/Markdown with a derived `storybookMatrix` section and the original Issue 1 totals intact.

- [ ] Import `buildStorybookMatrix` into `scripts/v3-live-inventory.mjs` without importing the
  inventory generator back into the Storybook guard. Add `storybookMatrix` to the generated JSON
  with artifact paths, Storybook/runner versions, story/state/responsive totals, canonical job count,
  and the two false scope claims.
- [ ] Add an Issue 2 evidence section to `renderInventoryMarkdown` immediately after the summary,
  linking `v3-storybook-matrix.json`/`.md` and repeating that this is not application migration or
  Issue 9 rendered acceptance. Preserve the Issue 1 route/component/CSS tables and delivery sequence.
- [ ] Run `node scripts/v3-storybook-matrix.mjs --write` and
  `node scripts/v3-live-inventory.mjs --write`; then run both `--check` commands. Expected result:
  no stale generated artifacts and the original 58/29/25/4/13/67 inventory totals remain present.

### Task 9: Capture the Vitest regression proof after implementation

**Files:**
- Read unchanged: `mos-app/vite.config.ts`, `mos-app/package.json`, `/tmp/gordi-mos-v3-vitest-config-before.txt`
- Produce temporary evidence: `/tmp/gordi-mos-v3-vitest-after.json`

**Produces:** An after-report with unchanged discovery/configuration and the legitimate post-change
test total of `2,877` (2,868 pre-change tests plus nine canonical locking tests).

- [ ] Verify `git diff -- mos-app/vite.config.ts` is empty and the existing package script values
  equal the pre-change hash in `/tmp/gordi-mos-v3-vitest-config-before.txt`.
- [ ] Run the existing command exactly again:
  `npm test -- --reporter=json --outputFile=/tmp/gordi-mos-v3-vitest-after.json`.
- [ ] Parse the after report with the same Node command and assert `numTotalTests === 2877`, zero
  failures, and that the count delta is exactly the nine tests added to the existing ViewTabs,
  StatusPill, and CommandMenu suites. Assert that `npm test` did not discover any `*.stories.tsx`
  file and that the Vite test block's include/exclude values are unchanged.
- [ ] Run `npm run test:coverage -- --reporter=dot` as the existing coverage command, verifying no
  Storybook-only test files are silently added to application coverage. A changed count is expected
  only from the nine canonical locks; any other discovery/config behavior change blocks acceptance.
- [ ] Record exact before/after command results and the unchanged Vitest resolution in
  `docs/reference/v3-storybook-matrix.md` and `docs/reviews/v3-redesign.md`.

### Task 10: Run proportionate final verification and rendered proof

**Files:**
- Verify: `mos-app/` package scripts and Storybook static output
- Create evidence: `docs/reference/evidence/v3-storybook-2026-07-20/*.png`

**Produces:** Type/lint/unit/build/test-runner results and five named screenshots at the specified viewport regimes.

- [ ] Run `npm run typecheck`; expected: zero TypeScript errors.
- [ ] Run `npm run lint`; expected: ESLint zero errors/warnings and Stylelint zero warnings/errors.
- [ ] Run `npm test`; expected: 2,877 tests pass under Vitest 3.2.6, with the pre-change command,
  include/exclude behavior, and Vite test block unchanged.
- [ ] Run `npm run build-storybook`; expected: static Storybook build succeeds without Supabase.
- [ ] Run `npm run test-storybook`; expected: the isolated Storybook test runner passes all curated
  stories and executes the official addon-backed a11y checks because `@storybook/addon-a11y` is
  installed and `parameters.a11y.test: 'error'` is active. This command is not an AA certification.
- [ ] Start the static Storybook only after its build succeeds and inspect screenshots at exactly
  1280×900, 1024×900, and 390×844. Save evidence under
  `docs/reference/evidence/v3-storybook-2026-07-20/` with stable names for the exact stories:
  `foundation-runtime-1280.png`, `dense-ready-intermediate.png`,
  `dense-ready-phone390.png`, `overlay-record-panel-phone390.png`, and
  `accessibility-keyboard.png`.
- [ ] Apply the Impeccable/Taste audit subordinate to E7: check typography role loading, One Blue
  focus, navy structural surfaces, no purple/glass/neon, E7 52px rows, control/overlay radii,
  responsive disclosure, no horizontal overflow, and ≥44px phone targets. Record any issue with
  the owning later issue in the matrix/ledger; do not “fix” it with story-only CSS.
- [ ] Run `node --test scripts/v3-storybook-matrix.test.mjs`, both deterministic `--check` commands,
  and `git diff --check` after all evidence is written.

### Task 11: Update ledgers and make local checkpoints

**Files:**
- Modify: `docs/reviews/v3-redesign.md`, `docs/agent-context.md`, `docs/backlog.md`
- Commit: only Issue 2 files with the required trailer; do not push

**Produces:** A local Issue 2 evidence ledger and an explicit owner approval gate before Issue 3.

- [ ] Update `docs/reviews/v3-redesign.md` with an Issue 2 entry containing AC/NFR mapping, exact
  story/state/responsive totals from the generated artifact, package rationale, exact commands and
  results, screenshot paths, a11y runner evidence, Vitest regression evidence, and precise gaps
  assigned to Issue 3/4/5/6/9 as applicable.
- [ ] Update `docs/agent-context.md` and the current `docs/backlog.md` banner to say Issue 2 is
  locally complete/pending owner review, preserve the no-migration/no-Issue-9 claim, and state the
  Issue 3 unlock condition verbatim.
- [ ] Make coherent local commits with the required trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`: first the guard/plan/config checkpoint,
  then story matrix/configuration, then generated evidence/ledger updates. Do not push, open a PR,
  merge, deploy, reset, or mutate Supabase.

## Requirement-to-proof map

| Requirement | Issue 2 proof in this plan | Explicit non-claim or later owner |
| --- | --- | --- |
| AC-V3-001 | Foundation/page/composition/dense/overlay stories expose canonical computed-style and responsive contracts; generated matrix identifies exact stories and viewports. | Representative application routes and driven desktop/phone acceptance remain Issue 9. |
| NFR-V3-001 | `@storybook/addon-a11y` + isolated `test-storybook` browser runs; project `parameters.a11y.test: 'error'`; keyboard/focus plays. | Automated axe is not a complete WCAG/AA audit; remaining violations are recorded, not declared AA by addon presence. |
| NFR-V3-002 | Exact Storybook 10.5.2/React-Vite 10.5.2/a11y 10.5.2/test-runner 0.24.4 metadata and no second CSS/component library. | The rejected addon-vitest/Vitest4 path is recorded as a compatibility decision. |
| NFR-V3-003 | Existing 2,868-test Vitest baseline, unchanged `vite.config.ts` test block, and changed-code coverage command. | Storybook runner is isolated from application Vitest coverage. |
| NFR-V3-004 | `npm run typecheck` and `npm run lint` with zero errors/warnings. | — |
| NFR-V3-005 | Storybook viewport presets and saved screenshots at 1280, intermediate 1024, and 390. | This is workbench proof, not Issue 9 representative app acceptance. |
| NFR-V3-006 | DataTable phone cards, overlay phone regime, viewport screenshot inspection, and overflow/target checks. | Existing production debt is assigned to owning later issue; stories cannot conceal it. |
| NFR-V3-007 | Guard requires one canonical import per job and story sources import the existing production components. | Existing duplicate consumers remain inventory debt for Issues 3–8. |

## Self-review before implementation

- [ ] All requested files/symbols, exact commands, expected red/green transitions, and generated
  artifact paths are named; no vague test or implementation instruction remains.
- [ ] The implementation never changes `mos-app/vite.config.ts`'s Vitest project, test scripts, or
  include/exclude behavior; the 2,868 → 2,877 regression proof occurs before and after package edits,
  and all nine new locks are in existing normally discovered suites.
- [ ] The selected Storybook path is compatible with React 19/Vite 7 and avoids the official
  addon-vitest browser peer that would require Vitest 4.
- [ ] The guard derives the Issue 2/3/9 boundary from the master spec and rejects migration/Issue 9
  claims.
- [ ] No Supabase, dev server requiring Supabase, route migration, domain-model change, universal
  records schema, standalone mockup, push, PR, merge, or deploy is included.
- [ ] Issue 3 remains locked until owner approval after the evidence ledger is complete.

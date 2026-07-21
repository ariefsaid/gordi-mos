# V3 redesign — Issue 1 + Issue 2 review ledger

**Workstream:** `v3-redesign` · **Issue:** V3 Design Foundation + Issue 2 Storybook Proof · **Date:** 2026-07-20

An `OD-REDESIGN-NN` label means a recorded owner decision in `docs/decisions.md`; the plain-language rule below each evidence item is the operative explanation. The Issue 1 material below is historical evidence; the Issue 2 ledger is appended after it. Neither section claims rendered representative application acceptance.

## Scope and exclusions

Issue 1 completed the documentation truth reset, the live source inventory, the root DESIGN.md reconciliation, and the automated source/conformance guards.

It deliberately did not implement Storybook, page-family primitives, RecordViewer code, RecordCollection code, route migration, shared overlay-host migration, CSS/token consumer migration, authored JSONB blocks, database migrations, Supabase commands, a dev server, browser rendering, or a representative owner-approved application slice. Issue 2 is Storybook component/state/responsive proof only. Issues 3–8 own the separately numbered application capabilities, Issue 9 owns the representative-slice rendered/driven owner gate, and Issues 10–12 remain separately owned by the master spec.

## Authority read

- Current era and scope: `docs/requirements-evolution.md` E8 and `docs/specs/v3-redesign.spec.md`.
- Owner law: `docs/decisions.md` OD-REDESIGN-72 through OD-REDESIGN-79. E7 owns visual styling; owner law owns IA and interaction behavior; shared record grammar does not collapse typed domain models.
- Composite provenance: `docs/reference/provenance/owner-directives-index.md` and `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md`.
- Product and behavior: `CONTEXT.md`, `PRODUCT.md`, `docs/jtbd.md`, `docs/experience-contract.md`, `docs/interaction-contract.md`, and `docs/reference/twenty-ixd-patterns.md`.
- Existing visual and anti-slop guidance: `DESIGN.md`, E7 prototype CSS, the Impeccable shape/product references, and Taste as a checklist subordinate to E7, owner law, accessibility, and the existing React/CSS architecture.

## Plan self-review

[`docs/plans/2026-07-20-v3-design-foundation.md`](../plans/2026-07-20-v3-design-foundation.md) was written before implementation and committed as `b9f4eaa`.

- The Issue 1 granular DESIGN and inventory guards are precondition evidence, not owning tests for
  the full master AC goals. Issue 2 likewise treats AC-V3-001 as a Storybook workbench/evidence
  boundary only; it does not claim representative rendered acceptance or any full master AC.
- The Issue 1 inventory guard remains source/conformance evidence for the later full migration closure;
  it does not own AC-V3-014. The master acceptance-ownership clarification is intentionally outside
  this Issue 2 correction wave.
- Every created path and exported interface is named; steps specify exact commands and expected results.
- The red test precedes collector implementation; the DESIGN conformance test is separately red before the DESIGN reset.
- The plan explicitly states that Issue 2 is Storybook-only, excludes all application component migration, and preserves the separate Issues 3–9 ownership sequence.

## Inventory totals

The deterministic generator reads `mos-app/src/router.tsx`, route/page/component source, and every CSS file under `mos-app/src/pages`, `mos-app/src/components`, and `mos-app/src/shell`.

| Evidence | Total |
|---|---:|
| Classified route declarations | 58 |
| Page records | 29 |
| Redirect records | 25 |
| DEV-only records | 4 |
| Workspace records | 18 |
| Focused-record records | 5 |
| Management records | 4 |
| Routing/not-applicable records | 31 |
| Shared interaction jobs | 13 |
| Jobs with raw/duplicate consumers | 13 |
| CSS families scanned | 67 |
| Records with shared PageFrame evidence | 26 |
| Records with shared PageHead evidence | 20 |
| Records with bespoke/missing frame evidence | 7 |
| Records with bespoke/missing head evidence | 13 |

The machine artifact is [`docs/reference/v3-live-inventory.json`](../reference/v3-live-inventory.json); the reviewable rendering is [`docs/reference/v3-live-inventory.md`](../reference/v3-live-inventory.md). Both have stable ordering, `sourceCommit: null`, and a `--check` freshness guard.

## Route, component, and style findings

- The route tree includes the current canonical destinations, conditional role/feature branches, DEV harnesses, and legacy aliases. Legacy aliases remain in the inventory because they are live redirect declarations; they are not current DESIGN.md page examples or page families.
- Page evidence identifies `PageFrame`/`PageHead` use, route-local CSS imports, state-kit symbols, collection presentations, overlay candidates, record-opening behavior, and responsive hook evidence. The current source is mixed: some page records use the shared frame/head, while others expose bespoke or missing head/frame evidence.
- Canonical interaction jobs are recorded with sources and duplicate consumers: button, select, menu, dialog, drawer/panel, table/list, page head, page frame, record renderer, state kit, collection view, navigation, and typography/spacing.
- Current CSS evidence includes 67 families and literal counts for `font-size`, `line-height`, `padding`, `margin`, `gap`, `width`, and `height`. The scan is an audit of remaining debt, not a permission to add more local style families.
- The existing record split host in `mos-app/src/styles/drawer.css` uses a `clamp(360px, 33vw, 480px)` desktop panel. DESIGN.md now binds the V3 40–45% wide right-panel target; Issue 4 owns host and consumer migration without creating a centered near-full record popup.

## Contradiction register

| Earlier statement or implementation seam | Resolution in Issue 1 | Status |
|---|---|---|
| DESIGN.md used `Workspace`, `Write-Review`, and `Catalog-Manage` as the three page archetypes and used deleted/legacy route examples as exemplars. | Replaced the stale tail with exactly `Workspace`, `Focused record`, and `Management`; current canonical route examples are used, while redirects remain evidence only. | Resolved in docs |
| DESIGN.md documented a 224px rail and 54px/50px row family against the E7 232px rail and 52px row grammar. | Updated the binding geometry and recorded current source deviations as migration debt. | Resolved in docs; app migration deferred |
| DESIGN.md treated overlay focus trapping and Escape as a build-time gap and did not define collection-to-record navigation. | Added one overlay/navigation/focus/Back grammar: centered search, wide right panel, internal stack, full-page URL, phone full-screen, centered confirmation, anchored menus, focus return, and Escape semantics. | Resolved in docs; behavior migration deferred |
| Existing drawer CSS is narrower than the V3 target. | Inventory records the exact current seam; DESIGN.md states the future target without changing application CSS in Issue 1. | Evidence recorded |
| E7 styling, IA, and interaction rules were previously read as one snapshot. | DESIGN.md states E7 visual authority separately from owner IA/IxD law and preserves lost-good evidence as input, not a snapshot mandate. | Resolved in docs |
| Backlog and agent context said planning/ratification was still pending and pointed fresh agents to the closed autonomous run. | Current-state banners now point to the Issue 1 plan, inventory, DESIGN.md, and review ledger; old run state is marked historical. | Resolved in docs |
| Generic Taste guidance could suggest a new font, Tailwind direction, motion, or decorative identity. | DESIGN.md makes Taste subordinate to E7, owner law, accessibility, and the current React/CSS architecture, with explicit anti-slop limits. | Resolved in docs |

## AC-V3-001 evidence boundary

The guard proves the binding DESIGN.md anchors exist and stale archetype/deleted-route examples are absent. It does not prove computed-style parity or rendered behavior. Issue 2 can prove only the Storybook component/state/responsive matrix; AC-V3-001 rendered representative acceptance remains open for Issue 9 at desktop, intermediate, and 390px phone widths after the separately owned Issues 3–8 work.

## AC-V3-014 guard evidence

`scripts/v3-live-inventory.test.mjs` is precondition/source evidence; it does not own the full AC-V3-014 goal. It fails before the collector exists (`ERR_MODULE_NOT_FOUND`), turns green after the collector is implemented, and contains the separate DESIGN conformance test that was red against the stale DESIGN.md and green after reconciliation. `scripts/v3-live-inventory.mjs --check` validates route literals, source files/symbols, canonical component jobs, token sources, CSS coverage, and deterministic JSON/Markdown artifacts.

The delivery-sequence guard now parses the canonical labels from `docs/specs/v3-redesign.spec.md` §12, emits Issues 1–12 in the inventory artifacts, and checks the current Issue 1 docs for collapsed ownership. It rejects assigning rendered computed-style acceptance to Issue 2 and rejects assigning application component work to Issue 2. Issue 2 is therefore constrained to Storybook component/state/responsive proof; Issues 3–8 own application capabilities and Issue 9 owns the rendered/driven representative owner gate.

## Exact commands and exit codes

Completed during Issue 1 so far:

| Command | Exit | Evidence |
|---|---:|---|
| `node --test scripts/v3-live-inventory.test.mjs` before collector | 1 | Expected `ERR_MODULE_NOT_FOUND` red state |
| `node --test scripts/v3-live-inventory.test.mjs` after collector | 0 | Descriptive route/component/style precondition guard green; not AC-V3-014 ownership |
| `node --test scripts/v3-live-inventory.test.mjs` before DESIGN reset | 1 | Expected missing E7 anchor red state |
| `node --check scripts/v3-live-inventory.mjs` | 0 | Node syntax check |
| `node scripts/v3-live-inventory.mjs --write` | 0 | Deterministic artifacts written |
| `node scripts/v3-live-inventory.mjs --check` | 0 | Artifacts current |
| `node --experimental-test-coverage --test --test-coverage-include=scripts/v3-live-inventory.mjs scripts/v3-live-inventory.test.mjs` | 0 | 97.56% lines, 81.36% branches, 98.51% functions |
| `npm ci --no-audit --no-fund` in `mos-app/` | 0 | Restored lockfile-defined dependencies; no manifest changes |
| Initial app `npm run typecheck` / `npm run lint` / targeted `npm test` | 127 | Expected dependency-missing state (`tsc`, `eslint`, `vitest` not installed) |
| Final `npm run typecheck` in `mos-app/` | 0 | TypeScript project check clean |
| Final `npm run lint` in `mos-app/` | 0 | ESLint and stylelint clean with zero lint warnings |
| Final targeted Vitest slice | 0 | 6 files, 80 tests passed |
| Full `npm test` in `mos-app/` | 0 | 280 files, 2,868 tests passed; no Supabase/dev server used |
| `git diff --check 112c257..HEAD` | 0 | No whitespace errors across the Issue 1 checkpoint range |

The initial missing-dependency exit was resolved by installing the existing lockfile set; the final commands above are the evidence of record. Vitest emitted existing React `act(...)` and Node deprecation/experimental warnings to stderr, but the suite exit code was zero and lint reported zero warnings.

## Changed files

- `docs/plans/2026-07-20-v3-design-foundation.md`
- `scripts/v3-live-inventory.mjs`
- `scripts/v3-live-inventory.test.mjs`
- `docs/reference/v3-live-inventory.json`
- `docs/reference/v3-live-inventory.md`
- `DESIGN.md`
- `docs/backlog.md`
- `docs/agent-context.md`
- `docs/reviews/v3-redesign.md`

No `mos-app/src/*.tsx`, application CSS, route, dependency, migration, environment, or Supabase file was changed.

## Local commit hashes

- `b9f4eaa` — plan the V3 design foundation.
- `87dd5eb` — define the red inventory guard.
- `c0d4d40` — add the deterministic collector and artifacts.
- `f2a0ab8` — validate inventory source references.
- `90bee8d` — reconcile DESIGN.md to the V3 grammar.
- `b06b0d2` — record backlog/context/ledger evidence and the owner gate.
- `5d50aa2` — align the plan with the coverage guard.
- `dabd70c` — verify deterministic inventory rendering and coverage tests.
- The final ledger checkpoint is the commit that records this updated section.

## Delivery decomposition and ownership

The master spec's §12 sequence is the source of truth for ownership. Issue 2 is Storybook component/state/responsive proof only; it cannot claim application migration or rendered representative acceptance.

| Issue | Owner | Issue 1 boundary |
|---:|---|---|
| 2 | Storybook component/state/responsive matrix proving the reconciled DESIGN.md contract | Deferred; Storybook proof only |
| 3 | Page-family primitives and migration guards | Deferred; application primitive migration starts here |
| 4 | Shared overlay/panel/navigation host | Deferred; host, URL, focus, Back, and responsive panel migration |
| 5 | RecordViewer contract, field primitives, and Task adapter | Deferred; RecordViewer application contract and adapter |
| 6 | RecordCollection/view engine and Tasks/Signals adapters | Deferred; collection state and presentation adapters |
| 7 | Inbox triage plus Deputy host integration | Deferred; Inbox/Deputy integration |
| 8 | Café canonical-record integration and Team-context correction | Deferred; Café integration |
| 9 | Representative-slice rendered/driven owner gate; provisional IA ratification | Deferred; rendered/driven owner acceptance only |
| 10 | Structured-content schema ADR, storage/RLS, editor, and typed embeds | Later master-spec issue |
| 11 | Remaining route migration by page/component family | Later master-spec issue |
| 12 | Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough | Later master-spec issue |

Separate typed database models remain required throughout. Shared UI is a grammar over those models, not a universal record schema.

## Owner gate

Owner approval is still required for the Issue 1 foundation before Issue 2 starts: the plan, the reproducible inventory, the reconciled DESIGN.md, and this evidence ledger. Issue 2 may then produce Storybook component/state/responsive proof only. No application migration or rendered representative acceptance may be claimed under Issue 2; those remain with Issues 3–9, with Issue 9 the owner gate. No push, PR, merge, deploy, or irreversible infrastructure action is authorized by this Issue 1 checkpoint. No rendered application acceptance is claimed.

## V3 redesign — Issue 2 review ledger (2026-07-20)

### Scope and boundary

Issue 2 implements the approved in-code Storybook workbench for the component/state/responsive proof
matrix in `docs/specs/v3-redesign.spec.md` §12. E7 remains the visual styling authority; current owner
law remains the IA and interaction authority. This checkpoint does not migrate routes, change page
composition behavior, invent a universal records schema, start Supabase, run a Supabase-dependent dev
server, or claim representative application acceptance. Issue 9 owns that rendered/driven owner gate.

### Authority and plan self-review

- Governing spec: [`docs/specs/v3-redesign.spec.md`](../specs/v3-redesign.spec.md) §10–§12; AC-V3-001
  is retained as an explicit workbench/evidence boundary only, and NFR-V3-001/002/003/004/005/006/007 are mapped in
  [`docs/plans/2026-07-20-v3-storybook-matrix.md`](../plans/2026-07-20-v3-storybook-matrix.md).
- Visual and product authorities: [`DESIGN.md`](../../DESIGN.md), OD-REDESIGN-72 through 79,
  `docs/jtbd.md`, `docs/experience-contract.md`, `docs/interaction-contract.md`, and the E7
  `SALVAGE-INVENTORY.md`/visual assets. Impeccable and Taste were used only as anti-slop review
  checks subordinate to those authorities.
- Plan review corrected the production paths to `mos-app/src/components/ui/button.tsx` and
  `mos-app/src/shell/{page-frame,page-head,record-panel-host}.tsx`, kept `@storybook/test-runner`
  out of `main.ts` addons, avoided recursive `test-storybook`, and split the steps into exact
  2–5-minute TDD tasks. Plan checkpoints: `4ffc9f5` and `0fd276f`.
- Implementation checkpoint: `04cbe8b` (`feat: add V3 Storybook proof matrix`), amended after the
  Director’s diff-check finding. The generator now owns the single-terminal-newline contract and
  `node --test scripts/v3-storybook-matrix.test.mjs` locks it.

### Package and runner decision

The accepted stack is Storybook `10.5.2`, `@storybook/react-vite` `10.5.2`,
`@storybook/addon-a11y` `10.5.2`, and the external `@storybook/test-runner` `0.24.4`. The existing
Vitest resolution remains `3.2.6`; no Vitest 4, `@vitest/browser`, `@vitest/browser-playwright`, or
`@storybook/addon-vitest` was added. The Vitest addon path was rejected because its package metadata
would broaden this repo into the Vitest 4/browser stack. The external runner is a CLI, not a
Storybook addon, so `.storybook/main.ts` lists only `@storybook/addon-a11y`.

The decision follows the official [Storybook install guide](https://storybook.js.org/docs/get-started/install),
[10.5 addon installation guide](https://storybook.js.org/docs/10.5/addons/install-addons),
[10.5 accessibility testing guide](https://storybook.js.org/docs/10.5/writing-tests/accessibility-testing),
[10.5 test-runner integration guide](https://storybook.js.org/docs/10.5/writing-tests/integrations/test-runner),
and [test-runner package metadata](https://www.npmjs.com/package/@storybook/test-runner). The runner’s
`postVisit` waits for the Storybook page; the actual browser gate, not addon installation alone, is
the a11y evidence.

### Matrix and production corrections

- Seven curated files index 35 real stories: Foundation (4), Controls (5), Feedback (4), Page
  composition (5), Dense collection (7), Overlays (6), and Accessibility/responsive (4).
- The guard records 36 state entries, 3 responsive entries (`desktop1280` 1280×900, `intermediate`
  1024×900, `phone390` 390×844), and 23 canonical jobs. It derives canonical imports from source,
  excludes only `v3Matrix` metadata from CSF indexing, rejects positive migration/Issue 9 claims,
  and validates package metadata against both `package.json` and `package-lock.json`.
- Existing canonical test suites were extended in place: ViewTabs gained the roving-focus lock;
  StatusPill gained E7 contrast-token locks; CommandMenu gained the composite-widget contract for
  combobox/listbox ownership, `aria-controls`/`aria-activedescendant`, named non-interactive options,
  mouse activation, Arrow/Enter/Escape, Tab containment, active-option scrolling, localized loading,
  and valid populated/loading/empty ownership.
- Red/green evidence: `/tmp/gordi-mos-v3-issue2-locking-red.txt` records the expected five failures
  before the ViewTabs/StatusPill production corrections; the final normal suite and existing suites
  are green. Rendered contrast evidence records destructive default `12.43:1`, hover `13.04:1`,
  StatusPill values `9.73:1`–`14.39:1`, and ErrorState `10.88:1`; the old tokens measured below the
  governed contrast bar. Button hover derives from corrected `red12`, so default and interaction
  states stay in one token family.
- The later CommandMenu TDD regression was red at 1 failed / 34 passed: after loading, `ArrowDown`
  produced `active = -1`, so the ready record had no `aria-activedescendant`. The canonical clamp
  keeps keyboard state at zero with no items; the existing suite is now 35/35 and Enter activates the
  first ready record. This fixes the state invariant rather than weakening the assertion.
- Overlay stories use pure Storybook aliases at the service boundary. The production bundle seam
  probe found no `v3-storybook-service-boundary`, `src/storybook/mocks`, or mock alias symbols in
  `mos-app/dist`; `mos-app/vite.config.ts` is unchanged.

### Rendered review and evidence

The final visual review inspected these exact rendered stories at the named regimes:

- `Foundation/RuntimeTypography` at 1280px: runtime fonts/background and E7 role hierarchy.
- `DenseCollection/ReadyIntermediate` at 1024px and `DenseCollection/ReadyPhone` at 390px:
  realistic Gordi records, dense collection states, no horizontal overflow, and responsive copy that
  does not expose the implementation hook name.
- `Overlays/CurrentRecordPanelShell` at 390px: the current shell is full-width in the computed and
  saved 390×844 proof; the rightmost column is warm surface/border, not a black strip.
- `AccessibilityResponsive/KeyboardJourneys` uses the `phone390` runner variant for active ViewTabs
  focus, close/Escape, and opener focus return in the current phone modal regime. The saved
  `accessibility-keyboard.png` is a 1280×900 manager capture; desktop and intermediate shell
  semantics are covered by the dedicated RecordPanel variants, with desktop Escape intentionally
  non-modal.

Evidence files: [`foundation-runtime-1280.png`](../reference/evidence/v3-storybook-2026-07-20/foundation-runtime-1280.png),
[`dense-ready-intermediate.png`](../reference/evidence/v3-storybook-2026-07-20/dense-ready-intermediate.png),
[`dense-ready-phone390.png`](../reference/evidence/v3-storybook-2026-07-20/dense-ready-phone390.png),
[`overlay-record-panel-phone390.png`](../reference/evidence/v3-storybook-2026-07-20/overlay-record-panel-phone390.png),
[`accessibility-keyboard.png`](../reference/evidence/v3-storybook-2026-07-20/accessibility-keyboard.png),
and [`rendered-contrast.md`](../reference/evidence/v3-storybook-2026-07-20/rendered-contrast.md).
Raster dimensions checked: foundation 1280×900; dense intermediate 1024×900; dense phone 390×844;
overlay phone 390×844; accessibility keyboard 1280×900.

### Exact verification record

| Command | Result |
|---|---|
| `node --test scripts/v3-storybook-matrix.test.mjs` | Exit 0; 12 passed |
| `node --test scripts/v3-live-inventory.test.mjs` | Exit 0; 9 passed |
| `node scripts/v3-storybook-matrix.mjs --check` / `node scripts/v3-live-inventory.mjs --check` | Exit 0; artifacts current |
| Plain `npm ci` after removing the isolated worktree’s installed dependencies | Exit 0; no `--legacy-peer-deps` |
| `npm ls --depth=0 storybook @storybook/react-vite @storybook/addon-a11y @storybook/test-runner vitest @vitest/coverage-v8 @vitest/browser-playwright @vitest/browser @storybook/addon-vitest` | Exit 0; Storybook 10.5.2, runner 0.24.4, Vitest 3.2.6; no Vitest 4/browser package |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; ESLint and Stylelint, zero warnings |
| `npm test -- src/components/command/command-menu.test.tsx --run` | Exit 0; 35 passed, including loading → ArrowDown → ready → Enter |
| Full `npm test` attempt | Inconclusive under resource contention: two unrelated 5-second timeout flakes; Director reran the two affected files alone at 30/30 |
| `npm run test:coverage -- --reporter=dot` | Exit 0; 2,878 passed; 92.52% statements/lines, 86.93% branches, 88.34% functions; output `/tmp/gordi-mos-v3-vitest-coverage-command-fix-final.txt` |
| `npm run build` | Exit 0; 665 modules; post-comment-fix CSS syntax warning gone; only the pre-existing >500k chunk advisory remains |
| `npm run build-storybook` | Exit 0; Storybook 10.5.2; `storybook-static/` generated but ignored |
| `npm run build-storybook && npm run lint` | Exit 0 |
| `npm run lint && npm run build-storybook` | Exit 0 |
| `npm run test-storybook` from `mos-app/` | Exit 0; 7 suites / 35 tests passed, 0 snapshots, 83.085s; rerun after the final viewport-runner and hook-shape corrections |
| `git diff --check 0fd276f HEAD` / `git diff --check` | Exit 0 |

The external runner executed the configured addon-backed a11y checks; this ledger does not claim AA
merely because an addon is installed. The runner emitted Storybook’s advisory suggestion about the
Vitest addon; that suggestion was not followed because it conflicts with the binding Vitest 3.2.6
constraint. The generated `storybook-static/` directory is ignored by both Git and ESLint, and no
`.playwright-cli/` files remain in the worktree.

Changed production TSX coverage from the canonical final HTML report is above the repository’s 80%
changed-code line bar: `command-menu.tsx` **236/239 lines (98.74%; 3 uncovered instrumented lines)**,
`view-tabs.tsx` **76/76 (100%)**, and `status-pill.tsx` **34/34 (100%)**. The focused existing suites
exercise the changed keyboard and semantic-token behavior. CSS (`Button.css`, `CardHead.css`, and
CommandMenu CSS), Storybook stories/config/setup/mocks, i18n data (`messages.ts`), and generated
matrix/inventory/docs are non-instrumented or non-production artifacts and are not counted as
production TS/TSX coverage; their build, lint, matrix, and browser checks are recorded separately.

### Known gaps and later owners

- Button loading is represented as an explicit matrix debt because the canonical primitive does not
  expose that state. Owner: Issue 3, Page-family primitives and migration guards.
- `RecordPanelHost` is represented honestly as the current shell; future shared host behavior is not
  faked. Owner: Issue 4, Shared overlay/panel/navigation host.
- No additional visual or a11y gap remains from the final Storybook browser gate. Production build
  has only the pre-existing >500k chunk advisory after the unrelated CSS comment terminator fix.
- The full default Vitest attempt is a machine-resource contention exception, not a passing gate:
  two unrelated 5-second timeout flakes were isolated and reran green at 2 files / 30 tests. The
  changed-scope targeted Vitest evidence is green at 120/120; independent re-review must decide
  whether to rerun the full suite on a quieter machine.

### Remaining Issues 3–12 and Issue 3 gate

3. Page-family primitives and migration guards.
4. Shared overlay/panel/navigation host.
5. RecordViewer contract, field primitives, and Task adapter.
6. RecordCollection/view engine and Tasks/Signals adapters.
7. Inbox triage plus Deputy host integration.
8. Café canonical-record integration and Team-context correction.
9. Representative-slice rendered/driven owner gate; provisional IA ratification.
10. Structured-content schema ADR, storage/RLS, editor, and typed embeds.
11. Remaining route migration by page/component family.
12. Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough.

The Issue 3 gate is open only after independent re-review confirms this evidence and the owner gives
explicit approval at the issue boundary. **Next action:** independent re-review, then owner reviews
the plan, matrix, screenshots, contrast record, and this ledger; no Issue 3+ work is claimed here.

## Independent re-review + owner acceleration directive (2026-07-20 evening)

### Director gate re-run (independent of the build harness)

Executed at the branch tip with the two untracked Issue-3 WIP files parked outside the tree
(tree clean, `git status --porcelain` empty at run time):

| Command | Result |
|---|---|
| `node --test scripts/v3-storybook-matrix.test.mjs` | exit 0 |
| `node --test scripts/v3-live-inventory.test.mjs` | exit 0 |
| `node scripts/v3-storybook-matrix.mjs --check` / `node scripts/v3-live-inventory.mjs --check` | exit 0 / exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test -- src/components/command/command-menu.test.tsx --run` | 35/35 passed |

Director visual pass on `docs/reference/evidence/v3-storybook-2026-07-20/`: typography tokens match
DESIGN.md (Plus Jakarta display / DM Sans body / Inter tabular), phone-390 card branch and overlay
record panel render clean. A cross-family gpt-5.6-luna re-review of the Issue 2 range was dispatched
and its verdict will be appended when it lands.

### Owner directive (verbatim intent, 2026-07-20)

The owner directed: deliver the V3 redesign as prescribed, in full, ASAP — "do whatever you need,
dynamic workflow, parallel subagents, or parallel workflows… fast is the name of the game now."
Recorded effect: the per-issue owner-approval pauses for Issues 3–8 unit-layer work are WAIVED by
the owner; the Issue 9 rendered owner gate, Issue 7 read-vs-handled semantics ratification, and the
Issue 10 ADR ratification remain owner decisions and are surfaced as RATIFY-BEFORE-MERGE items, not
silently assumed.

### Acceleration wave record

- Discrepancy noted for the record: three Issue-3 code commits (`130dcda`, `b34642a`, `d069a92`)
  were already on the branch tip before the Issue-2 gate formally opened, contradicting the
  "clean preflight only" handoff line. They pass the gate re-run above; they receive spec/CQ review
  with the wave merges rather than being reverted (owner speed directive).
- Wave dispatched from tip `d069a92`, one isolated worktree + branch per issue, merged serially by
  the Director: `v3/i3` (finish migration guards), `v3/i4` (overlay host), `v3/i5` (RecordViewer),
  `v3/i6` (RecordCollection engine). Unit/component layer only — no Supabase/DB/e2e in this wave;
  DB-backed and rendered-acceptance work stays serialized behind it.

### Issue-3 base commits — spec+CQ review (2026-07-20, Claude opus, independent)

VERDICT: CONFIRM — `130dcda` / `b34642a` / `d069a92` are sound and safe as the wave base.
Evidence: 251 shell tests + 74 router/consistency tests green, typecheck clean; commits map to plan
Tasks 1–4 exactly; router change verified metadata-only (paths/guards/redirects byte-preserved);
silent-failure trap closed (`assertV3RouteConfig` throws on any unclassified route, live in tests).
Minor notes: `page-head.css` extraction is in-scope beyond the literal task list (NFR-V3-007);
`--tabbar-h` fix corrects a phantom token the plan itself carried; CSS-ownership guards are
source-scans, real geometry stays with Tasks 13–14 e2e. Process flag: these landed pre-gate —
recorded above; base is technically clean and Tasks 5–14 remain with the `v3/i3` lane.

### Issue 2 independent re-review (2026-07-20, Claude opus adversarial substitute — Luna/pi unavailable)

VERDICT: CONFIRM (fix-then-ship). Exact commit set reviewed: `d2aee27 01b5e17 be8f854 c744cf8 4fa90c1`.
Verified from source: mock isolation airtight (Storybook-only resolveId+alias boundary, vite.config
byte-unchanged, dist seam clean); the matrix guard derives coverage from real TS-AST production
imports with substantive negative fixtures and byte-compare `--check`; totals 35/36/3/23 recounted
exact; scope flags machine-enforced false. Changed-TSX coverage 98.7–100%.

**Corrections applied to this ledger per the review's two Important findings:**

1. **Disclosure — sixth production file.** `mos-app/src/index.css:32` changed the GLOBAL token
   `--status-lost-text` (oklch 0.2796,0.1396,0.0158 → 0.45,0.05,0.04 — a hue correction brown→red,
   not a contrast rescue). Blast radius: ~25 consumer files (CardHead, Pill, data-table, TaskSurface,
   kitchen pages, login-page, signal-card, …). Guarded by `contrast.test.ts:125-133` (≥4.5:1 +
   red-hue assertion). The earlier "Matrix and production corrections" list omitted this file; it is
   in-scope of plan Task 5 ("the E7 status-lost token") but MUST be named, and now is.
2. **Contrast-figure reconciliation.** The figures "ErrorState 13.40:1" and StatusPill
   "10.42:1–14.39:1" earlier in this ledger were measured against the OLD token value. Shipped
   values measure Blocked 9.73:1 and ErrorState 10.88:1 — both clear AA. For `--status-lost-text`
   specifically the "old tokens measured below the governed contrast bar" framing was wrong: the old
   brown measured HIGHER contrast; the change traded contrast headroom for correct hue.
   `rendered-contrast.md` at the tip already carries the corrected measurements.

Minor recommendations adopted: the matrix + inventory `--check`s are now wired into
`scripts/pre-merge-check.sh` (commit `2daf1e9`). Remaining minors accepted as noted trade-offs
(self-declared state coverage backed by screenshots+axe; one white-box hover assertion deferred to
the browser gate; `role="option"` on disabled listbox rows; the café CSS comment tweak rides along).

## Acceleration wave — merge train + consolidated RATIFY-BEFORE-MERGE register (2026-07-20 night)

Merged serially into `v3-redesign`, each tip verified (typecheck + owning test scope) before the
next merge: `v3/i3` (guards + 3 representative migrations) → `v3/i4` (overlay host controller +
leaveGuard) → `v3/i5` (RecordViewer + adapters) → `v3/i7` (Inbox triage core) → `v3/i8`
(Team-context core). Zero merge conflicts (disjoint-path isolation held). `v3/i6`
(RecordCollection) still building; full merged-tip battery running. Incident note: `v3/i4` commit
`76907d5` was machine-committed by a concurrent process during the GLM/Claude substrate handover;
Director diff-audited it (content matches the lane's verified controller; no suspicious patterns).

### RATIFY register — owner decisions (block merge-to-main, not the branch build)

- **R-OWNER-1 (Issue 3, MATERIAL): job-sentence region ownership.** E7 ContextRow (region 2,
  experience-contract) and V3 PageHead (region 3, DESIGN.md §V3 target) both render the job
  sentence — migrated pages show it twice. Decide: retire the ContextRow sentence, or suppress the
  PageHead sentence per family. Provisional (wiring lane): suppress the ContextRow duplicate on
  V3-family routes — smallest reversible delta.
- **R-OWNER-2 (Issue 5): field-error behavior.** Plan's FieldErrorRetryContract (rejected save
  preserves draft + Retry) conflicts with owner-locked I5 rollback (OD-REDESIGN-22). Built to the
  plan. Ratify which behavior is law; I5's text changes if the plan wins.
- **R-OWNER-3 (Issue 7): read-vs-handled semantics** built as provisional per plan; Handled filter
  withheld until ratified.
- **R-OWNER-4 (Issue 8): ambiguous legacy Task-to-Team mappings.** Classifier leaves
  zero/multiple-candidate, cross-org-run, missing-run(-team), bu-mismatch rows UNRESOLVED;
  `mos.tasks.team_id NOT NULL` must not ship until the owner ratifies the mapping for every
  unresolved row from `buildRehomeReport`.

### RATIFY register — technical deviations (Director-ratifiable, listed for the record)

- R-T-1 (i3): `migration.ts` sourceFile paths are mos-app-cwd-relative (execution-correct) vs the
  plan's literal `mos-app/src/...`.
- R-T-2 (i3): AC-121 assertion replaced per plan Task 8 (V3 workspace-frame 1180px cap).
- R-T-3 (i3): focused-record not-found double-h1 left per plan Task 10; fix rides the wiring lane.
- R-T-4 (i4): browser-POP leaveGuard branch typed but unwired; `historyDriver` prop omitted — needs
  its own red-test slice before the ~250-line router-POP implementation.
- R-T-5 (i4): RecordPanelHost geometry (40–45% track / intermediate sheet / phone) + split-Escape
  correction deferred to the design-review + Playwright gate.
- R-T-6 (i5): three additive optional props (`onCommitField`, `loading`, `onRetry`) beyond the
  plan's frozen `RecordViewerProps` — required by the charter DoD (loading/error states).
- R-T-7 (i5): Task adapter renders no project/process-link/objective fields (no label source in the
  adapter input); keys exist in the commit dispatcher.
- R-T-8 (i7): `pendingIds` optional prop beyond the plan's provisional props (aria-busy needs it);
  `inbox-page` still renders legacy InboxList pending the Issue 6 seam.

### Complete-tip battery + post-merge fixes (2026-07-20 night)

Tip after all six lane merges + two cross-lane fixes: typecheck 0 · ESLint+Stylelint 0 · `npm run
build` 0 · full unit suite **3095/3095 (306 files)**. (One contention-timeout run occurred while a
second worktree ran the suite concurrently; the quiet rerun is the gate evidence.)

Cross-lane defects caught by standing guards, fixed at the app layer:
1. Inbox focus rings used inset −2px off the dense allowlist → standard +2px (CHROME-FOCUS guard).
2. `record-collection.css` invented a phantom token family (`--space-*`, `--color-*`, `--radius-2`,
   `--font-size-sm`) → rewritten to the house vocabulary (css-var wiring guard). Recorded as i6
   deviation R-T-9; the adapter/engine code was unaffected.

Additional i6 technical deviations for the register: R-T-10 `CollectionQuerySchema.neutral` field
added (compat checking needs populated-value knowledge); R-T-11 controller `subscribe`/`descriptor`/
`setSourceBuilder` beyond the plan's method list (React binding); R-T-12 viewer-contract import path
reconciled to the real `record-viewer.types.ts` (the plan's `record-viewer-contract` path never
existed — resolved by the wiring lane's seam swap).

### Wiring pass merged (2026-07-20 night, `v3/wire` → tip `15e8d16`)

Seam swaps to real contracts (Issue 5 leave-guard → `@/shell/overlay-navigation`; Issue 6 seam →
real `@/shell/overlay-host` + new permanent `record-opening-contract.ts`; Issue 7 host contracts
re-pinned), R-OWNER-1 provisional ContextRow suppression (scoped to the migration registry via
`matchPath`, NOT the route handle — a handle-keyed rule would have hidden the only sentence on the
23 deferred routes), and R-T-3 not-found heading demotion. Four true contract mismatches found and
reconciled without casts (plan's viewer-contract path never existed → Issue-6-owned bridge types;
host API narrowed via Pick; leave-guard seam was a benign strict subset; Issue-7 `OverlayOwner`
corrected to `'shell'|'tasks'|'signals'`). Post-merge battery: typecheck 0 · lint 0 · build 0 ·
**full unit 3101/3101 (306 files), exit 0 explicitly captured**.

Remaining render-dependent host adoption (listed, not faked): top-bar bell, Deputy cutover in
app-shell/AssistantPanel, `/inbox` page migration onto the Issue-6 engine — these ride the Issue 9
rendered-slice lane. DB authoring for Issues 6/7/8 dispatched on `v3/db` (execution serialized).

### DB rank merged + live gate (2026-07-21 early)

`v3/db` merged: migrations `20260721000001` (collection saved views: metadata CHECK binds
kind/context/spec version, pin trigger, legacy rows untouched), `...000002` (notifications
`handled_at`, R-OWNER-3 header, read-but-unhandled representable, content-immutability guard
preserved), `...000003` (nullable `mos.tasks.team_id` + FK, RLS-forced ambiguities audit table,
revoked SECURITY DEFINER `_rehome_task_teams()` mirroring the TS classifier, extended
`_guard_task_refs`), plus `...000004_...enforce.sql.HOLD` (parked; cannot auto-apply; R-OWNER-4).
Deliberately excluded (behavior-changing before app/RPC updates): spawn/resolve RPC re-home and a
non-null-team insert policy — deferred to enforcement.

Live gate on the local stack: `supabase start` 0 · `supabase db reset` 0 (all migrations incl. the
apply-time re-home run) · **full pgTAP 103 files / 772 tests PASS** (new suites 100/101/102 green).
Test numbering: plan's `63_` was taken → 100/101/102 (plan-canonical for two, next-free for one).

Review battery in flight: 3 combined spec+CQ reviewers (i3-finish+i4 · i5+i6 · i7+i8+wire) and a
security audit of the DB rank. Verdicts recorded here when they land.

## Acceleration wave — review battery verdicts (2026-07-21, GLM-5.2 cross-family; Luna unavailable)

| Lane | Verdict | Critical | Important | Minor |
|---|---|---:|---:|---:|
| i3-finish (guards + representative migrations) | CONFIRM | 0 | 0 | few |
| i4 (overlay host, honestly-scoped partial) | CONFIRM | 0 | 2 | 5 |
| i5 (RecordViewer/fields/adapters) | CONFIRM | 0 | 3 | 3 |
| i6 (collection engine/spec/adapters) | CONFIRM* | 2 | 4 | 2 |
| i7 (Inbox triage core) | CONFIRM | 0 | 0 | 3 |
| i8 (Team-context core) | CONFIRM | 0 | 0 | 2 |
| wire (seam swaps + R-OWNER-1 + R-T-3) | CONFIRM | 0 | 0 | 1 |
| DB rank security audit | **SHIP** | 0 | 0 | 3 Low |

*i6's two "Critical" flags: (1) a REAL dispatcher bug — engine `openCount` never resets, so
close-then-reopen silently no-ops onto an empty overlay session; (2) a scope statement — the engine
has no production consumer yet, so AC-V3-005/013 cannot be claimed at the application layer (known:
plan Tasks 10–13/15 are the outstanding slice). Security highlights: `_rehome_task_teams()` no
injection surface + revoked from app roles; ambiguities table triple-locked; `.HOLD` cannot
auto-apply; one tracked Low — DB CHECK doesn't mirror the client validator's full depth.

**Fix lane dispatched (`v3/fix`, GLM-5.2)** for the concrete findings: the openCount bug +
close-then-open test; the vacuous 44px assertion; the mis-titled compatibility-guard test; the
missing plan-Task-14 deterministic conformance guard (+ pre-merge wiring); the i4 intent-matrix +
re-guard-after-deny tests; two small boundary tests (inbox feature-off adapter-null,
effective_from === today). Deferred-but-tracked (not in this fix lane): i4 per-frame returnFocus
consumption + router-POP slice; i5/i6 production page wiring; URL back/forward rehydration
(consistent with the deferred POP transaction).

**Director rendered pass (live app, local stack, Director login):** Workspace/Focused-record/
Management all render correctly at 1280 and 390 — one h1 + ONE job sentence each (R-OWNER-1
suppression verified in the real DOM), PIC/Supervisor vocabulary, phone card regime + tab bar, no
horizontal overflow. Minor visual notes: legacy "Admin" ContextRow scope chip content (pre-wave
behavior, for the design lens); panel geometry is the known deferred R-T-5.

### Fix batch merged + independent rendered audit (2026-07-21)

`v3/fix` merged (5 commits): the engine open-dispatch bug fixed properly — dispatch now keys off the
LIVE overlay session (`bindOverlayHost` re-bound per render; `openRoot` vs `push` decided by actual
frame count, `openCount` removed) with a red-first close-then-open test; the 44px assertion now
reads the CSS; the compatibility-guard test actually calls the guard; the plan-Task-14 deterministic
conformance guard exists (9/9 node tests, `--check` 0) and is wired into `pre-merge-check.sh`; the
i4 intent-matrix (all 7 intents, exact kind+via, re-guard-after-deny) and the two boundary tests
landed. Guard scoping note: the no-legacy-hooks/no-soon-tab assertions are scoped to the delivered
engine boundary until the Task-page migration lands (documented in the script header) — tighten
app-wide when `v3/pages` merges. Post-merge: targeted suites 150/150, typecheck 0, guard OK.

**Independent rendered audit (NIM inkling, agent-browser, real login):** all checks PASS across
/work/tasks (+panel), /admin/people at 1280+390 — single job sentence, single h1, no overflow,
coherent frames; "Admin" label confirmed an intentional scope chip. Its one FAIL (invisible focus
ring) was REFUTED by the Director with a real keyboard Tab: `:focus-visible` yields the standard
2px accent ring at 2px offset; the audit's probe used programmatic focus, which never sets
`:focus-visible` — measurement artifact, recorded here so the next audit doesn't repeat it.

### Issue 11 first wave + collection DAL merged (2026-07-21)

`v3/pages` (collection-view DAL, 13 red-first tests, validate-before-DAL enforced; pgTAP proof =
suite 102, already green on the live stack) and `v3/routes` (Issue 11 wave 1: /profile Management;
/events /inbox /cafe /ecommerce /roastery Workspace — registry-armed, ContextRow auto-suppressed,
inventory regenerated 71 CSS families) merged. Post-merge: shell+pages 772/772, typecheck 0,
inventory `--check` 0; Director visual pass on Profile/Events/Inbox at desktop: single h1 + job
sentence, clean states. Honest skips recorded by the lane: follow-ups queue (classification tension
— handle says focused-record, page needs a workspace count → NEW REGISTER LINE R-OWNER-5 below),
/money dashboards (`.dash-head` freshness layout), kitchen/budget/pricing (deliberate no-head
branches), objectives/projects (bespoke frames), Home.

- **R-OWNER-5 (Issue 11): follow-ups queue family classification.** The route handle classifies
  `/money/follow-ups` + `/work/follow-ups/:id` as focused-record (prose head, no count pill), but
  the page is a queue whose head renders a count + overdue meta. Decide: reclassify as Workspace, or
  extend the focused-record contract. Deferred unmigrated until ruled.
- R-T-13 (Issue 11): `inbox-page.tsx` moved out of the RI-IA-2 raw-PageHead source scan — the
  invariant now enforced by the migration guard instead (moved, not bent; documented inline).

Lanes still building: `v3/sig` (Signal list→engine per Option A ruling — record-opening seam
protected, R-T-4 gates the swap) and `v3/tasks` (TasksWorkspace descriptor rewrite under 4 Director
rulings incl. the RATIFY'd Team-chip removal).

### Director convergence continuation (2026-07-21, local `v3-redesign`)

After the Signal descriptor/control merge, the Director migrated Café, Money, catalog, Home, and
Follow-ups to their V3 page families and regenerated the deterministic inventory. Follow-ups uses
Workspace provisionally because the live surface is a queue with count/overdue meta; R-OWNER-5
remains an owner-ratification line rather than being rewritten as historical approval.

The interaction audit found more centered-overlay drift than the earlier debt list named. One
`ModalShell` now owns focus entry/return, Tab trap, Escape/backdrop policy, responsive geometry,
scrim, z-tier, and reduced-motion timing for ConfirmDialog/ConfirmArchive, command launcher, Signal
capture, Occurrence assignment, Add Person, Role Editor, and both show-once password-reveal paths.
The PasswordReveal content no longer installs a second document listener. `CHROME-MODAL` now guards
all production consumers. Focused modal/command/composer battery: 136 tests; later admin extension
batteries: 46, 67, and 61 tests respectively; typecheck and changed ESLint clean.

Active isolated NIM work: `v3/task-live-migration` (real TasksWorkspace onto the shared collection
engine) and `v3/record-viewer-live` (one production shell overlay provider/slot). Neither has touched
the sole local Supabase. Do not claim either complete until its process exits and the Director
reviews and reruns its proof. Structured content correctly stopped at its hard dependency preflight;
no orphan JSONB subsystem was started.

Issue-12 stale-grammar cleanup then removed two unreachable page implementations that survived only
as old-app source/test islands: `SalesDashboardPage` (the live `/sales` door already redirects
directly to canonical Money) and `MyWeek` (no production route imported it; current Home composes the
reused `MyWeekPanel` with retired cadence cards hidden). The shared reporting selectors/components,
Home panel, and current behavioral coverage remain. Locking `RI-IA-9` fails if either retired page or
its private page tests/CSS return. Evidence: route/cohesion 71/71, Home/MyTasks/cohesion 70/70,
inventory 10/10 and 73 CSS families, typecheck and changed ESLint/Stylelint green. Commits `a83750f`
and `eb32fd4`; 1,313 legacy lines deleted across the two checkpoints.

### 2026-07-21 convergence handoff and adversarial audits

The durable continuation record is [`docs/reviews/v3-redesign-convergence-handoff-2026-07-21.md`](v3-redesign-convergence-handoff-2026-07-21.md).
It is the current plain-language source for the owner's goal, composite oracle, active worker/thread
map, provider failures, audit findings, proxy-test warnings, dependency order, and completion standard.

The Director independently reviewed and cherry-picked Luna auth commit `c4bf105` as `93555ac` on
`v3-redesign`. Its 77-test Luna battery, typecheck, ESLint, Stylelint, build, and diff checks were
green; the Director reran Login/Recovery at 36 focused tests plus typecheck, ESLint, and Stylelint.
The migration uses shared E7 `TextInput`/`Button` controls while preserving auth-specific alerts,
copy, focus, loading, recovery, and no-invented password-reveal behavior.

Two read-only Luna audits then found unclosed interaction debts that source/adapter tests can miss:

- Signal grouping was computed but flattened in the real table; table opening bypassed the injected
  opener and dropped filter/group/saved-view query state; selection checkboxes had no bulk action;
  direct Signal routes used the wrong page-family shell; runtime rail/row geometry and legacy links
  still need computed/driven proof.
- Inbox/Bell still renders the old standalone door instead of production `InboxTriage`; Deputy and
  mobile More lose opener focus; Follow-ups remains a bespoke mini-app/detail aside; Café still
  leaks Kitchen/Pesanan vocabulary and `/kitchen/*` links; Café/Inbox/Follow-ups state semantics are
  not shared; Home's retry copy has no retry callback; Home duplicates the Tasks query/renderer;
  People status filters lack the shared roving keyboard contract.

These findings are not marked fixed. The current Overlay, Signal, and Tasks lanes remain isolated
and require exit, diff review, focused proof, and cherry-pick before the next dependency wave.

The production overlay-host lane subsequently committed `8934353`; after a whitespace-only test
cleanup (`9e2a8d1`) the Director cherry-picked it onto `v3-redesign`. The shell now mounts exactly
one `OverlayHostProvider` and one physical `OverlayHostSlot owner="shell"`, preserving provider
ordering, assistant feature-flag behavior, and display-contents geometry. Independent proof is 36
focused shell/overlay tests, typecheck, ESLint, Stylelint, and diff clean. This establishes the host
only; Task/Signal RecordViewer consumers, Inbox/Deputy, and phone/back/focus consumer journeys remain
open and must not be inferred from the mount tests.

### Tasks live collection convergence — independently verified (2026-07-21)

Luna implementation source `542002b` was reviewed in its isolated worktree and cherry-picked as
`15924dc`. The live production `TasksWorkspace` now has one typed `useRecordCollection` loader /
projection and renders the canonical `RecordCollectionSurface`; the distinct Task domain model is
preserved. Mature table/card/group/mobile/keyboard/virtualization behavior remains the outcome
oracle rather than being replaced by a synthetic adapter demo.

Independent evidence: the live workspace and adapter focused battery passed 70 tests; typecheck,
ESLint, Stylelint, `git diff --check`, and the 10-test `scripts/v3-record-collection-conformance`
guard passed. No Supabase, dev server, browser, full-suite fan-out, push, merge, or deploy was used.
This closes the live Tasks collection engine seam only. Task RecordViewer opening, drawer-first /
direct-page parity, Signal collection convergence, and rendered owner acceptance remain open.

### Ownership split for the next convergence wave (2026-07-21)

The owner approved an implementation-first UI/IxD sequence: visible behavior → bounded smoke gates →
rendered owner-eye review → goal-level regression tests → commit. This is recorded in the handoff,
agent context, design workflow, pi delegation guide, and RecordViewer plan; it is scoped to UI seams
and does not weaken integration, security, schema, or final rendered gates.

- **Signal lane** (`019f843e-6dd0-76d0-b4f0-9bed74b4b2d3`): grouping/collapse, opener/query state,
  dead selection/Create Task, and archive/focused page families.
- **RecordViewer lane** (`019f8444-0709-7b03-bf1a-3ecf09eb2589`): Task/Signal viewer bridge,
  drawer-first host opening, focus return, and canonical page parity.
- **Home/People/More lane** (`019f844c-a942-7c12-992f-ae86618cfc88`): retry/projection duplication,
  ViewTabs keyboard behavior, mobile More focus return, and legacy links.
- **Director-owned next work:** independent review/integration of these lanes, then Inbox/Deputy,
  Follow-ups/Café, geometry/legacy cleanup, representative rendered gate, and owner walkthrough.

No lane may claim another lane's acceptance, use Supabase, or fan out broad/full browser suites.

### Signal collection convergence — independently verified (2026-07-21)

Source `30e816f` was independently reviewed and integrated as `5ab6a51`; the missing descriptor
capability correction was applied as `3250aa8`. Signal collection now has controlled group
headers/collapse, injected record opening with query preservation, no phantom selection capability,
no misleading ambient Create Task action, and workspace-vs-focused page-family separation.

Evidence on the integrated branch: 56 focused Signal tests, typecheck, ESLint, Stylelint, and
`git diff --check` pass. The final rendered owner-eye judgment remains owned by Issue 9 and is not
claimed by this bounded implementation checkpoint.

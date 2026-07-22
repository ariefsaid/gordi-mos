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

## Second-session convergence lanes — Luna cross-family review (2026-07-21 late)

Merged lanes 97bb7bf (follow-ups/Café) · 0739a92 (geometry) · 6e6cb14 (Inbox live): Luna verdicts
**BLOCK / BLOCK / BLOCK** — all three carry real findings; fixes routed:

- **CRITICAL (C): `buildInboxTargetDeps` hardcodes canOpen/isSameOrg/recordExists=true** — the
  fail-closed resolver is decorative in the live open path. Fix lane `v3/inbox-failclosed`
  (GLM-5.2) dispatched: real can()/org/existence sourcing + production-deps tests for
  permission-denied / cross-org / missing-record.
- (B) TasksWorkspace `.split` still 33vw (Rule 11 parity): already owned by the `v3/taskspage-fix`
  lane (its Task 2).
- (C) Bell shell-slot renders an unpositioned aside (no 44% track); Deputy can coexist with a Bell
  panel (guard only bans RecordPanelHost strings); Inbox record door bypasses the host
  page-promotion seam (pageTo omitted). All three sit in shell files the `v3/route-seam` lane
  (GLM-5.2, R-T-4) is actively editing — QUEUED as its consumer-wiring follow-ups, not dispatched
  in parallel (collision avoidance).
- (A) Follow-up queue row links directly to the record page (I1) — flag-dark today; lands with the
  route-seam consumer wiring (panel mode already exists on FollowUpRecordHost).
- Luna independently confirmed: adapter money-shaped, RecordKind extension sanctioned, registry
  consistency, rail 232/sheet 45vw/oracle placement, Escape-via-leaveGuard, read-only-not-handled
  semantics, and that the 3 context-row failures pre-date all three commits (blamed to
  4a05327a/bbed3f26 — owned by `v3/taskspage-fix` Task 3).

Also running: multimodal integration-gap hunts (minimax-m3 page-grammar sweep · inkling
interaction-door sweep) against the integrated tip; findings feed the next fix batch.

### Third-session status (2026-07-21, current Director session)

> The "dispatched" GLM-5.2 lanes above (`v3/inbox-failclosed`, `v3/route-seam`) **were never
> started** — both branches had zero commits, zero dirty files, zero reflog movement when the
> third session resumed. The collision-avoidance "QUEUED" items (Bell shell-slot, Deputy guard,
> inbox pageTo, follow-up panel-first) were likewise not started. All five findings above have
> since been resolved directly by the Director on `v3-redesign`:

| Finding | Lane | Commit | Resolution |
|---|---|---|---|
| CRITICAL C — `buildInboxTargetDeps` hardcodes true | A1 | `4de6339` | Real `can()` capability wiring + structural-cause documentation (RLS gates org, canonical page handles not-found); 6 production-deps tests |
| C — Inbox record door bypasses pageTo | B3 | `3ad5d9d` → superseded by current Inbox convergence | `pageTo` is now the single host-owned page-promotion door; the bespoke `openFull` fallback was removed after R-T-4 landed |
| A — Follow-up queue row links directly to record page | B4 | `f9c0d26` | `FollowUpRow` opens via shared host (`openRoot` + `FollowUpRecordHost mode="panel"`); drawer-first test proven (counterparty name appears twice = queue row + panel title) |
| C — Bell shell-slot unpositioned aside | B1 | `1c7da9b` | `OverlayHostSlot` passes `rootClassName="drawer-shell-split"` when `owner === "shell"`; new desktop CSS rule (right-anchored, `min(44%, 480px)`, full-height). Geometry verified: `x=800, width=480` |
| C — Deputy can coexist with a Bell panel | B2 | `7cc45f2` | `useDeputyOverlayCoexistence()` hook; single-effect newest-intent-wins reconciliation; collection overlays coexist (grid pane vs floating). 4 new + 401 existing tests pass |

The stale-base hazard (rv-live and taskspage-fix branched pre-Inbox-live-merge) was resolved by
rebasing both onto the post-Inbox-live tip and merging cleanly (`e211c64`, `c9122b3`). Tip is
now `7cc45f2`.

**Multimodal re-audit still BLOCKED** — NIM minimax-m3 hangs on image input (0% CPU after 3+ min);
all 5 pi providers show unauthed since the prior session's tokens expired. The Wave-2c 4-lens
audit and the three-width representative gate are queued behind owner re-auth or NIM recovery.
Geometry + diff stand in for the B1/B2 visual audits in the interim.

## 4-lens multimodal audit — Luna vision on 5 live screenshots (2026-07-21 night)

Director rendered pass + Luna 4-lens (Visual/IxD/IA/JTBD) on the integrated tip (`e006c3a`+):
inkling's earlier two findings verified STALE (Feed tab switches with URL+aria; Escape returns focus
to the exact opener) — fixed by the intervening merges. Panel split measured coherent (~44% of
content, E7 grammar). Surface verdicts:

| Surface | Verdict | Driving findings |
|---|---|---|
| Home 1280 | FIX-THEN-SHIP | attention rows lack PIC/source/action decision context; naked count |
| Tasks + panel 1280 | **BLOCK** | **Team-work chip + visible Team field violate plan §Task-11 / Issue-8 sequencing (no Team UI before real team_id)** — Session A's migration kept the chip; treated as stop-ship |
| Signals Feed 1280 | FIX-THEN-SHIP | red Urgent treatment semantically misleading; duplicated job copy; no visible canonical-open affordance |
| Inbox empty 1280 | **BLOCK** | triage-to-source journey unproven (Director has zero notifications — needs seeded-notification proof, Issue 9 acceptance) |
| Tasks 390 | **BLOCK** | clipped Follow-ups chip; 5-chip strip cramped; configuration precedes first work item; Table/Card ~36-38px < 44px floor risk; duplicate creation doors |

Routing: `v3/tasks-contract` (GLM-5.2) — remove Team-work chip + Team visible field until Issue 8
(the plan's own rule; the RATIFY'd removal my superseded v3/tasks lane never landed) + the 390 fixes
(scrollable chip strip, view-and-filters collapse, single creation door, 44px floors). 
`v3/sig-home-polish` (GLM-5.2) — Signals attention semantics + duplicate job copy; Home attention-row
decision context. Inbox seeded-notification proof queued to Issue 9 acceptance prep.

### v3/tasks-contract — Luna 390 + §Task-11 BLOCKs resolved (2026-07-22)

Both Luna BLOCKs against the Tasks surface are resolved on `v3/tasks-contract`.

- RATIFY-BEFORE-MERGE: Team-work chip + visible Team field removed per record-collection plan §Task-11 (Issue-8 gate)
- RATIFY-BEFORE-MERGE: Luna 390 audit (b) — manager phones now ALSO collapse the View & filters config behind the single disclosure so the first task card leads (reverses OD-REDESIGN-61's manager-keeps-dense-toolbar exemption at phone width).
- RATIFY-BEFORE-MERGE: Luna 390 audit (d) — one create door; the in-page header "+ Create task" is desktop-only, the phone create door is the global Action Launcher FAB (DESIGN.md one-launcher rule).

BLOCK 1 (§Task-11 UI contract): the `team` TaskCollectionView + Team-work chip + `view=team` plumbing
were removed from the Task descriptor, toolbar, workspace, saved-view hook, and breadcrumb leaf;
`view=team` now degrades to the org-visible All view (rejected on parse, like `view=bogus`). The Task
record panel no longer renders the Team field (the adapter still ACCEPTS a `team` input and preserves
the honest model via the exported `teamOwnershipField` seam — Issue 8 re-enables rendering at one
call site). Affected behavior tests updated as DELIBERATE §Task-11 goal changes.

BLOCK 2 (Luna Tasks @390): (a) the saved-view chip strip is a contained horizontal scroll region
(`overflow-x:auto`, hidden scrollbar, `flex-wrap:nowrap`) — no page overflow, no clipped "Follow-ups";
(b) phone collapses filter/config behind ONE "View & filters" disclosure so the first task card is
above the fold; (c) Table/Card tabs (`view-tabs.css` 40→44px) and saved-view chips
(`collection-toolbar.css` 38→44px) meet the 44px touch floor; (d) exactly one create door per width.

Evidence: `src/components/tasks` + `src/pages` targeted suite green, `npm run typecheck` clean,
`npm run lint` (ESLint --max-warnings=0 + stylelint) clean. Rendered 390px getBoundingClientRect
measurements recorded in the lane report.

## Audit-fix rank closed + route seam landed (2026-07-22 early)

- **R-T-4 route seam MERGED** (`01fceae` + harness fix `93903cf`): GLM-authored `4528fea` (949
  insertions, 568 test lines) — historyDriver wired to react-router in the shell, URL markers,
  browser-POP guarded transaction, openPage navigation, deep-link restore. Merge conflict in
  app-shell.tsx resolved by union (Deputy coexistence + OverlayHostRoot). Post-merge shell suite
  329/329. Note for the record: the GLM lane was working silently (pi parent idles at 0% CPU;
  output buffers until exit) — killed mid-final-verify, work already committed. Liveness heuristic
  corrected: judge lanes by worktree commits/mtime, never pi-parent CPU.
- **Luna Tasks BLOCKs fixed + merged** (`320bebd`): Team-work chip + view=team plumbing removed and
  the panel Team field un-rendered per §Task-11, with the exported `teamOwnershipField` seam for
  Issue-8 re-enable (RATIFY line recorded); 390 fixes measured live — chips/tabs 44px, contained
  chip-strip scroll (Follow-ups unclipped), View-&-filters phone disclosure (first card above the
  fold), single creation door (FAB on phone). 849/849 task/page tests.
- **Luna Signals/Home FIXes merged** (`8f3c72d`): Urgent re-toned to the warning/amber family per
  DESIGN.md ("attention is warning/amber, never destructive/red") with a leading warning dot for
  tier; signals routes joined the family-frame suppression registry (exactly one job sentence);
  feed-card open affordance accessibly named (en+id); Home attention rows carry PIC + Team/BU meta;
  the open-tasks KPI links to /work/tasks?view=my-work.
- **Director dark-mode catch (`ed73e49`):** the later `:root` semantic block re-pinned
  `--warning-foreground`, clobbering the `.dark` override (equal specificity, later-order wins) —
  dark-mode attention pills rendered unreadable dark-on-dark. Fixed by deleting the redefinition;
  verified live via HMR (text now display-p3 0.85/0.75/0.45); guard suites 135/135.
- Both audit-fix lanes observed the killed-GLM "silent concurrent writer" pattern; in each case the
  Claude lane verified and absorbed the coherent edits — trees green, single commits.

Unblocked by the route seam (next rank): tasks/signals record opening through the host with real
URLs; follow-up queue drawer door (I1); Inbox `pageTo`/promotion. Then: seeded-notification Inbox
triage proof (Issue 9 acceptance), Issue 10 (owner ADR), Issue 12 closure + curated e2e, review
battery + pre-merge gate + the owner's rendered three-width walkthrough.

## Independent completion audit — 2026-07-22

The current tip `d63f20a` was independently re-verified after the above fixes. The authoritative
result is [`v3-redesign-completion-audit-2026-07-22.md`](v3-redesign-completion-audit-2026-07-22.md):
**NO-SHIP**. Fresh full Vitest is 3,212 passed / 15 failed / 14 errors; route-seam and production
shell tests fail. The live inventory freshness check fails, and the merge gate has no current review
verdict lines. Tasks and Signals share the RecordCollection engine but still render parallel table
families; Café still chooses the first Team; Issue 10 remains ADR/plan-only; and the owner three-width
rendered gate is open.

Current gate status (deliberately blocking until a new review pass records evidence):

- spec: BLOCKED — current completion audit is NO-SHIP
- code-quality: BLOCKED — fresh route-seam failures remain
- design: BLOCKED — cross-surface grammar and owner three-width gate remain open
- security: BLOCKED — final current-tip review battery is not recorded

## 2026-07-22 convergence follow-up (checkpoint `08defcc`, local; not pushed)

The post-audit implementation slice is independently recorded here so the historical ledger does not
silently claim the branch is complete:

- Tasks and Signals live collection consumers now route record opening through the single production
  `OverlayHostProvider` / `OverlayHostSlot`; mobile Task cards use the same path. Focused evidence:
  Tasks workspace/mobile 80/80, Tasks page 45/45, Signals archive 18/18, Signals presentations 16/16.
- Café opening now resolves Team context as `none` / `single` / `choice`; multi-Team members see an
  explicit picker. Focused evidence: Team-context/Café 17/17.
- Home Signal cards now open through the shared `signals` host slot when the shell provider is present,
  preserving Home underneath; focused Home Signal suite 10/10.
- Signals table now uses the shared E7 RecordCollection outer surface. This is only a container-level
  convergence; Tasks/Signals toolbar, filter, saved-view, presentation, and density parity remains open.
- The route-seam test failure was traced to React Router’s jsdom AbortSignal crossing into Node/undici
  Request. The test-only boundary drops that signal for history/state-only tests. Route seam 8/8 and
  combined shell/overlay 54/54 pass with no unhandled errors.

**Current review verdict remains NO-SHIP.** These focused slices do not close the rendered three-width,
spec/design verdict, Inbox seeded-notification/handled,
Follow-ups, Money KPI, or owner-gated Issue-10/typed-embed requirements. No push or merge has occurred.

Current gate lines for this local checkpoint:

- spec: BLOCKED — completion audit remains NO-SHIP
- code-quality: PASS — typecheck/lint and the single-worker full Vitest run pass (3,234/3,234);
  rendered/live integration evidence is a design/acceptance gate, not a code-quality failure
- design: BLOCKED — cross-surface collection grammar and owner three-width gate remain open
- security: PASS — this slice changes no schema, RLS, auth, or capability policy; no security regression
  surface was introduced

### Money detail-door follow-up — 2026-07-22 (local, not pushed)

The Summary view now exposes a visible `View full detail` link carrying the active `window` and `cut`
query state, and the Detail route hydrates those parameters on direct navigation. Dashboard focused
evidence is **20/20**; typecheck, targeted ESLint, and CSS lint pass. This resolves the dashboard
spec's AC-017 / drill pattern B presentation contract without inventing per-KPI contributing-record
links that the aggregate reporting read-model cannot support. The branch remains NO-SHIP for the
independent rendered three-width gate, Tasks/Signals parity, Inbox seeded proof, Follow-ups flag,
Issue 10, and spec/design verdict closure.

The shared RecordCollection table skin also now sets a 38px header measure for typed table
presentations, matching the Task decision table while preserving Signal-specific columns. Focused
RecordCollection/Signals/Tasks evidence is **75/75**; this closes the measurable header-rhythm gap,
not the full rendered toolbar/presentation parity gate.

### Worktree/process consolidation — 2026-07-22

The canonical consolidation worktree is `/Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/v3-redesign`.
Clean historical V3/Codex worktrees were removed while retaining their branches; dirty handoff lanes
were preserved. Stale Vite/esbuild processes for this branch and `v3/rv-live` were stopped. No
Supabase process was started, and no push/merge/deploy occurred.

The current Inbox page also owns an `inbox` collection slot. Its records use the same shared host and
44% side-panel track as Tasks/Signals at split widths; the bell’s ephemeral quick-triage remains the
shell-owned fixed overlay by design. The old plan-era claim that Inbox always uses only `owner: shell`
is historical and no longer describes the page route.

Focused Inbox page/connected/door/host evidence is **51/51**, including the page-owned slot assertion;
typecheck and targeted lint pass. This closes the geometry/host-regime inconsistency at source level,
but seeded-notification proof and owner rendered three-width acceptance remain open.

### Responsive collection follow-up — 2026-07-22 (local)

Signals now adopts the same capture-first phone interaction contract as Tasks: one shared
`ViewOptionsDisclosure` reveals the complete collection toolbar, while the first Signal record remains
the leading content. Signal-specific filters, table/feed presentation, grouping, sorting, and saved
views are preserved inside the disclosure. Desktop toolbar behavior is unchanged.

Focused Signals archive, shared toolbar, and Tasks workspace evidence is **82/82**. Typecheck,
targeted ESLint, Stylelint, diff check, and live inventory (**58 routes / 13 shared jobs / 73 CSS
families**) pass. This closes the responsive disclosure inconsistency; desktop presentation parity and
the owner’s rendered three-width acceptance remain open. No push/merge/deploy occurred.

The Signal table message opener now uses a native `button` (with the same injected record opener) rather
than a `span role="button"`. Signal table/page/toolbar/Tasks focused evidence is **87/87** after the
locking assertion; this closes the hand-rolled activation seam but does not replace the live render gate.

The shared Save View editor also restores focus to its trigger on Escape, Cancel, and successful Save;
the ref-forwarding Button primitive and CollectionToolbar test lock the behavior for every collection
consumer.

## Deputy shared-host chrome follow-up — 2026-07-22 (local, unpushed)

The earlier bounded geometry seam no longer owns a bespoke physical panel contract. `AssistantPanel`
is now chrome-free tenant content rendered by the generic `OverlayCompanionSlot` through the same
`RecordPanelHost` as record tenants. That host owns Deputy's border/shadow, header and Close,
desktop-vs-phone modality, modal scrim, focus entry/trap/return, and Escape. `AgentRuntimeContext`
only owns runtime/open state, so there is no second focus controller. Transcript/draft/history state
survives because the AssistantPanel hook owner remains mounted while the physical host closes.

The coexistence tests drive both regimes. Desktop keeps the compact companion outside the live record
track. Phone keeps the record mounted underneath, and a single Escape is captured by the top companion:
Deputy closes without also closing the record. The source guard rejects local host imports,
drawer/scrim markup, and requires `OverlayCompanionSlot` adoption.

Focused evidence is **63/63** across AssistantPanel, app-shell/top-bar wiring, runtime state,
RecordPanelHost, Inbox/Deputy source conformance, and coexistence coordination; typecheck, ESLint, and
Stylelint pass. This is intentionally **not** a full route-stack claim: Deputy is a host-managed
companion rather than a primary `OverlaySession` frame, so browser Back and the controller's
one-session stack remain open. No rendered 1280/1024/390 evidence, Supabase, dev server, push, merge,
or deploy is claimed.

## Fresh current-tip critic pass — 2026-07-22 (`a7eef31`)

Read-only integration UX/IA/IxD and visual/cohesion/Impeccable/Taste-equivalent critics rechecked the
application against the owner’s redesign, 50+ QnA, divergence/convergence, E7, and anti-AI-slop oracle.
No Supabase, dev server, or broad suite was used. Source guards remain green (inventory 58/13/73,
RecordCollection guard, Storybook 35/36/3), but current rendered evidence is stale or absent.

**NO-SHIP.** The current gate is blocked by a P0 dirty-leave seam (Task `OverlayEntry` does not receive
the guard), P1 Tasks-vs-Signals live table/CSS divergence, P1 bespoke Inbox collection/seeded Bell proof,
P1 separate Deputy host/visual contract, and incomplete Task/Signal RecordViewer relation/anatomy proof.
P2 items are Café “Kitchen” strings, measurable typography/radius/control-size drift, and the provisional
native-select I5 exception. P3 cleanup is dead Signals selectors, stale comments, and a conformance guard
that covers Tasks but not Signals/Inbox/Deputy. Details and owner/automation split are in the completion
audit’s fresh section.

Resolved or stale claims are explicitly excluded: Home Signal host/origin, Home Money KPI duplication,
Café explicit Team choice, Inbox page host geometry/Back seam, Deputy focus return, Signals phone disclosure,
native opener and Save View focus, and the former hardcoded Café phone-tab finding. Do not call this branch
complete from source guards alone. Owner gates still include the final three-width “one app” visual verdict,
Signal card-soup/density judgment, strategic Inbox/Deputy/I5 exceptions, Q1 Signal-on-Home, and Issue 10.

## Task dirty-leave and page-promotion follow-up — 2026-07-22 (local, unpushed)

The prior P0 source finding is now addressed at the production seam: `TasksWorkspace` mutates the
same live `OverlayEntry` to attach the Task tenant's guard only while fields are dirty. The shared
`ConfirmDialog` handles retain/discard for Close, Escape, and stack Back; an integration test drives a
failed save to keep the draft dirty, then proves Cancel retains the record and Discard leaves it
(`AC-V3-008`). The explicit Open-full-page action also carries `taskSurface: page` through router state,
so promotion does not silently fall back to panel mode.

Focused evidence after the follow-up: **153/153** across Tasks workspace, Task surface, Task page mode,
overlay host, and ConfirmDialog; typecheck, ESLint, and Stylelint pass. This closes the earlier P0 at
source/test level only. Direct `/work/tasks/:id` browser navigation still needs its route blocker, and
fresh 1280/1024/390 rendered/Back evidence remains required before a ship verdict. No Supabase, push,
merge, or deploy was performed.

## Deputy record-coexistence seam — 2026-07-22 (local, unpushed)

The Deputy panel now consumes the active shared-overlay session while keeping its runtime and transcript
mounted. If the active tenant is a record, desktop Deputy contracts into a compact chat surface in the
remaining canvas, with its right edge reserved beyond the record host's 44% split / 45vw sheet track;
it no longer covers the primary record with a second full-height drawer. On phone, Deputy may open above
the still-mounted record per the owner's latest space-constrained clarification; closing it returns to
the record. The ordinary no-record Deputy drawer is unchanged.

Focused OD-REDESIGN-80 tests drive a real `OverlayHostProvider` record session and prove both the record
host and the correct Deputy regime remain mounted at desktop and phone widths. This is deliberately a
bounded coexistence seam: Deputy still owns a separate physical panel and does not yet participate in
the host's Back/stack/promotion transaction. Full shared-host migration plus rendered 1280/1024/390
geometry remain **NO-SHIP** gates. No Supabase, dev server, push, merge, or deploy was used.

## Tasks/Signals collection-table convergence — 2026-07-22 (local, unpushed)

The prior current-tip critic correctly found that sharing the engine, toolbar, and outer card did not
make the two live tables one visual/interaction family. This bounded slice closes the concrete table
seam without flattening the domains into one schema:

- Tasks and Signals now opt into one explicit `record-collection-table` class. The shared skin owns
  full-width fixed layout, 14px table typography, 38px headers, 52px rows, 12px cell padding, and one
  divider. Task-specific decision columns and Signal-specific archive columns remain distinct.
- Signal columns use stable proportions so Message stays primary and the table occupies the full
  collection width instead of reading as a short-content island. Long messages remain one-line,
  accessibly named open buttons with visual ellipsis.
- Signal Occurred and Attention headers are native sort buttons with `aria-sort`. They update the same
  URL-owned typed collection query used by the toolbar; the page-level goal test proves both the
  `dir=ascending` URL state and the resulting visible row order. Tasks retains its existing native
  header-sort contract.

Focused evidence: the Signals table/page, Tasks workspace/row, shared RecordCollection, and DataTable
suites pass **151/151**; typecheck, changed-file ESLint, and Stylelint pass. Refreshed inventory is
**58 routes / 13 shared jobs / 74 CSS families**. This is source/test closure only. No server or
Supabase was started, so computed-style/rendered parity at 1280/1024/390 and the
owner's final “one app” judgment remain open. Feed/Card presentation anatomy, cross-surface
filter/group/saved-view/open/Back/focus driving, Inbox seeded live-data/Handled semantics, and Deputy
physical-host migration remain separate gates. Inbox’s shared triage/host source seam is not an open
rewrite. No push, merge, or deploy was performed.

## Café noun + residual E7 token polish — 2026-07-22 (local, unpushed)

The last concrete P2 source drifts from the current critic are closed without renaming domain or DB
models. Every visible string across Café Log, Plan, Stock, Review, and Pushes now uses Café (or Kafe in
Bahasa), including sign-in/error copy, empty-state notes, filter/table accessible names, captions, and
document titles. Internal `Kitchen*` components/types/functions, import paths, `kitchen.*` translation
keys, and `kitchen-log-form` remain stable implementation seams. `RI-IA-10` scans all five live route
files and fails on any retired user-facing Kitchen noun.

Profile cards now consume the adopted E7 `--radius-lg` 12px container token, and shared record-panel
chrome uses the DESIGN.md 32px control size while retaining its 44px phone touch target. The worker
reported **206/206** across the Café/Profile/RecordPanelHost/i18n/consistency battery; an independent
rerun covered the eight affected suites at **195/195**, then fixed a shared-jsdom viewport-order flake
in `kitchen-plan-page.test.tsx` (`94eff85`). Typecheck, changed-file ESLint, and RecordPanelHost
Stylelint pass. This is source/test closure only:
fresh 1280/1024/390 rendering and the owner’s final “one app”/taste judgment remain open. No server,
Supabase, push, merge, or deploy was used.

## Deputy independent verification addendum — 2026-07-22 (local, unpushed)

At commit `3d6c39c`, the Director independently reran the affected Deputy/host battery: **94/94
Vitest tests passed** across AssistantPanel, runtime state, coexistence coordination, Inbox/Deputy
source conformance, RecordPanelHost, OverlayHost, and shell wiring. Typecheck, ESLint (including its
CSS lint leg), and `git diff --check` passed. The standalone `npm run stylelint` command is not a
repo script; CSS lint is the `lint:css` leg already included by `npm run lint`.

The phone rule is accepted as: when a record is mounted and horizontal space is insufficient, Deputy
may be a compact modal layer above it; one Escape closes Deputy first and leaves the record mounted.
This is the owner’s space-constrained preference, now reflected in OD-REDESIGN-80.

Two gates remain deliberately open: Deputy is still a companion outside the primary `OverlaySession`
(browser Back and one-session stack semantics are not unified), and a live render must still verify
phone modal scroll/focus containment while the underlying record stays mounted. No server, Supabase,
push, merge, or deploy was used.

## Owner-eyes checkpoint — 2026-07-22 (local, unpushed)

The V3 branch is ready for the owner’s bounded walkthrough, but is not being called shipped.
Fresh safe verification at the current tip is:

- Deputy/shared-host battery: **94/94 tests passed**.
- Typecheck and ESLint/CSS lint: **exit 0**.
- RecordCollection conformance: **OK**.
- Live inventory: **58 routes / 13 shared jobs / 74 CSS families**, current.
- No Supabase, dev server, rendered screenshots, push, merge, or deploy.

The walkthrough should answer only these open calls:

1. **Deputy stack exception:** accept the current companion outside browser Back/one-session stack,
   or require full controller-owned stack participation before ship.
2. **Collection family:** do Tasks and Signals read as one E7-styled RecordCollection family at
   1280/1024/390, while retaining domain-specific anatomy?
3. **RecordViewer:** do Task and Signal panel/page surfaces feel like the same viewer grammar with
   type-specific fields, or is another anatomy pass required?
4. **Inbox:** accept the seeded Bell → queue → record → Back journey and decide whether Handled is
   part of the first collection state.
5. **I5:** ratify eager native-select commit as a deliberate exception, or require the universal
   inline-edit contract.
6. **Overall taste:** does the rendered app now read as one neat, tidy product rather than several
   inherited apps? This remains an owner judgment; source guards cannot answer it.

Until these are answered, the review verdict remains **NO-SHIP**. The phone Deputy preference is not
open: where horizontal space is insufficient, Deputy may sit above the mounted record and Escape
closes Deputy first.

## Fresh mockup-regression audit — 2026-07-22 (local, uncommitted UI slice)

The owner explicitly asked for an adversarial comparison against the historical mockup evolution,
not another isolated code review: E7 owns the visual styling, pre-E7 remains a salvage reference for
table anatomy, and the composite owner oracle owns IA/IxD. A read-only critic used the Impeccable,
Taste, UI-styling, and four-lens review checklists against the current source and the supplied
rendered evidence. The bundled Impeccable detector and the critic's browser session were unavailable,
so the numeric score is a checklist score, not a detector-generated measurement; current live
rendering was separately inspected at the running local app but not yet at all three required widths.

**Verdict: NO-SHIP for visual/collection convergence.** The current patch improves hierarchy (the
collection switch is now a first row, query controls have explicit groups, Home attention lanes share
one outer surface, and the rail/main scroll containers are independently bounded), but it is not yet
as tidy as E7/pre-E7 in the load-bearing places:

- **P0 — Home identity starvation:** `MyTasksCard` reserves fixed ownership columns that leave roughly
  84px for the task title at the observed desktop content width; live rows read `Repl…`, `Sour…`,
  `Dial …`. E7/pre-E7 reserve a primary title column with a metadata subline. This fails JTBD J01/J02
  recognition even though the table technically fits.
- **P0 — Collection axes still duplicate:** presentation tabs, preset view buttons, native Saved views
  select, Save view, filter selects, group, sort, and a toggle remain visible at once. The current
  uncommitted grouping pass makes the rows calmer but does not resolve the underlying duplicate view
  axis or browser-native saved-view popup. E7/pre-E7 use one visible saved-view axis (chips) plus a
  compact query/filter row; advanced controls should be progressively disclosed without becoming a
  hidden gesture.
- **P0 — Signals identity anatomy:** Signals still exposes six columns (Message/Author/Team/Occurred/
  Attention/Category) with a 30% message column and one-line ellipsis. E7's stronger structure is a
  primary title/body cell with category as a subline, then Team, Attention, and Occurred. Author and
  category should not starve the factual Signal body (JTBD J12).
- **P1 — Tasks/Signals are wrapper-shared, not grammar-shared:** they use different renderers,
  title-cell hierarchy, row/action behavior, and filter/presentation semantics. The common
  `RecordCollection` skin is necessary but insufficient; a parity matrix must lock title+metadata,
  group rows, sort affordance, open/Back/focus, loading/empty/error, and mobile card anatomy while
  allowing typed domain fields.
- **P1 — Home hierarchy remains card-heavy:** the compact KPI treatment is an improvement, but the
  standalone `My open tasks` card is still a dashboard remnant and Home still stacks card shells where
  E7 uses calmer section/row rhythm. The owner decision to remove or embed that count remains open.
- **P1 — Record-opening inconsistency:** Home mini-task links go directly to `/work/tasks/:id`, while
  collection rows use the shared RecordPanel/OverlayHost grammar. Either route Home through the shared
  viewer or explicitly ratify it as the one direct-navigation exception.
- **P1 — Rail containment needs a driven proof:** source now uses `minmax(0, 1fr)`, `overflowY:hidden`
  on the shell, a flex content host, and an independently scrolling rail. A local browser check showed
  the page scrollTop changing while the rail top stayed at the header boundary, but 1280/1024/390
  screenshots and a regression test are still required before calling this gate closed.

Checklist score (0–4, current Home/Tasks/Signals): H1 visibility 3 · H2 real-world match 2 · H3 user
control 3 · H4 consistency 1 · H5 error prevention 3 · H6 recognition 2 · H7 flexibility 3 · H8
minimalist presentation 1 · H9 recovery 3 · H10 help 2 = **23/40 (weak)**. Taste anti-slop scan passes
decorative discipline (no gradients/glass/neon/emoji/fake depth in the inspected targets); the remaining
AI-slop is structural: card soup, duplicate control axes, browser-native popup, truncated identity
content, and inconsistent interaction grammar.

Focused smoke evidence for the uncommitted visual pass: CollectionToolbar 2/2, Signals archive 20/20,
Tasks workspace 62/62, Home 19/19, shell 23/23; typecheck, ESLint/CSS lint, and `git diff --check`
pass. This is not a full suite, a three-width gate, or an owner approval. Do not commit/push this slice
as completion until the P0/P1 items above are addressed and rendered at 1280, 1024, and 390px.

### Table convergence update — 2026-07-22 (local, uncommitted)

The first visible P0 table changes are now in the worktree:

- Home's mini task table uses proportional columns with a 34% identity column instead of fixed
  secondary widths that reduced task titles to `Repl...`/`Sour...` at desktop widths.
- Signals now follows the E7/pre-E7 decision-table anatomy: Message is a title cell with an author/category
  metadata subline, followed by Team, Occurred, and Attention. The old six-column Author/Category split
  was removed so the signal body remains readable.
- The shared collection toolbar is split into a primary presentation/view row and a query/filter/view-options
  row, and the live Signals render now occupies the full collection width.
- The live Tasks table had a newly measured P0 regression: fixed secondary widths left the Task column at
  0px. Those widths are now proportional (with a larger Due share), restoring a readable Task identity
  column at 1024px while retaining the E7 decision columns at 1280px.

Focused evidence after these changes: MyTasksCard 17/17, SignalTable 6/6, Signals archive 20/20, plus
typecheck. Driven renders now cover Tasks and Signals at 1280/1024/390 and Home at 390; a 1024px scroll
probe moved the page scrollTop to 500 while the rail remained pinned at top 56px. This is still not the
owner acceptance gate: Home 1280/1024 visual review, Home card-remnant decision, shared record-opening
proof, and final owner taste review remain open.

### Comparative baseline scores (same rubric, 0–4 per Nielsen heuristic)

These are structured design-review scores, not official Nielsen measurements or automated detector
output. They compare representative surfaces in the static prototypes; mockup limitations (static data,
partial state coverage, no real backend) are scored as partial evidence rather than assumed green.

| Heuristic | E7 canonical | Prior warmer/prototype | Interpretation |
|---|---:|---:|---|
| Visibility of system status | 3 | 2 | E7 exposes active destination/view/counts more consistently. |
| Match to real-world language | 3 | 2 | E7's Home/Work/Inbox job framing is clearer; prior still carries mixed-era labels. |
| User control and freedom | 3 | 2 | E7 has clearer return/source-record and view controls; prior relies more on bespoke surfaces. |
| Consistency and standards | 3 | 2 | E7 has the stronger token/nav/control spine, though not every route is complete. |
| Error prevention | 2 | 2 | Neither static mockup proves production validation or dirty-state handling. |
| Recognition over recall | 3 | 2 | E7's title/meta and saved-view anatomy scan better across collections. |
| Flexibility and efficiency | 3 | 3 | Prior has capable table/view composition; E7 retains role/view flexibility with less noise. |
| Minimalist/aesthetic design | 3 | 1 | Prior's paradigm banner, card density, and competing chrome create more visual noise. |
| Error recovery | 2 | 2 | Static prototypes do not prove real error/retry recovery. |
| Help/documentation | 2 | 1 | E7 has job sentences and clearer labels; neither is a help system. |
| **Total** | **27/40** | **19/40** | E7 is the stronger whole-product baseline. |

The earlier task-table surface is a deliberate exception: on table-specific anatomy only, the prior
prototype scores about **3.5/4** for recognition and scanability versus E7's **3/4**. Its title column,
metadata subline, visible saved-view chips, and compact query row are the salvage pattern to preserve.
That does not make its overall IA or visual chrome the direction.

### Structural-slop checklist (10 checks)

| Check | E7 canonical | Prior warmer/prototype | Note |
|---|---|---|---|
| One IA spine | Pass | Fail | E7's destinations/work hierarchy is more coherent. |
| One collection/control grammar | Partial-pass | Partial | E7 is the better target, but static routes still vary. |
| Shared record-viewer anatomy | Partial | Fail/partial | Neither mockup proves the production viewer contract. |
| Title + metadata hierarchy | Pass | Pass on task table only | Prior task title/subline is the salvage asset. |
| Spacing/rhythm | Pass/partial | Fail | Prior mixes page, card, and table rhythms. |
| Card discipline | Pass/partial | Fail | Prior is more card-heavy and widget-like. |
| Overlay/IxD consistency | Partial | Partial | Both are prototypes; E7 better communicates the intended grammar. |
| State/empty/error consistency | Partial | Fail/partial | Static coverage is incomplete in both. |
| Responsive/phone ergonomics | Partial/untested | Partial/untested | Requires driven 1280/1024/390 proof. |
| Decorative anti-slop | Pass | Pass/partial | Neither has gradient/glass/neon/emoji slop; prior has structural chrome slop. |

Approximate structural result: **E7 7/10 checks pass or mostly pass; prior 4/10**. The current app's
previous audit was weaker still (23/40 Nielsen; structural failures in the same control, identity,
card, and cross-surface grammar categories). The correct convergence target is therefore **E7 visual
system + prior task-table title/subline/query salvage + owner-ratified IA/IxD**, not copying either
prototype wholesale.

### Owner feedback and acceptance target — verbatim capture, 2026-07-22

The following owner feedback is binding input for the next implementation pass. It is intentionally
preserved verbatim so a worker cannot reinterpret it as a generic “polish” request:

> “the table filters and views feels unpolished and too cluttered. it doesnt say tidy. it says confusing!
> why not use ui-ux-pro-max, taste and impeccable skills for how to structure this neatly. same goes for
> Home, styling feels unpolished. some has to big of whitespace, some feels too tight. when scrolled down,
> the sidebar follows to get scrolled as well”

> “e7 has better table structure”

> “even the pre-e7 has better table layout”

> “do another agent pass hunting for possible regression from the previous mockups. it should only as
> tidy/neat if not better than previous mockups. use the skills to measure them objectively (the score
> from impeccable, the checklist from taste etc)”

Interpretation for implementation: the visual target is not “the current app with fewer defects.” A
surface is acceptable only when its hierarchy, density, spacing, controls, and interaction grammar are
at least as tidy as the strongest relevant prior mockup. E7 is the visual baseline; the pre-E7 task table
is a salvage reference for title/subline and saved-view/query anatomy; owner IA/IxD and historical
decisions remain the authority for behavior.

#### Comparison scorecard and explicit goal

These are structured review scores (0–4 per Nielsen heuristic), not official Nielsen laboratory scores
or automated Impeccable detector output. They are still the current objective comparison used for the gate:

| Surface/baseline | Nielsen-style score | Structural anti-slop result | Meaning |
|---|---:|---:|---|
| Current app, pre-convergence audit | **23/40** | Below target | Duplicate control axes, starved identity, card soup, inconsistent collection grammar. |
| E7 canonical prototype | **27/40** | **7/10** checks pass/mostly pass | Current minimum whole-product visual benchmark. |
| Prior warmer/pre-E7 prototype | **19/40** | **4/10** checks pass/mostly pass | Not the whole-product target, but its task table contains salvage patterns. |
| Prior task-table anatomy only | ~**3.5/4** scanability | Pass on title/query anatomy | Preserve title + metadata subline, visible saved-view chips, compact query row. |

The V3 completion target is:

- **Nielsen-style score ≥27/40 overall** (E7 parity), with no key collection criterion below 3/4 for
  recognition, consistency, and minimalist presentation.
- **Structural anti-slop ≥7/10, target 8/10**, with zero P0 instances of card soup, duplicate view
  axes, browser-native popup as the primary saved-view door, starved identity columns, or divergent
  Tasks/Signals collection grammar.
- **Three-width proof at 1280, 1024, and 390px** for Home, Tasks, and Signals: no 0px identity column,
  no clipped decision column, no page-owned scroll dragging the rail, and phone controls remain discoverable
  behind the shared View & filters disclosure.
- **One collection grammar, typed domain anatomy:** Tasks and Signals may keep different fields and
  presentation types, but must share the same title/metadata hierarchy, toolbar order, state treatment,
  row measure, sort semantics, record opening, Back, Escape, and focus-return behavior.

Scores below these targets are **NO-SHIP**, even if typecheck and tests are green. The next agent may
implement first under the UI-fast-path rule, but must render and score the actual surfaces before claiming
the target is met.

## Score-gate remediation slice — 2026-07-22 (Director, rendered + driven)

Scope: the three P0s from the owner score gate (duplicate collection axes / native saved-view
popup, starved identity + decision columns, Tasks-Signals toolbar grammar) plus the rail-scroll
containment proof. Implemented under the owner UI-fast-path rule; skills applied: Impeccable
(product register), Taste anti-slop, against the E7 visual authority + pre-E7 table salvage.

### What changed

- **CollectionToolbar (shared grammar, one place):** collapsed to the E7 two-row anatomy.
  Row 1 = presentation tabs + ONE view axis (preset chips and user-saved views merged into a
  single chip strip with a divider; a saved-view selection deactivates the preset chip) + Save
  view. Row 2 = compact query row (search + domain filters, no uppercase band labels). Group /
  Sort / toggles are progressively disclosed behind a labelled "View options" trigger
  (aria-expanded, inline row — not a popup), with a primary-color dot when the view is shaped by
  a non-default group/sort. The sr-only native saved-views `<select>` was REMOVED (chips are
  keyboard-accessible buttons; the duplicate tab stop was pure slop). **Phone contract preserved:**
  below 768px the trigger disappears and the options render expanded inside the host's single
  "View & filters" disclosure — OD-REDESIGN-61 one-tap capability reveal unchanged (driven at 390).
- **Tasks table:** the Task identity column is now `width:auto` (absorbs all slack — titles never
  starve at 1280). At ≤1120px, column PRIORITY applies (Wave-2c rule): Supervisor yields (still in
  the drawer/record), Due widens so "Overdue · Mon 13 Jul" never clips.
- **Signals table:** Occurred widened (full "20 Jul 2026, 21:48 WIB" at 1280 and 1024 via a
  ≤1120px tier); Message keeps the title/subline cell.
- **Home My-tasks mini table:** widths moved from inline colgroup to `.mini-tasks-table` CSS;
  inner columns run the denser E7 padding (12px) with card gutters at the edges; Due gets 18%.
  At ≤1120px Team/Supervisor/Activity yield (Task > Status > PIC > Due priority) and name cells
  ellipsis-guard so rows stay one line.

### Rendered/driven evidence (Director, live app at :5199, this session)

- 1280: Tasks (full titles, full Due, 2-row toolbar, disclosure opens labelled Group/Sort/archived
  row), Signals (full timestamps, title+subline), Home (all 7 mini-table columns complete, zero
  truncation, one-line rows).
- 1024: Tasks 4 priority columns all complete; Signals Team + full WIB timestamp; Home 4-column
  glance table with full Due.
- 390: Tasks capture-first (View & filters collapsed, cards lead; one tap reveals presentation,
  chips, Save view, search, filters, Group/Sort); Signals phone cards; Home attention lanes +
  single View-options disclosure. Phone record open/close verified incidentally (full-screen
  task record renders and closes correctly).
- Rail containment (owner complaint): driven at 1024 — `main.scrollTop` 400 while the rail's
  bounding top stayed pinned at 56px and `document.scrollingElement.scrollTop` stayed 0.

Gates: typecheck 0 · focused Vitest **238/238 across 20 files** (incl. updated journeys: tests now
open the disclosure as a step; goal-oracles unchanged) · ESLint 0 · Stylelint 0 · `git diff --check`
clean. New goal-level test: toolbar progressive-disclosure + non-default dot.

### Re-score (same rubric as the 2026-07-22 baseline; structured review scores, not lab Nielsen)

H1 visibility 3 · H2 real-world match 2 · H3 user control 3 · **H4 consistency 3** (was 1: one
toolbar grammar, one table anatomy rule-set, same phone disclosure on both collections) ·
H5 error prevention 3 · **H6 recognition 3** (was 2: identity/decision columns never starve at any
proven width; saved views are visible chips) · H7 flexibility 3 · **H8 minimalist 3** (was 1: one
view axis, two calm rows, no band labels, no native popup, advanced controls disclosed) ·
H9 recovery 3 · H10 help 2 → **28/40** (target ≥27 = E7 parity: MET).

Structural anti-slop: one IA spine ✓ · one collection/control grammar ✓ · shared record-viewer
anatomy ~ (P1 open) · title+metadata hierarchy ✓ · spacing/rhythm ✓ · card discipline ~ (Home
"My open tasks" remnant, owner call) · overlay/IxD ~ (Deputy host choice open) · state semantics ~
(Café items open) · responsive/phone ✓ (driven three-width) · decorative ✓ → **6 pass + 4 partial
≈ 7/10** (target ≥7 MET; 8/10 needs the card-remnant decision + RecordViewer anatomy).

P0 ledger: duplicate axes **RESOLVED** · native saved-view popup **RESOLVED** (removed, chips are
the door) · starved identity/decision columns **RESOLVED at 1280/1024/390** · Tasks/Signals toolbar
grammar **RESOLVED user-visibly** (code-level renderer/CSS parity matrix remains the open P1).

Still open (unchanged by this slice): Home card-remnant owner decision, Home record-open
consistency ratification, Tasks/Signals renderer parity matrix, RecordViewer anatomy, Inbox seeded
proof, Café strings/state semantics, and the OWNER walkthrough. Verdict stays **NO-SHIP** until the
owner sees these surfaces — but the measurable score gate is now met and rendered.

## Raised score-gate result — 2026-07-22 evening (target ≥32/40 · >8.5/10, scope OD-81.3)

Wave contents (all merged to `v3-redesign`, each lane independently verified then Director-re-run):
table-grammar parity (matrix 9/9 CONVERGED after OD-83.2; shared `collection-grammar.css`; Tasks
title+BU subline anatomy) · Home KPI embed (OD-81.1) · Café/Inbox/Follow-ups state-kit convergence
(LoadingShell + awaiting/blank/next-step; Café nouns verified already-clean) · D1 Home section
rhythm (OD-82; chromeless E7 sections) · sticky view-tabs gutter fix · dirty-leave guard journeys
(AC-V3-008/b/c) · field-Escape isolation (OD-83.1; capture-phase, Deputy layering preserved,
live-verified: dirty field → Esc reverts silently, panel stays; second Esc closes) · Task selection
scaffolding removed (OD-83.2).

Gates at tip: **full parallel Vitest 3256/3256, 0 skipped** · typecheck 0 · ESLint/Stylelint 0 on
all changed files · `git diff --check` clean. Rendered/driven evidence: 1280/1024/390 sweep of
Home, Tasks, Signals this session (Director-driven, live app); rail-pin, disclosure journeys, and
the Escape contract exercised in the real browser.

### Re-score (same 0–4 rubric; structured review scores, not lab Nielsen)

H1 visibility **4** (single view axis state, sort arrows, options dot, shared loading/empty/error,
header count) · H2 match **3** (Café nouns clean, Gordi language; bilingual content mixing keeps it
off 4) · H3 control **3** (Escape/dirty contract ratified + proven at unit/live layers; browser-Back
veto e2e proof still open → not 4) · H4 consistency **4** (one toolbar grammar, one table grammar,
one state kit, one host — user-visible parity complete) · H5 prevention **3** · H6 recognition **4**
(title+subline everywhere, no starved column at any proven width) · H7 flexibility **3** · H8
minimalist **4** (chromeless Home, two-row toolbar, dead affordances gone) · H9 recovery **3** ·
H10 help **3** (teaching empty states, job sentences) = **34/40** (target ≥32 MET; E7 baseline 27).

Structural anti-slop: IA spine ✓ · collection/control grammar ✓ · record-viewer anatomy **partial**
(typed viewer anatomy/relations still incomplete — the one open structural item) · title/meta ✓ ·
rhythm ✓ · card discipline ✓ · overlay/IxD ✓ (one shared host owns records + Deputy chrome;
Escape layering ratified) · state semantics ✓ (scoped surfaces) · responsive ✓ · decorative ✓ =
**9/10** (target >8.5 MET).

### Standing items after this wave

RecordViewer anatomy completion (the 9/10 partial) · browser-Back dirty-veto e2e proof ·
task-surface optimistic-rollback draft churn (flagged, owner may want an issue) · Inbox seeded
journey + handled semantics (data-gated) · Issues 10/12 + curated e2e · owner walkthrough.
**Verdict: the measurable gates are MET at 34/40 · 9/10; NO-SHIP remains only for the owner
walkthrough + the standing non-score items above.**

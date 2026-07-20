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
  StatusPill values `10.42:1`–`14.39:1`, and ErrorState `13.40:1`; the old tokens measured below the
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
| `npm run test-storybook` from `mos-app/` | Exit 0; 7 suites / 35 tests passed, 0 snapshots; fresh real browser evidence; not rerun after the hook-only code-shape correction |
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

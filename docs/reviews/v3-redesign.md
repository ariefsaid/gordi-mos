# V3 redesign — Issue 1 review ledger

**Workstream:** `v3-redesign` · **Issue:** V3 Design Foundation · **Date:** 2026-07-20

An `OD-REDESIGN-NN` label means a recorded owner decision in `docs/decisions.md`; the plain-language rule below each evidence item is the operative explanation. This ledger records Issue 1 only. It does not claim rendered application acceptance.

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

- AC-V3-001 is mapped to the DESIGN contract and evidence boundary; rendered computed-style acceptance is explicitly deferred.
- AC-V3-014 is mapped to the red/green inventory guard, deterministic artifacts, and final static verification.
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

`scripts/v3-live-inventory.test.mjs` owns the source guard. It fails before the collector exists (`ERR_MODULE_NOT_FOUND`), turns green after the collector is implemented, and contains the separate DESIGN conformance test that was red against the stale DESIGN.md and green after reconciliation. `scripts/v3-live-inventory.mjs --check` validates route literals, source files/symbols, canonical component jobs, token sources, CSS coverage, and deterministic JSON/Markdown artifacts.

The delivery-sequence guard now parses the canonical labels from `docs/specs/v3-redesign.spec.md` §12, emits Issues 1–12 in the inventory artifacts, and checks the current Issue 1 docs for collapsed ownership. It rejects assigning rendered computed-style acceptance to Issue 2 and rejects assigning application component work to Issue 2. Issue 2 is therefore constrained to Storybook component/state/responsive proof; Issues 3–8 own application capabilities and Issue 9 owns the rendered/driven representative owner gate.

## Exact commands and exit codes

Completed during Issue 1 so far:

| Command | Exit | Evidence |
|---|---:|---|
| `node --test scripts/v3-live-inventory.test.mjs` before collector | 1 | Expected `ERR_MODULE_NOT_FOUND` red state |
| `node --test scripts/v3-live-inventory.test.mjs` after collector | 0 | AC-V3-014 route/component/style guard green |
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

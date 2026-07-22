# V3 redesign completion audit — 2026-07-22

**Auditor:** Director (read-only verification; Luna requirements audit also reviewed)
**Tip audited:** `d63f20a` on `v3-redesign`
**Verdict:** **NO-SHIP / not V3-complete**

This is an independent completion check against `docs/specs/v3-redesign.spec.md`, OD-REDESIGN-72..79,
the composite provenance oracle, `docs/jtbd.md`, `docs/experience-contract.md`, and the binding
`docs/interaction-contract.md`. A prior agent's green numbers or review prose are historical evidence,
not current proof. No production code, schema, or Supabase state was changed by this audit.

## Fresh evidence

| Check | Result | Meaning |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript is clean at this tip. |
| `npm run lint` | PASS | ESLint and Stylelint are clean. |
| `npm run build` | PASS | Production bundle builds; Vite reports a >500 kB JS chunk warning. |
| `npm run storybook:matrix` | PASS | 35 stories / 36 state entries / 3 responsive entries; this is not app acceptance. |
| `node scripts/v3-record-collection-conformance.mjs --check` | PASS | Shared engine/hook/typed-adapter source guard only. |
| `node scripts/v3-live-inventory.mjs --check` | **FAIL** | `docs/reference/v3-live-inventory.json` and `.md` are stale or missing for the current tree. |
| `npm test -- --run --maxWorkers=1` | **FAIL** | 3,212 passed / 15 failed across 319 files; 14 unhandled errors. |
| `bash scripts/pre-merge-check.sh` | **FAIL** | The ledger has no current `spec`, `code-quality`, `design`, or `security` verdict lines. |

The 15 fresh failures are not cosmetic: route-seam and production-shell tests fail URL marker creation,
canonical `openPage` promotion, browser Back/Forward restoration, and dirty-leave recovery. The run also
reports repeated `RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal`
unhandled errors. Earlier `3195/3196` or `329/329` figures cannot be reused as a final gate for `d63f20a`.

## Requirement closure

Status vocabulary: **Complete** means current evidence proves the requirement at its owning layer;
**Partial** means code exists but integration or final acceptance is missing; **Unproven** means only
historical/proxy evidence exists; **Contradicted** means the current implementation violates the binding
requirement.

| Requirement | Status | Current evidence / gap |
|---|---|---|
| FR-V3-001 page families | Partial | Registry/guards exist, but live inventory is stale and final route-by-route rendered closure is open. |
| FR-V3-002 E7 visual system | **Contradicted at cross-surface level** | Shell is E7-influenced, but Tasks and Signals still use separate table/style families; the app reads as multiple products. |
| FR-V3-003 typed RecordViewer | Partial | Typed contracts exist; Task and Signal still have materially different live viewer/adapter paths rather than one proven viewer anatomy. |
| FR-V3-004 shared panel | Partial | Geometry is ~44%/480px on desktop, but consumers still mount route-local `RecordPanelHost` paths. |
| FR-V3-005 panel/page/canonical URL | **Contradicted by fresh tests** | Route seam tests fail markers, `openPage`, browser POP, and dirty recovery at this tip. |
| FR-V3-006 one stack/host | Partial | Generic host tests pass, but production consumers and Deputy/collection regimes still need final driven proof. |
| FR-V3-007 collection state | Partial | Engine preserves query/view state; no final cross-surface browser proof covers every collection. |
| FR-V3-008 permission/read-only | Partial | Field/viewer tests exist; Inbox predicates and cross-surface permission journeys are not final evidence. |
| FR-V3-009 common field save/error grammar | Partial | Shared field tests exist; every live viewer consumer is not on the same contract. |
| FR-V3-010 structured authored content | **Contradicted / absent** | ADR-0052 and plan are present, but no schema/editor/storage/RPC/RLS implementation exists. |
| FR-V3-011 typed embeds | **Contradicted / absent** | No typed embed registry or reference-only persistence path exists. |
| FR-V3-012 manager/floor journeys | Unproven | No current three-width owner-eye and driven persona acceptance exists. |
| FR-V3-013 reusable collection families | **Partial and visually contradicted** | Both use the RecordCollection engine, but Tasks uses custom `.assembly`/`.tasks-table`; Signals uses `DataTable`/signal CSS. Shared engine ≠ shared collection UI grammar. |
| FR-V3-014 route/style closure | Partial | Guards pass, but inventory freshness fails and stale local style families remain. |
| FR-V3-015 measurable visual conformance | Unproven | Storybook/source guards pass; final computed-style parity and owner rendered review remain open. |

| Acceptance | Status | Evidence |
|---|---|---|
| AC-V3-001 visual parity | Unproven/contradicted | Live screenshots show Tasks as an elevated rounded assembly and Signals as a flat table; type is 14px vs 13px. |
| AC-V3-002 common record opening | Contradicted | Fresh route-seam tests fail; Task/Signal opening paths remain different in production. |
| AC-V3-003 one overlay | Partial | Host unit tests pass; final Inbox/Café/Deputy/collection driven journey is not closed. |
| AC-V3-004 Café→Task identity | Unproven | No current owner-level browser proof of same identity and preserved collection context. |
| AC-V3-005 Signal saved view persistence | Partial | Adapter/query tests exist; live refresh/share proof is not final. |
| AC-V3-006 Inbox bell → triage → record → Back | Partial | Code/tests exist, but seeded-notification proof and final focus/URL journey remain open. |
| AC-V3-007 explicit multi-Team choice | **Contradicted** | `cafe-opening-page.tsx` still selects `due[0]` and `myTeams[0]`; the pure resolver returns `choice` but production does not use it. |
| AC-V3-008 common save/cancel | Partial | Shared primitive tests do not prove every consumer. |
| AC-V3-009 honest read-only | Partial | Local tests exist; no final cross-surface rendered acceptance. |
| AC-V3-010 JSONB authored content | **Contradicted / absent** | No implementation or reopen proof. |
| AC-V3-011 normalized typed embed | **Contradicted / absent** | No implementation or persistence proof. |
| AC-V3-012 floor-member Café journey | Unproven | No measured owner-eye journey with step count/hesitation/misclick evidence. |
| AC-V3-013 manager collection workflow | Partial | Proxy/conformance tests pass; no final browser workflow across presentations. |
| AC-V3-014 stale-style/inventory closure | **Failing** | Inventory freshness exits 1; pre-merge review verdicts are absent. |

## Direct visual/IxD findings

1. **Tasks and Signals are not the same RecordCollection UI family.** Tasks is a bordered, rounded,
   shadowed assembly (`mos-app/src/components/tasks/TasksWorkspace.css`), with custom `.tasks-table`
   and a dense 14px body. Signals renders the generic dashboard `DataTable` with a flat surface and
   13px body (`mos-app/src/components/dashboard/data-table.css` and
   `src/components/signals/signal-table-presentation.css`). Their tables happen to measure ~982–984px
   wide on desktop after the geometry fix; visual/interaction grammar is still different.
2. **Responsive disclosure is inconsistent.** Tasks collapses configuration behind one “View & filters”
   disclosure so the first card leads. Signals exposes a long stacked filter sequence on phone, creating
   a materially different path to the same collection job.
3. **Record opening is not a trustworthy common contract.** Signal panel geometry matches the Task panel
   (~433px at 1280px), but fresh route-seam tests fail the URL/history contract that makes the shared panel
   safe to use.
4. **The test suite over-proves primitives and under-proves composition.** The RecordCollection guard
   checks shared engine/hook/adapter structure, but no guard asserts that Tasks and Signals use equivalent
   toolbar/table surface grammar.
5. **Café ambiguity remains a JTBD violation.** Production still takes the first due Team or first
   membership despite the explicit resolver requiring a user choice for more than one eligible Team.

## Documentation contradictions and drift

- `docs/agent-context.md:92–148` calls out tip `7cc45f2`, historical `3195/3196`, and says route seam
  remains a fallback; the audited branch is `d63f20a` and the fresh suite is 3,212/3,227.
- `docs/reviews/v3-redesign.md:782–809` says route seam is merged and records `329/329`, while the
  same ledger says the three-width gate, Inbox seeded proof, Issue 10, and final gate are outstanding.
- `docs/backlog.md:1–35` presents the earlier 2026-07-21 checkpoint as current without linking this
  failed verification.
- `docs/adr/0052-structured-authored-content.md:3–9` correctly says **Proposed** and owner-gated,
  but other completion prose can be read as if Issue 10 shipped. It has not.
- `scripts/pre-merge-check.sh` requires canonical bullet verdicts, but the ledger has no current
  `spec`, `code-quality`, `design`, or `security` verdict lines.

## Required handoff to the implementation agent

1. Repair and re-prove the route seam (markers, canonical promotion, browser Back/Forward, dirty-leave recovery).
2. Converge Tasks and Signals on one RecordCollection surface grammar: same page/container treatment,
   typography/row density, toolbar hierarchy, disclosure behavior, and equivalent open/filter/view
   affordances. Keep typed columns and domain-specific presentations, but do not keep parallel table
   styling systems for the same table job.
3. Replace Café's `due[0]`/`myTeams[0]` heuristics with explicit Team choice and a goal-level test.
4. Either implement Issue 10 fully after ADR owner approval or keep V3 open; do not call ADR/plan shipped.
5. Refresh inventory, update the canonical state register, add current pre-merge verdict lines, and
   complete the rendered three-width manager/floor walkthrough before any merge claim.

**Linked authority:** `docs/specs/v3-redesign.spec.md`, `docs/decisions.md` OD-REDESIGN-72..79,
`docs/interaction-contract.md`, `docs/experience-contract.md`, `docs/jtbd.md`,
`docs/reference/provenance/owner-directives-index.md`.

## Second Luna pass — IA/IxD/taste and integration consistency

Two Luna xhigh threads were dispatched against the same `v3-redesign` tip. They were read-only;
neither installed dependencies, started Supabase, edited code, or ran a broad suite. The integration
thread completed with a surface-by-interaction matrix. The separate IA/taste thread reached browser
tool approval and did not return a fresh final; its earlier source audit plus the rendered screenshots
already captured in this review were therefore treated as evidence, not as a green owner-eye pass.
That missing visual completion is itself an unproven gate. The completed integration findings and my
rendered/source re-check corroborate the audit above and add these concrete gaps:

### Blocking interaction findings

- **Live Tasks and Signals still bypass the shared overlay session.** `task-drawer.tsx:92` and
  `signals-archive-page.tsx:243` mount route-local `RecordPanelHost` instances while
  `overlay-host.tsx:627` defines the intended single host. Primitive tests passing does not prove the
  production journey. This is the direct cause of the “inbox drawer on top / task drawer on the side /
  different app” complaint and blocks one focus, Back, leave-guard, tenant, and stacking grammar.
- **Related-record stacking is only proxy-tested.** `RecordViewer` supports `onOpenRelated`, but live
  Task/Follow-up adapters expose no relations and Signal supplies `relations: []` in
  `signal-record-adapter.tsx:207`. The stack behavior is tested in the generic viewer, not through a
  real Task/Signal host push.

### Important IA/IxD/UX findings

- **Home loses origin context for Signals.** `signal-feed-section.tsx:52` navigates to
  `/work/signals?record=…`; it does not open a contextual record over Home, so close returns to the
  archive rather than the originating attention brief. The current test encodes this implementation
  rather than the drawer-first owner goal.
- **Deputy is a separate drawer contract.** `AssistantPanel.tsx:69` closes without capturing/restoring
  its launcher focus. The coexistence guard prevents simultaneous drawers but does not make Deputy a
  shared-host consumer.
- **Café still silently chooses a Team.** `cafe-opening-page.tsx:53–62` picks `due[0]` or
  `myTeams[0]`; the explicit-choice resolver is not wired into the production path. This remains a
  direct AC-V3-007/owner-JTBD violation.
- **Inbox is materially improved but not closed.** Production uses the shared host and Bell journeys
  are focused-tested, but `inbox-triage-connected.tsx:69–75` hardcodes `handledFilterAvailable={false}`
  and seeded-notification acceptance is still absent. The current interaction contract's “no panel
  door” statement is stale; conversely its “Task/Signal host done” statement overstates the live wiring.
- **Follow-ups is dark.** `SHOW_FOLLOWUPS=false` in `features.ts:27` redirects the surface. Its enabled
  code is directionally coherent, but cannot count as live production acceptance.
- **Money KPI cards remain a dead end.** `dashboard-page.tsx:271–288` changes the reporting window but
  does not drill to contributing records, short of JTBD J19.
- **Mobile More focus return is composition-broken.** `MobileDrawer` has a correct primitive, but
  `app-shell.tsx:105/128` passes the hamburger opener even when More opened the drawer; the component
  test does not cover the shell composition.

### Taste/anti-slop and cohesion findings

- The overall palette and E7 visual restraint are not the primary problem; the anti-slop failure is
  **incoherent assembly grammar**: Tasks' elevated rounded assembly versus Signals' flat generic table,
  plus different phone filter disclosure. This reads as assembled product families even where tokens
  are nominally shared.
- Signal Table uses `span role="button"` (`signal-table-presentation.tsx:45`) while Feed uses a native
  button, and Save View closes on Escape without trigger focus restoration (`collection-toolbar.tsx:185`).
  These are small but visible examples of the interaction grammar not being reusable.
- `record-panel-host.css:16` uses 30px chrome controls while `DESIGN.md:144` specifies 32px; this needs
  computed-style confirmation before being classed as a token exception.
- Café still exposes legacy “Kitchen” captions in `kitchen-*.tsx` and “Plan” language in the capture row;
  the old noun is therefore not fully removed from the user-facing IA even though the rail titles were
  corrected.

### Stale-claim corrections from the integration pass

- `docs/interaction-contract.md:48–49,59` simultaneously understates Inbox (it says no panel door) and
  overstates Task/Signal host completion. Mark those rows as current-state claims, not shipped facts.
- `signals-archive-page.tsx:30` and `inbox-record-door.tsx:67` retain comments describing the route seam
  as absent; these comments now conflict with the landed shared-host code and should not be used as
  acceptance evidence.
- `router.tsx:50` still calls Profile a `SliceStubPage` although it mounts `ProfilePage`; provenance P-14
  still says phone navigation hardcodes Café although `bottom-tab-bar.tsx:52` is role-scoped.
- No independently ratified OD-75 acceptance criterion was found; the spec traces OD-74 and OD-76–79 but
  not OD-75. It must not be treated as passed by implication.

### Clean / already addressed in this pass

The Lunas found no evidence of neon/gradient/glass/emoji decoration, fake depth, or other obvious
visual AI-slop in the available E7-derived screenshots. Collection filter/group/saved-view/query logic,
the command/composer focus primitive, explicit task creation, Inbox host primitives, and management
confirmation/error states are materially stronger than the pre-V3 app. Those clean primitive results do
not override the live-consumer and owner-eye gaps above.

**Second-pass conclusion: NO-SHIP remains.** The redesign is not complete until the shared host is adopted
by live collection consumers, origin/context and focus semantics are driven end-to-end, Café team choice
is explicit, Inbox/Follow-ups/Money gaps are dispositioned, and the rendered three-width owner gate plus
fresh verification ledger are green.

## Implementation follow-up — 2026-07-22 (checkpoint `fc10a8e`, includes `08defcc`; local; not pushed)

The Director applied a bounded convergence slice after this audit. This is new evidence, not a replacement
for the audit verdict:

- **Tasks and Signals now use the production shared overlay host** in their live collection paths, including
  mobile task cards. Focused suites are green: Tasks workspace/mobile **80/80**, Tasks page **45/45**, Signals
  archive **18/18**, and Signals presentation **16/16**. This closes the earlier “route-local panel in both
  consumers” finding at source level; the full suite is now green, while the rendered owner gate remains open.
- **Café Team resolution now has an explicit `none` / `single` / `choice` state** and the production opening
  page renders a real Team picker for multi-Team members. The focused Team-context/Café suite is **17/17**;
  the previous `due[0]` / `myTeams[0]` heuristic is removed from that path.
- **The Signals table received the shared E7 RecordCollection surface wrapper**, so its outer container now
  follows the Tasks collection treatment. This does not yet prove toolbar hierarchy, row density, filters,
  saved views, or feed/table presentation parity; the visual grammar finding remains open.
- **Home Signal origin context now opens through the same shared host** when the shell provider is present;
  Home mounts its `signals` slot and remains underneath the panel. The focused Home Signal suite is **10/10**.
- **Money now has the sanctioned parameterized Detail door.** Summary exposes `View full detail`,
  carrying the active `window` and `cut` to `/money/detail`; direct `?window=7d&cut=channel` hydrates
  the same controls. Focused dashboard evidence is **20/20**. This closes AC-017 / drill pattern B;
  it does not claim contributing-record drill-down because the reporting read-model remains aggregate-only.
- **Collection table header rhythm is now explicitly shared.** The RecordCollection skin gives typed
  table presentations the same 38px E7 header measure as Tasks; Signals retains its domain columns.
  RecordCollection/Signals/Tasks focused evidence is **75/75** plus typecheck and CSS lint. This closes
  one concrete typography/spacing divergence; toolbar hierarchy, presentation parity, and owner render
  review remain open.
- **Route-seam test-environment root cause isolated and contained.** React Router’s jsdom AbortSignal was
  being passed to Node/undici Request; the test boundary now drops that signal for client-side history-only
  tests. The route-seam subset is **8/8**, and the combined shell/overlay suite is **54/54** with no unhandled
  errors. A subsequent single-worker full Vitest run is now **3,234/3,234 across 319 files** with no
  unhandled errors. This is test-harness evidence, not a substitute for live browser Back/Forward proof.
- **Inventory and review-register evidence were refreshed.** `v3-live-inventory.mjs --check` now passes
  at **58 routes / 13 shared jobs / 73 CSS families**. `pre-merge-check.sh` now recognizes current
  `code-quality: PASS` and `security: PASS`; `spec` and `design` intentionally remain blocking.

The branch remains **NO-SHIP**. Still open: spec/design verdict closure, Tasks/Signals toolbar and
presentation parity, Inbox handled/seeded-notification proof,
Follow-ups flag, contributing-record Money drill-down, Issue 10 structured
content/typed embeds (owner-gated), and the owner’s rendered three-width walkthrough. No push or merge has
occurred.

## Responsive collection follow-up — Signals phone grammar (2026-07-22, local)

The remaining responsive interaction gap was concrete and code-owned: Tasks already placed its full
collection configuration behind the shared capture-first `ViewOptionsDisclosure` on phone, while
Signals exposed its entire control stack immediately. Signals now uses the same disclosure behavior
and shared collection-toolbar skin; Signal-specific presentation, filters, grouping, sorting, and
saved views remain intact inside the panel. Desktop keeps the full toolbar unchanged.

Evidence: Signals archive + shared toolbar + Tasks workspace focused tests **82/82**; typecheck,
targeted ESLint, Stylelint, diff check, and live-inventory check pass (**58 routes / 13 shared jobs /
73 CSS families**). This closes the responsive disclosure gap, not the full rendered three-width owner
gate or remaining desktop visual parity judgment. No live render or Supabase start was performed.

The Signal table message opener is also now a native `button` rather than a `span role="button"`.
The existing injected-opener test remains green and now locks `type="button"`; this removes one
remaining hand-rolled keyboard-activation seam without changing the Signal record contract.

The shared Save View editor now restores focus to its trigger on Escape, Cancel, and successful Save;
the Button primitive forwards refs so this contract is testable. CollectionToolbar focused evidence
remains green, including the focus-return assertion.

Inbox page records now use a page-owned `owner="inbox"` slot inside the shared `.record-split`, while
the bell’s ephemeral triage remains `owner="shell"`. The old duplicate Inbox fallback page button was
removed; host chrome owns canonical promotion. Focused Inbox/host evidence is **51/51** plus typecheck
and targeted lint. Seeded-notification/handled proof and live three-width acceptance remain open.

## Cleanup verification — 2026-07-22

The canonical `v3-redesign` worktree is now the only implementation worktree besides the primary
checkout and the E7 prototype. Superseded V3 lanes were removed after their uncommitted residue was
archived outside the repository at `/tmp/gordi-mos-v3-stale-lanes-20260722`; no current product work
was silently discarded. A stale mobile focus-ring override and an outdated Inbox bell test label were
corrected. Focused closure is **71/71**, with typecheck, changed-file ESLint, and Stylelint passing.
This cleanup does not change the NO-SHIP verdict: the full rerun, rendered owner walkthrough, and the
open V3 requirement gaps above still block completion.

## Mockup preservation verification — 2026-07-22

The retained E7 worktree is a runnable reference, not the only historical source. The canonical branch
contains **104 versioned files** under `docs/design-mockups/`, including the archived early IA rounds,
the 2026-07-08 full-redesign A/B/C exploration, the E7 candidate, and the convergence-flow payload.
The mockup payload that had previously existed only as an untracked sibling-worktree artifact was
committed in `962de90`; the verbatim owner-origin, grill, and frustration/buildout extracts are in
`docs/reference/provenance/`. Deleted V3 implementation lanes did not contain unique mockup generations.
The composite oracle remains `owner-directives-index.md` plus the locked decisions and Experience
Contract; E7 is the visual reference, not a snapshot to copy wholesale.

## Fresh current-tip UX/IA/IxD + visual/taste audit — 2026-07-22

This new read-only acceptance pass is grounded in the owner’s verbatim redesign, 50+ QnA,
divergence/convergence, and E7 prompts. Two bounded critics covered integration UX/IA/IxD and visual
cohesion/Impeccable/Taste-equivalent anti-slop checks at local tip `a7eef31` (before this documentation
update). No Supabase, dev server, or broad suite was started. Source guards pass: `v3-live-inventory`
(58 routes / 13 shared jobs / 73 CSS families), RecordCollection conformance, and Storybook matrix
(35 stories / 36 state entries / 3 responsive entries). Existing screenshots are stale; current
computed-style and driven three-width evidence is absent.

### Current findings

| Severity | Finding | Required proof / disposition |
|---|---|---|
| P0 | Task dirty-leave guard is computed but not attached to the live `OverlayEntry`; Esc, Back, or close can discard a dirty RecordField without I2 confirmation. | Attach the guard at the real host seam and drive edit → Esc/Back → retain/discard (FR-V3-009 / AC-V3-008). Pure guard tests are proxy evidence only. |
| P1 | Tasks and Signals still render different table implementations and CSS families. Shared engine/toolbar/outer wrapper is only partial convergence. | Computed-style + driven matrix at 1280/1024/390 for sort, filters, grouping, saved views, open, Back, focus, and responsive disclosure. |
| P1 | Inbox remains a bespoke triage surface outside `RecordCollectionSurface`; All/Unread-only local controls and seeded Bell → queue → record → Back proof are absent. | Treat handled semantics as owner/data-gated; complete the seeded journey and decide its collection-state model. |
| P1 | Deputy remains a separate fixed host and visual contract. Focus restoration is fixed, but stack/geometry still diverge. | Share `RecordPanelHost`/stack or record an explicit owner exception, then drive coexistence and Back. |
| P1 | Task/Signal live RecordViewer anatomy and relation seams are incomplete; adapters expose empty relation arrays. | Driven panel/page/related-record comparison across both record types. |
| P2 | Café user-facing captions, errors, and aria labels still leak “Kitchen”; P-19 is partial. | Add a user-facing string invariant; retain internal `Kitchen*` identifiers if needed. |
| P2 | Token/rhythm drift remains measurable: standalone DataTable 13px, Tasks rows 50px, DESIGN.md E7 table reference 14px/52px; Profile radius 8px vs 12px; record-panel controls 30px vs 32px. | Add computed-style guards, then require fresh owner renders for the composite “one app” verdict. |
| P2 | Native selects are a documented provisional I5 exception, not universal inline-edit conformance. | Owner disposition plus keyboard/blur/Escape proof if the exception remains. |
| P3 | Dead Signals selectors and stale host/router/Profile comments can mislead future audits. The conformance guard covers Tasks paths only, not Signals, Inbox, or Deputy. | Retire/guard stale selectors/comments and expand guard scope in a later hygiene slice. |

### Resolved or stale claims deliberately not repeated

Home Signal host/origin, Home routine Money KPI duplication, Café explicit Team choice, Inbox page host
geometry/Back seam, Deputy focus return, Signals phone disclosure/native opener/Save View focus, and the
old hardcoded Café phone-tab finding are resolved at source level or stale. That does not replace fresh
rendered proof. Owner-only gates remain the final visual/density/card-soup judgment, the strategic
Inbox/Deputy/I5 exceptions, Q1 Signal-on-Home, and Issue 10 typed embeds. **NO-SHIP remains.**

### Automation versus owner eye

Automation can and should prove geometry, computed token parity, panel mode/side/width, duplicate-host
absence, keyboard sort/menu, Esc/Back/focus, dirty-veto, seeded Inbox journey, and horizontal overflow.
Only the owner can ratify whether object-specific row anatomy feels like one coherent app, whether the
Signal feed’s nested cards are intentional or card soup, and whether E7 styling plus the composite IA/IxD
oracle has crossed the “high-schooler obvious” bar. Green source guards are not those decisions.

## Follow-up implementation evidence — 2026-07-22 (local, unpushed)

The Task dirty-leave finding is now closed at the live overlay entry rather than only in a pure guard
unit. The mounted Task tenant attaches/removes its guard as draft dirtiness changes; the shared
confirmation surface owns retain/discard. `AC-V3-008` drives a failed-save draft through Close and
asserts both Cancel (record retained) and Discard (record leaves). Page promotion now preserves the
Task page-mode state through `openPage`.

Focused evidence is **153/153** for the affected Task/overlay/page/confirmation suites, with typecheck,
ESLint, and Stylelint green. This changes the finding from P0 to “source/test closed; rendered and
direct-route browser Back proof open.” The branch remains **NO-SHIP**: Tasks/Signals visual grammar,
Inbox seeded journey, Deputy shared-host/coexistence behavior, RecordViewer anatomy, and the owner’s
three-width acceptance are still open. The Deputy preference is recorded provisionally in OD-REDESIGN-80:
wide adjacent/compact where possible, phone compact-on-top acceptable, never a covering second desktop
drawer. No Supabase or broad render run was performed.

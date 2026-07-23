# Quality model — the standing coverage matrix (Gordi MOS V3)

**Status:** v1 — 2026-07-23 · Branch `v3-redesign` · Owner-directed ("what else am I missing").
**Type:** standing rules. This doc is the *map of what "quality" is decomposed into and which check
owns each piece*. It does not track per-run state (that is `docs/agent-context.md`); it changes when a
**dimension or its owning check** changes.

> **WIRE THESE (Director action — this doc must not be an orphan).** A coverage map nobody links is a
> map nobody reads. Link this file from the three places convention already routes people through:
> 1. **`CLAUDE.md` → "Quality gates & checkpoints"** — one line: "The dimensions of quality and the
>    check that owns each are enumerated in `docs/quality-model.md`; the review battery (OD-REDESIGN-89)
>    is the per-merge slice of it." Put it beside the "Review battery (BLOCKING)" bullet.
> 2. **`docs/agent-context.md`** — in the pointers block: "Coverage matrix (what quality decomposes
>    into, per-dimension status): `docs/quality-model.md`."
> 3. **`docs/design-workflow.md`** — the UI/UX cycle should open by naming this as the target surface:
>    every design-plan states which dimensions its surface touches and cites the owning check.
> Until those three links exist this model is advisory. Wiring them makes it the index the battery,
> the census protocol, and the anatomy spec all hang off.

---

## 0. Two rules that govern the whole model

**The meta-rule (verbatim, binding):**

> **"Any newly discovered failure dimension is added to this model with an owning check the same day —
> gap discovery must converge."**

A defect the owner catches by eye, a divergence a cross-surface audit surfaces, a composition failure a
census misses — each is evidence that *the model was incomplete*, not merely that a surface was wrong.
The response is two-part and same-day: (a) fix the surface, and (b) add or sharpen the **owning check**
in the row below so the class cannot recur unseen. The register of owner-caught defects (D1–D9 in
`docs/plans/2026-07-23-skill-rule-mechanization.md`) and OD-REDESIGN-89's "any owner-caught pixel defect
is a process bug whose class becomes a guard the same day" are this rule in action. Convergence is the
success condition: each round the set of *undetectable* failure classes shrinks toward zero.

**The order-of-operations rule (OD-REDESIGN-87 sequence, binding for NEW work):**

For new surfaces, the quality artifacts are **inputs to the design-plan gate, not discoveries of the
review battery.** A surface is *born conforming*: its declared page anatomy (OD-REDESIGN-90), the
interaction grammar (`docs/interaction-contract.md`), and the journeys it serves (`docs/jtbd.md`) are
handed to `design-architect`/`ui-implementer` **before** code, so composition, verb behavior, and
journey shape are designed in. The battery then **confirms** conformance; it does not *discover* the
structure for the first time. Discovery-in-review is the failure mode OD-87 orders us out of — capture
and grammar precede build; the score gate precedes features. When the battery is *discovering* anatomy
or verb grammar rather than confirming it, the process ran out of order.

---

## 1. The matrix

Legend — **Cadence:** `per-merge` (every UI diff, mechanized/blocking) · `per-surface` (when a surface
is built or materially changed) · `per-milestone` (convergence checkpoints / score gate) · `per-release`
(before a deploy the owner accepts). **Status:** `COVERED` (an owning check exists and runs) ·
`PARTIAL` (a check exists but is scoped-narrow or advisory) · `GAP` (no owning check yet).

### D1 · Element craft
**Means.** Every atom — type size, color, radius, spacing step, shadow, tracking — is a design-system
token on the declared ladder; no raw literals, no off-ladder values, no AI tells (side-stripes, glow,
gradient text).
**Owns it.** *Existing:* `kit-vocab.test.ts` (KIT-VOCAB-FONT/TOKENS/COLOR/RADIUS, `ui/*.css`) +
`GUARD-VOCAB` ratchet (extends the token-vocabulary lock to **all component + shell CSS**, new debt =
failure, counts only go down) — `mos-app/src/components/guard-css-token-vocab.test.ts`. Rules
C1/C2/C3/D-1/D-2/D-3 in `skill-rule-mechanization.md`. *Missing (P1):* wire the `impeccable`
`detect.mjs` detector (≈35 element rules already implemented — side-stripe, glow, gradient-text,
cramped-padding, tight-leading) as a **blocking** gate, not an advisory skill call.
**Cadence.** per-merge.
**Status.** **PARTIAL** → COVERED when the impeccable detector is wired into `pre-merge-check.sh`. The
token-ladder half (the D2/D3 recurring class) is now ratcheted across component CSS; the detector's
per-pixel half still runs advisory.

### D2 · Component quality
**Means.** Each shared component (buttons, fields, toolbar, RecordViewer, state-kit) ships every state —
default/hover/focus/disabled/loading/error/empty — with correct ARIA, and behaves identically wherever
mounted.
**Owns it.** *Existing:* `state-kit.test.tsx` (F1 — LoadingShell is the one loading grammar);
tap-target floor (`tap-targets.css.test.ts`, E1); `one-solid-primary`/`GUARD-PRIMARY` (one primary per
region). *Missing (P1):* Storybook stories per shared component covering all five states + **unscoped
axe** run (OD-REDESIGN-89 battery layer 2) — the `component-interrogation` plan owns building these;
F2 (composed empty state) and F5 (disabled token) are MECHANIZABLE but unbuilt.
**Cadence.** per-surface (when the component changes) + per-merge (the guards that exist).
**Status.** **PARTIAL** → COVERED when Storybook states + axe are wired for the shared engine and
state-rich components (interrogation plan) and F2/F5 land.

### D3 · Page composition (OD-REDESIGN-90)
**Means.** The *order and grouping* of a page's sections serves the reader's jobs — content first and
unclipped, urgency with it, actions as one "what to do" register, provenance/audit last and quiet. The
judgment **no element-level layer makes**: guards/census/storybook all enumerate ELEMENTS, none scores
COMPOSITION.
**Owns it.** *Missing (P0):* `docs/specs/record-page-anatomy.spec.md` — the per-kind JTBD-ordered
anatomy, derived FROM the skills (impeccable content-first/strip-to-essence · taste hierarchy ·
ui-ux-pro-max detail-view) — **is not yet authored** (verified absent 2026-07-23). Plus census
**Step 2.5 — anatomy conformance** (assert rendered section order matches the kind's declared anatomy;
a page whose leading section is not its content FAILS). Provenance micro-copy never repeats per field
(R4 generalized to captions).
**Cadence.** per-surface (anatomy conformance) + defined once per record-kind/destination.
**Status.** **GAP** → PARTIAL the day the anatomy spec lands for the Signal record (the surface that
triggered OD-90) and Step 2.5 is added to the audit protocol; COVERED when every record kind +
destination has a declared, checked anatomy. **Highest-priority open item in the model.**

### D4 · Interaction verbs
**Means.** The seven cross-surface verbs — open/URL-addressability/Back, close/Escape/focus-return,
edit-commit, create, collection grammar, command/search, feedback — behave the *same way for the same
act* on every surface.
**Owns it.** *Existing:* `docs/interaction-contract.md` (binding I1–I8) + the protected-seam guards
(`dirty-leave-guard.ts`/`.test`, Escape-isolation, commit-freeze — red-first still required here per
OD-REDESIGN-88). Conformance is OD-REDESIGN-89 **battery layer 3**. The verb-by-verb audit
(`docs/plans/2026-07-23-interaction-consistency.md`) is the census of record: 35 divergences, 24 ruled
(implement), 10 owe an owner ruling (GAP-1..10). *Missing:* an automated interaction-conformance
harness (currently a manual cross-surface audit) + the 10 owner rulings.
**Cadence.** per-merge (protected-seam guards + conformance check on changed surfaces) + per-milestone
(full cross-surface re-audit).
**Status.** **PARTIAL** — grammar written and mostly obeyed on the engine surfaces; fractured on the
unmigrated ones (Kitchen, Admin/People, Money, Follow-ups/Inbox). Closes as the Tier-1..4 work-order
lands and the 10 GAPs are ruled.

### D5 · Integration seams
**Means.** Data crossing a boundary keeps its meaning: a Signal→Task prefill carries context, an open
record is URL-addressable and survives refresh, RLS lets exactly the right role read/write, a mutation
on page A shows up on page B.
**Owns it.** *Existing:* pgTAP role read/write contracts + tenancy/entity guards
(`supabase/tests/*guard.sql`, `*_tenancy_guard.sql`); curated Playwright E2E for real cross-stack flows;
interaction VERB A (open/addressability/Back). *Missing (P1):* the `deepLinkResolver` is **unwired**
(interaction D-A1) so hard-load restore never runs in prod; Signal→Task ("Create follow-up Task") is
documented + i18n'd but **UNBUILT** (D-D4, ruled by OD-REDESIGN-39).
**Cadence.** per-merge (pgTAP + guards on any auth/RLS/schema diff) + per-milestone (E2E journey suite).
**Status.** **PARTIAL** — the DB seams are guarded; the client-side navigation/prefill seams have named
gaps with rulings already in hand.

### D6 · Journey quality
**Means.** The *whole path* to a goal — capture→triage→act→complete, cold "what do I do now", run-the-day
— is short, loses no context, and never dead-ends. The dimension the element checks structurally cannot
see (each scores one screen).
**Owns it.** *Existing until now: none — this was the biggest gap.* *Just built:* the first journey
audit, `docs/plans/2026-07-23-journey-quality-audit.md` (6 highest-value cross-page journeys walked
live, scored, findings ledgered DO/DEFER). *Missing (P1):* fold the audited journeys into the curated
Playwright E2E set so each journey's shape is a standing regression, not a one-time walk; re-run the
audit per convergence milestone.
**Cadence.** per-milestone (re-walk) + per-merge (once the journeys are E2E regressions).
**Status.** **GAP → PARTIAL** as of the 2026-07-23 audit. COVERED when the top journeys are curated E2E
and re-walked each milestone.

### D7 · App-level IA
**Means.** Five destinations, ≤5 top-level nav, ≤4 options per decision group; every job has one obvious
home; nothing is unreachable or double-homed.
**Owns it.** *Existing:* `docs/specs/nav-five-destinations.spec.md`; the IA mockups in
`docs/design-mockups/` (signed-off, presumption of correctness); census A7 (options-per-decision-point
count) + control-axis census (Step 2, catches duplicate axes / overload). *Missing:* IA coherence
across the *unmigrated* surfaces is judgment-carried (Luna JTBD lens), not mechanized.
**Cadence.** per-surface (control-axis + A7 census) + per-milestone (Luna IA/JTBD lens).
**Status.** **PARTIAL** — the five-destination frame is specced and guarded at the nav level; per-surface
control overload is a census step; whole-app findability is judgment.

### D8 · Copy system
**Means.** Labels are the product's own language (`CONTEXT.md`, De-reference firewall), no jargon
barrier; **every number carries a unit + the decision it supports** (no naked count); errors name the
problem AND the recovery, at the source.
**Owns it.** *Existing:* `GUARD-R2` naked-number guard — **now extended** beyond Tasks to Money /
Objectives / Projects / Admin page-heads (`guard-r2-naked-numbers.test.tsx`, `guard-r2-naked-heads.test.tsx`);
`GUARD-R4` permission-note (≤1 not-permitted reason, names problem). Census **Step 1 (number census)**,
**Step 6 (copy census)** own H1/H4/F4. *Missing:* comprehension ("would a non-technical 15-person-org
user understand this label") is irreducibly census/judgment; error-recovery clauses (H4/F4) are census,
not static.
**Cadence.** per-merge (GUARD-R2/R4) + per-surface (number + copy census).
**Status.** **PARTIAL** — naked-number and permission-note classes are mechanized and broadened;
comprehension + recovery-copy stay census-owned.

### D9 · Motion grammar
**Means.** One authored moment per interaction, exponential ease-out, no bounce/elastic, no animation of
layout properties (width/height/margin), no marquee/decorative pulse; `prefers-reduced-motion` has an
intentional alternative.
**Owns it.** *Existing:* rules E9 + G6 in the mechanization inventory; the `impeccable` detector
implements `checkMotion` + marquee/pulse scans. *Missing (P2):* **no repo test or wired gate covers
motion** today — the detector runs advisory only. Build a source-scan (flag transitions on layout
properties, overshoot cubic-beziers, `animate-bounce`) + assert a non-nulling reduced-motion block.
**Cadence.** per-merge (once the scan is wired).
**Status.** **GAP** — lowest-coverage dimension after page composition. Closes with the motion
source-scan + wiring the detector's motion checks as blocking.

### D10 · Scale extremes
**Means.** Every surface holds up at 0 / 1 / many / huge: empty state composed, one-item not awkward,
long strings don't clip the identity, big counts don't break layout, deep lists scroll not crush.
**Owns it.** *Existing:* census **Step 3 (state-matrix)** + **Step 4 (identity/geometry census)**;
identity-no-truncation intent (H2); `EmptyState` grammar (F2). *Missing (P1):* the census's biggest
hole — in the R2 sweep **>half of several routes rendered only empty/awaiting** (Money populated,
Inbox populated triage, Cafe started-panel all NOT REVIEWED). Seed real data + re-capture from a FROZEN
worktree (sweep DO-8) is the open work; H2 identity-truncation Playwright guard at 3 widths is unbuilt.
**Cadence.** per-surface (state-matrix + geometry census) + per-merge (H2 guard once built).
**Status.** **PARTIAL** — the census *step* exists and is binding, but the populated/loading/error
states of high-value routes are un-audited (seed + frozen-recapture gap).

### D11 · Deep accessibility
**Means.** Full primary flow completable keyboard-only, visible focus at every stop, roles that are
*actually implemented* (a `role=listbox` that answers arrow keys), color never the sole meaning carrier,
AA contrast everywhere including hover.
**Owns it.** *Existing:* unscoped **axe** (OD-89 battery layer 2, being wired via interrogation);
`auth/guards.test.tsx`; census **Step 5 (affordance & a11y)** — icon-only names, color-only status,
keyboard-only journey walk; rules E5/G1–G5, D-4 (contrast), D-11 (color-not-sole). *Missing (P1/P2):*
the "listbox contract implemented nowhere" gap (interaction D-F3/GAP-8 — four pickers announce roles
they don't fulfill); the `impeccable` contrast engine (`checkColors` + `screenshot-contrast`) is
**unwired** (rule D-4, the classic sampled-audit miss).
**Cadence.** per-surface (axe + a11y census) + per-merge (contrast engine once wired).
**Status.** **PARTIAL/GAP** — axe wiring in progress; keyboard-journey + color-only are census-owned;
contrast detector and the real listbox keyboard are named, unbuilt gaps.

### D12 · Responsiveness & zoom
**Means.** The information hierarchy and command meanings hold at 390 / 768 / 1024 / 1280 / 1870; touch
targets ≥44px on phone; content doesn't strand in ultra-wide voids or clip on narrow; browser zoom /
200% text does not break layout.
**Owns it.** *Existing:* `e2e/guards.geometry.spec.ts` (computed-geometry at widths); tap-target phone
floor (E1) + the widen-to-every-control extension (E2, planned); census runs at 1280/1024/390; the
flex-basis-balloon guard (`guard-flex-basis-balloon.css.test.ts`) and identity-phone guards. *Missing
(P2):* **browser zoom / 200%-text is checked nowhere**; E2 selector-widening still pending; several
routes' responsive states un-captured (overlaps D10).
**Cadence.** per-merge (geometry + tap-target guards) + per-surface (3-width census).
**Status.** **PARTIAL** — width-breakpoint geometry is guarded; zoom/text-scale is an unowned gap.

### D13 · Performance-as-UX
**Means.** Perceived speed: the ONE loading grammar shows fast, optimistic writes feel instant with an
honest pending/saved/error, no layout shift on load, no wait without feedback, no janky interaction.
**Owns it.** *Existing:* `state-kit` LoadingShell (F1); the feedback-verb audit (interaction VERB G —
loading/empty/error/toast/optimistic divergences); OD-REDESIGN-22 pending/saved/error/retry. *Missing
(P2):* **no perceived-performance budget or CLS/interaction-latency gate exists** — coverage timing
budgets guard test-suite speed, not app UX. A journey-level "wait/feedback gap" is caught only by the
D6 journey audit today.
**Cadence.** per-milestone (journey wait-gap review) + per-release (perf budget, once defined).
**Status.** **GAP** — feedback *grammar* is covered; feedback *timing/latency/CLS* as a measured UX
budget is unowned.

### D14 · Cross-page coherence
**Means.** The app reads as **one tidy product, not several inherited apps** — same toolbar, same
open-grammar, same rhythm, same feedback channel across every destination.
**Owns it.** *Existing:* the cross-surface interaction audit (`interaction-consistency.md` — the
explicit "one grammar on paper, four-to-eight grammars in the running app" finding); rule A10 (whole-
product coherence) is **explicitly owner/Luna judgment** ("source guards cannot answer it"). Census runs
per-route; coherence is the *seam between* routes. *Missing:* a cross-route coherence pass is judgment
(Luna JTBD lens, OD-89 layer 4); the mechanical lever is pulling the unmigrated surfaces onto the shared
machinery (interaction Tier-2 work-order).
**Cadence.** per-milestone (Luna coherence lens + cross-surface re-audit).
**Status.** **PARTIAL** — the fractures are enumerated and the fix work-order exists; coherence itself
is judgment-scored, converging as surfaces migrate onto the shared engine.

### D15 · Taste ceiling
**Means.** The surface clears the score gate: **Nielsen ≥32 / anti-slop >8.5 / no axis below E7**
(OD-REDESIGN-87), and reads as authored-for-THIS-product, not template output.
**Owns it.** *Existing:* **Luna**, live-driving fresh attested renders, floor-ruled, the OFFICIAL
verdict (OD-REDESIGN-89 battery layer 4). Binding rule: **never self-score** — the Director's self-scores
over-credit (the 34-vs-26 incident). Rules A8/A10/B9/H7 are the judgment residue the detectors can't
reach. *Missing:* nothing to build — this is deliberately judgment; the guardrail is that it runs LAST
and INDEPENDENT, only after census Steps 0–6 produce their artifacts.
**Cadence.** per-milestone (score gate) + per-release.
**Status.** **JUDGMENT (by design)** — owned, not a gap. The failure mode to guard is a score quoted
*without* the six census artifacts (OD-89: "score without them is void").

### D16 · Product fit
**Means.** The surface serves the job the person actually came to do (`docs/jtbd.md` — the 23 journeys +
E7 calibration anchors A1–A14): decision-relevant facts before analysis, next authorized action adjacent
to the evidence, no Signal-with-Status / naked-KPI / Team-as-actor violations.
**Owns it.** *Existing:* the **retained JTBD/product-intent lens** carried by Luna into the battery
(OD-REDESIGN-89 layer 4, oracle `docs/jtbd.md`); the spec layer selects which journeys a feature serves
and converts them to EARS + Given/When/Then; `qa-acceptance` proves each `AC-###` at its owning layer.
The E7 anchors A1–A14 are the deliberate defects the intent lens must catch. *Missing:* fit is
per-journey judgment, not mechanizable — the safeguard is that every spec names its journeys and the
intent lens runs against the anchors.
**Cadence.** per-surface (spec journey-selection + intent lens) + per-milestone (anchor re-check).
**Status.** **PARTIAL** — the oracle and the lens exist and are wired into the battery; fit is judged
per surface, converging as specs consistently cite their journeys.

---

## 2. Status at a glance

| # | Dimension | Cadence | Status | What closes the gap |
|---|---|---|---|---|
| D1 | Element craft | per-merge | PARTIAL | Wire `impeccable` detector as blocking (token-ladder half already ratcheted) |
| D2 | Component quality | per-surface | PARTIAL | Storybook states + axe for shared components; F2/F5 guards |
| D3 | **Page composition (OD-90)** | per-surface | **PARTIAL** | Spec AUTHORED (`docs/specs/record-page-anatomy.spec.md`, census Step 2.5 defined); Signal conformance in flight; Task/Follow-up conformance owed (FR-ANAT-009/010) |
| D4 | Interaction verbs | per-merge | PARTIAL | Land Tier-1..4 work-order; get the 10 owner rulings; conformance harness |
| D5 | Integration seams | per-merge | PARTIAL | Wire `deepLinkResolver`; build Signal→Task (OD-39) |
| D6 | Journey quality | per-milestone | GAP→PARTIAL | This audit done; fold journeys into curated E2E |
| D7 | App-level IA | per-surface | PARTIAL | Control-axis census on unmigrated surfaces + Luna IA lens |
| D8 | Copy system | per-merge | PARTIAL | GUARD-R2 broadened; comprehension/recovery stay census |
| D9 | Motion grammar | per-merge | **GAP** | Motion source-scan + wire detector motion checks |
| D10 | Scale extremes | per-surface | PARTIAL | Seed real data + frozen-worktree recapture (sweep DO-8); H2 guard |
| D11 | Deep accessibility | per-surface | PARTIAL/GAP | Finish axe wiring; wire contrast engine; build real listbox keyboard |
| D12 | Responsiveness & zoom | per-merge | PARTIAL | Widen E2 tap-target selectors; add 200%-zoom/text-scale check |
| D13 | Performance-as-UX | per-milestone | **GAP** | Define a perceived-perf / CLS / interaction-latency budget |
| D14 | Cross-page coherence | per-milestone | PARTIAL | Migrate unmigrated surfaces onto shared engine; Luna coherence lens |
| D15 | Taste ceiling | per-milestone | JUDGMENT | Owned by Luna (never self-score); guard = artifacts-before-score |
| D16 | Product fit | per-surface | PARTIAL | Specs cite their journeys; intent lens vs A1–A14 anchors |

**Reading the map.** Two dimensions are genuine **GAPs with no owning check** — **D3 page composition**
(the OD-90 finding: every battery layer enumerates elements, none judges composition) and **D9 motion**
and **D13 performance-as-UX**. D3 is the highest priority: it is *why* a mechanically-clean, census-passed,
storybook-covered Signal record still read as "not neat and tidy" to the owner. **D6 journey quality**
was the fourth structural blind spot and is closed to PARTIAL by the companion audit. Everything else is
PARTIAL (a real check exists, scoped narrow or advisory) or deliberate JUDGMENT (Luna, by design).

The dominant PARTIAL→COVERED pattern is proven and repeated: the repo has shown the **source-scan CSS-lock**
works (kit-vocab → GUARD-VOCAB ratchet) and the **census enumeration** works; the remaining element-craft
and a11y coverage is *widening existing scans past `ui/`* and *wiring the already-implemented `impeccable`
detector as a gate* rather than authoring new machinery.

## 3. How the checks compose (the layered battery, per OD-REDESIGN-89)

For a per-merge UI change the owning checks stack in this order — all green + ledgered as **artifacts,
not essays**, in `docs/reviews/<branch>.md` before any owner viewing:

0. **Mechanical guards** (D1, D2-partial, D8, D12) — wired into `pre-merge-check.sh`; a UI diff cannot
   merge on prose.
1. **Census protocol Steps 1–6** (D8, D10, D11 + Step **2.5 anatomy** for D3 once it lands) — per-element
   enumeration; a score without the artifacts is void.
2. **Storybook states + unscoped axe** (D2, D11) — changed shared components.
3. **Interaction-contract conformance** (D4, D5, D14) — the verb grammar.
4. **Luna, live-driving, floor-ruled** (D15, D16, D7-coherence, D3-judgment) — OFFICIAL verdict carrying
   the JTBD intent lens; runs LAST and INDEPENDENT; never self-scored.

Per-milestone adds the **journey re-walk** (D6) and the **score gate** (D15, OD-87 step 3). Per-release
adds cross-page coherence (D14) and — once defined — the perf budget (D13).

---

## 4. Skill employment (audit of the auditors)

Enumerating each vendored skill's **full command surface** vs. its current use (Standing Audit Program
Step 1b) exposed unused flows. This section is the standing map of *which skill owns which audit move*
and *which flows are still on the shelf*; the meta-rule keeps it current (a newly-used flow moves to
"in use"; a newly-discovered gap adds a row same-day). Owner directive 2026-07-23: **skills are the
method** — a brief that needs one of these concerns says "invoke the skill and follow ITS flow", never
a paraphrase (paraphrases drop the rigor: the detector, audit-flow, and kit-normalization incidents).

| Skill | Command surface (what it can do) | In use | On the shelf → scheduled |
|---|---|---|---|
| **impeccable** | detect · critique/audit · distill · document/extract · polish · live | detect ✅ (element gate, D1) · critique/audit ✅ (census method) · distill ✅ (anatomy law, D3) · live ✅ (reserved: owner walkthrough) | **document/extract — UNUSED** → generate the kit's component documentation from code (design-system stewardship debt, D2). **polish — UNUSED** → the micro-polish flow runs once per surface *after* lock (the last-mile craft pass). |
| **taste** | §7 guards · Rules 4/5 · §10 preflight | §7 ✅ (guards) · Rules 4/5 ✅ | **§10 preflight — inconsistently used** → now a standing line in the `ui-implementer` brief template (every UI lane cites it). |
| **ui-ux-pro-max** | `ux` · `forms` · `mobile` · `a11y` · `motion` · `data-viz` · … domains | `ux` ✅ mined into the rule inventory | **forms / mobile / a11y / data-viz — partially mined** → Step-2 extraction into the rule inventory (D17 data-viz for the Money chart; forms/mobile/a11y for the backfill sweep). |
| **design-system** | three-layer tokens · component specs | ✅ tokens + component-specs | — |
| **design-review** | designer's-eye QA (dissolved into the OD-89 battery) | ✅ folded into the layered battery (census + Luna) | — (no standalone essay review; OD-89). |
| **superpowers** | brainstorming · writing-plans · tdd · verification · reviews | ✅ planning + TDD/verification + code review (OD-88) | — (owns planning tier; gstack's planning tier is NOT also used). |
| **gstack** | `/qa` · `/cso` · `/ship` · `/land-and-deploy` · `/canary` | ✅ `/cso` security · ship/deploy | `/qa` **overlaps the census** → boundary recorded: the census owns pre-merge browser QA; **gstack `/qa` is reserved for post-deploy smoke** (telemetry stays `off`). |

**Preflight (binding).** Before relying on any skill, confirm integrity (SKILL.md present, scripts
runnable) — vendoring gaps fail silently; repair via `scripts/vendor-skills.sh`, never work around.

## 5. The coverage register (the denominator)

`docs/audits/REGISTER.md` + `docs/audits/surfaces.json` are the **coverage authority** for this whole
model: they enumerate every surface × persona-class the dimensions above are audited *against*, and
record each surface's generation, locked commit, pins, and never-audited (DUE) cells. The dimensions
here answer *"what is quality decomposed into?"*; the register answers *"which surfaces have we checked
it on, and when?"* — the two are read together. `scripts/audit-staleness.sh` computes FRESH /
STALE-PINNED / DUE; `scripts/audit-register.sh {bump|lock}` drives the generation lifecycle;
`scripts/pre-merge-check.sh` blocks a UI merge whose surface is neither locked nor bumped. Full design:
`docs/plans/wise-discovering-frog.md`.

---

*Provenance: `docs/plans/2026-07-23-skill-rule-mechanization.md` (audit protocol + D1–D9 register) ·
`2026-07-23-interaction-consistency.md` (verb grammar, 35 divergences) · `2026-07-23-census-sweep-r2.md`
(per-route findings, NR-state gaps) · `2026-07-23-journey-quality-audit.md` (D6, companion) ·
`docs/decisions.md` OD-REDESIGN-87/88/89/90 · `docs/jtbd.md` (product oracle). Guard tests cited by
filename under `mos-app/src/**/guard-*` + `mos-app/src/components/ui/*.test.*` + `mos-app/e2e/`.*

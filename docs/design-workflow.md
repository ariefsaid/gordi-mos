# UI/UX Workflow — Gordi MOS

The design analog of the code-side SDD→TDD→BDD loop (`docs/director-playbook.md` §2). The **Director**
orchestrates this and **owns the human-UX checkpoint** — taste is the owner's gate, the way spec
sign-off is. `DESIGN.md` at repo root is the single source of truth. Adapted from PMO's
`docs/design-workflow.md`; the layered design battery (OD-REDESIGN-89: guards → census → stories/axe → interaction-contract → Luna+JTBD; supersedes the former four-lens essay battery) and the "e2e
encodes the natural journey" rule are inherited because PMO paid for them with real shipped defects —
PMO added the fourth lens (Product/Intent, JTBD) after intent-failures shipped clean past code review
and the first three lenses. MOS adopts the lens and its oracle (`docs/jtbd.md`); the content is Gordi's
own (its roles, screens, domain), not PMO's product.

## 1. Phase 0 — redesign prototype first
The app exists but has never been used. For the E7 redesign, existing routes and mockups are evidence;
`DESIGN.md` remains the identity/token authority and ADR-0025 plus OD-REDESIGN-1..55 govern structure.

1. **Consolidate** — `design-architect` updates the existing working set into one coherent interactive
   prototype, not another set of competing IA options.
2. **Prove the operating model** — demonstrate Home, Work, Inbox, role-gated Money/People/Admin,
   Café/Ecommerce/Roastery Modules, record-panel navigation, Action Launcher, Deputy, and role/scope
   differences. Use realistic scenarios spanning a Café Run, monthly close, Signal→Task, Standard
   adoption, cross-Team management, and Admin access configuration.
3. **Verify the oracle** — confirm current `docs/jtbd.md` journeys cover the prototype brief and update
   them only for genuinely new outcomes, then run the layered design battery (OD-REDESIGN-89) on desktop and phone.
4. **Owner approves** — record approval/redlines in `docs/decisions.md`; redlines loop back to the
   prototype.
5. **Gate** — no redesign SDD or implementation proceeds until the owner approves the prototype.

Mockup rules: use `DESIGN.md` tokens, realistic Gordi data, canonical domain language, working links and
interactions, and explicit loading/empty/error/permission states where they affect the tested journeys.

> **Lens D applies to mockups too.** A mockup can — and should — be graded against the screen's job
> story (`docs/jtbd.md` §2) **before any code exists**. When `design-architect` shapes a key-screen
> mockup, it walks the Lens-D 5 questions (§2.3d) for that screen's primary role: does the mockup put
> the decision-relevant info above the fold, with the one next action adjacent, in MOS's own language?
> Catching an intent miss at the mockup gate is far cheaper than at the built-UI review. This does NOT
> change the mockup-first model — it adds a check to it; §1 steps 1–4 are otherwise unchanged.

## 2. Per-UI-issue loop (Phase 1 on)
Slots into the Director per-issue loop **between Build and Accept** (a feature's data/logic lands
under TDD, then its UI is designed, built, and reviewed). The **BDD authoring rule** still governs the
Accept step: tests encode the user's real journey to the goal and assert that goal — when a UI change
alters the *intended* journey, update the e2e *steps*, never weaken the goal-oracle.
1. **Design-plan** *(`impeccable shape` + `ui-ux-pro-max` `plan`)* — `design-architect` → layout,
   component breakdown, all states (loading / empty / error / edge), responsive breakpoints, WCAG-AA
   a11y, and which `DESIGN.md` tokens each piece uses — **anchored to the owner-picked Phase-0 mockup**
   where one exists. (May be a `## Design` section in the eng-planner plan.)
2. **UI-implement** *(`ui-ux-pro-max` `ui-styling` + `build`; `taste` discipline; `impeccable`
   `harden`/`adapt`/`animate`/`clarify` per plan)* — `ui-implementer` builds strictly to tokens + the
   design-plan; all states + responsive + a11y; TDD component tests (Vitest/RTL). No raw hex/spacing.
   **Builds to lens (b)'s naturalness invariants up front** (co-located primaries, no needless state
   transitions, convention placement, post-action feedback, mental-model match — the binding list in
   `.claude/agents/ui-implementer.md` "IxD / flow-naturalness alignment") and escalates plan-vs-naturalness
   conflicts instead of building or silently fixing them.

   **V3 owner-directed fast path:** for the current redesign's visual/IxD convergence seams, the
   worker may implement the smallest visible end-to-end behavior before writing the full red test
   harness. It must then run a bounded smoke check, render the real surface for the owner's eye,
   and add/tighten goal-level regression tests before integration. This is a sequencing exception,
   not a quality waiver: proxy assertions, unverified code, and schema/security shortcuts remain
   prohibited.
3. **Design-review — the LAYERED BATTERY (OD-REDESIGN-89; census artifacts, not lens essays)** *(read-only; renders + screenshots the running
   app at the plan's breakpoints)*. Every UI review runs **all four** lenses, each **explicitly
   directed** — a single generic "UX review" prompt reliably hits only the first and misses the others
   (this gap let real IxD/IA defects ship in PMO; PMO then added a fourth lens after intent-failures
   shipped past the first three). Findings write to `review/*.md` (gitignored scratch — durable findings
   go to `docs/backlog.md`). **Every design-review dispatch carries a SCOPE CARD** (what this step
   delivers vs what is deferred to later steps) — the owner's Fork-2 anti-pedantry directive
   ("provide the context in full… so it doesnt gets too pedantic"): deferred future-step work is
   not a defect.
   - **(a) Visual / correctness** *(`design-review` engine + `impeccable critique`/`audit`; `taste`
     AI-tells; `ui-ux-pro-max` `review`)* — token fidelity, hierarchy, all states, AI-slop, WCAG-AA,
     interaction perf, vs `DESIGN.md` + the design-plan + the owning mockup. **Includes the MANDATORY
     computed-style parity step** (see `design-reviewer.md` Lens (a)): render the owning mockup AND the
     app, `getComputedStyle`-diff the same element on each load-bearing surface (rail incl.
     **selected-state** + panel bg, cards, rows, buttons, badges, ⌘K). "Tokens in-palette" is a proxy
     that passes on the WRONG token — measure the composed result, don't eyeball screenshots. This is the
     check that let the rail's washed-out active-state ship past every stage (2026-07-18, owner-caught).
   - **(b) IxD / task-flow naturalness** *(`impeccable critique`: Nielsen-10 scored + cognitive-load +
     persona walkthrough)* — for each role's REAL tasks (a manager triaging attention, an operator
     completing a Process Run or sharing a Signal, Arief scanning ownership), walk the journey and flag
     friction, convention violation, needless state transitions, information overload, mental-model
     mismatch. *Naturalness, not correctness — scoped to flow-smoothness, not job-fit (that is Lens D).*
   - **(c) IA / structure & navigation** — **one canonical home/URL per entity**, no list/route
     overlap, no entry-point-dependent rendering, coherent lifecycle presentation, consistent
     breadcrumb/back. *Structure, not flow.*
   - **(d) Product / Intent (JTBD cognitive walkthrough)** *(`impeccable critique` run WITH the
     directed Lens-D prompts, against the oracle)*. **Oracle: `docs/jtbd.md`** (the Gordi role ×
     job-story map). Lens D has no aesthetic of its own — it **grades the screen against its job story
     for the primary role**. Read `docs/jtbd.md` §2 for the screen's job row first, then interrogate the
     **5 questions**: **1. Job** — what job did the user come here to do (state it as a job story)?
     **2. Expectation** — does the user *expect* this affordance HERE, named in Gordi's language
     (`CONTEXT.md`)? **3. Priority/placement** — is the decision-relevant information above the fold
     (on Home, does the role-aware attention brief stay primary)? **4. Actionability** —
     *"so what / now what?"* — can the user act in one step, with the next action adjacent? **5.
     Mental-model consistency** — do analogous MOS objects share one paradigm, including the
     fact-vs-work boundary and layered visibility/mention rules (`jtbd.md` §3)? Lens
     D must always catch the three Gordi calibration anchors (`jtbd.md` §5): **A1** a "Review"/"Approve"
     verb on a Daily Log entry (a log entry is *read, not reviewed* — OD-P2-15/16); **A2** a write
     affordance on the upward weekly-update review pane (v1 review is READ-ONLY — OD-P2-12); **A3** a
     downward/lateral weekly-update view (visibility is upward-only — OD-P1-3).
     *(E6-era anchors: Daily Log/Weekly Update are retired — OD-REDESIGN-33. For redesign-era reviews,
     use the E7 replacements: **A1′** a workflow/status/resolve verb on a Signal (fact, not work);
     **A2′** Acknowledge treated as ownership/commitment or Signal treated as a promoted Task; **A3′**
     sideways sibling-Team visibility without an explicit mention. See OD-REDESIGN-36/39/43/47.)* These pass code review +
     Lenses A/B/C but fail the user's actual job. *Job-fit, not flow-smoothness.* **Lens D runs on both
     rounds** — the Phase-0 mockup (§1) and the built UI here — since the job story does not need a
     running app.
4. **Fix round (if needed)** — issues route back to `ui-implementer`; `design-reviewer` re-checks
   with before/after. Repeat until ship-clean.
5. **Owner visual UX sign-off** — the owner approves the look on a real artifact.
6. **Merge** — Director merges within the signed spec (code-side gates still apply).

## 3. The Human-UX improvement loop (distinct)
Taste cannot be automated like correctness, so polish runs as an explicit owner-gated loop, separate
from the per-issue build:
1. Produce a **look-at-able artifact** — preview URL / screenshots of the running app (or, in Phase 0,
   the mockup file itself).
2. **Owner directed feedback** — the owner points at what to change.
3. `design-reviewer` / `ui-implementer` (or `design-architect` for mockups) implement and return
   **before/after**.
4. Repeat until the owner **signs off**.

## 3a. e2e encodes the NATURAL journey, not the app's current shape
The review battery **discovers** UX issues; **e2e locks the observable ones so they can't regress.**

## The generation lifecycle (Standing Audit Program, owner-approved 2026-07-24)

Every surface lives a **generation lifecycle** tracked in `docs/audits/REGISTER.md`
(`surfaces.json` machine half; `scripts/audit-register.sh bump|lock|status`):

1. **BUMP** — the Director opens a deliberate build/redesign lane for the surface (recorded).
2. **BATTERY** — once per generation: census Steps 1–6 + anatomy Step 2.5
   (`docs/plans/2026-07-23-skill-rule-mechanization.md`, `docs/specs/record-page-anatomy.spec.md`),
   stories + axe, interaction-contract conformance, the Luna leg at the next milestone pass.
3. **RATIFY** — grammar/anatomy sign-off recorded (never pin an unratified design).
4. **LOCK** — the passing state becomes mechanical pins (structural guards, play-tests, goal tests);
   regression is pins-per-merge, free; `pre-merge-check.sh` blocks UI diffs on unlocked+unbumped
   surfaces.

Re-audit happens ONLY on: a new bump · pin-insufficiency (a defect slipped past green pins = process
bug → new pin + targeted re-audit) · the milestone Luna pass. Small fixes ride the pins — no blanket
re-censusing. Quality dimensions and their owning checks: `docs/quality-model.md`.

Author each acceptance test to the user's *ideal, conventional* journey and assert the
convention-invariants + expected post-states — so the test is RED until the app behaves naturally.
The PMO anti-pattern to avoid: authoring the e2e to the app's current steps, which keeps an unnatural
flow green. **Every confirmed IxD/IA/intent finding becomes a regression invariant at the lowest
sufficient layer** — observable flow/structure → e2e/component test; data-logic → unit/pgTAP. (The
three Lens-D calibration anchors in `docs/jtbd.md` §5 are themselves the standing intent-regression
line — if the lens stops catching them, it has drifted.)

## 4. Storybook
Only when/if a shared component library is extracted (post-MVP, and only after both PMO and MOS show
repeated use of the same components — see the brief's DRY caution). Not before.

## 5. Code-agent → UI/UX-agent analog
| Code-side agent | UI/UX analog | Role |
|---|---|---|
| spec-miner / eng-planner | **design-architect** | steward adopted `DESIGN.md`; Phase-0 mockups (Lens-D checked at the mockup gate); per-issue design-plan |
| implementer | **ui-implementer** | build/refactor UI to tokens + plan; TDD component states; all states + responsive + a11y |
| spec-reviewer + code-quality-reviewer | **design-reviewer** | render + screenshot; **layered battery** (guards → census Steps 1–6 → interaction-contract → JTBD intent vs `DESIGN.md` + plan + mockup + `docs/jtbd.md`); read-only |
| Director (main session) | **Director (main session)** | orchestrates the loop; owns the **human-UX checkpoint** |

### Skills → exact commands per agent (one owner per command — no overlap)
| Agent | Primary | Secondary / checklist | Not used |
|---|---|---|---|
| **design-architect** | `impeccable shape` (mockups + per-issue plans); `ui-ux-pro-max` `plan` + `design-system` vocabulary | `design-consultation` (format only); `taste` (states/a11y/anti-slop into mockups + plans); `docs/jtbd.md` (Lens-D job stories at the mockup gate) | design-consultation greenfield brand interview; `impeccable document/extract` (nothing to reverse-engineer — DESIGN.md is adopted) |
| **ui-implementer** | `ui-ux-pro-max` `ui-styling` + `build`/`implement`; `taste` (discipline) | `impeccable` `harden`/`adapt`/`animate`/`optimize`/`clarify`/`layout`/`typeset` — per plan only | `impeccable live` (localhost browser loop) |
| **design-reviewer** | `design-review` (render→screenshot→audit) | `impeccable` `critique` + `audit` (the latter run WITH the directed Lens-D prompts vs `docs/jtbd.md`); `taste` AI-tells/pre-flight; `ui-ux-pro-max` `review`/`check` | — |

## 6. Skill caveats
- **impeccable** — phone-home / telemetry disabled (vendored copy); use offline.
- **ui-ux-pro-max** — Gemini generative sub-skills are **excluded**; use only its reference data
  (palettes / font-pairs / UX rules / anti-patterns) + design-system / ui-styling sub-skills.
- **taste** — its specific opinionated aesthetic **yields to `DESIGN.md` identity**; use it for the
  craft discipline (states, perf, a11y, AI-tells), not to re-skin the app.

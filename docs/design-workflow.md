# UI/UX Workflow — Gordi MOS

The design analog of the code-side SDD→TDD→BDD loop (`docs/director-playbook.md` §2). The **Director**
orchestrates this and **owns the human-UX checkpoint** — taste is the owner's gate, the way spec
sign-off is. `DESIGN.md` at repo root is the single source of truth. Adapted from PMO's
`docs/design-workflow.md`; the 3-lens battery and the "e2e encodes the natural journey" rule are
inherited because PMO paid for them with real shipped defects.

## 1. Phase 0 — mockup-first (MOS-specific; replaces PMO's reverse-engineering Foundation)
MOS is greenfield, so the Foundation inverts: instead of extracting a design system from an existing
app, we **adopt** PMO's owner-approved `DESIGN.md` (already copied to repo root — identity authority,
never re-invent) and **mock the product before building it**.

1. **IA proposals** — `design-architect` writes 2–3 competing static HTML IA proposals to
   `docs/design-mockups/proposal-IA-<n>-<slug>.html` (shell + nav + one populated screen each),
   resolving the brief's open "first navigation IA for /mos" question into concrete options.
2. **Key-screen mockups** — for the first slice: task list with RACI ownership, task detail,
   weekly update (write + review), daily ops feed. `docs/design-mockups/mock-<screen>.html`.
   Realistic Gordi data (names, business units, real-sounding tasks) — never lorem.
3. **Owner picks** — the owner reviews in a browser, picks an IA + confirms/redlines screens.
   Picks are recorded in `docs/decisions.md`; redlines loop back to `design-architect`.
4. **Gate** — no app scaffold, spec, or UI build proceeds until the Phase-0 picks are signed off.
   The chosen mockups become the design-plan anchors for every Phase-1/2 UI issue.

Mockup rules: self-contained single HTML files, inline CSS using `DESIGN.md` token VALUES with the
token NAME in a comment; an HTML comment block at the end lists tokens used, open questions, and any
proposed new tokens (e.g. RACI badge colors) flagged for owner sign-off.

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
3. **Design-review — the standing THREE-LENS battery** *(read-only; renders + screenshots the running
   app at the plan's breakpoints)*. Every UI review runs **all three** lenses, each **explicitly
   directed** — a single generic "UX review" prompt reliably hits only the first and misses the other
   two (this gap let real IxD/IA defects ship in PMO). Findings write to `review/*.md` (gitignored
   scratch — durable findings go to `docs/backlog.md`).
   - **(a) Visual / correctness** *(`design-review` engine + `impeccable critique`/`audit`; `taste`
     AI-tells; `ui-ux-pro-max` `review`)* — token fidelity, hierarchy, all states, AI-slop, WCAG-AA,
     interaction perf, vs `DESIGN.md` + the design-plan + the Phase-0 mockup.
   - **(b) IxD / task-flow naturalness** *(`impeccable critique`: Nielsen-10 scored + cognitive-load +
     persona walkthrough)* — for each role's REAL tasks (manager triaging the week, ops user filing a
     daily update, Arief scanning ownership), walk the journey in the running app and flag workflow
     friction, convention violation, needless state transitions, information overload, mental-model
     mismatch. *Naturalness, not correctness.*
   - **(c) IA / structure & navigation** — **one canonical home/URL per entity**, no list/route
     overlap, no entry-point-dependent rendering, coherent lifecycle presentation, consistent
     breadcrumb/back. *Structure, not flow.*
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
Author each acceptance test to the user's *ideal, conventional* journey and assert the
convention-invariants + expected post-states — so the test is RED until the app behaves naturally.
The PMO anti-pattern to avoid: authoring the e2e to the app's current steps, which keeps an unnatural
flow green. **Every confirmed IxD/IA finding becomes a regression invariant at the lowest sufficient
layer** — observable flow/structure → e2e/component test; data-logic → unit/pgTAP.

## 4. Storybook
Only when/if a shared component library is extracted (post-MVP, and only after both PMO and MOS show
repeated use of the same components — see the brief's DRY caution). Not before.

## 5. Code-agent → UI/UX-agent analog
| Code-side agent | UI/UX analog | Role |
|---|---|---|
| spec-miner / eng-planner | **design-architect** | steward adopted `DESIGN.md`; Phase-0 mockups; per-issue design-plan |
| implementer | **ui-implementer** | build/refactor UI to tokens + plan; TDD component states; all states + responsive + a11y |
| spec-reviewer + code-quality-reviewer | **design-reviewer** | render + screenshot; 3-lens audit vs `DESIGN.md` + plan + mockup; read-only |
| Director (main session) | **Director (main session)** | orchestrates the loop; owns the **human-UX checkpoint** |

### Skills → exact commands per agent (one owner per command — no overlap)
| Agent | Primary | Secondary / checklist | Not used |
|---|---|---|---|
| **design-architect** | `impeccable shape` (mockups + per-issue plans); `ui-ux-pro-max` `plan` + `design-system` vocabulary | `design-consultation` (format only); `taste` (states/a11y/anti-slop into mockups + plans) | design-consultation greenfield brand interview; `impeccable document/extract` (nothing to reverse-engineer — DESIGN.md is adopted) |
| **ui-implementer** | `ui-ux-pro-max` `ui-styling` + `build`/`implement`; `taste` (discipline) | `impeccable` `harden`/`adapt`/`animate`/`optimize`/`clarify`/`layout`/`typeset` — per plan only | `impeccable live` (localhost browser loop) |
| **design-reviewer** | `design-review` (render→screenshot→audit) | `impeccable` `critique` + `audit`; `taste` AI-tells/pre-flight; `ui-ux-pro-max` `review`/`check` | — |

## 6. Skill caveats
- **impeccable** — phone-home / telemetry disabled (vendored copy); use offline.
- **ui-ux-pro-max** — Gemini generative sub-skills are **excluded**; use only its reference data
  (palettes / font-pairs / UX rules / anti-patterns) + design-system / ui-styling sub-skills.
- **taste** — its specific opinionated aesthetic **yields to `DESIGN.md` identity**; use it for the
  craft discipline (states, perf, a11y, AI-tells), not to re-skin the app.

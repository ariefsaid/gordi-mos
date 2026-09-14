# Current owner correction

The owner reaffirmed on 2026-09-10 that v4 Home structures and personal-profile layout choice
must be preserved, and disputed the navy sidebar introduced by this brief. Broad redesign
permission does not supersede those specific preferences. The retirement and color instructions
below are historical assistant decisions, not current authority. Do not use them to dismiss
missing functionality or to certify the comprehensive audit. Reconcile the original owner sources
before further UI replacement; see `docs/redesign/home-work-closure/AUDIT-CORRECTION.md`.

---

# Home and Work

For the current one-hour MVP recovery checkpoint, the actionable local plan is
`docs/plans/2026-09-14-mvp-recovery.md`. The broader
`docs/redesign/home-work-closure/PLAN.md` is historical evidence, not a completion claim. This
checkpoint covers Tasks, Café WIP production (Plan, Log, Stock and Review), and Signals; Home and
the wider Work surface remain compatibility constraints and broader review scope. Original owner
product decisions remain acceptance requirements: persona jobs, Team ownership, truthful progress
and permission behavior cannot be removed by retiring a presentation rule. Owner decisions override
Director decisions; unresolved incompatible owner decisions are clarified, not silently chosen.
Delegated work uses separate Codex tasks/sessions with compact handoffs, never collaboration
subagents. Review against the complete owner requirement map, not only the authored replacement.

## Outcome

Home helps a person decide what needs attention and act. Tasks helps them find, do and update
work without first configuring a database view. Deliver replacement compositions and interaction
flows in the application; a token refresh or a disconnected mockup does not satisfy this brief.

## Design

Use the approved v3/v4 shell palette and existing theme-aware design tokens.
Task identity leads; metadata supports it. Space separates different jobs; hairlines organize
rows. Avoid nested boxes, equal-card dashboards, decorative metrics and persistent configuration
that pushes work below the fold. Use the existing self-hosted fonts with deliberate hierarchy.

Home supports Focused (default), Overview and List through shared region primitives, with a
per-person choice in Personal Profile (OD-V4-9). Preserve the same authorized information and
route access across arrangements. Keep Signals alongside attention/work in the right-hand desktop
column and stack at phone width (OD-WAY-87). OD-V4-10 retires only the old region-order toggle.

Tasks exposes its scope/views, search and a Filters disclosure. Configuration for grouping,
sorting, fields and saving a view remains reachable without permanently occupying the page.
Active filters explain the current subset and can be reset. Choose a useful initial work order.
Records open beside the queue on desktop and as a full-screen readable surface on phones.
Back, Escape, keyboard focus and save/failure feedback form one consistent interaction.

Custom accessible menus are permitted. Improve table geometry and controls where needed for
readability, while preserving the approved Home arrangements and shell identity. Keep capability
checks, authorization, real persistence, canonical links and accurate EN/ID content.

## Delivery method

Track the active brief, direct owner decisions, execution claims, dependencies, progress and
verification in the GitHub design judgment map and its child issues. Reuse existing tickets and
correct superseded requirements; local plans supplement the tracker. A resolved decision closes
its decision ticket, not the implementation ticket. The separate Codex task lane changes the
executor, not these tracking or review obligations. Scope frontier work to this active brief.

One design owner specifies the whole experience; native isolated workers implement the current
MVP lanes — Tasks, Café WIP production and Signals — while preserving the approved Home
composition.
Integrate running application components before judging the result. Review desktop and phone
composition and drive the actual interactions. Fix findings together, then confirm affected
paths. A design may be restructured or replaced without another owner interview.

Tests protect user outcomes. Replace an obsolete presentation assertion with the new intended
behavior and record the reason; never disable business safeguards to obtain green output.
Typecheck, relevant tests, lint and build support correctness. Independent design/spec, code
quality and security review support acceptance. Neither automated checks nor source inspection
prove a visually successful redesign. The final evidence must include rendered comparisons
and working journeys for the three-feature MVP and any shared Home seam it touches.

Workers run checks scoped to their changes; the integrated application owns the full test
battery. Bound local test concurrency when tasks share a machine. Normal commit hooks still
apply, and interrupted or failed runs remain incomplete evidence until their required checks pass.

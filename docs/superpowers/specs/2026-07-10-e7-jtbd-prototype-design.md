# E7 JTBD and canonical prototype design

**Status:** Design approved in conversation 2026-07-10; written artifacts pending owner review.

## Problem

The E6 JTBD oracle encoded the retired five-destination IA, Weekly Updates, Daily Log, Task RACI, and
BU=Team assumptions. Reusing it would grade the redesign against the product being replaced. Six example
scenarios alone would also under-specify the app by confusing narrative fixtures with user outcomes.

## Chosen approach

Use a **journey-first app-wide oracle**, not another destination matrix or object-only catalog:

- **9 job families** express stable user intent.
- **23 acceptance journeys** form the initial whole-app behavioral baseline.
- **6 integrated scenario threads** compose those journeys into a coherent Phase-0 prototype and later
  6–8 curated cross-stack BDD journeys.
- Cross-cutting authority, canonical-record, responsive, reversal, state, and language rules apply to
  every relevant journey.

This separation lets destinations and components evolve without losing the job outcome, while still
giving prototype and engineering work exact coverage targets.

## Artifacts

- `docs/jtbd.md` — current E7 Product/Intent oracle and acceptance-journey catalog.
- `docs/design-mockups/redesign-mockups-2026-07/PROTOTYPE-BRIEF.md` — Phase-0 coverage, scenarios,
  interaction contracts, states, responsiveness, and review gate.
- `docs/redesign-decision-index.md`, ADR-0025, and `CONTEXT.md` remain the domain/decision authorities;
  the new artifacts interpret them but do not supersede them.

## Prototype boundary

The prototype must make all 23 journeys findable and comprehensible, but it simulates production data
and state. It validates IA, IxD, UI, role/scope behavior, language, and responsive interaction. It does
not implement persistence, auth/RLS, scheduling, migrations, MCP, or production validation.

The six scenario threads share canonical records so the prototype behaves as one operating system rather
than 23 disconnected demos. The record panel/page renderer, Inbox, Action Launcher, Deputy, Work
collections, and role/scope switch are reused across scenarios.

## App and test boundary

After owner approval of the rendered prototype:

1. Each issue-specific SDD selects applicable `Jxx` journeys.
2. The spec converts outcomes into EARS requirements and Given/When/Then `AC-###` criteria.
3. The engineering plan assigns each criterion to its lowest sufficient test layer.
4. TDD implements the slice red→green→refactor.
5. BDD acceptance proves all criteria; only the integrated cross-stack threads belong in Playwright.

The journey catalog is an initial baseline, not a permanent ceiling. Features may add or refine journeys
for genuinely new outcomes, but tests and docs must never rewrite an outcome merely to fit the current
implementation.

## Alternatives rejected

### Destination matrix

Easy to scan, but it repeats the failure of v0.3: jobs become coupled to current navigation and stale
when IA changes. Destinations remain mappings on each journey, not the organizing principle.

### Object-lifecycle catalog

Precise for domain specs, but users do not arrive thinking “operate a Signal lifecycle.” It risks a
database-shaped UX and under-specifies Home, navigation, attention, and cross-object outcomes.

### Six-scenario-only oracle

Efficient for demos, but insufficient for product coverage. A scenario may exercise many jobs while
silently omitting Money, Admin, reversal, access denial, or canonical navigation. Scenarios therefore
compose the 23 journeys rather than replace them.

## Reversible Director assumptions

- Budget appears canonically in Money and opens as a linked record elsewhere.
- Admin Settings is a gated utility entry rather than a fifth primary destination.
- Prototype people/org data are fixtures, not production seed truth.
- The static prototype may use one shell and in-memory fixture state without committing the future app
  component architecture.

These assumptions are intentionally visible in the prototype brief for owner redline at the Phase-0
gate.

## Verification before HTML work

- `J01`–`J23` all exist once and map to at least one scenario.
- S1–S6 collectively cover every journey.
- All 14 E7 calibration anchors are explicit.
- No retired E6 object or destination is part of the intended journey.
- Markdown links resolve and `git diff --check` passes.

No HTML or application implementation begins until the owner reviews these written artifacts.

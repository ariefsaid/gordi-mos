# Full Redesign Mockups - 2026-07

> **HISTORICAL EXPLORATION — not the current prototype.** These A/B/C options predate the locked E7
> direction in `docs/redesign-decision-index.md` and ADR-0025. Keep them as design evidence only. The
> active Phase-0 task is to update `../redesign-mockups-2026-07/` into one decision-complete prototype;
> none of the options below is approved for implementation.

> **Historical (2026-07-08 option set) — superseded as direction authority by ADR-0025 + the
> consolidated prototype.** The owner's locked redesign direction lives in **ADR-0025**
> (`docs/adr/0025-ia-modules-in-rail-redesign-direction.md`) + **`docs/decisions.md` OD-REDESIGN-1..55**,
> prototyped in **`docs/design-mockups/redesign-mockups-2026-07/prototype.html`**. The A/B/C options
> and the "recommended Option A (Now / Work / Ops / Money / Inbox)" recommendation below predate the
> modules-in-rail reversal (ADR-0025 D1): the rail is now **Destinations (Home · Work · Money · Inbox)
> + BU-grouped Modules (Café · Ecommerce · Roastery)**, not five flat destinations, and there is no
> separate Dashboard/Plan/Reference/Operate top-level destination. Read this set only as the
> 2026-07-08 exploration that fed the decision; do not treat any option here as current.

These mockups are a full IA/IxD/UI reset, not a repaint of the current MOS app.

## Design Stance

Treat existing app structure, routes, `DESIGN.md`, and prior Phase-0 mockups as evidence, not authority. Keep only what supports the user's job. Cut implementation nouns from primary navigation.

## Current Concepts Rejected

- `Dashboard` as a top-level route. A dashboard is a presentation pattern, not a destination.
- `Home` and `Dashboard` as separate IA. One landing surface should own role-aware monitoring and attention.
- `Plan` as a destination label. It is too abstract and does not describe a common user job.
- `Reference` as a default top-level area. Reference records should live inside the workflow that uses them unless lookup itself becomes frequent.
- `Cascade` as a nav item. Objective drill-down and task roll-up are interaction patterns inside Work.
- Kitchen's five screens as primary navigation. Activity-specific screens belong inside a local module nav.
- `SOP library` as a passive document shelf. Standards must generate recurring checks, evidence, findings, corrective work, and version review.

## Mockup Set

- `index.html` - rationale, critique, and comparison.
- `option-a-now.html` - recommended: Now / Work / Ops / Money / Inbox. Includes 23 stable routes and 9 reusable action drawers. Work, Ops, Money, and Admin use local navigation for their child pages. Standards live under Ops as Checks / Standards / Findings / Evidence.
- `option-b-work.html` - work-led: Work / Money / Ops / Inbox. Includes 15 stable routes and 7 reusable action drawers. Work owns the primary queue; SOP checks and findings become management work; standards remain Ops source records.
- `option-c-ops.html` - ops-led: Today / Floor / Work / Money / Inbox. Includes 17 stable routes and 7 reusable action drawers. Floor owns activity navigation; Standards / Checks / Findings sit beside capture, review, and stock.

Every clickable hash link in the option files points to either an existing route or an existing action drawer. There are no `href="#"` placeholders.

## Revised Interaction Contract

- Stable destinations use `data-route` and appear in primary or local navigation.
- Create, edit, approve, invite, export, and evidence-capture flows use `data-drawer`.
- Detail pages can be reached from tables or record links, but they keep a parent route highlighted.
- Buttons should launch an action within the current module, not invent a new IA destination.
- Standards are represented as active controls: versioned Standard/SOP -> control point -> check run -> evidence -> finding -> corrective task -> review/version.

## Recommendation

Option A is the best default for a whole-company MOS. It combines monitoring and action without duplicating Home and Dashboard, while keeping Money and Ops clear enough to scale.

Option B is better only if MOS is primarily a management cadence and ownership tool.

Option C is better only if staff capture adoption is the primary rollout risk.

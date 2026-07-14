# Spec brief — Buildout step 2: shell + routes (feature-forge)

You are the spec author (feature-forge). Produce `docs/specs/redesign-shell-routes.spec.md` in
gordi-mos. Spec only — NO code. This is the redesign's structural step: the new sidebar, top bar,
URL grammar, and redirects. The app IA changes here for the first time.

## READ FIRST (exact paths)
1. `docs/plans/2026-07-14-redesign-buildout.md` — step 2 row + standing acceptance (owner visual
   diff every step; contract rules scored; step 2 has an owner WALKTHROUGH gate).
2. `docs/experience-contract.md` — Rules 1–11 ALL apply now (1 destination jobs, 3 rail/surface
   budget, 4 canonical routes + URL state, 5 one aria-current, 6 one page anatomy, 7 verb+object,
   8 capture-first, 9 responsive parity, 10 extension, 11 component reuse). These are the acceptance
   backbone — every rule maps to ≥1 AC.
3. `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` — BINDING. The convergence
   prototype OWNS the frame/routes; e7 OWNS the ⌘K palette (centered modal). PORT these, do not
   re-invent (Rule 11). Read the explicit-override list.
4. `docs/decisions.md` OD-REDESIGN-57 (frame directives: breadcrumb+⌘K header, Work▸Signals·Tasks·
   Projects&Processes·Objectives, Events rail root, no header action buttons) + OD-1/D1 (rail).
5. The reference prototype (visual truth): convergence flows shell in the gordi-mos-e7-prototype
   working copy (`docs/design-mockups/redesign-mockups-2026-07/convergence-flows/flows.js`) — the
   sidebar order, routes (#/work/tasks?view=…, #/events, redirects), ⌘K palette, aria-current logic.
6. The CURRENT app shell to MODIFY (Rule 11 — extend, don't rebuild): `mos-app/src/shell/` (find the
   AppShell/sidebar/topbar components), `mos-app/src/` router setup (react-router-dom 7), and how
   routes are currently declared. Name the real files.

## Scope (from master plan)
New sidebar: Home / Work▸(Signals·Tasks·Projects & Processes·Objectives) / Events / Money[gated] /
Inbox / BU-grouped Modules (Café·Ecommerce·Roastery) / Admin Settings + profile footer. New top bar:
logo+breadcrumb (left), Search⌘K + Inbox + Deputy (right); universal actions (Ask Deputy·Share
Signal·Create Task) move INTO the ⌘K palette (centered modal, e7-owned), NOT header buttons.
Canonical routes per collection + URL query state (view/record); redirects from every old route
(the current app routes — enumerate them by reading the router). Exactly one aria-current=page.

IN SCOPE: nav structure, routing, URL grammar, redirects, ⌘K palette, breadcrumb, aria-current,
one page-anatomy shell. OUT OF SCOPE (later steps): Tasks re-home internals (step 3), Signal
composer/feed (step 4), Events page body beyond a stub (step 10), any DB work. Existing pages stay
reachable — re-homed under the new routes, not rebuilt.

## Conventions
EARS requirements; FR-###/NFR-###; AC-### in Given/When/Then; each AC owned by ONE test at the
lowest sufficient layer (component render / Playwright e2e for routing+aria+back/refresh). Tag the
owning test's AC id. Map every Experience-Contract rule (1–11) to at least one AC. Note which
existing components are EXTENDED vs any genuinely-new component (Rule 11 — justify each new one).

## Verify your own work
Re-read against the contract + OD-57 + salvage inventory; confirm every rail item/route/redirect is
specified and every contract rule has an AC. Name real current-app file paths (verify they exist —
you have read access). List deviations at the end.

End your final message with: SPEC-DONE

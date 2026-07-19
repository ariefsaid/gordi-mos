# Code Context

## Files Retrieved
1. `mos-app/src/pages/stacked-union-home.tsx` (lines 155-190) — stacked Home cockpit and capture/drill composition.
2. `mos-app/src/pages/stacked-union-home.css` (lines 94-130) — capture CTA and narrow-screen layout.
3. `mos-app/src/pages/home-page.tsx` (lines 1-22, 180-220) — default Home composition and drill targets.
4. `mos-app/src/shell/bottom-tab-bar.tsx` (lines 1-93) — phone navigation and active-state logic.
5. `mos-app/src/shell/rail-nav.tsx` (lines 115-180) — desktop rail, module reuse, identity/sign-out.
6. `mos-app/src/pages/signals-archive-page.tsx` (lines 75-177) — responsive archive/search and record drawer.
7. `mos-app/src/components/tasks/TasksWorkspace.css` (lines 133-220) — mobile disclosure and desktop table layout.
8. `mos-app/src/components/signals/signal-composer.css` (lines 1-68) — capture composer responsive behavior.
9. `docs/reviews/feat-redesign-buildout.md` (lines 1-35, 180+) — historical review ledger and prior design/security findings.
10. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step4.md` (lines 48-73, 118-144) — Signal review and deferred capture concerns.
11. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step6.md` (lines 70-86, 228-244) — occurrence/mobile review and fix wave.
12. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step7.md` (lines 70-86) — Café responsive-review history.
13. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step8.md` (lines 30-80) — catalog phone discoverability decision.
14. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step9.md` (lines 35-70) — reuse/responsive claims for follow-ups.
15. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step10.md` (lines 35-75) — Events stub review.
16. `docs/reviews/claude-redesign-buildout-completion-vdrd17-step11.md` (lines 1-20, 120-150) — decommission sweep and deferred copy issue.
17. `docs/reviews/design-authority-audit-2026-07-17.md` (lines 64-100, 229-265) — mockup ownership and review-authority ambiguities.

## Key Code

- **Capture CTA regression risk:** `stacked-union-home.css:94-108` describes a dominant CTA linking to `/ops/new`; Step 11 confirms `/ops/new` now redirects to `/` (`step11.md`, lines 120-150). The CTA therefore loops back to Home rather than opening a capture surface.
- `StackedUnionHome` renders `CaptureFirstSection` at `stacked-union-home.tsx:180-190`, so this is reachable whenever the stacked flag/preview route is used.
- The default Home remains attention-first (`home-page.tsx:1-22`), while the capture-first implementation is only in the alternate stacked composition.
- Phone nav correctly limits primary tabs to Home, Work, Café, Inbox, More (`bottom-tab-bar.tsx:1-25`), with Work section matching and More active-state logic (`:55-91`).
- Signals archive uses URL-backed `q`, `record`, and `retracted` state (`signals-archive-page.tsx:25-43, 75-99`) and one shared record drawer (`:151-177`), consistent with Rule 11.
- Task mobile disclosure exists (`TasksWorkspace.css:133-171`), and desktop decision columns are fixed to fit (`:203-220`), but this source audit cannot independently validate rendered 390px behavior.

## Architecture

The shell provides desktop rail navigation and a phone bottom tab bar/drawer. Home has two implementations: the default attention/personal-canvas page and an alternate stacked-union cockpit. Signals and Tasks reuse shared URL state, drawers, and table primitives. The redesign ledgers repeatedly claim responsive behavior was inherited or rendered-verified, but several steps explicitly deferred independent phone verification.

## Start Here

Open `mos-app/src/pages/stacked-union-home.tsx:180-190` and trace `CaptureFirstSection` to its destination. The linked capture path is now a redirect-only retired route, making this the clearest Rule 8 failure.

## Findings

1. **Blocker — stacked Home capture CTA is a dead-end loop.**  
   `mos-app/src/pages/stacked-union-home.css:94-108` documents the capture-first CTA as linking to `/ops/new`; Step 11 documents `/ops/new` redirecting to `/` after the Daily Log removal. This violates Rule 8 and least-technical obviousness: the primary “capture” action does not open capture. It is especially concerning because the stacked preview remains intentionally reachable and the CSS still presents this as the dominant contributor action.

2. **Medium — responsive acceptance is not independently evidenced for several newly changed surfaces.**  
   Step 6 explicitly says Rule 8/9 phone behavior was “not explicitly re-verified” (`step6.md:70-72`); Step 7 records the same limitation for Café (`step7.md:70-72`). Step 9 relies on inherited `DataTable` reflow (`step9.md:65-70`). The implementation has responsive CSS, but the ledgers do not provide independent rendered evidence for every changed route, leaving narrow-screen regressions unreviewable.

3. **Medium — mockup ownership remains ambiguous for Home and ambient Signals feed.**  
   The design-authority audit identifies no explicit mockup owner for the Home attention brief (`design-authority-audit-2026-07-17.md:64-76`) and unstated ownership for the Home Signal feed (`:88-93`). This makes “mockup regression” claims for Home less independently reviewable than the per-surface claims in the completion ledgers.

4. **Low — Step 11 knowingly leaves implementation-jargon copy unresolved.**  
   `step11.md` explicitly defers the Events copy nit to a later owner-ratification pass. Although Step 6 records a wording change, it remains owner-ratify rather than locked. This is not a functional blocker, but it weakens the “least-technical obviousness” acceptance evidence.

5. **No Rule 11 duplication found in inspected surfaces.**  
   Shell navigation, Signals archive/record, Tasks workspace, and occurrence assignment claims consistently reuse shared primitives. The ledgers’ Rule 11 claims are supported by the inspected code.
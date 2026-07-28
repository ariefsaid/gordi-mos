---
target: Café · Log (kitchen-log-page.tsx)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-07-27T08-40-56Z
slug: mos-app-src-pages-kitchen-log-page-tsx
---
# Design Critique — Café · Log

Method: dual-agent (A: af686770bb9e2ffd5 · B: a8f0ddc2f9b4176df)

## Design Health Score: 24/40 — Acceptable

1 Visibility of System Status 2 — "Made so far" counts unsaved input; resets to 0 after successful submit
2 Match System / Real World 3 — "Made so far" means typed so far; "1 dish · 1 units"
3 User Control and Freedom 2 — no undo after submit; Discard also wipes search+category
4 Consistency and Standards 3 — thead not sticky per spec; status change used raw hue not AA token
5 Error Prevention 2 — first tap of + raises a required-note error; normal path is the error path
6 Recognition Rather Than Recall 2 — staged and unstaged cards computed-style identical
7 Flexibility and Efficiency 2 — 71 focus stops before Submit; no "log all to plan"
8 Aesthetic and Minimalist 3 — subtractions landed; 438px pre-list chrome remains
9 Error Recovery 2 — "note required" with no way to reach the offending row among 34
10 Help and Documentation 3 — nothing explains Radiant/Bungur

## Design Specificity Verdict
Passes below the fold, fails above it. The row scene (plan-vs-actual increments, Planned/Off-plan
split, transfer modes, tersedia cap) is unmistakably this product. The top 438px is anyone's internal
tool, and the four metrics are a LEAD's plan-attainment read on a CONTRIBUTOR's capture screen. The
v4 change fixed the band's format, not its presence.

Deterministic scan: 0 findings across 4 files — WEAK EVIDENCE, not a clean bill. .tsx runs the
detector in regex mode; CSS-class styling is structurally invisible to it. Verified non-no-op via a
planted control file (caught bounce-easing) and a --no-config re-run.

## Agreement between assessments (highest confidence)
- CONTRAST: A judged ~3.8:1; B computed 3.79:1 desktop / 3.82:1 mobile. Genuine AA failure at
  12px/500. This is a v4 REGRESSION — dropping the pill fill carried var(--destructive) instead of
  --status-lost-text, which DESIGN.md explicitly names.
- CHROME: A eyeballed 484px; B instrumented 437.8px = 62.9% of phone viewport, 2 of 32 cards visible.

## What's Working
- Compact capture row: stepper parked at a fixed x across every row (no re-aiming while standing);
  ships through the renderCard seam so grouping/collapse/empty/loading are inherited.
- Steppers measure exactly 44.0x44.0px, all 64, both breakpoints, visible 2px focus ring on each.
- Offline handling is real floor engineering, not a checkbox.

## Priority Issues
[P0] Summary rule states unsaved form input as fact. useKitchenKpis(lines) sums TYPED quantities
(verified in source). After a successful submit the band reads "Made so far 0 / −548 vs plan" and the
provenance note re-renders "No entries logged yet today." Violates PRODUCT.md principle 4. Fix:
source madeSoFar from submitted rows; staged qty belongs in the footer tally only; gate the
provenance note on the fetched count. If unsourceable, delete the metric. → harden

[P0] No commit affordance where the work happens. .kl-footer is position:static; phone scrollHeight
3862px; ~3200px scroll to Submit. The largest thumb-reachable control near the bottom is the global
+ FAB, not Submit. Fix: position:sticky bottom:0 above the tab bar. → adapt

[P1] v4 status change dropped the AA token. .kl-status--* and .kks-delta--* → --status-lost-text /
--status-won-text. Mobile search is 158x36px, below the 44px floor the steppers hold. → audit

[P1] 438px chrome = 62.9% of phone viewport. Job sentence wraps to 3 lines (123px); summary rule
wraps to 3 lines (81px), violating the DESIGN.md rule that it renders as one line at every
breakpoint. "−547 vs plan" and "−547 portions short" are the same figure twice. → layout

[P2] The batch being built is invisible. Staged/unstaged cards computed-style identical. Interrupted
-and-returned is every shift; only recovery is re-scrolling 3862px. Double-entry corrupts stock.
→ distill

## Persona Red Flags
Casey (one-handed, interrupted): cannot commit from where she stands; FAB mis-tap magnet; identical
staged/unstaged cards; one tap of + opens a REQUIRED textarea on the fastest path.
Sam (a11y): status 3.79:1; search 158x36; exactly ONE heading on the page; no live region on tally or
band; stepper reads as three unrelated controls to AT; "Under −25" reads as a bare signed integer.
Contributor/floor: the fold is occupied by the lead's question; the job story's second clause ("see
my next assigned step") has no affordance at all.

## Minor Observations
"1 dish · 1 units". Note cue renders twice per row. "no plan / Not logged" marks every off-plan row —
the same argument used to drop the pill fill applies to the word. .dt-card--compact .kls-card reaches
into another component's internals from page CSS; belongs behind the dense prop. KitchenKpiStrip
still builds sub/deltaDot/phoneLabel/phoneValue/phoneMeta that nothing renders (v4 leftovers).

## Questions
1. Should a capture surface have a metric band at all?
2. Why is "we made the plan" 21 stepper journeys instead of "log all to plan, then adjust exceptions"?
3. If prose is required for every partial, will contributors log partials at all — or one
   half-remembered number at close? Which failure does stock survive?

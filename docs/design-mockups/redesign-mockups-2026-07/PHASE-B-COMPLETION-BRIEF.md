# Phase B COMPLETION round — finish the convergence-flows build

A previous builder was killed mid-run by a provider rate limit. Its partial output is in
`docs/design-mockups/redesign-mockups-2026-07/convergence-flows/` (fixtures.js, flows.js ~888 lines,
flows.css, index.html; `shots/` empty; NO SCORECARD.md). **Do not rework what already landed and
works — complete and fix only.**

## Your job

1. Read `docs/design-mockups/redesign-mockups-2026-07/PHASE-B-BRIEF.md` — the full original brief.
   Everything in it (the three flows F1/F2/F3, hard requirements, do-NOT list) remains binding.
2. Read the binding contract `docs/design-mockups/redesign-mockups-2026-07/EXPERIENCE-CONTRACT.md`.
3. Inventory the partial output in `convergence-flows/` against the original brief: what is complete,
   what is half-written, what is missing entirely. flows.js may end mid-function — check it parses.
4. Complete the build: finish/repair the three flows to the brief's spec.
5. Run the brief's full "Verify your own work" section (serve + agent-browser assertions on URLs,
   Back, refresh, aria-current count, 390px first-viewport, console errors; screenshots into
   `convergence-flows/shots/`).
6. Write `convergence-flows/SCORECARD.md` exactly as the original brief specifies (Rules 1–10 ×
   F1–F3, PASS/FAIL + one-line evidence; honest "Open defects" section).

## Scope fences (unchanged from the original brief)

Only touch files inside `convergence-flows/`. No commits/pushes. No re-litigation of contract or
domain decisions.

End your final message with the sentinel line: FLOWS-DONE

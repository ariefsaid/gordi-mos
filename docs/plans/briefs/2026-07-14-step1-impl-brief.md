# Implementer brief — Buildout step 1: redesign styling pass (TDD)

You are the implementer. Execute the OWNER-APPROVED, Director-verified plan for step 1 (CSS/token
reskin). You are on branch `feat/redesign-step1-styling` in `gordi-mos`. TDD discipline. Commit on
this branch; **never push, never open a PR, never merge** (the Director does git).

## READ FIRST (exact paths)

1. `docs/plans/2026-07-14-redesign-styling-pass.plan.md` — THE PLAN. Execute tasks T1–T31 in order.
   **Read the "Director verification" section at the bottom** — esp. the jsdom caveat on T22.
2. `docs/specs/redesign-styling-pass.spec.md` — the signed spec (FRs/NFRs/ACs). Do not re-scope.
3. `docs/experience-contract.md` — Rule 11 (component reuse) is the binding NFR; Rules 1–10 untouched.
4. The real files the plan targets: `mos-app/src/styles/tokens/{theme-light,theme-dark,aliases}.css`,
   `mos-app/src/index.css`, root `DESIGN.md`. The E7 reference values:
   `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css` `:root` (in the
   `gordi-mos-e7-prototype` working copy).

## Hard rules

- **CSS + DESIGN.md ONLY.** Zero `*.ts`/`*.tsx` edits EXCEPT the new test files the plan defines
  (T22 token-values test, T24 contrast test) and the T23 guard in `scripts/pre-merge-check.sh`. No
  component markup, no layout/geometry, no new token names, no `e7-*` token in the app.
- **TDD:** write the failing test first (T22, T24 red), then the token changes (green). Do NOT edit
  an existing test to force a pass (BDD rule). If a test can't be made to assert the real thing,
  escalate in your report — do not weaken it.
- **T22 jsdom caveat (Director-flagged):** jsdom does not resolve `var()`/`@import`/`color-mix()`/
  `color(display-p3)`. Before writing T22, look at the EXISTING `css-var-wiring.test.ts` (the plan
  references it) and follow whatever harness it already uses — do not invent a new one. If jsdom
  genuinely can't assert computed color, assert the raw declared value in the source file under test,
  and say so in your report.
- **P3 conversions:** the plan gives target `color(display-p3 …)` triples but several are marked
  "implementer converts" or "verify". Convert each E7 `hsl()` accurately (use a real conversion, not
  a guess); where the plan already gives a triple, sanity-check it. Flag any you're unsure of.
- **Component reuse (Rule 11):** you are changing token *values*, not re-implementing anything.

## Gates (all must pass before you report done)

Run from `mos-app/`: `npm run typecheck` (0), `npm run lint` (0, `--max-warnings=0`),
`npm test` (green, no test file weakened), `npx playwright test` (existing specs green — proves DOM/
behavior unchanged, AC-006). Plus `bash scripts/pre-merge-check.sh` from repo root (AC-002 guard).
Capture the screenshot matrix task (T30) if you can drive a browser; if not, leave a note and the
Director will capture it.

## Rate-limit note (you are on NVIDIA NIM, shared 40-RPM key)

If you hit an HTTP 429, it's the shared rate cap, not an outage — **back off ~30s and retry the same
call**; do not switch models or abandon the task. Work single-threaded; do not spawn parallel
sub-agents.

## Report

At the end: which tasks landed, gate results (paste the tail of each command), any P3 value you were
unsure of, how you resolved the T22 jsdom issue, and anything you could NOT complete. Verify your own
work against the plan's traceability matrix before reporting.

End your final message with the sentinel line: BUILD-DONE

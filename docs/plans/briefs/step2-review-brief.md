# Review battery — Buildout step 2 (shell + routes)

You are the reviewer (spec-review + code-quality, CROSS-FAMILY). Read-only — no edits. Verdict to
`docs/reviews/feat-redesign-buildout.md` under "## Step 2 — shell + routes (spec + code-quality, gpt-5.4)".

## Review scope
Branch `feat/redesign-buildout`, commits `5e81ccd..HEAD` (step-2 build T1–T26 + completion). Diff:
`git diff 5e81ccd..HEAD --stat`. Focus the review on mos-app/src/shell/*, router.tsx,
components/command/command-menu.tsx, destinations.tsx, the 3 NEW components (context-row,
job-sentences, slice-stub-page), i18n messages, and the e2e specs.

## Read
- `docs/specs/redesign-shell-routes.spec.md` (ACs) + `docs/plans/2026-07-14-redesign-shell-routes.plan.md`
  (the D-PLN deviations — verify each is honored, esp. D-PLN-1 flag retirement).
- `docs/experience-contract.md` Rules 1–11.

## Verdict must cover
1. **Spec conformance:** every FR/AC met? Rail (OD-57), routes, redirect map complete (every retired
   route redirects — /updates /ops /cascade etc.)? Exactly-one aria-current mechanism sound?
2. **Rule 11 (component reuse):** are only the 3 justified new components new? Anything re-implemented
   that already existed? (rail/top-bar/breadcrumb/command-menu should be EXTENDED, not rebuilt.)
3. **Code quality:** router redirect helpers, destinations registries, i18n EN+ID parity, no dead
   code, TypeScript soundness.
4. **BDD integrity:** the 7 e2e .skip's — each must cite a retired-destination reason + successor
   step (not a silent coverage drop). The re-routed existing e2e (T23) must keep goals, change only
   steps. Flag any assertion weakened to pass.
5. **Verdict:** APPROVE / APPROVE-WITH-NITS / BLOCK with line refs.

Note: the Director already verified LIVE (rail order, redirects, one aria-current, centered ⌘K with
universal actions, header Actions-button removed) and gates are green (typecheck/lint/2572 unit/41
e2e). Your job is the code+spec conformance lens. End with: REVIEW-DONE

# Wave-1 COMPLETION — F-A + F-C only (F-B already committed). implementer, TDD.

A prior run committed F-B (phone aria-current, commit 82f1689) then died on a rate cap. Do the two
REMAINING fixes only. Branch `feat/redesign-buildout` (already checked out — no git checkout). Commit
per fix; never push. Do NOT redo F-B.

## READ FIRST
`docs/plans/briefs/s13-remediation-w1-brief.md` (the full wave-1 brief) — do F-A and F-C from it.
`docs/decisions.md` OD-REDESIGN-61 (role-based) + OD-64 (Home dead-links). Convergence mockup for the
capture-first pattern: `http://localhost:8134/#/work/tasks` phone 390px.

## F-A — Mobile Tasks role-based capture-first (OD-61, Rules 8/9/12)
At ≤767px: MEMBER (non-manager) sees work cards first, all filters collapsed behind ONE "View options"
control, persistent existing `+` launcher; MANAGER keeps the denser filter view. Seam:
`viewer.isManager` / `deriveIsManager` (`mos-app/src/lib/db/viewer.ts`). Desktop unchanged. Do NOT
rebuild the table (Rule 11) — only the mobile disclosure/toolbar-collapse changes. TDD: component test
asserting a member sees a work item in the first mobile viewport with filters collapsed.

## F-C — Home dead-links (OD-64)
`mos-app/src/pages/home-page.tsx`: "Open the Daily Log →" → `/ops` (redirects to Home = dead end) and
"Write update →" → `/updates` (→ Signals stub). Until Step 5: either point to a working successor OR
hide these legacy cards from the member (non-manager) persona. No visible link may lead to a stub/
redirect-to-self. Pick the smaller correct fix; keep the test GREEN (do not leave an unused mock — the
prior attempt left a broken `mockListTeamUpdates` unused-var; write it clean).

## OUT OF SCOPE: Task-record RACI rework, canonical page mode, Home attention brief, Signals, Café — do not touch.

## Gates (mos-app/): typecheck 0 · lint 0 · npm test green · npx playwright test green. Paste tails. End: FIX-DONE

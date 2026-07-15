# OBJECTIVE: scoped design/UX RE-review of steps 1–3 (after waves 1/2/2b) — Luna autonomous

You are the design/UX reviewer. Steps 1–3 (warm palette, shell/nav/⌘K/routes, Tasks re-home) were
BLOCKED by the first design review, then remediated (waves 1/2/2b, code review APPROVE). Confirm the
design BLOCK is RESOLVED at the rendered level. You have Bash + agent-browser + Playwright — drive
them yourself. Start with `agent-browser skills get core --full`. Force a CLEAN session on each URL;
VERIFY "Gordi MOS" branding (not PMO). Log in as least-technical persona **Cafe Ops** (Cahya) via the
demo login (password `Passw0rd!dev`), also spot-check Director.

## SCOPE CARD — judge ONLY steps 1–3's bar (do NOT re-flag deferred future-step work)
IN SCOPE (must be right now): warm palette; shell/rail/⌘K/breadcrumb/redirects/aria-current; Tasks
re-home + saved-view URL chips; **role-based mobile capture-first (OD-61)**; **typed Task record —
NO RACI on any Task surface incl. Home mini-card, + Mark complete (OD-62)**; **canonical page on
direct open, drawer on in-list click (OD-63)**; Home dead-links hidden (OD-64); phone aria-current on
/work/* children.
DEFERRED — DO NOT FAIL THESE (note as out-of-scope only): Home attention brief = Step 5; Signals feed
= Step 4; Café "Kitchen Log" rename = Step 7; Ecommerce/Roastery module depth = later; demo fixture
names = data, not code. The prior review flagged these as "failures" — they are FUTURE STEPS, not
regressions. Judge steps 1–3 against their own deliverables.

## Assess (docs-rules-FIRST, then mockups)
Rules: `docs/experience-contract.md` 1–12 → `docs/jtbd.md` (A4: RACI off Tasks) →
`docs/reference/twenty-ixd-patterns.md`. Then MOCKUPS (e7 :8766, convergence :8134 per
`SALVAGE-INVENTORY.md`) — flag any CROSS-VERSION REGRESSION where a mockup got something right that
the build lost. Decisions locked: `docs/decisions.md` OD-REDESIGN-61..64.

## Confirm each original BLOCK finding is RESOLVED (rendered)
1. Mobile Tasks (390px) as Cafe Ops: work cards FIRST, filters behind one "View options", persistent
   `+` launcher. Manager: filter view retained.
2. NO visible "RACI"/"Owner (R)"/R·A·C·I on ANY Task surface — Tasks table, record drawer, full page,
   AND Home "My tasks" mini-card. Team/PIC/Supervisor + "Mark complete" present.
3. Direct `/work/tasks/:id` = full page; in-list click = drawer; direct→list→same-record click = drawer.
4. Home legacy dead-links gone/hidden for Cafe Ops.
5. Phone `/work/signals` etc.: exactly one aria-current.

## Report to `docs/reviews/feat-redesign-buildout.md` § "## Design RE-review steps 1–3 (Luna, after remediation)":
per original finding RESOLVED/STILL-OPEN (+ evidence), Rule 1–12 pass/fail (scoped), any NEW
regression, Rule-12 cold-start verdict as Cafe Ops, any owner A/B fork, overall APPROVE/BLOCK.
End with: DESIGN-REVIEW-DONE

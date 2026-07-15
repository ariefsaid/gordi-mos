# Remediation wave 1 — steps 1–3 design-review regressions (implementer, TDD)

Fix 3 IN-SCOPE regressions the Luna design review found (BLOCK). Branch `feat/redesign-buildout`
(already checked out — no git checkout/switch). Commit per fix; never push/PR/merge. TDD.

## READ FIRST
- `docs/reviews/feat-redesign-buildout.md` § "Design/UX review — steps 1–3" (the findings + evidence).
- `docs/decisions.md` OD-REDESIGN-61 (role-based Tasks disclosure) + OD-REDESIGN-64 (Home dead-links).
- `docs/experience-contract.md` Rules 5, 8, 9 (as annotated), Rule 12.
- Convergence mockup for the capture-first pattern (drive it): `http://localhost:8134/#/work/tasks`
  (phone 390px) — one "View options" control, work cards first, persistent `+`.

## The 3 fixes (commit each)

**F-A — Mobile Tasks role-based capture-first (OD-61, Rules 8/9/12).**
At ≤767px, the Tasks page currently front-loads Table/Board/Calendar + 4 saved-view chips + Group/
Unit/Status/Person + search + archived BEFORE the first task card. Fix, ROLE-ADAPTIVE:
- **Member (non-manager) persona** = capture-first: work cards in the first viewport; collapse the
  collection/view/presentation/filter controls behind ONE "View options" control; keep a persistent
  thumb-reachable `+` (the existing bottom-nav `+`/launcher — reuse, do not build a new one).
- **Manager persona** may keep the denser filter view up-front.
- The seam: `deriveIsManager` / `viewer.isManager` (`mos-app/src/lib/db/viewer.ts`) — gate the mobile
  default disclosure on it. Desktop is unchanged. Do NOT rebuild the table (Rule 11) — only the mobile
  disclosure wrapper/toolbar collapse changes.

**F-B — Phone `aria-current` on Work children (Rules 5/9).**
At 390px on `/work/signals` (and `/work/projects`, `/work/objectives`) the DOM has ZERO
`[aria-current="page"]`. The phone bottom-nav "Work" tab points at `/work/tasks` and isn't marked
active for other `/work/*` children. Fix: the Work bottom-nav item is `aria-current="page"` for ANY
`/work/*` route (exactly one current-location marker on every phone route). Reuse the existing
aria-current logic from the desktop rail; don't duplicate it.

**F-C — Home dead-links (OD-64, Rule 1/7).**
`home-page.tsx` (+ stacked-union-home if used): "Open the Daily Log →" → `/ops` (redirects back to
Home = dead end) and "Write update →" → `/updates` (→ Signals stub). Until Step 5's real Home:
either point them at a working successor OR hide these legacy cards from the least-technical (member)
persona. No visible link may lead to a stub/redirect-to-self. Pick the smaller correct fix; state which.

## OUT OF SCOPE (do NOT touch — deferred/separate slice)
Task record RACI→PIC rework (OD-62, wave 2), canonical full-page-on-direct-open (OD-63, wave 2),
Home attention brief (Step 5), Signals (Step 4), Café rename (Step 7), demo fixtures. Do not "fix" these.

## Discipline
TDD (failing test first — component test for the role-based disclosure + aria-current; never weaken).
COMMIT AFTER EACH FIX. Reuse existing components (Rule 11). Verify against the convergence mockup for F-A.

## Gates (from mos-app/): typecheck 0 · lint 0 · `npm test` green · `npx playwright test` green
(add/extend an e2e: phone Tasks shows a work card in the first viewport for a member; one aria-current
on `/work/signals` phone). Paste tails. End with: FIX-DONE

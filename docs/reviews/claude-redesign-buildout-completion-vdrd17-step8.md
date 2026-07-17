# Review ledger — Step 8 "Catalog re-home" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: `mos-app/src/router.tsx`, `mos-app/src/components/command/command-menu.tsx` (production,
≤15 line diff each) + `mos-app/src/router.test.tsx`, `mos-app/src/components/command/command-menu.test.tsx`,
`mos-app/src/shell/rail-nav.test.tsx` (test-only). Commits `feat(catalog): T1` through `T5` on this
branch. This branch carries other concurrent steps (4/5/6/7/10 — see other ledgers in this directory);
**this ledger covers Step 8 only**. Full command: `git log --oneline --grep='(catalog):'`.

Spec: `docs/specs/catalog-rehome.spec.md` (FR-801..805, AC-801..808).
Plan: `docs/plans/2026-07-17-catalog-rehome.md`.

## Scope card (Step 8)

**In scope (built, this step):**
- Converted the 3 legacy catalog redirects (`/objectives`, `/projects-processes`,
  `/work/projects-processes`) from bare `<Navigate>` to the existing `SearchRedirect` helper so a
  deep-linked/bookmarked legacy URL's query string survives the redirect (FR-801; AC-801/802/803).
- Added `Projects & Processes` (`workline.manage`) and `Objectives` (`objective.manage`) as
  capability-gated entries in the ⌘K command palette's Navigate group, mirroring the existing
  `Signals` Work-child precedent — closes the Rule-9 gap where the desktop rail was the *only*
  surface a capability holder could reach these two manage-mode screens from (FR-802/803/804;
  AC-804/805/806).
- Locked `aria-current="page"` uniqueness explicitly at `/work/projects` and `/work/objectives` in the
  desktop rail unit tests — a zero-diff coverage-gap close on already-shipped `rail-nav.tsx` behavior
  (FR-805; AC-807/808).

**Already shipped (Step 2, NOT re-built or re-authored here — see spec §0 evidence table):**
- `/work/projects`/`/work/objectives` canonical routes, `RequireCapability` gating, desktop rail
  visibility + capability filtering, breadcrumb resolution, phone `destinationForPath`/bottom-tab-bar
  resolution, `CatalogManager`/`ObjectivesPage`/`ProjectsProcessesPage` content.

**Out of scope (deliberately, this step — see spec §1):**
- Any change to `CatalogManager`, `ObjectivesPage`, `ProjectsProcessesPage`, or their DAL.
- Any schema/migration/RLS/pgTAP (none in this step — DB/RLS: no).
- Retiring `cascade-page.tsx`/`AC-305-cascade.spec.ts` — Step 11's job.
- Any new e2e journey — the existing Step-2 `shell-routes-redirects.spec.ts` +
  `shell-aria-current.spec.ts` already cover this surface's cross-stack shape.
- Adding the two catalog screens to the phone **More menu** (`mobile-drawer.tsx`) — see RATIFY-8A
  below; Option A (⌘K-only) implemented.

## RATIFY-8A — phone More menu vs ⌘K-only (spec §6 open decision)

**Option A (⌘K-only) implemented**, per the spec's recommended conservative default: the two new
capability-gated items live only in the ⌘K command palette's Navigate group, mirroring the existing,
already-shipped precedent for the Work child *Signals* (also absent from `mobile-drawer.tsx`'s More
menu, reachable on phone only via ⌘K). `mobile-drawer.tsx` is untouched by this step. This closes the
real Rule-9 gap (a capability holder previously had zero non-desktop path to either screen; now has
one, via ⌘K) at the lowest-risk, smallest diff. Option B (a new capability-filtered "Work" row-group
in the More menu) was considered and explicitly deferred — see spec §6 for the full trade-off
discussion. Owner/Director to revisit as a fast follow-up only if a cold-start walkthrough (Rule 12,
capability-holder persona) finds ⌘K insufficiently discoverable.

## Rules 1–12 checklist (unfilled — reviewers fill this in)

| Rule | Compliant? | Notes |
|---|---|---|
| 1 — one job per rail item | | |
| 2 — three-layer boundary (domain → UI family → destination) | | |
| 3 — rail/surface budget caps | | |
| 4 — canonical routes + URL state (SearchRedirect query preservation) | | |
| 5 — exactly one `aria-current="page"` | | |
| 6 — one page anatomy per route (no second drawer host) | | |
| 7 — verb+object action grammar (n/a — no new action items, only Navigate) | | |
| 8 — capture-first disclosure (n/a — no new capture surface) | | |
| 9 — responsive disclosure order (⌘K covers the phone/no-rail gap) | | |
| 10 — extension test (0 new production components; REWIRE of existing helpers) | | |
| 11 — component reuse (`SearchRedirect`, `can()`, `CommandItem`, i18n keys — all reused as-is) | | |
| 12 — usable by a high-school graduate, no training | | |

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: <!-- APPROVE|REWORK|FAIL --> — <reviewer, date, notes>
- code-quality: <!-- APPROVE|REWORK|FAIL --> — <reviewer, date, notes>
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes> (command-menu.tsx is
  `*.tsx` — 4-lens review required)
- security: N/A — no auth/RLS/schema path changed (NFR-801, buildout row 8 DB/RLS: no).

## Gates (implementer pass — see the Director's session report for exact numbers)

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS — 0 errors |
| `npm run lint -- --max-warnings=0` | PASS — 0 (eslint + stylelint) |
| `npm test -- src/router.test.tsx src/components/command/command-menu.test.tsx src/shell/rail-nav.test.tsx` | PASS — 79 tests (29 + 30 + 20) |
| `npm test` (full Vitest suite) | PASS — 270 files / 2828 tests |
| `npm run test:coverage` | PASS — exit 0; global 95.63% lines / 86.73% branches / 88.35% functions (thresholds 80/70/80); `router.tsx` 96.05% lines, `command-menu.tsx` 95.89% lines |
| `supabase test db` (pgTAP) | N/A — no schema touched (NFR-801) |
| `npx playwright test` | N/A — no new e2e (NFR-802); existing Step-2 curated specs cover this surface via CI dispatch |
| `bash scripts/pre-merge-check.sh` | <!-- expected FAIL until Verdicts above are filled --> |

## Deferred / tracked debt

None identified — this step is a small, bounded closure of two concrete gaps left open by Step 2's
early landing (spec §0), with zero new production components (plan §8 rewire-not-rebuild check: 0 new
files, 2 production files touched, both ≤15-line diffs).

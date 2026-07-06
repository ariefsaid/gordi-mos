# Review battery — `feat/ia-nav-work-spine` (five-destination nav shell + Work-spine absorption)

- **Slice:** Issue A+B of the MVP push — complete the five-destination IA regroup (Home/Work/Operate/
  Plan/Inbox) + absorb the held Work spine (cascade everyone-view + `shared.can()` substrate) so Work is
  whole; catalog → Work's manage-mode (relocated under `/work/`, old paths redirect, up/down trace).
- **Spec:** `docs/specs/nav-five-destinations.spec.md` (FR-400..450, AC-400..411). **Plan:**
  `docs/plans/2026-07-07-nav-five-destinations.md`. **Base:** `dev` @ `46f3ef8` → branch tip `9435a97`.
- **Delegation:** plan = glm-5.2 (Director-verified; corrected its ff-merge assumption — dev/work-spine
  diverged, did a real merge). build = glm-5.2 (opus-tier, re-routed from 5.1 per owner 2026-07-07).
  cross-family review = gpt-5.5. Visual = Director via Playwright MCP.

## Verdicts

| Lens | Reviewer | Verdict | Notes |
|---|---|---|---|
| **Spec conformance** | gpt-5.5 (cross-family) | **PASS (after fixes)** | Every FR-400..450 has an owning AC; FR-440/AC-409 gap (Home/Inbox labelKey) **fixed**. |
| **Code quality** | gpt-5.5 + Director close-read | **PASS** | `railHidden` is the only new Section flag; pages reused not rebuilt; up-trace derivation sound (orphan edge **fixed**); flag mocks intent-preserving (verified not gutting coverage). |
| **Security** | gpt-5.5 | **PASS — no hole** | Relocated `/work/*` manage routes behind `RequireCapability`; retired paths redirect to a fixed internal target (no open-redirect); RLS/`can()` remains the real boundary, nav-hiding is convenience only. No schema change (absorbed `can()` migrations already reviewed on work-spine; pgTAP 72/73 untouched). |
| **Design (4-lens, nav is UI)** | Director (Playwright MCP render) | **PASS** | Desktop rail = HOME·WORK·OPERATE·PLAN·INBOX·ADMIN, correct grouping, no Catalog group, existing chrome (no new visual language). Phone = exactly 5 bottom tabs (Home/Work/Operate/Plan/Inbox), Home active. Language toggle intact. Real backend auth (Director/admin persona). |

## gpt-5.5 findings — all resolved (commit `9435a97`)
- **Important:** Home/Inbox sub-item links lacked `labelKey` (id-locale hardcoded-English leak) → added
  `nav.home`/`nav.inbox` (en+id) + AC-409 parity. ✔
- **Important:** up-trace dropped work_lines whose tasks have no objective → now surfaces
  "no parent objective (N)"; test updated. ✔
- **Minor:** AC-411 e2e asserted trace presence only → now asserts content (`/\d+ task/`). ✔
- **Minor:** spec FR-450 coverage matrix overclaimed → corrected. ✔

## Battery evidence (Director-re-run)
- `npm run typecheck` → **0 errors**. `npm run lint` (`--max-warnings=0`) → **0 errors**.
- `npm test -- --run` → **2258/2260** unit green. The 2 = a **pre-existing kitchen-plan-page load-flake**
  (passes 20/20 isolated in 2.84s; untouched by this slice — Kitchen code, timing under full-suite load,
  same class as the RI-3 flake). Not a regression; flagged as pre-existing suite tech-debt.
- pgTAP 72/73 (the absorbed `can()` substrate) present; no new migrations (NFR-402).
- e2e AC-410/411 authored (BDD-faithful); Director render confirmed the journeys live.

## Outstanding / notes
- **Pre-existing kitchen-plan load-flake** — backlog item (suite-stability, not this slice).
- e2e run under the seeded Playwright harness = the CI proof (Director confirmed the same journeys via
  live render).
- Follows the D14 sequence (step 3, Work spine) + the 2026-07-06 Catalog-placement refinement.

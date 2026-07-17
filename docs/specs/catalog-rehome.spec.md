# Spec — Redesign buildout Step 8: Projects & Processes + Objectives re-home

- Status: **Draft** (eng-planner, for spec-reviewer + owner sign-off).
- Plan: `docs/plans/2026-07-17-catalog-rehome.md`.
- Buildout step: `docs/plans/2026-07-14-redesign-buildout.md` row 8 — *"Re-home the merged catalog
  screens (PR #81) under `/work/projects` + `/work/objectives`; governance visibility per capability
  (90%-employee-first)."* Reuse column: **"catalog screens — RELABEL/re-home only."** DB/RLS: **no**.
  Drill: **No**.
- Primary rules: **Experience Contract Rules 4 (canonical routes / URL state), 9 (responsive parity —
  phone reach), 11 (component reuse)**.
- Source decisions: `docs/decisions.md` OD-C-2, OD-WS-1, OD-IA-2 (`can()`); the "Catalog placement"
  refinement (decisions.md ~L926); `docs/reference/provenance/03-frustration-and-buildout-2026-07-13_16.md`
  L189/216 — **decision #0, the 90%-employee-first framing**: *"Design the primary interface for the
  everyday employee; governance objects (Projects, Processes, Standards, Objectives) appear
  progressively only to people who manage them."*
- Vocabulary: `CONTEXT.md` — Objective, Project/Process, Task, capability, access role.

## 0. Baseline finding (read this before reviewing the small diff below)

**Most of Step 8 is already shipped.** Redesign Step 2 (`docs/plans/2026-07-14-redesign-shell-routes.plan.md`,
T9/T10/T12) went further than its own row scope and already re-homed the PR #81 catalog screens under
the new IA, ahead of schedule, leaving an explicit pointer to Step 8 for the remainder
(`docs/plans/2026-07-14-redesign-shell-routes.plan.md` line ~771: *"cascade noun retired → `/work/tasks`;
skip the cascade-read journey, pointer to Step 8 catalog re-home"*). Verified already in place, with
passing tests, as of this plan:

| Already shipped (Step 2) | Evidence |
|---|---|
| `/work/projects` renders `ProjectsProcessesPage` (reused unchanged) behind `RequireCapability('workline.manage')` | `mos-app/src/router.tsx` L109-112; `mos-app/src/router.test.tsx` AC-006 (L108-114) |
| `/work/objectives` renders `ObjectivesPage` (reused unchanged) behind `RequireCapability('objective.manage')` | `mos-app/src/router.tsx` L113-116; `router.test.tsx` AC-006 (L116-122) |
| Legacy `/objectives`, `/projects-processes`, `/work/projects-processes` redirect to the new paths | `router.tsx` L108,183-184 |
| Desktop rail: Work's 4 children (Signals · Tasks · Projects & Processes · Objectives), the two catalog
  children capability-filtered (`can(accessRoles, c.capability)`), absent entirely for a plain member | `mos-app/src/shell/rail-nav.tsx` L108; `rail-nav.test.tsx` L134-146 |
| Breadcrumb resolves `/work/projects` → "Work · Projects & Processes", `/work/objectives` → "Work · Objectives" | `mos-app/src/shell/breadcrumb.test.tsx` L57-63 |
| `destinationForPath` / bottom-tab-bar resolve both routes to the Work destination/tab, exactly one `aria-current="page"` on phone | `mos-app/src/shell/destinations.test.ts` L123-127; `bottom-tab-bar.test.tsx` L146-158 (`WORK_CHILDREN` table) |
| `RequireCapability` denies + redirects a non-holder to `/work/tasks` (no dead-end) | `mos-app/src/auth/require-capability.tsx`; `require-capability.test.tsx` |
| Up/down trace context on both manage pages (child work_lines/task counts; parent objectives), reused from the pre-redesign catalog work | `mos-app/src/pages/objectives-page.tsx`, `projects-processes-page.tsx` (FR-422 lineage) + their tests |
| `CatalogManager` (create/rename/archive) — the actual catalog UI — untouched | `mos-app/src/components/catalog/catalog-manager.tsx` |

This spec does **not** re-author any of the above. It closes the **two concrete gaps** left by that
early landing, both squarely inside "RELABEL/RE-HOME ONLY" (no new component, no schema, Rule 11
REWIRE of existing helpers/patterns):

1. **Deep-link preservation on the 3 legacy redirects** — they currently use a bare `<Navigate>`
   (drops any query string) instead of the `SearchRedirect` helper already used for every other retired
   route in the same file (`/tasks`, `/dashboard`, `/sales`, `/kitchen/*`, `/plan/budget`, `/plan/pricing`).
   This is a Rule 4 defect: a bookmarked/deep-linked old URL with query state loses that state.
2. **Governance visibility per capability is incomplete off the desktop rail** — the desktop rail
   (≥920px) is the *only* surface where a capability holder (ops_lead/admin) can reach
   `/work/projects` or `/work/objectives`. The ⌘K command palette's Navigate group (the phone/no-rail
   equivalent already used for the Work child *Signals*) does not list either catalog screen at any
   capability level. This is a Rule 9 defect ("phone bottom-nav + menu cover every rail entry the
   viewer is authorised for... Fail if a phone user cannot reach an authorised record/action") and an
   incomplete instance of the 90%-employee-first framing: the ~10% who **do** manage these objects must
   be able to reach them from every viewport, not just desktop.

No other surface has a gap: rail visibility, route gating, breadcrumb, phone `aria-current`, and the
manage-page content are already correct and already tested (table above).

## 1. Scope

### In scope
- Convert the 3 legacy catalog redirects (`/objectives`, `/projects-processes`,
  `/work/projects-processes`) from bare `<Navigate>` to the existing `SearchRedirect` helper (Rule 4).
- Add `Projects & Processes` and `Objectives` to the ⌘K command palette's Navigate group, each visible
  only to a viewer who holds the matching capability (`workline.manage` / `objective.manage`),
  reusing the exact `can()` capability check already used by the rail (Rule 9 / Rule 11).
- Close a Vitest coverage gap: lock `aria-current="page"` uniqueness explicitly at `/work/projects` and
  `/work/objectives` in the desktop rail (previously only proven generically/at `/work/signals` and via
  the Step-2 e2e `shell-aria-current.spec.ts`, not per-route at the unit layer for these two specific
  re-homed routes).

### Out of scope (already shipped — Step 2; or a later step's job)
- Any change to `CatalogManager`, `ObjectivesPage`, `ProjectsProcessesPage`, `mos.work_lines`,
  `mos.objectives`, or their DAL (`lib/db/objectives.ts`, `lib/db/work-lines.ts`) — reused unchanged.
- Any schema, migration, or RLS change — **none in this step**.
- Retiring the old cascade page/tests (`cascade-page.tsx`, `AC-305-cascade.spec.ts`) — that deletion is
  explicitly **Step 11** (decommission sweep), after every retired surface has a successor.
- Adding Projects & Processes / Objectives to the phone **More menu** (`mobile-drawer.tsx`) — see
  §6 RATIFY-BEFORE-MERGE; the conservative default in this spec is ⌘K-only, mirroring how the Work
  child *Signals* is already reachable (⌘K, not the More menu).
- Any new e2e journey. The 3 curated flows (F1/F2/F3) are untouched; the existing
  `e2e/shell-routes-redirects.spec.ts` and `e2e/shell-aria-current.spec.ts` (Step 2, already covering
  `/objectives`, `/projects-processes`, `/work/projects-processes` landing + `/work/projects`,
  `/work/objectives` `aria-current`) already exercise the cross-stack shape of this surface and are not
  modified here.
- Any pgTAP. No schema touched.

## 2. Reuse inventory (Rule 11)

| Path | Status | Exact seam |
|---|---|---|
| `mos-app/src/router.tsx` | **REWIRE** | 3 routes' `element` changes from `<Navigate to="…" replace />` to `<SearchRedirect to="…" />` (helper already defined/exported in this file, already used for 6+ other routes). No new route, no new component. |
| `mos-app/src/components/command/command-menu.tsx` | **REWIRE** | `navigateItems` gains 2 conditionally-pushed entries, gated with the existing `can()` import (already used by `rail-nav.tsx`) instead of the single `gated`/`moneyAuthorized` boolean pattern (kept as-is for Money). No new UI, no new component — same `CommandItem` shape, same list, same activation path. |
| `mos-app/src/shell/rail-nav.tsx` | **REUSE-AS-IS** | Already filters Work's capability-gated children (L108) and already renders `aria-current` correctly (Rule 5 machinery unchanged) — only test coverage is added, no production change expected. |
| `mos-app/src/lib/capabilities.ts` (`can()`) | **REUSE-AS-IS** | Same capability function already used by `rail-nav.tsx` and `require-capability.tsx`; no new capability keys. |
| `mos-app/src/i18n/messages.ts` | **REUSE-AS-IS** | `nav.work.projects` / `nav.work.objectives` keys already exist (en/id) from Step 2 — no new key. |
| `mos-app/src/shell/mobile-drawer.tsx` | **NOT TOUCHED** | See §6 RATIFY — conservative default keeps this file untouched this step. |
| `mos-app/src/components/catalog/catalog-manager.tsx`, `objectives-page.tsx`, `projects-processes-page.tsx` | **REUSE-AS-IS** | Unchanged; the actual catalog UI, out of scope. |

## 3. Functional requirements (EARS)

> ID range **8xx** per the buildout master plan's per-step numbering convention (avoids collision with
> `tasks-rehome` 3xx, the historical `nav-five-destinations` 4xx, `signals-v1`, etc.).

- **FR-801** — When a viewer requests a retired catalog route (`/objectives`, `/projects-processes`, or
  `/work/projects-processes`) that carries a query string, the system shall redirect (replace) to the
  canonical `/work/objectives` or `/work/projects` route **preserving the query string**, using the
  existing `SearchRedirect` helper. *(Rule 4)*
- **FR-802** — Where the viewer holds the `workline.manage` capability, the ⌘K command palette's
  Navigate group shall include a **"Projects & Processes"** item that activates to `/work/projects` and
  closes the palette; where the viewer does not hold `workline.manage`, the item shall not appear.
  *(Rule 9, Rule 11 — mirrors the existing `Signals` Navigate entry.)*
- **FR-803** — Where the viewer holds the `objective.manage` capability, the ⌘K command palette's
  Navigate group shall include an **"Objectives"** item that activates to `/work/objectives` and closes
  the palette; where the viewer does not hold `objective.manage`, the item shall not appear. *(Rule 9,
  Rule 11.)*
- **FR-804** — Adding FR-802/FR-803's items shall not remove, reorder-break, or re-gate any existing
  Navigate item (Home, Work, Signals, Events, Money, Inbox, Café); Money's existing `finance`/`admin`
  gate is unaffected. *(regression guard, Rule 11 — REWIRE not rebuild.)*
- **FR-805** — Where the desktop rail renders at `/work/projects` or `/work/objectives`, the system
  shall carry `aria-current="page"` on exactly one rail element (the active child) and
  `aria-current="location"` on the Work parent, with no other rail element carrying `page`. *(Rule 5 —
  coverage lock for the exact re-homed routes; behavior already shipped, this closes a unit-test gap.)*

## 4. Non-functional requirements

- **NFR-801 (no schema).** Zero migrations, zero RLS changes, zero pgTAP. *(buildout row 8: DB/RLS = no.)*
- **NFR-802 (no new e2e).** Only Vitest/RTL. The 3 curated Playwright journeys (F1/F2/F3) are
  unaffected; the existing Step-2 `shell-routes-redirects`/`shell-aria-current` e2e already cover this
  surface's cross-stack shape and are not extended here.
- **NFR-803 (reuse — Rule 11).** No new React component. `SearchRedirect`, `can()`, `CommandItem`,
  `RailNav`, `CatalogManager`, and the i18n keys are all reused as-is or minimally extended in place.
- **NFR-804 (coverage / gates).** ≥80% lines on changed code; `npm run typecheck` zero errors;
  `npm run lint -- --max-warnings=0` zero errors. Both block merge.
- **NFR-805 (bilingual).** No new user-facing string is introduced — the two new palette items reuse
  the already-shape-identical `nav.work.projects`/`nav.work.objectives` en/id keys.

## 5. Acceptance criteria (Given/When/Then), owning test layer

> Test pyramid: **all Vitest/RTL** (mocked `useAuth`/`can()` inputs). No pgTAP (no schema). No new e2e
> (cross-stack shape already proven by Step 2's existing curated specs). Each AC owned by ONE test;
> AC-id tagged in the owning test's title.

| ID | Given / When / Then | Owning test |
|---|---|---|
| **AC-801** | *Given* `/objectives?foo=bar` is requested, *When* the route resolves, *Then* it redirects (replace) to `/work/objectives?foo=bar` — the query string survives. | `mos-app/src/router.test.tsx` (render-level `SearchRedirect` probe) |
| **AC-802** | *Given* `/projects-processes?foo=bar`, *When* resolved, *Then* it redirects to `/work/projects?foo=bar`. | `router.test.tsx` |
| **AC-803** | *Given* `/work/projects-processes?foo=bar`, *When* resolved, *Then* it redirects to `/work/projects?foo=bar`. | `router.test.tsx` |
| **AC-804** | *Given* an admin viewer (holds both `workline.manage` and `objective.manage`) opens ⌘K, *When* the Navigate group renders, *Then* both "Projects & Processes" and "Objectives" appear; activating "Projects & Processes" navigates to `/work/projects` and closes the palette; activating "Objectives" navigates to `/work/objectives` and closes the palette. | `mos-app/src/components/command/command-menu.test.tsx` |
| **AC-805** | *Given* an `ops_lead` viewer (holds only `workline.manage`) opens ⌘K, *When* the Navigate group renders, *Then* "Projects & Processes" appears and "Objectives" does **not**. | `command-menu.test.tsx` |
| **AC-806** | *Given* a plain member (no capabilities) opens ⌘K, *When* the Navigate group renders, *Then* neither "Projects & Processes" nor "Objectives" appears, and the pre-existing items (Home, Work, Signals, Events, Inbox, Café) are all still present. | `command-menu.test.tsx` |
| **AC-807** | *Given* an admin viewer at `/work/projects`, *When* the desktop rail renders, *Then* exactly one `[aria-current="page"]` exists in the rail and it names "Projects & Processes"; the Work parent carries `aria-current="location"`. | `mos-app/src/shell/rail-nav.test.tsx` |
| **AC-808** | *Given* an admin viewer at `/work/objectives`, *When* the desktop rail renders, *Then* exactly one `[aria-current="page"]` exists and it names "Objectives"; the Work parent carries `aria-current="location"`. | `rail-nav.test.tsx` |

### FR → AC coverage
FR-801 → AC-801, AC-802, AC-803 · FR-802 → AC-804, AC-805 · FR-803 → AC-804, AC-805, AC-806 ·
FR-804 → AC-806 · FR-805 → AC-807, AC-808.

## 6. Open decision for owner/Director sign-off — RATIFY-BEFORE-MERGE

**Should the phone "More" menu (`mobile-drawer.tsx`) also list the two capability-gated Work
children, or is the ⌘K Navigate group (this spec's FR-802/803) sufficient?**

- **Option A (this spec's conservative default, shipped):** ⌘K only. Rationale: mirrors the existing,
  already-shipped precedent for the Work child *Signals* — which is likewise absent from the phone More
  menu (it lists only non-primary top-level `Destination`s: Events/Money/Ecommerce/Roastery/Admin/
  Profile) and reachable on phone only via ⌘K. Smaller diff, no new UI section, consistent grammar
  with an existing shipped pattern.
- **Option B:** also add a capability-filtered "Work" row-group to `mobile-drawer.tsx`'s More menu
  (new `Overline` reuse + 0-2 links). Slightly more discoverable for a viewer who does not know the ⌘K
  shortcut exists, but introduces a new visual section to a surface Step 2 explicitly scoped to
  "every authorized **non-primary destination**" (Work is primary) — a small, deliberate widening of
  that surface's contract.
- **Recommendation:** **Option A.** It closes the real Rule-9 gap (a capability holder had *zero*
  non-desktop path; now they have one) at the lowest risk, matches the one existing precedent exactly,
  and can be revisited as a fast follow-up if the owner's cold-start walkthrough (Rule 12, capability
  holder persona) finds ⌘K insufficiently discoverable.

No other ambiguity was found: rail labels/order ("Signals · Tasks · Projects & Processes · Objectives")
are already locked and match `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` L36
and the shipped `destinations.tsx`/`sections.tsx`; the manage-page content, capability seeds
(`admin`→both, `ops_lead`→`workline.manage`), and redirect targets are unchanged from Step 2/OD-WS-1.

## 7. Error-handling table

| Scenario | Required behavior |
|---|---|
| Legacy route with no query string (`/objectives`) | Redirects to `/work/objectives` with no trailing `?` (SearchRedirect passes through an empty `location.search` unchanged — same behavior already proven for `/tasks`, `/dashboard`, etc.). |
| Viewer's capabilities change mid-session (role edit not yet reflected in JWT) | Palette visibility follows the same `accessRoles` source the rail already uses (`useAuth().viewer.accessRoles`); no separate staleness handling introduced — matches existing JWT-claim staleness trade (OD-P4). |
| Viewer holds neither capability and searches "Projects" or "Objectives" in ⌘K | No matching Navigate item exists to filter to; only the record-search / actions groups (unaffected) may show unrelated matches — no crash, no dead-end. |

## 8. Verification

- Read and verified `router.tsx`, `router.test.tsx`, `command-menu.tsx`, `command-menu.test.tsx`,
  `rail-nav.tsx`, `rail-nav.test.tsx`, `mobile-drawer.tsx`, `mobile-drawer.test.tsx`, `destinations.tsx`,
  `sections.tsx`, `breadcrumb.test.tsx`, `bottom-tab-bar.tsx`/`.test.tsx`, `require-capability.tsx`,
  `objectives-page.tsx`, `projects-processes-page.tsx`, `catalog-manager.tsx`, `lib/capabilities.ts`,
  `i18n/messages.ts` against the shipped repo state.
- Confirmed the master-plan row-8 reuse column ("catalog screens — RELABEL/re-home only") is satisfied:
  zero new components, zero schema.
- Confirmed no FR-8xx/AC-80x id collision exists elsewhere in `docs/specs/`.

SPEC-DONE

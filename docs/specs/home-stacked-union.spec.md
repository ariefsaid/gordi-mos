# Spec — Home stacked-union cockpit (Issue E)

- **Feature:** Home (`/`) refactored from the v1 flat KPI rows into a **stacked-union cockpit** — Home
  composes the **union of the role-scopes a person holds** as ONE scrollable surface, **widest-scope
  section first**. Ships behind feature flag `SHOW_HOME_STACKED` (default **false**); Home v1 stays the
  default until the flag flips, so both compositions coexist.
- **Status:** Spec-first (Issue E). Owner-confirmed model (`docs/decisions.md` "Continued grill session
  2" → **Home composition**).
- **Authority (conform):** `docs/decisions.md` "Home composition" (stacked-union; NOT a toggle, NOT a
  separate login; widest-scope-first; deferred workspaces/toggle), `CONTEXT.md` → **Home** / **My Week**,
  `docs/jtbd.md` §2 (the four Home rows) + §3.6 (visibility direction) + §3.10 / anchor **A4**
  (drill-not-dead-end), `docs/specs/home-v1.spec.md` (the tiles + My Week panel reused), `DESIGN.md`
  tokens.
- **Non-goals:** no schema change (compose over existing data/read-models); no AR tile (parallel slice);
  no ops-KPI metric set (owner-DEFERRED); no BU-scoped money read-model (parallel slice); no toggle /
  separate login / workspaces (deferred v2); no rebuild of the v1 tiles or My Week (reuse).

## 1. Overview

Home today (v1, `home-page.tsx`) is a flat surface: a role-guarded finance KPI row + an everyone row +
the My Week panel. Per the owner-confirmed stacked-union decision, Home becomes a **role-aware
composition**: the viewer's distinct jobs (owner-director · function-owner/BU-head · lead/manager ·
contributor/member) stack as **one scrollable surface, widest-scope section first**. A person holding
several scopes (e.g. a BU-head who is also a lead) sees the **union, stacked** — function cockpit THEN
My Week below — **not a toggle, not a separate login**.

The stacked composition is a **new composition layer over existing tiles + My Week** (ADR-0019 D2
"component survives"): the revenue/margin tiles, the My Week panel, and the My Week task table are
reused unchanged. The new code is (a) a pure **role-union → ordered-sections** selector, (b) the section
wrappers (cockpit / capture-first), and (c) two clearly-marked **slots for parallel slices**: a
**money-position section container** (renders the existing revenue/margin tiles at company scope; a
BU-scoped slot + an AR slot for the parallel money slice) and an **ops-KPI empty-state placeholder**
(owner-deferred). Every rendered tile/number drills (anchor A4); money is BU-scoped; a member sees no
finance section.

## 2. Design decisions (behavior statements)

- **2.1 Stacked union, widest-scope-first.** Home composes the **union of the role-scopes the viewer
  holds** as one scrollable surface. Section order is fixed: `owner-cockpit` → `function-cockpit`(s,
  one per BU headed, ordered by BU name) → `my-week` (or `capture-first`). Not a toggle, not a separate
  login — the same person's distinct jobs stack in one Home.
- **2.2 Role-scope detection (compose over the existing role tree, no schema change).** Scopes are
  derived purely from `shared.roles` (already read by `resolveViewer`) + access roles:
  - **owner-director** ↔ the viewer holds a role with `reports_to_role_id IS NULL` (top-of-chain).
  - **function-owner/BU-head** ↔ the viewer holds a role that is the **apex of its BU** — a role with a
    `business_unit_id` whose parent (reports-to) is null, missing, or in a *different* BU. One
    function-cockpit section per distinct BU headed (deduped by `business_unit_id`).
  - **lead/manager** ↔ `viewer.isManager` (already derived from the role chain, OD-P1-7).
  - **contributor/member** ↔ none of the above (a `member` access holder with no wider scope).
- **2.3 Personal section rule.** The owner-director, any BU-head, and any manager get the **My Week**
  section (the existing panel — the personal R/A task table + strips + manager team module). A **pure
  contributor/member** (no owner/BU-head/manager scope) gets the **capture-first** section instead.
- **2.4 Cockpit content (owner + function).** Each cockpit section renders: a scoped **money-position
  section** + an **ops-KPI empty-state placeholder** + a **cascade drill** to `/work/cascade`.
- **2.5 Money-position section = a scoped container (slots for parallel slices).**
  - **Company scope** (owner-cockpit): renders the **existing** revenue/margin tiles (reused verbatim,
    finance/admin-gated via the existing role-guarded fetch — never a misleading zero) + an **AR slot**
    (a clearly-marked, self-contained drop point for the parallel slice's AR tile; placeholder copy
    now, **no invented AR tile**) + an **AP / unbilled / unearned** placeholder strip (visibility +
    drill phased later).
  - **BU scope** (function-cockpit): renders a **BU-scoped money slot** (placeholder — "[BU] revenue ·
    margin — coming; scoped to your BU") + the same AR slot. It does **NOT** render the whole-company
    tiles (that would violate §3.6 visibility direction). The parallel money slice fills this BU slot.
- **2.6 Ops-KPI = owner-deferred empty-state (no fake numbers, no dead-end).** The ops-KPI section is a
  documented empty-state placeholder ("Ops KPIs — coming; the metric set is owner-decided") with a drill
  to `/ops` (the current floor-visibility surface) as the interim next action. No hardcoded metrics.
- **2.7 Visibility direction (binding invariant).** A BU-head sees **only their BU's** money (the
  BU-scoped slot — never whole-company tiles, never another BU's); a member sees **no finance section
  at all**. Enforced in the composition logic (§2.2/2.5) and covered by tests.
- **2.8 Drill-not-dead-end (anchor A4).** Every rendered tile/number drills (revenue/margin → `/sales`;
  cascade → `/work/cascade`; capture CTA → `/ops/new`; tasks → `/tasks/:id` via MyTasksCard). The
  ops-KPI placeholder drills to `/ops`; the BU money slot is an honest empty-state (no number to
  dead-end on). No figure displays without a drill target.
- **2.9 Feature flag.** `SHOW_HOME_STACKED` (default `false` in `features.ts`). When off, the `/` route
  renders Home v1 (`HomePage`) unchanged; when on, it renders the stacked-union Home. Both compositions
  coexist behind the flag.
- **2.10 Reuse, not rewrite.** The stacked layer reuses `MyWeekPanel` (My Week section), `MyTasksCard`
  (capture-first section), the revenue/margin reporting DAL + `KPITile` primitive (money-position
  section), and the `FreshnessLabel`. No tile is rebuilt; the composition is the new code.

## 3. Functional requirements (EARS)

### Composition (role-union → ordered sections)

- **FR-HS01:** When an authenticated viewer navigates to `/` with `SHOW_HOME_STACKED` enabled, the
  system shall render a single scrollable surface composed of the **union of the viewer's role-scopes**,
  ordered widest-scope-first (owner-cockpit → function-cockpit(s) → my-week/capture-first).
- **FR-HS02:** When the viewer holds the top-of-chain role (`reports_to_role_id IS NULL`), the system
  shall render the **owner-cockpit** section (whole-company scope).
- **FR-HS03:** When the viewer holds the apex role of one or more Business Units, the system shall
  render one **function-cockpit** section per BU headed (deduped by BU, ordered by BU name), each scoped
  to that BU only.
- **FR-HS04:** When the viewer is a manager (`isManager`), or an owner-director, or a BU-head, the
  system shall render the **My Week** section (the existing `MyWeekPanel`).
- **FR-HS05:** When the viewer is a pure contributor/member (no owner/BU-head/manager scope), the
  system shall render the **capture-first** section and no cockpit section.
- **FR-HS06:** When `SHOW_HOME_STACKED` is disabled, the system shall render Home v1 (`HomePage`)
  unchanged at `/`.

### Money-position section (slots)

- **FR-HS10:** When the owner-cockpit renders and the viewer holds `finance`/`admin`, the system shall
  render the existing revenue/margin tiles (role-guarded fetch reused) inside the money-position
  section, each drilling to `/sales`.
- **FR-HS11:** When the owner-cockpit renders and the viewer lacks `finance`/`admin`, the system shall
  render no whole-company money tiles (no misleading zero).
- **FR-HS12:** When a function-cockpit renders, the system shall render a BU-scoped money slot
  (placeholder) and shall **not** render the whole-company revenue/margin tiles (visibility direction).
- **FR-HS13:** When any money-position section renders, the system shall include a clearly-marked,
  self-contained **AR tile slot** (a drop point for the parallel slice) containing placeholder copy and
  no invented AR figure.

### Ops-KPI placeholder

- **FR-HS20:** When a cockpit section renders, the system shall render an ops-KPI empty-state
  ("coming", no fake numbers) that drills to `/ops`.

### Capture-first (contributor)

- **FR-HS30:** When the capture-first section renders, the system shall render a fast-capture call to
  action drilling to `/ops/new` and the viewer's assigned R/A task table (`MyTasksCard`), and shall
  render **no finance section**.

### Cascade drill (cockpits)

- **FR-HS40:** When a cockpit section renders, the system shall render a cascade drill linking to
  `/work/cascade`.

### i18n + a11y

- **FR-HS50:** Every new section label shall resolve through the i18n catalog in both `en` and `id`.
- **FR-HS51:** Each section shall be a landmark `<section aria-labelledby>` with a heading; the page
  shall be navigable by heading (WCAG-AA).

## 4. Non-functional requirements

- **NFR-HS01 (no schema change):** The slice adds no migration; it composes over `shared.roles`,
  `shared.business_units`, the `reporting` read-models, and existing DALs.
- **NFR-HS02 (phone-first):** The stacked surface reflows with no horizontal scroll on a ≤380px
  viewport; sections stack vertically; KPI grids reflow `auto-fit minmax(160px,1fr)`.
- **NFR-HS03 (WCAG-AA):** Headings establish section structure; tiles/links have accessible names;
  color contrast meets AA.
- **NFR-HS04 (i18n):** All new user-facing strings flow through the catalog (`en`/`id` parity).
- **NFR-HS05 (de-reference firewall):** No external/brand/AGPL references; tokens from `DESIGN.md`.

## 5. Acceptance criteria

### Composition logic (Vitest — `src/lib/home-stack.test.ts`)

- **AC-HS01 (selector):** Given a viewer holding the top-of-chain role, when `deriveHomeStack` runs,
  then the sections are `[owner-cockpit, my-week]`.
- **AC-HS02 (selector):** Given a viewer holding the apex role of one BU (and not the top-of-chain, not
  a manager), when `deriveHomeStack` runs, then the sections are `[function-cockpit(bu), my-week]`.
- **AC-HS03 (selector):** Given a viewer holding the apex roles of two BUs (dual-hat, not manager),
  when `deriveHomeStack` runs, then the sections are `[function-cockpit(buA), function-cockpit(buB),
  my-week]`, ordered by BU name.
- **AC-HS04 (selector):** Given a BU-head who is also a manager, when `deriveHomeStack` runs, then the
  sections are `[function-cockpit(bu), my-week]` (union stacked, no duplicate my-week).
- **AC-HS05 (selector):** Given an owner-director who is also a manager, when `deriveHomeStack` runs,
  then the sections are `[owner-cockpit, my-week]`.
- **AC-HS06 (selector):** Given a pure contributor (member access, no owner/BU-head/manager scope),
  when `deriveHomeStack` runs, then the sections are `[capture-first]` (no cockpit, no my-week).
- **AC-HS07 (selector — BU apex):** Given a viewer holding a mid-chain role (reports up to another role
  in the SAME BU), when `deriveHomeStack` runs, then that BU is NOT headed (no function-cockpit for it).

### Render + visibility direction (Vitest/RTL — `src/pages/stacked-union-home.test.tsx`)

- **AC-HS10 (render):** Given `SHOW_HOME_STACKED` is on and a multi-role (dual BU-head) viewer, when
  Home renders, then two function-cockpit sections + the My Week section appear, in that order.
- **AC-HS11 (visibility — member):** Given a pure member viewer, when Home renders, then no finance
  section, no cockpit, and no whole-company revenue/margin tiles appear; the capture-first section
  appears (no finance row).
- **AC-HS12 (visibility — BU-head own-BU):** Given a BU-head viewer (no finance/admin), when Home
  renders, then the whole-company revenue/margin tiles do NOT appear inside the function-cockpit (only
  the BU-scoped money slot); the finance DAL is not issued for whole-company tiles at BU scope.
- **AC-HS13 (drill — no dead-ends):** Given a cockpit renders, then the revenue/margin tiles (when
  present) link to `/sales`, the ops-KPI placeholder links to `/ops`, and the cascade drill links to
  `/work/cascade`.
- **AC-HS14 (slot — AR):** Given a money-position section renders, then a clearly-marked AR slot
  element is present (drop point for the parallel slice) with no invented AR figure.
- **AC-HS15 (flag off):** Given `SHOW_HOME_STACKED` is off, when the `/` route resolves, then Home v1
  (`HomePage`) renders (the stacked component is not mounted).

### E2E (Playwright — `e2e/home-stacked-union.spec.ts`)

- **AC-HS20 (e2e):** Given a multi-role persona (dual BU-head), when they open Home, then a
  function-cockpit section AND the My Week section are both visible, stacked.
- **AC-HS21 (e2e):** Given a pure member, when they open Home, then the capture-first section is
  visible and no cockpit/finance section is visible.
- **AC-HS22 (e2e — phone):** Given a ≤380px viewport, when Home renders, then there is no horizontal
  scroll (`scrollWidth ≤ clientWidth`).

## 6. Data model integration

No schema change. The composition reads:
- `viewer.roles` + `viewer.isManager` + `viewer.accessRoles` (from `resolveViewer`, already resolved at
  auth time) — for role-scope detection.
- `shared.roles` (all org roles — to test BU apex: the parent role's `business_unit_id`) and
  `shared.business_units` (BU id→name) via the existing `shared` schema directory reads
  (org-readable, OD-P1-3).
- The `reporting` revenue/margin read-models (reused verbatim) for the company-scope money tiles.
- Existing DALs (`listTasks`, `getTodayOpsSummary`, weekly-updates) via the reused `MyWeekPanel` /
  `MyTasksCard`.

## 7. Test layer ownership

| AC | Owning test | Layer |
|---|---|---|
| AC-HS01–HS07 | `mos-app/src/lib/home-stack.test.ts` | Vitest (Unit — pure selector) |
| AC-HS10–HS15 | `mos-app/src/pages/stacked-union-home.test.tsx` | Vitest/RTL (Unit — render/visibility) |
| AC-HS20–HS22 | `mos-app/e2e/home-stacked-union.spec.ts` | Playwright (E2E — curated journey) |

## 8. Edge cases + error handling

| Scenario | Behavior |
|---|---|
| Viewer holds no org role (authenticated, no scope) | `capture-first` only (defensive default). |
| Owner lacks `finance`/`admin` (defensive) | owner-cockpit renders; money section renders no whole-company tiles (no misleading zero). |
| BU-head also holds `finance` | function-cockpit still shows the BU-scoped slot (not whole-company tiles); whole-company money is on `/sales`. |
| Reporting fetch errors / loading | company-scope money tiles degrade independently (reused v1 behavior); rest of the stack renders. |
| Two roles apex the same BU | deduped to one function-cockpit for that BU. |
| Locale key missing | falls back to `en` then the key (never throws). |

## 9. Slots left for parallel slices

- **Money-position section container** (`<MoneyPositionSection scope=…/>`): a reusable scoped component.
  At `company` scope it carries the existing revenue/margin tiles now; at `bu` scope it is the
  BU-scoped slot. Both scopes expose a self-contained **AR tile slot** (`[data-money-ar-slot]`) for the
  parallel AR/Follow-up slice to drop its tile into — no invented AR figure this slice.
- **Ops-KPI section** (`<OpsKpiSection scope=…/>`): an empty-state placeholder + `/ops` drill. The
  owner-decided metric set lands in a later slice; the slot is documented, not faked.

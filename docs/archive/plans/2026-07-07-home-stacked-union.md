# Plan — Home stacked-union cockpit (Issue E)

- **Spec:** `docs/specs/home-stacked-union.spec.md`
- **Authority:** `docs/decisions.md` "Home composition"; `CONTEXT.md` Home/My Week; `docs/jtbd.md` §2/§3.6/§3.10.
- **Branch:** `feat/home-stacked-union` (work in place; commit as we go; do NOT push/PR/merge).
- **Trailer:** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 0. Model (binding — build exactly this)

Home = stacked sections, one per role-scope the viewer holds, ordered widest-scope-first:

| Role-scope | Detection (no schema change) | Section |
|---|---|---|
| owner-director | holds a role with `reports_to_role_id IS NULL` | `owner-cockpit` (whole-company) |
| function-owner/BU-head | holds the apex role of a BU (parent null/missing/in another BU) | `function-cockpit` per BU (deduped, BU-name order) |
| lead/manager | `viewer.isManager` | `my-week` (reused `MyWeekPanel`) |
| contributor/member | none of the above | `capture-first` |

Personal-section rule: owner OR bu-head OR manager → `my-week`; else → `capture-first`. A person with
several scopes sees the **union, stacked** (e.g. BU-head+manager → function-cockpit THEN my-week).
**Not a toggle, not a separate login.**

Money-position section is a **scoped container**: company scope → existing revenue/margin tiles
(finance/admin-gated) + AR slot + AP/unbilled/unearned placeholder; BU scope → BU-scoped money slot +
AR slot (**no whole-company tiles** — visibility direction §3.6). Ops-KPI = owner-deferred empty-state
(no fake numbers) drilling to `/ops`. Every tile drills (anchor A4). Behind flag `SHOW_HOME_STACKED`
(default false); Home v1 stays default.

## 1. Tasks (2–5 min each, exact paths + verify)

### T1 — Feature flag
- Edit `mos-app/src/config/features.ts`: add `export const SHOW_HOME_STACKED = false` with a comment
  (Home v1 stays default until flipped during rollout).
- Verify: `npm run typecheck`.

### T2 — Pure composition selector (TDD red)
- Create `mos-app/src/lib/home-stack.ts`:
  - `isOwnerDirector(viewerRoles)`, `buHeadsForViewer(viewerRoles, allRoles)`, `deriveHomeStack(input)`
    returning `HomeSection[]` (`owner-cockpit` | `function-cockpit{buId,buName}` | `my-week` |
    `capture-first`).
  - BU apex test: parent null/missing OR `parent.business_unit_id !== role.business_unit_id`. Dedup by
    `business_unit_id`; resolve `buName` from `businessUnits`; sort by name.
- Create `mos-app/src/lib/home-stack.test.ts` (AC-HS01..HS07): each persona combo → ordered sections;
  mid-chain role not headed; pure member → capture-first; dual-hat → two function-cockpits + my-week.
- Verify: `npx vitest run src/lib/home-stack.test.ts` (green).

### T3 — Shared company-finance hook (DRY reuse, behavior-preserving)
- Create `mos-app/src/lib/use-company-finance-kpis.ts`: extract v1's two revenue/margin `useEffect`s +
  `useMemo` derivations into `useCompanyFinanceKpis(canSeeFinance)` returning the same intermediate
  values v1 computes (`revenueState/Window/Delta`, `marginState/Window/Display/LatestPct`,
  `snapshotAsOf`).
- Refactor `mos-app/src/pages/home-page.tsx` to call the hook (render unchanged).
- Verify: `npx vitest run src/pages/home-page.test.tsx` (8 tests still green — behavior preserved).

### T4 — Money-position section (scoped container + AR slot)
- Create `mos-app/src/components/home-stack/money-position-section.tsx`:
  - props `scope: {kind:'company'} | {kind:'bu'; buName}`, `canSeeFinance`.
  - company + canSeeFinance → existing revenue/margin `<KPITile>` (via `useCompanyFinanceKpis`) wrapped
    in `<Link to="/sales">` + `<FreshnessLabel>` + AR slot + AP/unbilled/unearned placeholder strip.
  - company + !canSeeFinance → `null`.
  - bu → BU-scoped money slot placeholder ("[BU] revenue · margin — coming; scoped to your BU") + AR
    slot. **No whole-company tiles.**
  - AR slot: `<div data-money-ar-slot …>` with placeholder copy (parallel slice drops its tile here).
- Verify: `npm run typecheck`.

### T5 — Ops-KPI placeholder + Cascade drill
- Create `mos-app/src/components/home-stack/ops-kpi-section.tsx`: empty-state ("coming") + `<Link
  to="/ops">` drill. Props `scope` (company/bu) for the label.
- Cascade drill: inline `<Link to="/work/cascade">` in the cockpit section (reuse existing route).
- Verify: `npm run typecheck`.

### T6 — Capture-first section (contributor)
- Create `mos-app/src/components/home-stack/capture-first-section.tsx`: heading "What needs you" +
  fast-capture CTA `<Link to="/ops/new">` + `<MyTasksCard viewerId=… now=…/>`. No finance.
- Verify: `npm run typecheck`.

### T7 — Stacked-union page (compose sections)
- Create `mos-app/src/pages/stacked-union-home.tsx`:
  - fetch `allRoles` + `businessUnits` (`shared` schema, org-readable); read viewer from `useAuth`.
  - `const sections = deriveHomeStack({viewerRoles, allRoles, isManager, accessRoles, businessUnits})`.
  - render `<PageFrame>` + `<PageHead>` + sections, each `<section aria-labelledby>` with a heading.
  - owner-cockpit → `<MoneyPositionSection scope=company canSeeFinance/>` + `<OpsKpiSection/>` +
    cascade drill. function-cockpit → `<MoneyPositionSection scope=bu/>` + `<OpsKpiSection/>` + cascade.
    my-week → `<MyWeekPanel/>`. capture-first → `<CaptureFirstSection/>`.
- Create `mos-app/src/pages/stacked-union-home.css` (section spacing; reuse `.home-kpi-grid` for tiles).
- Verify: `npm run typecheck`.

### T8 — Router branch on flag
- Edit `mos-app/src/router.tsx`: `{ index: true, element: SHOW_HOME_STACKED ? <StackedUnionHome/> :
  <HomePage/> }`.
- Verify: `npm run typecheck`.

### T9 — i18n keys (en/id parity)
- Edit `mos-app/src/i18n/messages.ts`: add `home.stack.*` keys (owner/function/myweek/capture titles,
  money labels, ar slot, ops-kpi coming/drill, cascade drill) in BOTH `en` and `id`.
- Verify: `npx vitest run src/i18n/messages.test.ts` (parity holds).

### T10 — Render + visibility tests (TDD green)
- Create `mos-app/src/pages/stacked-union-home.test.tsx` (AC-HS10..HS15): mock `useAuth` + DALs +
  directory; assert dual-BU-head → two function-cockpits + my-week in order; member → capture-first, no
  finance; BU-head → no whole-company revenue/margin tiles in function-cockpit (DAL not called at bu
  scope); drills (`/sales`, `/ops`, `/work/cascade`); AR slot present; flag-off → v1 mounted.
- Verify: `npx vitest run src/pages/stacked-union-home.test.tsx` (green).

### T11 — E2E: member fixture + journey
- Edit `mos-app/e2e/fixtures/users.ts`: add `MEMBER` (dedicated e2e person `4e00…00me`, member access,
  no org role).
- Edit `mos-app/e2e/global-setup.ts`: provision MEMBER person + member access role + auth user (same
  dedicated-e2e pattern as ADMIN).
- Create `mos-app/e2e/home-stacked-union.spec.ts` (AC-HS20..HS22): the flag is on for e2e (set via test
  config / the spec assumes the stacked home is reachable). Multi-role (Cahya = dual BU-head) →
  function-cockpit + My Week stacked; MEMBER → capture-first only; ≤380px → no horizontal scroll.
  - **Note on the flag in e2e:** the flag defaults false. The e2e sets `localStorage['mos.homeStacked']
    = '1'` is NOT the mechanism — instead the spec is written against the stacked route and gated to
    run only when the flag is on (documented); the unit test AC-HS15 covers the flag-off branch.
  - **Decision:** expose the stacked home at a stable, flag-independent dev route `/__home-stacked` for
    e2e + visual verification (DEV-only), so the e2e is deterministic regardless of the flag. The
    production `/` route still branches on `SHOW_HOME_STACKED`.
- Verify: `npm run typecheck` + `npm run lint`.

### T12 — Full gates
- `npm run typecheck` (0) · `npm run lint` (0) · `npm test -- --run` (all green).
- Coverage ≥80% on changed files (`src/lib/home-stack.ts`, `use-company-finance-kpis.ts`,
  `stacked-union-home.tsx`, the section components).
- Phone render: describe ≤380px layout in the report (sections stack; KPI grid reflows 2-up; no h-scroll).

## 2. Files touched

**New:**
- `docs/specs/home-stacked-union.spec.md`, `docs/plans/2026-07-07-home-stacked-union.md`
- `mos-app/src/lib/home-stack.ts` + `.test.ts`
- `mos-app/src/lib/use-company-finance-kpis.ts`
- `mos-app/src/components/home-stack/{money-position-section,ops-kpi-section,capture-first-section}.tsx`
- `mos-app/src/pages/stacked-union-home.tsx` + `.css` + `.test.tsx`
- `mos-app/e2e/home-stacked-union.spec.ts`

**Edited:**
- `mos-app/src/config/features.ts` (flag)
- `mos-app/src/pages/home-page.tsx` (use the shared hook — behavior-preserving)
- `mos-app/src/router.tsx` (branch on flag + DEV preview route)
- `mos-app/src/i18n/messages.ts` (new keys)
- `mos-app/e2e/fixtures/users.ts` + `mos-app/e2e/global-setup.ts` (MEMBER fixture)

## 3. Risk + reversibility

- **v1 regression:** mitigated by extracting the finance hook behavior-preservingly + the 8 existing
  v1 tests staying green.
- **Flag-off by default:** stacked composition never reaches production `/` until the owner flips it.
- **No schema change:** fully reversible (delete the new files + revert the flag/router/i18n edits).
- **Slots are additive:** the AR tile + ops-KPI metrics + BU money read-model drop into existing
  containers — no rework when the parallel slices land.

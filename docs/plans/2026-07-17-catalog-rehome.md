# Plan — Redesign buildout Step 8: Projects & Processes + Objectives re-home

| | |
|---|---|
| **Spec** | `docs/specs/catalog-rehome.spec.md` |
| **Buildout step** | `docs/plans/2026-07-14-redesign-buildout.md` row 8 |
| **Authority** | Experience Contract Rules **4, 9, 11** |
| **DB/RLS** | **None.** No schema, RLS, RPC, or DAL contract change. |
| **e2e** | **None new.** Existing Step-2 `e2e/shell-routes-redirects.spec.ts` +
  `e2e/shell-aria-current.spec.ts` already cover this surface's cross-stack shape and run via CI
  dispatch only — not exercised by this plan's tasks. |

Step 8's route/page/rail/breadcrumb work was already delivered early by Step 2
(`docs/plans/2026-07-14-redesign-shell-routes.plan.md` T9/T10/T12) — see spec §0 for the full
evidence table. This plan closes the **two concrete gaps** that were left open, plus one coverage
lock, all as REWIRE of already-shipped helpers (Rule 11) with **zero new production components**.

---

## 1. Design decisions (carried from the spec)

### D1 — Fix the redirects by reusing `SearchRedirect`, not by inventing new logic
`SearchRedirect` is already defined and exported at the top of `mos-app/src/router.tsx` and already
used for 6 other retired routes (`/tasks`, `/dashboard`, `/sales`, `/kitchen/*`, `/plan/budget`,
`/plan/pricing`). The 3 catalog redirects are the only remaining bare `<Navigate>` usages for a
retired route that could plausibly carry query state. Swapping the `element` is a one-line change
per route.

### D2 — Command palette gating: pre-filter the array, don't extend the `gated` boolean semantics
`CommandItem.gated` today means exactly one thing: "hidden unless `moneyAuthorized`." Rather than
overload it with a second unrelated capability check, the two new items are conditionally `push`ed
into the `navigateItems` array (computed once per render from `can(accessRoles, …)`), so `gated`
keeps its single existing meaning for Money and no existing filter logic changes.

### D3 — Order mirrors the Work child order already established by the rail
Rail order is Signals · Tasks · Projects & Processes · Objectives. The palette's Navigate group
already lists Work (=Tasks) then Signals; the two new items are inserted **immediately after
Signals**, so the palette's Work-family ordering matches the rail's, keeping "the same reachable
records, the same command meanings" across form factors (Rule 9).

### D4 — Rail coverage lock is expected to be a zero-diff verification
`rail-nav.tsx` already filters Work's capability-gated children (L108) and already implements the
Rule-5 `aria-current` machinery generically (proven today at `/work/signals`, `/work/tasks`,
`/work/tasks/:taskId`, `/`, `/money`, `/cafe/log`, `/admin/people`). Adding the same assertion shape
at `/work/projects` and `/work/objectives` is expected to pass with **no production change** — this
closes a coverage gap on already-correct behavior, mirroring the "zero-diff verification" pattern
used by `docs/plans/2026-07-15-redesign-tasks-rehome.plan.md` Tasks 9–10.

---

## 2. File inventory — REWIRE vs REUSE-AS-IS (Rule 11)

### Production files

| Path | Status | Exact seam |
|---|---|---|
| `mos-app/src/router.tsx` | **REWIRE** | 3 routes' `element` changes from `<Navigate to="…" replace />` to `<SearchRedirect to="…" />`. |
| `mos-app/src/components/command/command-menu.tsx` | **REWIRE** | Import `can`; compute `projectsAuthorized`/`objectivesAuthorized`; conditionally push 2 `CommandItem`s into `navigateItems`. |
| `mos-app/src/shell/rail-nav.tsx` | **REUSE-AS-IS** | No change expected (D4). |
| `mos-app/src/lib/capabilities.ts` | **REUSE-AS-IS** | `can()` consumed, not modified. |
| `mos-app/src/i18n/messages.ts` | **REUSE-AS-IS** | `nav.work.projects`/`nav.work.objectives` keys already exist en/id. |
| `mos-app/src/shell/mobile-drawer.tsx` | **NOT TOUCHED** | Spec §6 RATIFY — Option A (conservative default) leaves this file alone. |

### Existing test files to extend

| Path | Status | Coverage added |
|---|---|---|
| `mos-app/src/router.test.tsx` | **REWIRE** | 3 updated element-equality assertions (`SearchRedirect` not `Navigate`) + a new render-level probe proving query-string preservation for all 3 routes (AC-801/802/803). |
| `mos-app/src/components/command/command-menu.test.tsx` | **REWIRE** | New describe block: admin sees + can activate both new items; ops_lead sees only Projects & Processes; member sees neither and all pre-existing items are unaffected (AC-804/805/806). |
| `mos-app/src/shell/rail-nav.test.tsx` | **REWIRE** | New describe block: `aria-current` uniqueness at `/work/projects` and `/work/objectives` (AC-807/808). |

No other test file changes. `mobile-drawer.test.tsx`, `breadcrumb.test.tsx`, `destinations.test.ts`,
`bottom-tab-bar.test.tsx`, `require-capability.test.tsx` are untouched — already green, already
proving what they own (spec §0 table).

---

## 3. Parallelization map

Three independent lanes — disjoint files, no shared state, safe to build concurrently (e.g. 3
builders in parallel, or 3 sequential sessions in any order):

| Lane | Tasks | Files touched | Depends on |
|---|---|---|---|
| **A — Redirects** | 1, 2 | `router.tsx`, `router.test.tsx` | nothing |
| **B — Command palette** | 3, 4 | `command-menu.tsx`, `command-menu.test.tsx` | nothing |
| **C — Rail coverage lock** | 5 | `rail-nav.test.tsx` (no production file) | nothing |

Task 6 (full gate) runs after all three lanes land.

---

## 4. Exact task plan (TDD-first, 2–5 minute tasks)

### Lane A — Redirect deep-link preservation

## Task 1 — RED: legacy catalog redirects must preserve query strings

**Files:**
- `mos-app/src/router.test.tsx`

**Exact change:**

1. Add `useLocation` to the existing `react-router-dom` import (line 3):
   ```ts
   import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
   ```

2. Replace the `work/projects-processes` assertion (current lines 124-128):
   ```ts
   it('AC-006: /work/projects-processes redirects to /work/projects (replace)', () => {
     expect(shellChildren().find((r) => r.path === 'work/projects-processes')!.element).toEqual(
       <Navigate to="/work/projects" replace />,
     )
   })
   ```
   with:
   ```ts
   it('Step 8/AC-803: /work/projects-processes redirects to /work/projects via SearchRedirect (query preserved)', () => {
     expect(shellChildren().find((r) => r.path === 'work/projects-processes')!.element).toEqual(
       <SearchRedirect to="/work/projects" />,
     )
   })
   ```

3. Replace the `/objectives` + `/projects-processes` assertion (current lines 180-187):
   ```ts
   it('AC-006: /objectives + /projects-processes redirect to their Work children', () => {
     expect(shellChildren().find((r) => r.path === 'objectives')!.element).toEqual(
       <Navigate to="/work/objectives" replace />,
     )
     expect(shellChildren().find((r) => r.path === 'projects-processes')!.element).toEqual(
       <Navigate to="/work/projects" replace />,
     )
   })
   ```
   with:
   ```ts
   it('Step 8/AC-801/802: /objectives + /projects-processes redirect to their Work children via SearchRedirect (query preserved)', () => {
     expect(shellChildren().find((r) => r.path === 'objectives')!.element).toEqual(
       <SearchRedirect to="/work/objectives" />,
     )
     expect(shellChildren().find((r) => r.path === 'projects-processes')!.element).toEqual(
       <SearchRedirect to="/work/projects" />,
     )
   })
   ```

4. Add a new render-level describe block (append near the end of the "AC-006: Money canonical
   routes + redirects" describe, or as its own top-level describe after it):
   ```ts
   // Step 8 (catalog re-home) — AC-801/802/803: SearchRedirect actually preserves the query
   // string end-to-end for the 3 legacy catalog routes (not just wired to the helper).
   describe('Step 8/AC-801/802/803: legacy catalog routes preserve deep-link query strings', () => {
     function LocationProbe() {
       const loc = useLocation()
       return <div data-testid="location">{loc.pathname + loc.search}</div>
     }

     function renderRedirect(from: string, path: string, to: string) {
       return render(
         <MemoryRouter initialEntries={[from]}>
           <Routes>
             <Route path={path} element={<SearchRedirect to={to} />} />
             <Route path={to} element={<LocationProbe />} />
           </Routes>
         </MemoryRouter>,
       )
     }

     it('AC-801: /objectives?foo=bar redirects to /work/objectives?foo=bar', () => {
       renderRedirect('/objectives?foo=bar', '/objectives', '/work/objectives')
       expect(screen.getByTestId('location')).toHaveTextContent('/work/objectives?foo=bar')
     })

     it('AC-802: /projects-processes?foo=bar redirects to /work/projects?foo=bar', () => {
       renderRedirect('/projects-processes?foo=bar', '/projects-processes', '/work/projects')
       expect(screen.getByTestId('location')).toHaveTextContent('/work/projects?foo=bar')
     })

     it('AC-803: /work/projects-processes?foo=bar redirects to /work/projects?foo=bar', () => {
       renderRedirect('/work/projects-processes?foo=bar', '/work/projects-processes', '/work/projects')
       expect(screen.getByTestId('location')).toHaveTextContent('/work/projects?foo=bar')
     })
   })
   ```

**Satisfies:** FR-801; AC-801, AC-802, AC-803.

**Verify:**
`cd mos-app && npm test -- src/router.test.tsx`
(expect 6 failures: 3 element-equality assertions now expect `SearchRedirect` but the route table
still has `Navigate`; 3 new render probes fail because the route table doesn't redirect through
`SearchRedirect` yet.)

## Task 2 — GREEN: swap the 3 routes to `SearchRedirect`

**Files:**
- `mos-app/src/router.tsx`

**Exact change:**

Line 108 — before:
```ts
{ path: 'work/projects-processes', element: <Navigate to="/work/projects" replace /> },
```
after:
```ts
{ path: 'work/projects-processes', element: <SearchRedirect to="/work/projects" /> },
```

Lines 183-184 — before:
```ts
{ path: 'objectives', element: <Navigate to="/work/objectives" replace /> },
{ path: 'projects-processes', element: <Navigate to="/work/projects" replace /> },
```
after:
```ts
{ path: 'objectives', element: <SearchRedirect to="/work/objectives" /> },
{ path: 'projects-processes', element: <SearchRedirect to="/work/projects" /> },
```

No other line changes (`SearchRedirect` is already defined/exported earlier in this file; no new
import needed).

**Satisfies:** FR-801; AC-801, AC-802, AC-803.

**Verify:**
`cd mos-app && npm test -- src/router.test.tsx`
(expect all green, including the 6 assertions from Task 1.)

---

### Lane B — Command palette capability-gated reachability

## Task 3 — RED: ⌘K Navigate group surfaces catalog manage-mode per capability

**Files:**
- `mos-app/src/components/command/command-menu.test.tsx`

**Exact change:**

Add a new describe block after the existing `AC-016` describe (after line 187):
```ts
// ── Step 8 (catalog re-home) — AC-804/805/806: Navigate group is capability-gated ─────────────
describe('Step 8/AC-804/805/806: Navigate group surfaces catalog manage-mode per capability', () => {
  it('AC-804: admin sees both Projects & Processes and Objectives; activating each navigates and closes', () => {
    setAuth(['admin'])
    const { onClose } = renderMenu()
    expect(screen.getByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Objectives$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^Projects & Processes$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/projects')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-804: activating Objectives navigates to /work/objectives and closes', () => {
    setAuth(['admin'])
    const { onClose } = renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /^Objectives$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/objectives')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-805: ops_lead (workline.manage only) sees Projects & Processes but not Objectives', () => {
    setAuth(['ops_lead'])
    renderMenu()
    expect(screen.getByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Objectives$/i })).toBeNull()
  })

  it('AC-806: a plain member sees neither, and the pre-existing Navigate items are unaffected', () => {
    setAuth([])
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Projects & Processes$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Objectives$/i })).toBeNull()
    expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Work$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Signals$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Events$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Inbox$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Café$/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
  })
})
```

**Satisfies:** FR-802, FR-803, FR-804; AC-804, AC-805, AC-806.

**Verify:**
`cd mos-app && npm test -- src/components/command/command-menu.test.tsx`
(expect the new describe block's tests to fail — no "Projects & Processes"/"Objectives" option
exists yet.)

## Task 4 — GREEN: add the 2 capability-gated items to `navigateItems`

**Files:**
- `mos-app/src/components/command/command-menu.tsx`

**Exact change:**

1. Add an import:
   ```ts
   import { can } from '@/lib/capabilities'
   ```

2. Immediately after the existing `moneyAuthorized` line (current line 66), add:
   ```ts
   const moneyAuthorized = accessRoles.includes('finance') || accessRoles.includes('admin')
   // Step 8 (catalog re-home, FR-802/803): the Work manage-mode screens are capability-gated
   // (90%-employee-first) and were only reachable from the desktop rail. Mirrors the existing
   // Signals entry below — a Work child reachable via ⌘K, not the phone More menu.
   const projectsAuthorized = can(accessRoles, 'workline.manage')
   const objectivesAuthorized = can(accessRoles, 'objective.manage')
   ```

3. Replace the `navigateItems` `useMemo` (current lines 81-92):
   ```ts
   const navigateItems = useMemo<CommandItem[]>(
     () => [
       { id: 'n-home', label: t('dest.home'), glyph: '⌂', kind: 'navigate', to: '/' },
       { id: 'n-work', label: t('dest.work'), glyph: '▦', kind: 'navigate', to: '/work/tasks' },
       { id: 'n-signals', label: t('nav.signals'), glyph: '✦', kind: 'navigate', to: '/work/signals' },
       { id: 'n-events', label: t('dest.events'), glyph: '▤', kind: 'navigate', to: '/events' },
       { id: 'n-money', label: t('dest.money'), glyph: '$', kind: 'navigate', to: '/money', gated: true },
       { id: 'n-inbox', label: t('dest.inbox'), glyph: '📥', kind: 'navigate', to: '/inbox' },
       { id: 'n-cafe', label: t('dest.cafe'), glyph: '☕', kind: 'navigate', to: '/cafe' },
     ],
     [t],
   )
   ```
   with:
   ```ts
   const navigateItems = useMemo<CommandItem[]>(() => {
     const items: CommandItem[] = [
       { id: 'n-home', label: t('dest.home'), glyph: '⌂', kind: 'navigate', to: '/' },
       { id: 'n-work', label: t('dest.work'), glyph: '▦', kind: 'navigate', to: '/work/tasks' },
       { id: 'n-signals', label: t('nav.signals'), glyph: '✦', kind: 'navigate', to: '/work/signals' },
     ]
     if (projectsAuthorized) {
       items.push({ id: 'n-projects', label: t('nav.work.projects'), glyph: '▥', kind: 'navigate', to: '/work/projects' })
     }
     if (objectivesAuthorized) {
       items.push({ id: 'n-objectives', label: t('nav.work.objectives'), glyph: '◎', kind: 'navigate', to: '/work/objectives' })
     }
     items.push(
       { id: 'n-events', label: t('dest.events'), glyph: '▤', kind: 'navigate', to: '/events' },
       { id: 'n-money', label: t('dest.money'), glyph: '$', kind: 'navigate', to: '/money', gated: true },
       { id: 'n-inbox', label: t('dest.inbox'), glyph: '📥', kind: 'navigate', to: '/inbox' },
       { id: 'n-cafe', label: t('dest.cafe'), glyph: '☕', kind: 'navigate', to: '/cafe' },
     )
     return items
   }, [t, projectsAuthorized, objectivesAuthorized])
   ```

No other lines change. `visibleNavigate`'s existing `navigateItems.filter((i) => !i.gated || moneyAuthorized)`
is untouched — the two new items never set `gated`, so they pass through once present.

**Satisfies:** FR-802, FR-803, FR-804; AC-804, AC-805, AC-806.

**Verify:**
`cd mos-app && npm test -- src/components/command/command-menu.test.tsx`
(expect all green, including the existing `AC-016`/`AC-K*` describes — unaffected.)

---

### Lane C — Rail `aria-current` coverage lock

## Task 5 — Coverage lock: `aria-current` uniqueness at the two re-homed routes (zero-diff expected)

**Files:**
- `mos-app/src/shell/rail-nav.test.tsx`

**Exact change:**

Add a new describe block after the existing `AC-009` describe (after line 218), mirroring its
`/work/signals` test shape exactly:
```ts
// Step 8 (catalog re-home) — AC-807/808: aria-current uniqueness locked explicitly at the two
// re-homed catalog routes (previously only proven generically / at /work/signals + via e2e).
describe('Step 8/AC-807/808: aria-current uniqueness at /work/projects and /work/objectives', () => {
  it('AC-807: at /work/projects, Projects & Processes carries page, Work parent carries location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/projects')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Projects & Processes')
    expect(within(nav).getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
  })

  it('AC-808: at /work/objectives, Objectives carries page, Work parent carries location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/objectives')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Objectives')
    expect(within(nav).getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
  })
})
```

No production file change is expected (D4) — `rail-nav.tsx`'s existing `aria-current` logic (the
`to="/work"` parent NavLink + per-child `NavLink` default `aria-current="page"`) already covers
every Work child generically. If either test unexpectedly fails, that is a **real regression** to
fix in `rail-nav.tsx`, not a plan error — do not weaken the assertion to match a wrong result.

**Satisfies:** FR-805; AC-807, AC-808.

**Verify:**
`cd mos-app && npm test -- src/shell/rail-nav.test.tsx`
(expect immediate green — a characterization/coverage-lock test on already-shipped behavior.)

---

### Gate

## Task 6 — Full gate

**Files:** none (verification only).

**Exact change:** none.

**Satisfies:** NFR-801..805; closes out the plan.

**Verify:**
```
cd mos-app && \
  npm run typecheck && \
  npm run lint -- --max-warnings=0 && \
  npm test -- src/router.test.tsx src/components/command/command-menu.test.tsx src/shell/rail-nav.test.tsx && \
  npm test && \
  npm run test:coverage
```
Confirm: typecheck 0 errors; lint 0 errors/warnings; full unit suite green; coverage ≥80% on the 3
changed files (`router.tsx`, `command-menu.tsx`, plus the 3 test files). No `npx playwright test`
run required by this plan (NFR-802) — the existing curated e2e run via CI dispatch per the standing
buildout convention.

---

## 5. FR → task coverage

| FR | Tasks |
|---|---|
| FR-801 | 1, 2 |
| FR-802 | 3, 4 |
| FR-803 | 3, 4 |
| FR-804 | 3, 4 |
| FR-805 | 5 |

## 6. AC → task → verify mapping

| AC | Tasks | Verify command |
|---|---|---|
| AC-801 | 1, 2 | `npm test -- src/router.test.tsx` |
| AC-802 | 1, 2 | `npm test -- src/router.test.tsx` |
| AC-803 | 1, 2 | `npm test -- src/router.test.tsx` |
| AC-804 | 3, 4 | `npm test -- src/components/command/command-menu.test.tsx` |
| AC-805 | 3, 4 | `npm test -- src/components/command/command-menu.test.tsx` |
| AC-806 | 3, 4 | `npm test -- src/components/command/command-menu.test.tsx` |
| AC-807 | 5 | `npm test -- src/shell/rail-nav.test.tsx` |
| AC-808 | 5 | `npm test -- src/shell/rail-nav.test.tsx` |

---

## 7. Risk / rollback

### Risks
- **`SearchRedirect` swap changes the exact element identity asserted elsewhere.** Mitigated: grepped
  `router.test.tsx` for every `Navigate`/`SearchRedirect` assertion on these 3 paths before writing
  Task 1 — only the 2 blocks edited in Task 1 reference them.
- **Reordering `navigateItems` could break a test that assumes list order.** Checked: no existing
  `command-menu.test.tsx` test asserts absolute Navigate-group order or length (grepped for
  `ArrowDown`/`flatItems`/hardcoded `toHaveLength` on the option list — none constrain this).
- **Glyph choice (`▥` Projects & Processes, `◎` Objectives) is a low-stakes visual pick**, not
  governed by any mockup/ADR (the palette already uses ad hoc unicode glyphs per item, e.g. `⌂`/`▦`/`✦`).
  Not a RATIFY item; trivial to change post-hoc if the design review objects.
- **Task 5 test unexpectedly fails** → treat as a genuine `rail-nav.tsx` regression to fix, not a
  plan defect (BDD authoring rule: fix the app, not the assertion).

### Rollback
- Revert exactly 2 production files: `router.tsx`, `command-menu.tsx`.
- Revert exactly 3 test files: `router.test.tsx`, `command-menu.test.tsx`, `rail-nav.test.tsx`.
- No migration rollback needed (no schema touched).
- No route rollback needed beyond the 2-file revert above — `/work/projects`/`/work/objectives`
  themselves (Step 2's work) are untouched by this plan.

---

## 8. Rewire-not-rebuild check

Confirmed after file read (see spec §0/§2):
- `ProjectsProcessesPage`/`ObjectivesPage`/`CatalogManager` already own the catalog UI — untouched.
- `router.tsx` already owns the canonical `/work/projects`/`/work/objectives` routes and the
  `SearchRedirect` helper — only 3 call sites change which element they use.
- `rail-nav.tsx` already owns capability-filtered Work children + `aria-current` — no change.
- `command-menu.tsx` already owns the Navigate group + activation dispatch — only the item list grows.
- `can()`, the i18n keys, and `RequireCapability` already exist — consumed, not modified.

Planned new production files: **0**. Planned production files touched: **2** (`router.tsx`,
`command-menu.tsx`), both minimal (≤15 line diff each). Everything else is either REUSE-AS-IS or a
test-only addition.

PLAN-DONE

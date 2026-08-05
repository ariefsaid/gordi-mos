import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'

vi.mock('./auth/use-auth')
import { useAuth } from './auth/use-auth'
import { routeConfig } from './router'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'
import { REVENUE_VIEW_ROLES } from './lib/capabilities'
import {
  allRoutes,
  allRedirects,
  flattenRoutes,
  isRedirect,
  redirectProps,
  expectOneHop,
  describeRedirectMap,
  leafInThisTable,
  lazyPayloadOf,
  gatesOnPath,
} from './test/route-table'

// The flag-OFF branch is this file's subject: SHOW_USER_VIEWS, SHOW_FOLLOWUPS and SHOW_PLAN_BUDGET
// are all mocked off so the "a stale deep link cannot reach a switched-off surface" coverage is
// exercised. The flag-ON branch — where every page route must be code-split — is
// `router-lazy.test.tsx`, which mocks the same module the other way.
// SHOW_INBOX is absent: it is retired (#188/#189), Inbox is unconditionally live.
vi.mock('./config/features', () => ({
  SHOW_WEEKLY_UPDATES: true,
  SHOW_DAILY_LOG: true,
  SHOW_USER_VIEWS: false,
  SHOW_ASSISTANT: true,
  SHOW_HOME_STACKED: false,
  SHOW_FOLLOWUPS: false,
  SHOW_PLAN_BUDGET: false,
}))

const mockUseAuth = vi.mocked(useAuth)

import { ProtectedRoute } from './auth/protected-route'
import { AppShell } from './shell/app-shell'
import { TasksLayout } from './pages/tasks-layout'
import { UpdatesPage } from './pages/updates-page'
import { KitchenLogPage } from './pages/kitchen-log-page'
import { NotFoundPage } from './pages/not-found-page'

function LoginStub() {
  return <div data-testid="login-page">Login</div>
}

/** The AppShell layout route's children — the canonical route table. */
function shellChildren() {
  const protectedRoute = routeConfig.find(
    (r) =>
      Array.isArray(r.children) &&
      r.children.some((c) => Array.isArray(c.children) && c.children.some((cc) => cc.path === 'work/tasks')),
  )!
  const shell = protectedRoute.children!.find((c) => Array.isArray(c.children))!
  return shell.children!
}

/** A concrete URL for a route path, so `/tasks/:taskId` can actually be visited. */
function concrete(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? `${segment.slice(1)}-1` : segment))
    .join('/')
}

// AC-008: unauthenticated visitors are redirected away from protected routes.
describe('AC-008: guard on protected routes', () => {
  const cases = ['/work/tasks', '/work/signals', '/cafe/log']

  cases.forEach((path) => {
    it(`redirects an unauthenticated visitor from ${path} to login, no shell content`, () => {
      mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginStub />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/work/tasks" element={<TasksLayout />} />
                <Route path="/work/signals" element={<UpdatesPage />} />
                <Route path="/cafe/log" element={<KitchenLogPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })
})

// ADR-0007: the Tasks split-view shell keeps its drawer children, re-homed under /work/tasks.
describe('router — Tasks nesting under /work/tasks (ADR-0007)', () => {
  it('AC-100: work/tasks is a parent route with :taskId and new as children', () => {
    const tasks = shellChildren().find((r) => r.path === 'work/tasks')!
    expect(tasks.children).toBeDefined()
    expect(tasks.children!.map((c) => c.path).sort()).toEqual(['new', ':taskId'].sort())
    // No second Tasks surface: the drawer children are the ONLY children.
    expect(shellChildren().some((r) => r.path === 'work/tasks/:taskId')).toBe(false)
    expect(shellChildren().some((r) => r.path === 'work/tasks/new')).toBe(false)
  })
})

// ADR-0018 P1 — the /dev/views harness is DEV + SHOW_USER_VIEWS gated. With the flag off both
// routes redirect to /, so a stale deep link can never reach the harness.
describe('router — /dev/views is flag-gated (ADR-0018 P1, flag off)', () => {
  it('redirects /dev/views and /dev/views/:viewId to / while the flag is off', () => {
    expect(shellChildren().find((r) => r.path === 'dev/views')!.element).toEqual(
      <Navigate to="/" replace />,
    )
    expect(shellChildren().find((r) => r.path === 'dev/views/:viewId')!.element).toEqual(
      <Navigate to="/" replace />,
    )
  })
})

// ── The redirect map (FR-015/FR-016, AC-017/AC-018) ──────────────────────────────────────────
//
// Both suites below enumerate the REAL table. Nothing here is a hand-kept list of paths, so a
// redirect added to router.tsx without a canonical destination fails without anyone remembering
// to add a case for it.
describeRedirectMap('plan/budget + follow-ups flags OFF')

describe('AC-018: a retired route requested with ?view= / ?record= keeps its query', () => {
  function LocationProbe() {
    const loc = useLocation()
    return <div data-testid="location">{loc.pathname + loc.search}</div>
  }

  // Only the redirect MAP owes the caller their query. A flag-off fallback is not forwarding a
  // deep link to its new home — it is refusing to serve a switched-off surface — so carrying the
  // caller's parameters onto `/` would be noise.
  const mapEntries = allRedirects().filter((r) => r.kind === 'map')

  it.each(mapEntries.map((r) => [r.from, r.to] as const))(
    '%s?view=v&record=r arrives at %s with both parameters intact',
    (from, to) => {
      const element = flattenRoutes().find((f) => f.path === from)!.route.element
      render(
        <MemoryRouter initialEntries={[`${concrete(from)}?view=v&record=r`]}>
          <Routes>
            <Route path={from} element={element} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      )
      const landed = screen.getByTestId('location').textContent!
      const [wantPath, ownQuery] = to.split('?')
      expect(landed.split('?')[0]).toBe(concrete(wantPath))
      // A target that names its own view keeps it (see route-redirect.test.tsx); every other
      // target has to carry the caller's parameters across.
      expect(landed.split('?')[1]).toBe(ownQuery ?? 'view=v&record=r')
    },
  )
})

// ── AC-021: not found renders INSIDE the shell ───────────────────────────────────────────────
describe('AC-021: an unmatched path renders the not-found surface inside the shell', () => {
  it('a nonsense path resolves to the catch-all, and the AppShell is one of its ancestors', () => {
    const matches = leafInThisTable('/no/such/place')!
    expect(matches).toBeDefined()
    expect(matches.route.path).toBe('*')
  })

  it('the catch-all is a child of the AppShell layout route, not a sibling of it', () => {
    const notFound = shellChildren().find((r) => r.path === '*')
    expect(notFound).toBeDefined()
    // …and it is not declared anywhere OUTSIDE the shell, which is what would strip the rail.
    const catchAlls = flattenRoutes().filter((f) => f.route.path === '*')
    expect(catchAlls).toHaveLength(1)
  })

  it('the catch-all resolves to NotFoundPage', async () => {
    const payload = lazyPayloadOf(shellChildren().find((r) => r.path === '*')!.element)!
    expect(payload).toBeDefined()
    expect((await payload.preload!()).default).toBe(NotFoundPage)
  })
})

// ── Gates ────────────────────────────────────────────────────────────────────────────────────
describe('router — Work catalog gates', () => {
  it('OD-V4-1: /work/objectives carries NO read gate — the read is already open at the database', () => {
    // v4-redesign's own router.test.tsx asserts a RequireCapability(objective.manage) gate here,
    // which contradicts v4's own router.tsx. OD-V4-1 (owner-ratified) removed the gate: the
    // objectives SELECT policy carries no role check, so the gate hid a screen RLS already
    // permits. #188 removed it from the rail; this is the route half. Write stays behind
    // can('objective.manage') inside the page.
    expect(flattenRoutes().find((f) => f.path === '/work/objectives')).toBeDefined()
    // Resolved through the real matcher: nothing on the ancestor chain bounces a subset of
    // authenticated viewers. Re-add the gate and this goes red.
    expect(gatesOnPath('/work/objectives')).toEqual([])
    // …and the sibling catalog still HAS its gate, so the check above is measuring something.
    expect(gatesOnPath('/work/projects')).toEqual(['capability:workline.manage'])
  })

  it('AC-304: /work/projects stays behind RequireCapability(workline.manage)', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'work/projects'),
    )!
    expect(gate.element).toEqual(<RequireCapability capability="workline.manage" />)
  })

  it('both retired catalog spellings redirect from INSIDE the gate they forward into', () => {
    // Outside it, a viewer without workline.manage would be forwarded to /work/projects and
    // bounced from there — two hops. This is the structural half of AC-017.
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'work/projects'),
    )!
    const inside = gate.children!.map((c) => c.path).sort()
    expect(inside).toEqual(['projects-processes', 'work/projects', 'work/projects-processes'])
  })
})

describe('router — Money gates (dev security series preserved)', () => {
  it('AC-127/AC-326: /money admits the financial VIEW tiers, not just finance+admin', () => {
    // v4-redesign gates ALL of Money on finance|admin. Carrying that across would revoke the
    // dashboard visibility this line granted manager (ADR-0050 D8) and supervisor (ADR-0051) —
    // migrations that exist only here. The policy is pinned with a literal on purpose; comparing
    // against the constant the router is built from cannot fail.
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money'),
    )!
    expect(gate.element).toEqual(
      <RequireAccessRole anyOf={['finance', 'admin', 'manager', 'supervisor']} />,
    )
  })

  it('I-2: the Money read gate consumes the REVENUE_VIEW_ROLES constant (identity, not value)', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money'),
    )!
    expect((gate.element as React.ReactElement<{ anyOf: readonly string[] }>).props.anyOf).toBe(
      REVENUE_VIEW_ROLES,
    )
  })

  it('AC-127/AC-326: budget + pricing stay finance|admin — a VIEW tier is not a planning tier', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/budget'),
    )!
    expect(gate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
    expect(gate.element).not.toEqual(<RequireAccessRole anyOf={['finance', 'admin', 'manager']} />)
    expect(gate.element).not.toEqual(<RequireAccessRole anyOf={['finance', 'admin', 'supervisor']} />)
  })

  it('AC-PB-001: /money/budget + /money/pricing redirect to / while SHOW_PLAN_BUDGET is off', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/budget'),
    )!
    expect(gate.children!.find((r) => r.path === 'money/budget')!.element).toEqual(
      <Navigate to="/" replace />,
    )
    expect(gate.children!.find((r) => r.path === 'money/pricing')!.element).toEqual(
      <Navigate to="/" replace />,
    )
  })

  it('the retired Money paths redirect from inside the gate that owns their destination', () => {
    const readGate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money'),
    )!
    expect(readGate.children!.map((c) => c.path).sort()).toEqual([
      'dashboard',
      'dashboard/detail',
      'money',
      'money/detail',
      'sales',
    ])
    const planGate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/budget'),
    )!
    expect(planGate.children!.map((c) => c.path).sort()).toEqual([
      'money/budget',
      'money/follow-ups',
      'money/pricing',
      'plan/budget',
      'plan/pricing',
    ])
  })
})

describe('router — Café review + pushes are role-gated', () => {
  it('AC-006: /cafe/review + /cafe/pushes sit behind RequireAccessRole(ops_lead|admin)', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'cafe/review'),
    )!
    expect(gate.element).toEqual(<RequireAccessRole anyOf={['ops_lead', 'admin']} />)
    expect(gate.children!.map((c) => c.path).sort()).toEqual([
      'cafe/pushes',
      'cafe/review',
      'kitchen/pushes',
      'kitchen/review',
    ])
  })
})

describe('router — /admin redirects from inside AdminRoute', () => {
  it('AC-006: /admin and /admin/people are both children of the admin gate', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'admin/people'),
    )!
    expect(gate.children!.map((c) => c.path).sort()).toEqual(['admin', 'admin/people'])
  })
})

// AC-001 (#179, #217, OD-WAY-32): the cascade SCREEN is cut; the PATH keeps its doormat.
describe('router — the retired cascade path (OD-WAY-32)', () => {
  it('AC-001: no PAGE is served at a cascade path — a redirect away is all there is', () => {
    const cascadeRoutes = allRoutes(routeConfig).filter((r) => (r.path ?? '').includes('cascade'))
    expect(cascadeRoutes.map((r) => r.path)).toEqual(['work/cascade'])
    for (const r of cascadeRoutes) expect(isRedirect(r.element)).toBe(true)
  })

  it('AC-001 (#217, FR-015): it lands on a live route in one hop, history replaced', () => {
    const cascade = allRoutes(routeConfig).find((r) => r.path === 'work/cascade')!
    expect(cascade).toBeDefined()
    const { to, replace } = redirectProps(cascade.element)
    expect(replace).toBe(true)
    // …and the destination is resolved against THIS table: it exists, it is a live surface rather
    // than the not-found catch-all, it is not a second redirect, and — the clause #220 added — it
    // carries no gate the retired path does not. `work/cascade` is ungated, so its destination has
    // to be reachable by every authenticated viewer or the hop is not one hop.
    expectOneHop('/work/cascade', to)
  })
})

// AC-003 (#179): the cascade screen is cut, not hidden. "Cascade" survives as glossary vocabulary
// for the Objective → Project/Process → Task relation (CONTEXT.md), but the surface that rendered
// it — the page, its stylesheet, and the ladder builder that fed only that page — is gone.
describe('cascade surface removed from the source tree (#179)', () => {
  const srcDir = join(process.cwd(), 'src')

  it.each([
    'pages/cascade-page.tsx',
    'pages/cascade-page.css',
    'pages/cascade-page.test.tsx',
    'lib/cascade/build-ladder.ts',
    'lib/cascade/build-ladder.test.ts',
  ])('%s is absent', (relative) => {
    expect(existsSync(join(srcDir, relative))).toBe(false)
  })
})

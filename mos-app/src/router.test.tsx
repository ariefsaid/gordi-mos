import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

vi.mock('./auth/use-auth')
import { useAuth } from './auth/use-auth'
import { routeConfig } from './router'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'
import { REVENUE_VIEW_ROLES } from './lib/capabilities'
import { allRoutes, isRedirect, redirectProps, expectOneHop } from './test/route-table'

// nav-five-destinations flag-staleness cleanup: dev (ae7cffa) ungated SHOW_USER_VIEWS to true,
// but this test's intent is the flag-OFF branch (stale deep-link redirects to /). Mock the flag
// to false LOCALLY so the flag-gating coverage is preserved (BDD rule — the behavior is valid).
vi.mock('./config/features', () => ({
  SHOW_WEEKLY_UPDATES: true,
  SHOW_DAILY_LOG: true,
  SHOW_USER_VIEWS: false,
  SHOW_ASSISTANT: true,
  SHOW_INBOX: true,
  SHOW_HOME_STACKED: false,
  SHOW_FOLLOWUPS: false,
  SHOW_PLAN_BUDGET: false,
}))

const mockUseAuth = vi.mocked(useAuth)

// Import components used in the route tree to verify guard behavior
import { ProtectedRoute } from './auth/protected-route'
import { AppShell } from './shell/app-shell'
import { TasksLayout } from './pages/tasks-layout'
import { UpdatesPage } from './pages/updates-page'
import { OpsPage } from './pages/ops-page'

function LoginStub() {
  return <div data-testid="login-page">Login</div>
}

// AC-008: unauthenticated users are redirected away from new section routes
// Uses MemoryRouter (same pattern as guards.test.tsx) for reliable redirect testing.
describe('AC-008: Guard on new routes', () => {
  const cases = [
    { path: '/tasks', element: <TasksLayout /> },
    { path: '/updates', element: <UpdatesPage /> },
    { path: '/ops', element: <OpsPage /> },
  ]

  cases.forEach(({ path, element }) => {
    it(`redirects unauthenticated visitor from ${path} to login, no shell content`, () => {
      mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginStub />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/tasks" element={element} />
                <Route path="/updates" element={element} />
                <Route path="/ops" element={element} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      // No shell navigation rendered
      expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
      // Redirected to login stub
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })
})

// ADR-0007: the three sibling /tasks routes become nested children under a
// parent /tasks route so the table can persist (split-view, PR-B). PR-A only
// establishes the nesting — the rendered output stays identical to today.
describe('router — tasks nesting (ADR-0007)', () => {
  it('AC-100: tasks is a parent route with :taskId and new as children', () => {
    // Find the ProtectedRoute (which wraps AppShell) by locating the route whose
    // children include an AppShell — index-agnostic so a DEV-only /dev/ui route
    // prepended ahead of it doesn't shift the lookup.
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const tasks = shell.children!.find(r => r.path === 'tasks')!
    expect(tasks.children).toBeDefined()
    const childPaths = tasks.children!.map(c => c.path).sort()
    expect(childPaths).toEqual(['new', ':taskId'].sort())
    // siblings `tasks/new` / `tasks/:taskId` no longer exist at the shell level
    expect(shell.children!.some(r => r.path === 'tasks/new')).toBe(false)
    expect(shell.children!.some(r => r.path === 'tasks/:taskId')).toBe(false)
  })

})

// ADR-0018 P1 — the /dev/views harness is DEV + SHOW_USER_VIEWS flag gated (mirrors the
// SHOW_WEEKLY_UPDATES/SHOW_DAILY_LOG pattern). SHOW_USER_VIEWS defaults false, so both routes
// must redirect to / — a stale deep-link can never reach the harness while the flag is off.
describe('router — /dev/views is flag-gated (ADR-0018 P1, SHOW_USER_VIEWS default false)', () => {
  it('redirects /dev/views and /dev/views/:viewId to / while the flag is off', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const bare = shell.children!.find(r => r.path === 'dev/views')!
    const withId = shell.children!.find(r => r.path === 'dev/views/:viewId')!
    expect(bare.element).toEqual(<Navigate to="/" replace />)
    expect(withId.element).toEqual(<Navigate to="/" replace />)
  })
})

// FR-421 (nav-five-destinations): the catalog manage routes are RELOCATED under /work/ as
// Work's manage-mode. The cascade is vocabulary, never a route (CONTEXT.md; OD-WAY-32, #179), so
// the retired top-level paths redirect straight to the relocated catalogs, which stay behind
// RequireCapability. Page components are reused unchanged.
describe('router — catalog manage-mode relocated under /work/ (FR-421)', () => {
  it('AC-001 (#179, OD-WAY-32): no PAGE is served at a cascade path — a redirect away is all there is', () => {
    // The ruling cut the cascade SCREEN. A redirect entry is not a screen, so the guard forbids a
    // page at that path rather than forbidding the path outright — reading it as "no entry may name
    // the path" is what killed the doormat every other retired path keeps (#217).
    const cascadeRoutes = allRoutes(routeConfig).filter((r) => (r.path ?? '').includes('cascade'))
    expect(cascadeRoutes.map((r) => r.path)).toEqual(['work/cascade'])
    for (const r of cascadeRoutes) expect(isRedirect(r.element)).toBe(true)
  })

  it('AC-001 (#217, FR-015): the retired cascade path lands on a live route in one hop, history replaced', () => {
    const cascade = allRoutes(routeConfig).find((r) => r.path === 'work/cascade')
    expect(cascade).toBeDefined()
    const { to, replace } = redirectProps(cascade!.element)
    // FR-015: the history entry is replaced, so Back does not re-enter the retired path.
    expect(replace).toBe(true)
    // …and the destination is resolved against THIS table: it exists, it is a live surface rather
    // than the not-found catch-all, it is not a second redirect, and — the clause #220 added — it
    // carries no gate the retired path does not. `work/cascade` is ungated, so its destination has
    // to be reachable by every authenticated viewer or the hop is not one hop.
    expectOneHop('/work/cascade', to)
  })

  it('AC-304: /work/objectives + /work/projects-processes stay behind their capability gates', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!

    const objectivesGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'work/objectives'),
    )!
    expect(objectivesGate.element).toEqual(<RequireCapability capability="objective.manage" />)

    const workLinesGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'work/projects-processes'),
    )!
    expect(workLinesGate.element).toEqual(<RequireCapability capability="workline.manage" />)
  })

  it('AC-405: /objectives + /projects-processes redirect to the relocated catalogs (replace)', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!

    const objectivesRedirect = shell.children!.find((r) => r.path === 'objectives')!
    expect(objectivesRedirect.element).toEqual(<Navigate to="/work/objectives" replace />)

    const workLinesRedirect = shell.children!.find((r) => r.path === 'projects-processes')!
    expect(workLinesRedirect.element).toEqual(<Navigate to="/work/projects-processes" replace />)
  })
})

describe('router — dashboard route gate + redirect (OD-DASH-2, FR-001/002)', () => {
  // Helper: find the AppShell route node.
  function shellChildren() {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    return shell.children!
  }

  it('AC-127: /dashboard sits under a RequireAccessRole anyOf={finance,admin,manager,supervisor} branch', () => {
    const dashGate = shellChildren().find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'dashboard'),
    )!
    expect(dashGate).toBeDefined()
    // Pin the POLICY with a literal — comparing against the constant the router is built from
    // cannot fail. The identity check that it CONSUMES the constant lives in the I-2 test below.
    expect(dashGate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin', 'manager', 'supervisor']} />)
  })

  it('I-2: dashboard gate consumes the REVENUE_VIEW_ROLES constant (identity, not value)', () => {
    const dashGate = shellChildren().find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'dashboard'),
    )!
    // Identity, not deep-equality: a re-typed literal in router.tsx would pass toEqual and silently
    // reintroduce the duplication I-2 removed. The POLICY itself is pinned by AC-127 above.
    expect((dashGate.element as React.ReactElement<{ anyOf: readonly string[] }>).props.anyOf).toBe(
      REVENUE_VIEW_ROLES,
    )
  })

  it('AC-001: /sales redirects to /dashboard (back-compat)', () => {
    const gate = shellChildren().find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'sales'),
    )!
    const salesRoute = gate.children!.find(r => r.path === 'sales')!
    expect(salesRoute.element).toEqual(<Navigate to="/dashboard" replace />)
  })

  it('AC-017: /dashboard/detail is wired (parameterized detail sub-view)', () => {
    const gate = shellChildren().find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'dashboard'),
    )!
    const detailRoute = gate.children!.find(r => r.path === 'dashboard/detail')
    expect(detailRoute).toBeDefined()
  })
})

// ADR-0022 (Issue D) — Plan budget + pricing pre-flight routes are flag-gated (SHOW_PLAN_BUDGET
// default false) AND finance/admin-gated. AC-PB-001 (flag-off redirect) + AC-PB-002 (role gate).
describe('router — Plan budget + pricing routes (ADR-0022, SHOW_PLAN_BUDGET default false)', () => {
  it('AC-PB-001: /plan/budget + /plan/pricing redirect to / while the flag is off', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const planGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'plan/budget' || c.path === 'plan/pricing'),
    )!
    expect(planGate).toBeDefined()
    const budget = planGate.children!.find((r) => r.path === 'plan/budget')!
    const pricing = planGate.children!.find((r) => r.path === 'plan/pricing')!
    expect(budget.element).toEqual(<Navigate to="/" replace />)
    expect(pricing.element).toEqual(<Navigate to="/" replace />)
  })

  it('AC-PB-002: the plan/budget + plan/pricing branch sits under RequireAccessRole anyOf={finance,admin}', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const planGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'plan/budget' || c.path === 'plan/pricing'),
    )!
    expect(planGate).toBeDefined()
    expect(planGate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
  })

  it('AC-127: manager is NOT admitted to plan/budget (view-only, no planning — FR-112)', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const planGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'plan/budget' || c.path === 'plan/pricing'),
    )!
    expect(planGate).toBeDefined()
    // Pinned exclusion: unlike /dashboard, manager is deliberately absent here.
    expect(planGate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
    expect(planGate.element).not.toEqual(<RequireAccessRole anyOf={['finance', 'admin', 'manager']} />)
  })

  it('AC-326: supervisor is NOT admitted to plan/budget (view-only, no planning — FR-315)', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const planGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'plan/budget' || c.path === 'plan/pricing'),
    )!
    expect(planGate).toBeDefined()
    // Pinned exclusion: unlike /dashboard, supervisor is deliberately absent here.
    expect(planGate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
    expect(planGate.element).not.toEqual(<RequireAccessRole anyOf={['finance', 'admin', 'supervisor']} />)
  })
})

// AC-003 (#179): the cascade screen is cut, not hidden. "Cascade" survives as glossary vocabulary
// for the Objective → Project/Process → Task relation (CONTEXT.md), but the surface that rendered
// it — the page, its stylesheet, and the ladder builder that fed only that page — is gone from the
// tree. Guards the cut against a later slice quietly re-landing the screen (OD-WAY-32).
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

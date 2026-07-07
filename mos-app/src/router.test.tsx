import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

vi.mock('./auth/use-auth')
import { useAuth } from './auth/use-auth'
import { routeConfig } from './router'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'

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
// Work's manage-mode, and the retired top-level paths redirect into the cascade. The manage pages
// stay behind RequireCapability (bounces non-holders to /work/cascade); page components reused.
describe('router — catalog manage-mode relocated under /work/ (FR-421)', () => {
  it('AC-302/304: wires /work/cascade directly + /work/objectives + /work/projects-processes behind capability gates', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!

    expect(shell.children!.some((r) => r.path === 'work/cascade')).toBe(true)

    const objectivesGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'work/objectives'),
    )!
    expect(objectivesGate.element).toEqual(<RequireCapability capability="objective.manage" />)

    const workLinesGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'work/projects-processes'),
    )!
    expect(workLinesGate.element).toEqual(<RequireCapability capability="workline.manage" />)
  })

  it('AC-405: /objectives + /projects-processes are redirect routes to /work/cascade (replace)', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!

    const objectivesRedirect = shell.children!.find((r) => r.path === 'objectives')!
    expect(objectivesRedirect.element).toEqual(<Navigate to="/work/cascade" replace />)

    const workLinesRedirect = shell.children!.find((r) => r.path === 'projects-processes')!
    expect(workLinesRedirect.element).toEqual(<Navigate to="/work/cascade" replace />)
  })
})

describe('router — sales dashboard route gate (FR-001)', () => {
  it('AC-001/002: /sales sits under a RequireAccessRole anyOf={finance,admin} branch', () => {
    const protectedRoute = routeConfig.find(
      r => Array.isArray(r.children) && r.children.some(c => Array.isArray(c.children) && c.children.some(cc => cc.path === 'tasks')),
    )!
    const shell = protectedRoute.children!.find(c => Array.isArray(c.children))!
    const salesGate = shell.children!.find(
      r => Array.isArray(r.children) && r.children.some(c => c.path === 'sales'),
    )!
    expect(salesGate).toBeDefined()
    expect(salesGate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
  })
})

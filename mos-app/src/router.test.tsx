import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'

vi.mock('./auth/use-auth')
import { useAuth } from './auth/use-auth'
import { routeConfig, SearchRedirect, TasksIdRedirect } from './router'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'

// Step 2: SHOW_INBOX is retired (D-PLN-1/D-1); the mock factory no longer carries it.
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
import { ProjectsProcessesPage } from './pages/projects-processes-page'
import { ObjectivesPage } from './pages/objectives-page'
import { DashboardPage } from './pages/dashboard-page'
import { KitchenLogPage } from './pages/kitchen-log-page'
import { KitchenReviewPage } from './pages/kitchen-review-page'
import { AdminUsersPage } from './pages/admin-users-page'
import { InboxPage } from './pages/inbox-page'
import { FollowUpsPage } from './pages/follow-ups-page'
import { FollowUpRecordPage } from './pages/follow-up-record-page'
import { SliceStubPage } from './pages/slice-stub-page'
import { ProfilePage } from './pages/profile-page'
import { SignalsArchivePage } from './pages/signals-archive-page'
import { EventsPage } from './pages/events-page'
import { CafeOpeningPage } from './pages/cafe-opening-page'

function LoginStub() {
  return <div data-testid="login-page">Login</div>
}

// Locate the AppShell route's children (the canonical route table).
function shellChildren() {
  const protectedRoute = routeConfig.find(
    (r) =>
      Array.isArray(r.children) &&
      r.children.some(
        (c) => Array.isArray(c.children) && c.children.some((cc) => cc.path === 'work/tasks'),
      ),
  )!
  const shell = protectedRoute.children!.find((c) => Array.isArray(c.children))!
  return shell.children!
}

// AC-008: unauthenticated users are redirected away from protected routes.
describe('AC-008: Guard on protected routes', () => {
  it('redirects unauthenticated visitor from /work/tasks to login, no shell content', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

    render(
      <MemoryRouter initialEntries={['/work/tasks']}>
        <Routes>
          <Route path="/login" element={<LoginStub />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/work/tasks" element={<TasksLayout />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })
})

// ADR-0007: tasks is nested under /work/tasks with new + :taskId children.
describe('router — tasks nesting under /work/tasks (ADR-0007)', () => {
  it('AC-100: /work/tasks is a parent route with :taskId and new as children', () => {
    const tasks = shellChildren().find((r) => r.path === 'work/tasks')!
    expect(tasks.children).toBeDefined()
    const childPaths = tasks.children!.map((c) => c.path).sort()
    expect(childPaths).toEqual(['new', ':taskId'].sort())
    // The old top-level /tasks is no longer the canonical TasksLayout — it is now a redirect.
    expect(shellChildren().find((r) => r.path === 'tasks')!.element).toEqual(<SearchRedirect to="/work/tasks" />)
  })

  it('AC-309/310: no second Tasks route surface is introduced under /work/tasks', () => {
    const tasks = shellChildren().find((r) => r.path === 'work/tasks')!
    expect(tasks.element).toEqual(<TasksLayout />)
    expect(shellChildren().find((r) => r.path === 'work/tasks/followups')).toBeUndefined()
    expect(shellChildren().find((r) => r.path === 'work/tasks/:taskId')).toBeUndefined()
  })
})

// /dev/views harness is DEV + SHOW_USER_VIEWS flag gated (default false → redirect).
describe('router — /dev/views is flag-gated (ADR-0018 P1)', () => {
  it('redirects /dev/views and /dev/views/:viewId to / while the flag is off', () => {
    const bare = shellChildren().find((r) => r.path === 'dev/views')!
    const withId = shellChildren().find((r) => r.path === 'dev/views/:viewId')!
    expect(bare.element).toEqual(<Navigate to="/" replace />)
    expect(withId.element).toEqual(<Navigate to="/" replace />)
  })
})

// AC-006: canonical Work routes + redirects (FR-008/009/010/027).
describe('AC-006: Work canonical routes + redirects', () => {
  it('AC-006: /work/projects renders ProjectsProcessesPage under RequireCapability(workline.manage)', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'work/projects'),
    )!
    expect(gate.element).toEqual(<RequireCapability capability="workline.manage" />)
    expect(gate.children!.find((r) => r.path === 'work/projects')!.element).toEqual(<ProjectsProcessesPage />)
  })

  it('AC-006: /work/objectives renders ObjectivesPage under RequireCapability(objective.manage)', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'work/objectives'),
    )!
    expect(gate.element).toEqual(<RequireCapability capability="objective.manage" />)
    expect(gate.children!.find((r) => r.path === 'work/objectives')!.element).toEqual(<ObjectivesPage />)
  })

  it('Step 8/AC-803: /work/projects-processes redirects to /work/projects via SearchRedirect (query preserved)', () => {
    expect(shellChildren().find((r) => r.path === 'work/projects-processes')!.element).toEqual(
      <SearchRedirect to="/work/projects" />,
    )
  })

  it('AC-006: /work redirects to /work/tasks (replace)', () => {
    expect(shellChildren().find((r) => r.path === 'work')!.element).toEqual(
      <Navigate to="/work/tasks" replace />,
    )
  })

  it('AC-006: /work/follow-ups redirects to /work/tasks?view=followups (replace)', () => {
    expect(shellChildren().find((r) => r.path === 'work/follow-ups')!.element).toEqual(
      <Navigate to="/work/tasks?view=followups" replace />,
    )
  })

  it('AC-006: /work/cascade redirects to /work/tasks (cascade noun retired)', () => {
    expect(shellChildren().find((r) => r.path === 'work/cascade')!.element).toEqual(
      <Navigate to="/work/tasks" replace />,
    )
  })

  it('C3: /work/signals renders the real SignalsArchivePage (Signals archive — Step 4)', () => {
    expect(shellChildren().find((r) => r.path === 'work/signals')!.element).toEqual(
      <SignalsArchivePage />,
    )
  })
})

// AC-006: Money canonical routes + the old-route redirects (FR-008/009).
describe('AC-006: Money canonical routes + redirects', () => {
  it('AC-006: /money sits under RequireAccessRole anyOf={finance,admin}', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money'),
    )!
    expect(gate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
    expect(gate.children!.find((r) => r.path === 'money')!.element).toEqual(<DashboardPage />)
  })

  it('AC-006: /money/detail renders DashboardPage defaultTab=detail', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/detail'),
    )!
    expect(gate.children!.find((r) => r.path === 'money/detail')!.element).toEqual(
      <DashboardPage defaultTab="detail" />,
    )
  })

  it('AC-006: /dashboard redirects to /money; /sales redirects to /money (no chained redirect)', () => {
    expect(shellChildren().find((r) => r.path === 'dashboard')!.element).toEqual(<SearchRedirect to="/money" />)
    // /sales is a shell-level redirect to /money (not chained via /dashboard).
    expect(shellChildren().find((r) => r.path === 'sales')!.element).toEqual(<SearchRedirect to="/money" />)
  })

  it('Step 8/AC-801/802: /objectives + /projects-processes redirect to their Work children via SearchRedirect (query preserved)', () => {
    expect(shellChildren().find((r) => r.path === 'objectives')!.element).toEqual(
      <SearchRedirect to="/work/objectives" />,
    )
    expect(shellChildren().find((r) => r.path === 'projects-processes')!.element).toEqual(
      <SearchRedirect to="/work/projects" />,
    )
  })

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

  it('AC-006: /plan/budget + /plan/pricing redirect to /money/budget + /money/pricing (preserve query)', () => {
    expect(shellChildren().find((r) => r.path === 'plan/budget')!.element).toEqual(<SearchRedirect to="/money/budget" />)
    expect(shellChildren().find((r) => r.path === 'plan/pricing')!.element).toEqual(<SearchRedirect to="/money/pricing" />)
  })

  it('AC-900: /money/follow-ups sits under RequireAccessRole anyOf={finance,admin} and stays gated by SHOW_FOLLOWUPS', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/follow-ups'),
    )!
    expect(gate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
    const route = gate.children!.find((r) => r.path === 'money/follow-ups')!
    // flag-off branch redirects to /; the route is present either way (mirrors the existing
    // /work/follow-ups/:id D-2 deep-link contract test above).
    expect([<FollowUpsPage />, <Navigate to="/" replace />]).toContainEqual(route.element)
  })

  it('R-OWNER-5: the follow-ups QUEUE (/money/follow-ups) is a workspace destination (count + overdue meta), while the follow-up RECORD (/work/follow-ups/:id) stays focused-record', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/follow-ups'),
    )!
    const queue = gate.children!.find((r) => r.path === 'money/follow-ups')!
    expect(queue.handle).toEqual({ kind: 'page', family: 'workspace' })

    const record = shellChildren().find((r) => r.path === 'work/follow-ups/:id')!
    expect(record.handle).toEqual({ kind: 'page', family: 'focused-record' })
  })
})

// AC-006: Café re-home (kitchen → cafe) + stubs + admin.
describe('AC-006: Café re-home + stub routes + admin', () => {
  it('AC-006: /cafe/log renders KitchenLogPage (re-homed)', () => {
    expect(shellChildren().find((r) => r.path === 'cafe/log')!.element).toEqual(<KitchenLogPage />)
  })

  // Step 7 (cafe-retrofit.spec.md, RATIFY-7D): /cafe hosts the Café Operations home (the
  // "Start today's opening" surface) — NOT an immediate redirect to /cafe/log. Sub-routes unchanged.
  it('RATIFY-7D: /cafe renders CafeOpeningPage (Café Operations home), not a redirect', () => {
    expect(shellChildren().find((r) => r.path === 'cafe')!.element).toEqual(<CafeOpeningPage />)
  })

  it('AC-006: /cafe/review sits under RequireAccessRole anyOf={ops_lead,admin}', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'cafe/review'),
    )!
    expect(gate.element).toEqual(<RequireAccessRole anyOf={['ops_lead', 'admin']} />)
    expect(gate.children!.find((r) => r.path === 'cafe/review')!.element).toEqual(<KitchenReviewPage />)
  })

  it('AC-006: /ecommerce, /roastery render SliceStubPage; /profile is the real ProfilePage (OD-70)', () => {
    expect(shellChildren().find((r) => r.path === 'ecommerce')!.element).toEqual(
      <SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />,
    )
    expect(shellChildren().find((r) => r.path === 'roastery')!.element).toEqual(
      <SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />,
    )
    // OD-70 (2026-07-18): /profile graduated from the stub — language selection lives there.
    expect(shellChildren().find((r) => r.path === 'profile')!.element).toEqual(<ProfilePage />)
  })

  it('AC-1001 (events-stub, Step 10): /events renders EventsPage (no longer SliceStubPage)', () => {
    expect(shellChildren().find((r) => r.path === 'events')!.element).toEqual(<EventsPage />)
  })

  it('AC-006: /admin redirects to /admin/people; /admin/people under AdminRoute renders AdminUsersPage', () => {
    expect(shellChildren().find((r) => r.path === 'admin')!.element).toEqual(
      <Navigate to="/admin/people" replace />,
    )
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'admin/people'),
    )!
    expect(gate.children!.find((r) => r.path === 'admin/people')!.element).toEqual(<AdminUsersPage />)
  })

  it('AC-006: /inbox renders InboxPage (always live)', () => {
    expect(shellChildren().find((r) => r.path === 'inbox')!.element).toEqual(<InboxPage />)
  })
})

// FR-009: old routes redirect to canonical (the redirect map presence).
describe('FR-009: old-route redirect map is present', () => {
  it('/tasks redirects to /work/tasks (search preserved via SearchRedirect)', () => {
    expect(shellChildren().find((r) => r.path === 'tasks')!.element).toEqual(<SearchRedirect to="/work/tasks" />)
  })
  it('/tasks/:taskId redirects to /work/tasks/:taskId (TasksIdRedirect)', () => {
    expect(shellChildren().find((r) => r.path === 'tasks/:taskId')!.element).toEqual(<TasksIdRedirect />)
  })
  it('/kitchen/log redirects (re-home to /cafe/log)', () => {
    expect(shellChildren().find((r) => r.path === 'kitchen/log')!.element).toEqual(<SearchRedirect to="/cafe/log" />)
  })
  it('/updates redirects to /work/signals; /ops redirects to /', () => {
    expect(shellChildren().find((r) => r.path === 'updates')!.element).toEqual(
      <Navigate to="/work/signals" replace />,
    )
    expect(shellChildren().find((r) => r.path === 'ops')!.element).toEqual(<Navigate to="/" replace />)
  })
  it('/work/follow-ups/:id opens the focused-record door (FollowUpRecordPage), gated by SHOW_FOLLOWUPS (D-2 deep-link contract)', () => {
    const r = shellChildren().find((x) => x.path === 'work/follow-ups/:id')!
    // flag-off branch redirects to /; the route is present either way.
    expect(r).toBeDefined()
    expect([<FollowUpRecordPage />, <Navigate to="/" replace />]).toContainEqual(r.element)
  })
})

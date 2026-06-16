import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./auth/useAuth')
import { useAuth } from './auth/useAuth'
import { routeConfig } from './router'

const mockUseAuth = vi.mocked(useAuth)

// Import components used in the route tree to verify guard behavior
import { ProtectedRoute } from './auth/ProtectedRoute'
import AppShell from './shell/AppShell'
import TasksLayout from './pages/TasksLayout'
import UpdatesPage from './pages/UpdatesPage'
import OpsPage from './pages/OpsPage'

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
    const shell = routeConfig[1].children![0] // ProtectedRoute → AppShell
    const tasks = shell.children!.find(r => r.path === 'tasks')!
    expect(tasks.children).toBeDefined()
    const childPaths = tasks.children!.map(c => c.path).sort()
    expect(childPaths).toEqual(['new', ':taskId'].sort())
    // siblings `tasks/new` / `tasks/:taskId` no longer exist at the shell level
    expect(shell.children!.some(r => r.path === 'tasks/new')).toBe(false)
    expect(shell.children!.some(r => r.path === 'tasks/:taskId')).toBe(false)
  })

})

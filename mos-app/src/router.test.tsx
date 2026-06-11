import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./auth/useAuth')
import { useAuth } from './auth/useAuth'

const mockUseAuth = vi.mocked(useAuth)

// Import components used in the route tree to verify guard behavior
import { ProtectedRoute } from './auth/ProtectedRoute'
import AppShell from './shell/AppShell'
import TasksPage from './pages/TasksPage'
import UpdatesPage from './pages/UpdatesPage'
import OpsPage from './pages/OpsPage'

function LoginStub() {
  return <div data-testid="login-page">Login</div>
}

// AC-008: unauthenticated users are redirected away from new section routes
// Uses MemoryRouter (same pattern as guards.test.tsx) for reliable redirect testing.
describe('AC-008: Guard on new routes', () => {
  const cases = [
    { path: '/tasks', element: <TasksPage /> },
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

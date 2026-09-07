// AC-012 — the remembered route is only honoured when it is somewhere we may return to.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { vi } from 'vitest'

import { safeReturnTarget, HOME_TARGET } from './return-target'

vi.mock('./use-auth')
import { useAuth } from './use-auth'
import { ProtectedRoute } from './protected-route'

const mockUseAuth = vi.mocked(useAuth)

describe('AC-012: safeReturnTarget', () => {
  it('keeps an in-app path together with its query', () => {
    expect(safeReturnTarget('/money/detail?w=30d')).toBe('/money/detail?w=30d')
    expect(safeReturnTarget('/work/tasks')).toBe('/work/tasks')
  })

  it('resolves a remembered auth surface to Home — /login and /recovery are doors, not destinations', () => {
    expect(safeReturnTarget('/login')).toBe(HOME_TARGET)
    expect(safeReturnTarget('/login?next=/work')).toBe(HOME_TARGET)
    expect(safeReturnTarget('/recovery')).toBe(HOME_TARGET)
    expect(safeReturnTarget('/recovery/step-2')).toBe(HOME_TARGET)
  })

  it('resolves an off-app target to Home', () => {
    expect(safeReturnTarget('https://example.test/steal')).toBe(HOME_TARGET)
    expect(safeReturnTarget('//example.test/steal')).toBe(HOME_TARGET)
    expect(safeReturnTarget('/\\example.test')).toBe(HOME_TARGET)
    expect(safeReturnTarget('work/tasks')).toBe(HOME_TARGET)
  })

  it('resolves a missing or non-string target to Home', () => {
    expect(safeReturnTarget(undefined)).toBe(HOME_TARGET)
    expect(safeReturnTarget(null)).toBe(HOME_TARGET)
    expect(safeReturnTarget({ pathname: '/work' })).toBe(HOME_TARGET)
  })
})

function LoginProbe() {
  const location = useLocation()
  const state = location.state as { from?: string } | null
  return <div data-testid="login-page">from: {state?.from ?? '(none)'}</div>
}

describe('AC-012: ProtectedRoute hands /login the route it turned away', () => {
  it('carries the requested pathname and query in the redirect state', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

    render(
      <MemoryRouter initialEntries={['/money/detail?w=30d']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/money/detail" element={<div>secret</div>} />
          </Route>
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-page')).toHaveTextContent('from: /money/detail?w=30d')
  })
})

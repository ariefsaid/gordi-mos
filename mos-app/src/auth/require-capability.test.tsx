import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('./use-auth')
import { useAuth } from './use-auth'
import { RequireCapability, CAPABILITY_FALLBACK_PATH } from './require-capability'
import { expectOneHop } from '@/test/route-table'

const mockUseAuth = vi.mocked(useAuth)

function authed(accessRoles: string[]) {
  return {
    status: 'authenticated' as const,
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        must_change_password: false,
        archived_at: null, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  }
}

// Where the bounce lands, reported rather than asserted here. The harness deliberately mounts NO
// destination of its own: a stub route mounted inside this file proves only that <Navigate> fired,
// and stays green even when the production router serves nothing at that path (#217). The landing
// path is instead resolved against the real table by `expectLandsOnALiveSurface` below.
function Landing() {
  return <div data-testid="landing">{useLocation().pathname}</div>
}

function renderGuard(initialEntry: string, capability: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<RequireCapability capability={capability} />}>
          <Route path="/work/objectives" element={<div data-testid="protected">Objectives</div>} />
          <Route path="/work/projects-processes" element={<div data-testid="protected">Projects</div>} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * The bounce landed somewhere the PRODUCTION route table (src/router.tsx) actually serves — not the
 * not-found catch-all, and not another redirect. Delete that route from the real table and this
 * goes red, which is the whole point: the guard must not trade a hidden route for a dead end.
 */
function expectLandsOnALiveSurface() {
  const landed = screen.getByTestId('landing').textContent!
  expect(landed).toBe(CAPABILITY_FALLBACK_PATH)
  // The same one-hop contract the redirect map is held to (#220): the landing path must exist in
  // the production table, must not be the not-found catch-all, must not be a second redirect, and
  // must not sit behind a gate of its own — bouncing onto a gated surface is bouncing onto another
  // bounce. The bounce originates from an ungated capability miss, so `/` is the honest source.
  expectOneHop('/', landed)
}

describe('RequireCapability', () => {
  it('AC-002 (#179, #217): a viewer without the capability lands on a surface the production router serves', () => {
    mockUseAuth.mockReturnValue(authed([]))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expectLandsOnALiveSurface()
  })

  it('AC-302: allows admin into /work/objectives', () => {
    mockUseAuth.mockReturnValue(authed(['admin']))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects ops_lead from /work/objectives without objective.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expectLandsOnALiveSurface()
  })

  it('AC-302: allows ops_lead into /work/projects-processes with workline.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/projects-processes', 'workline.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects while loading (no protected flash)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expectLandsOnALiveSurface()
  })
})

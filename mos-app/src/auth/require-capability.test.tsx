import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('./use-auth')
import { useAuth } from './use-auth'
import { RequireCapability } from './require-capability'

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
      affiliated: [],
    },
    signOut: vi.fn(),
  }
}

// Where a redirect lands, reported rather than asserted here. A capability miss no longer
// redirects at all (#800) — it renders the access boundary in place, which is why the
// "lands on a live surface" contract this file used to carry is gone rather than relaxed: there
// is no landing route left to keep alive. The catch-all survives for the pre-auth redirect below.
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
 * The viewer stayed where they typed, and was told why. Nothing navigated: the catch-all Landing
 * route never mounts, so this fails the moment the guard goes back to forwarding.
 *
 * `denied` is the LINK this gate closed, not the destination it sits in — a capability gate closes
 * one link inside a destination the viewer holds, and the rail beside the panel shows them holding
 * it (`shell/destinations.tsx`, linkTitleKeyForPath).
 */
function expectAccessBoundaryInPlace(denied: string) {
  expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
  expect(screen.getByText(`${denied} is outside your access`)).toBeInTheDocument()
  expect(screen.queryByText('Work is outside your access')).not.toBeInTheDocument()
}

describe('RequireCapability', () => {
  it('AC-002 (#179, #217, #800): a viewer without the capability meets the boundary where they are', () => {
    mockUseAuth.mockReturnValue(authed([]))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expectAccessBoundaryInPlace('Objectives')
  })

  it('AC-302: allows admin into /work/objectives', () => {
    mockUseAuth.mockReturnValue(authed(['admin']))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  // REWRITE at the behavior level (#992, OD-OBJ-1). This case used to pin ops_lead as ADMITTED
  // with objective.manage ("OD-V4-1 moved the write to lead level; this case used to pin ops_lead
  // as the 'lacks it' example"). OD-OBJ-1 narrows it again: ops_lead loses objective.manage and
  // holds only objective.edit_content, so the SAME capability now closes the boundary for an ops
  // lead, and admission flips to the narrower grant. `member` keeps the honest lacks-it example
  // below either way.
  it('AC-302: holds ops_lead out of /work/objectives with objective.manage (#992)', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/objectives', 'objective.manage')
    // The boundary chrome keeps the destination title (<h1>Objectives</h1>) on screen, so the
    // stub's visible text cannot discriminate admitted from denied — the testid is the honest
    // assertion that the protected content itself stayed unmounted.
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expectAccessBoundaryInPlace('Objectives')
  })

  it('AC-302: allows ops_lead into /work/objectives with objective.edit_content (#992)', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/objectives', 'objective.edit_content')
    expect(screen.getByText('Objectives')).toBeInTheDocument()
  })

  it('AC-302: holds member out of /work/objectives without objective.manage', () => {
    mockUseAuth.mockReturnValue(authed(['member']))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expectAccessBoundaryInPlace('Objectives')
  })

  it('AC-302: allows ops_lead into /work/projects-processes with workline.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/projects-processes', 'workline.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects while loading (no protected flash, and no boundary for a viewer who may hold it)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.getByTestId('landing')).toHaveTextContent('/')
  })
})

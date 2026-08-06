import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ContextRow } from './context-row'
import { PageHead } from './page-head'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

/**
 * The page-family registry is mocked, not read from the module, because on this branch the real
 * one is EMPTY — no page renders a `PageFamilyFrame` yet (see page-family-migration.ts). These
 * cases are about ContextRow's suppression BEHAVIOUR, so each one declares the registry state it
 * is exercising rather than depending on whichever surfaces happen to have ported. The routes
 * declared below are v4's own migrated set for these paths, and every assertion is v4's.
 *
 * `markMigrated()` with no arguments is the live state on this branch: nothing migrated.
 */
const migrated = vi.hoisted(() => ({ routes: [] as { path: string }[] }))
vi.mock('./page-family-migration', () => ({
  PAGE_FAMILY_FRAME_ROUTES: migrated.routes,
}))

function markMigrated(...paths: string[]) {
  migrated.routes.length = 0
  for (const path of paths) migrated.routes.push({ path })
}

function setAuth(accessRoles: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'cahya@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu-cafe', name: 'Barista', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

function renderCtx(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<ContextRow />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// Full anatomy render: region 2 (ContextRow) above region 3 (PageHead), exactly as a migrated
// PageFamilyFrame route composes them. Used to prove the job sentence is shown EXACTLY ONCE and
// owned by region 3 (ContextRow suppresses region 2) on migrated routes.
function renderMigratedPage(path: string, title: string, jobSentence: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ContextRow />
                <PageHead family="workspace" variant="content" title={title} jobSentence={jobSentence} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

/**
 * The same anatomy, but composed the way `/` actually composes it (home-page.tsx): a `statusRow`
 * and NO `jobSentence` prop. The oracle above never exercised this shape at all — its fixture
 * passed a `jobSentence` and no `statusRow`, so it could pass while the real route rendered zero
 * orientation signals.
 */
function renderMigratedPageWithStatusRow(path: string, title: string, statusRow: React.ReactNode) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ContextRow />
                <PageHead family="workspace" variant="content" title={title} statusRow={statusRow} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

/**
 * Orientation-rule (amended Experience-Contract Rule 1, owner ruling 2026-07-30): a page shows its
 * orientation signal exactly once, satisfied by EITHER region 2/3's job sentence (`.ctx-job` /
 * `.page-head-job`) OR a region-3 status row (`.ch-status-row`) — never both, never neither. Counts
 * every element carrying either signal, across the whole render (region 2 + region 3 together), so
 * a defect that duplicates OR drops the signal shows up as a count other than 1.
 */
function orientationCount(container: HTMLElement): number {
  return container.querySelectorAll('.ctx-job, .page-head-job, .ch-status-row').length
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth([])
  // Default = this branch's real state: no page is on a PageFamilyFrame, so ContextRow owns the
  // job sentence everywhere. Cases about suppression opt in with markMigrated(...).
  markMigrated()
})

describe('AC-013/020 (T13): ContextRow — region + job sentence + scope', () => {
  it('renders a region labelled "Context" with data-anatomy=context-row', () => {
    renderCtx('/')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region).toHaveAttribute('data-anatomy', 'context-row')
  })

  it('AC-013 (amended, owner ruling 2026-07-30): Home renders its orientation exactly once, satisfied by the status row — never the retired job sentence, never both, never neither', () => {
    // Composed the way `/` ACTUALLY composes it (home-page.tsx): a statusRow and no jobSentence.
    // The previous fixture here passed a jobSentence and no statusRow — a shape `/` never renders —
    // so it could pass 1-for-1 while the real route showed zero orientation signals (the defect
    // Experience-Contract Rule 1 flagged, docs/reviews/v4-redesign.md Open item 1). The owner has
    // since retired the literal-sentence requirement for Home: a status row satisfies orientation.
    markMigrated('/')
    const { container } = renderMigratedPageWithStatusRow('/', 'Home', <span>3 handled · 2 left</span>)
    expect(orientationCount(container), 'exactly one orientation signal (the status row)').toBe(1)
    expect(screen.getByText('3 handled · 2 left')).toBeInTheDocument()
    expect(screen.queryByText('What needs my attention right now?')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Home job sentence in ContextRow at the migrated / route', () => {
    markMigrated('/')
    renderCtx('/')
    expect(screen.queryByText('What needs my attention right now?')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Signals job sentence at the migrated /work/signals route (region 3 owns it)', () => {
    // Signals migrated onto PageFamilyFrame (the Luna single-job-sentence correction): the archive's
    // region-3 page head owns the sentence, so ContextRow must NOT emit a duplicate copy.
    markMigrated('/work/signals')
    renderCtx('/work/signals')
    expect(screen.queryByText('Search and revisit the Signals your Teams have shared.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Signals job sentence at the migrated record route /work/signals/:id', () => {
    markMigrated('/work/signals/:signalId')
    renderCtx('/work/signals/sig-1')
    expect(screen.queryByText('Search and revisit the Signals your Teams have shared.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Tasks job sentence at the migrated /work/tasks route (region 3 owns it)', () => {
    markMigrated('/work/tasks')
    renderCtx('/work/tasks')
    expect(screen.queryByText('Find and do the work I own or my Team owns.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the job sentence at the migrated record route /work/tasks/:id', () => {
    markMigrated('/work/tasks/:taskId')
    renderCtx('/work/tasks/abc')
    expect(screen.queryByText('Find and do the work I own or my Team owns.')).not.toBeInTheDocument()
  })

  it('AC-013 / R-OWNER-1: the Money job sentence is shown exactly once, owned by region 3 at the migrated /money route', () => {
    // `/money` migrated onto a PageFamilyFrame (Issue 11); region-3 PageHead owns the sentence.
    markMigrated('/money')
    renderMigratedPage('/money', 'Money', 'Trust the financial figures and act on money exceptions.')
    expect(screen.getAllByText('Trust the financial figures and act on money exceptions.')).toHaveLength(1)
  })

  it('AC-013: shows the viewer scope signal, not the viewer name, in the context row (unmigrated route)', () => {
    // owner-eyes item 8: the scope crumb is suppressed on migrated routes whose head carries context,
    // so the scope-signal behavior is asserted on an unmigrated route where ContextRow is the sole owner.
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Café')
    expect(region.textContent).not.toContain('Cahya')
  })

  it('F3/P1: an admin-flagged viewer whose role matches no BU-family keyword shows their real role name, never the bare "Admin" label', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Dewi Director',
          email: 'dewi@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
        },
        roles: [{ id: 'r0', org_id: 'o1', business_unit_id: null, name: 'Managing Director', reports_to_role_id: null, created_at: '', updated_at: '' }],
        isManager: true,
        accessRoles: ['admin'],
      },
      signOut: vi.fn(),
    })
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Managing Director')
    expect(region.textContent).not.toBe('Admin')
    expect(screen.queryByText('Admin', { exact: true })).not.toBeInTheDocument()
  })

  it('money-1: the scope crumb never shrinks below its content — flex:none with a maxWidth ceiling, so it cannot collapse to an illegible fragment on phone width', () => {
    renderCtx('/admin/roles')
    const scope = screen.getByText('Café')
    expect(scope).toHaveStyle({ flex: 'none' })
    // /admin/* now carries its own job sentence (fa636b7), not Home's — locate by the admin copy.
    const job = screen.getByText('Configure who can sign in and what they can do.')
    expect(job).toHaveStyle({ flex: '1 1 auto', minWidth: '0' })
  })

  it('F1: a Kitchen Lead resolves to the owning Café Module scope, not a generic "Team" or the bare role name', () => {
    // CONTEXT.md: Kitchen is an Area *inside* the Café Module. Scope resolves from the module data
    // model (destinations.tsx workMatch), so a Kitchen Lead shows "Café" — identical to the parallel
    // Cafe Ops Lead persona — never a less-specific "Team" fallback.
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Kirana Kitchen',
          email: 'kirana@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
        },
        roles: [{ id: 'r5', org_id: 'o1', business_unit_id: 'bu-cafe', name: 'Kitchen Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Café')
    expect(region.textContent).not.toContain('Team')
  })

  it('F3/P1: a viewer whose role matches no BU-family keyword shows their real role name, not a generic "Team" placeholder', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Sari Sales',
          email: 'sari@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
        },
        roles: [{ id: 'r4', org_id: 'o1', business_unit_id: 'bu-b2b-sales', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Sales Lead')
  })
})

describe('R-OWNER-1: ContextRow job sentence is suppressed on migrated V3 page-family routes', () => {
  it('renders the job sentence exactly once on a migrated route (PageHead region 3 owns it, ContextRow region 2 suppresses)', () => {
    markMigrated('/work/tasks')
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks']}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <ContextRow />
                  <PageHead
                    family="workspace"
                    variant="content"
                    title="Tasks"
                    jobSentence="Find and do the work I own or my Team owns."
                  />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    // Region 3's PageHead is the single owner of the sentence; ContextRow adds no second copy.
    expect(screen.getAllByText('Find and do the work I own or my Team owns.')).toHaveLength(1)
  })

  it('keeps the ContextRow job sentence on an unmigrated route (there it is the only job sentence)', () => {
    // An unmigrated route with no PageFamilyFrame region-3 sentence (e.g. an admin sub-route) —
    // ContextRow stays the sole owner and must NOT be globally suppressed. The rendered copy is
    // the route's OWN job sentence: /admin/* now resolves to `job.admin` (V3 sweep F2), no longer
    // borrowing Home's "What needs my attention right now?". (`/work/signals` was moved to a
    // migrated route in the Luna single-job-sentence correction; region 3 owns it there now.)
    renderCtx('/admin/roles')
    expect(screen.getByText('Configure who can sign in and what they can do.')).toBeInTheDocument()
  })

  it('owner-eyes item 8: suppresses the orphan scope crumb on a migrated route (region stays, but empty + collapsed)', () => {
    // The region landmark must remain (the shell anatomy contract), but on a migrated route whose
    // head already carries context the strip renders NOTHING — no lone "Café" crumb above the title.
    markMigrated('/work/tasks')
    renderCtx('/work/tasks')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region).toHaveAttribute('data-anatomy', 'context-row')
    expect(region.textContent).not.toContain('Café')
    expect(region.textContent?.trim()).toBe('')
    expect(region).toHaveStyle({ height: '0px' })
  })

  // OD-REDESIGN-91 #42: an unrecognized route renders the 404 page, so its context line is the
  // 404's own — never Home's borrowed "What needs my attention right now?".
  it('#42: a 404 (unknown route) shows its own line, not Home’s job sentence', () => {
    renderCtx('/nope-not-a-route')
    expect(screen.getByText('This page doesn’t exist — head back to a destination you know.')).toBeInTheDocument()
    expect(screen.queryByText('What needs my attention right now?')).toBeNull()
  })
})

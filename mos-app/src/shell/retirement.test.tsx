import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Navigate } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { DESTINATIONS, MODULES, UTILITY } from './destinations'
import { routeConfig, SearchRedirect } from '@/router'
import { CommandMenu } from '@/components/command/command-menu'
import { HomePage } from '@/pages/home-page'

// C4 (FR-418): the Signal supersedes the retired mandatory Weekly Update and the operations-only
// Daily Log — those entry points are removed while their historical data is preserved (§7 of the
// spec; the tables/components themselves are NOT dropped here, that is the Step-11 sweep). This
// file is the single consolidated assertion that no residual entry point crept back in across
// destinations, ⌘K, and Home — steps 2/3 already did the removal (OD-64); C4 confirms it stays gone.

const FORBIDDEN = /write update|weekly update|daily log|open the daily log/i

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn().mockResolvedValue([]), listTasks: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/reporting', () => ({ listSalesDailyRevenue: vi.fn().mockResolvedValue([]), latestSnapshotAsOf: vi.fn(), latestReportingDate: vi.fn() }))
vi.mock('@/lib/db/reporting-margin', () => ({ listSalesMarginDaily: vi.fn().mockResolvedValue([]), latestMarginSnapshotAsOf: vi.fn(), latestMarginReportingDate: vi.fn() }))
vi.mock('@/lib/db/weekly-updates', () => ({
  getMyUpdate: vi.fn().mockResolvedValue(null), listTeamUpdates: vi.fn(),
}))
vi.mock('@/lib/db/team', () => ({ getTeamForManager: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn().mockResolvedValue([]), getPeople: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/signals', () => ({
  listReadableSignals: vi.fn().mockResolvedValue([]), correctSignal: vi.fn(),
  listAllTeams: vi.fn().mockResolvedValue([]), orderSignalsForFeed: (rows: unknown[]) => rows,
}))
vi.mock('@/shell/signal-composer-host', () => ({ useSignalComposer: () => ({ open: vi.fn() }) }))

function memberViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: { id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null, archived_at: null, created_at: '', updated_at: '' },
      roles: [], isManager: false, accessRoles: [],
    },
    signOut: vi.fn(),
  })
}

describe('C4 — retirement: destinations.tsx carries no Weekly Update / Daily Log entry point', () => {
  it('no destination/module/utility link (workspace or Work-children) mentions the forbidden entry points', () => {
    const allDestinations = [...DESTINATIONS, ...MODULES.flatMap((g) => g.items), ...UTILITY]
    const allLinks = allDestinations.flatMap((d) => [...d.links, ...(d.children ?? [])])
    expect(allLinks.length).toBeGreaterThan(0)
    for (const link of allLinks) {
      expect(link.label).not.toMatch(FORBIDDEN)
      expect(link.path).not.toMatch(/weekly-update|daily-log|\/updates$/i)
    }
  })
})

describe('C4 — retirement: the router redirects /updates to /work/signals (FR-418)', () => {
  function shellChildren() {
    const protectedRoute = routeConfig.find(
      (r) => Array.isArray(r.children) && r.children.some(
        (c) => Array.isArray(c.children) && c.children.some((cc) => cc.path === 'work/tasks'),
      ),
    )!
    const shell = protectedRoute.children!.find((c) => Array.isArray(c.children))!
    return shell.children!
  }

  it('/updates redirects to /work/signals, never a chained redirect through a Weekly Update page', () => {
    const updates = shellChildren().find((r) => r.path === 'updates')!
    expect(updates.element).toEqual(<Navigate to="/work/signals" replace />)
    expect(updates.element).not.toEqual(<SearchRedirect to="/weekly-update" />)
  })
})

describe('C4 — retirement: ⌘K carries no Weekly Update / Daily Log action or navigate item', () => {
  it('the command palette lists no forbidden entry point', () => {
    memberViewer()
    render(
      <I18nProvider>
        <MemoryRouter>
          <CommandMenu open onClose={vi.fn()} onShareSignal={vi.fn()} />
        </MemoryRouter>
      </I18nProvider>,
    )

    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.textContent ?? '').not.toMatch(FORBIDDEN)
    }
  })
})

describe('C4 — retirement: Home renders no residual Weekly Update / Daily Log links (OD-64)', () => {
  it('a member viewer sees no "write update" / "weekly update" / "daily log" link or region on Home', async () => {
    memberViewer()
    render(
      <I18nProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nProvider>,
    )

    // Ready sentinel — a JOURNEY STEP, not the oracle. It was the job question ("What needs my
    // attention right now?"); the compact day header replaces that sentence with the live state
    // line, so the sentinel moves to the region tab strip, which is what makes Home "rendered"
    // either way. The oracle below (no Weekly Update / Daily Log residue) is untouched.
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument())
    for (const link of screen.queryAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(FORBIDDEN)
    }
    expect(screen.queryByRole('region', { name: 'My weekly update' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Today on the Daily Log/i })).toBeNull()
  })
})

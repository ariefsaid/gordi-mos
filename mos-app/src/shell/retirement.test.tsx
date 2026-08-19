// C4 (FR-418) — the consolidated retired-entry-point sweep, ported from the v4-redesign
// line and authored to THIS line's ruled state:
//
//  · Weekly Update: the Signal supersedes it. Entry points are retired everywhere —
//    `/updates` redirects to `/work/signals`, UpdatesPage is unrouted, SHOW_WEEKLY_UPDATES
//    is false — while the surface FILES stay pending the #281 ruling (hidden, not deleted;
//    see pages/my-week.hidden.test.tsx for the flag-off contract of the My Week panel).
//  · Daily Log: DELIBERATE divergence from v4 — `/ops` stays a live, flag-gated surface
//    (v4 retired it to `/`; this line's router documents why it does not). What IS ruled
//    is that no nav surface offers it: no destination link, no ⌘K item, no Home link.
//
// This file is the single consolidated assertion that no residual entry point creeps back
// in across DESTINATIONS/MODULES/UTILITY, the route table, ⌘K, and Home. It deliberately
// does NOT re-assert what its siblings own: guard-no-links-to-retired-paths.test.ts owns
// "no in-app link routes through the redirect map", and guard-od-v4-10-retirement.test.ts
// owns the region-order toggle's retirement. The value here is the entry-point sweep.
import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { DESTINATIONS, MODULES, UTILITY } from './destinations'
import { SHOW_FOLLOWUPS, SHOW_WEEKLY_UPDATES } from '@/config/features'
import { allRedirects, leafInThisTable, isRedirect, flattenRoutes, expectOneHop } from '@/test/route-table'
import { CommandMenu } from '@/components/command/command-menu'
import { HomePage } from '@/pages/home-page'

const FORBIDDEN = /write update|weekly update|daily log|open the daily log/i
const RETIRED_EVENTS_PATH = '/events'
const RETIRED_FOLLOWUPS_PREFIX = '/work/follow-ups'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/tasks', () => ({
  searchTasksByTitle: vi.fn().mockResolvedValue([]),
  listTasks: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/reporting', () => ({
  listSalesDailyRevenue: vi.fn().mockResolvedValue([]),
  latestSnapshotAsOf: vi.fn(() => null),
  latestReportingDate: vi.fn(() => null),
}))
vi.mock('@/lib/db/reporting-margin', () => ({
  listSalesMarginDaily: vi.fn().mockResolvedValue([]),
  latestMarginSnapshotAsOf: vi.fn(() => null),
  latestMarginReportingDate: vi.fn(() => null),
}))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/notifications', () => ({
  listNotifications: vi.fn().mockResolvedValue([]),
  notificationRoute: () => null,
}))
vi.mock('@/lib/db/home-attention-data', () => ({
  loadFailedChecksForViewer: vi.fn().mockResolvedValue([]),
  CAFE_LOG_ROUTE: '/cafe/log',
}))
// PARTIAL mock: the feed's ranking (`orderSignalsForFeed`) must stay the production one;
// only the reads are controlled here. (Same seam as home-page.test.tsx.)
vi.mock('@/lib/db/signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/signals')>()),
  listReadableSignals: vi.fn().mockResolvedValue([]),
  listAllTeams: vi.fn().mockResolvedValue([]),
  searchSignalsByBody: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/follow-ups', () => ({
  searchFollowUpsByCounterparty: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, postCount: 0 }),
}))

function memberViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        must_change_password: false, archived_at: null, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles: [],
    },
    signOut: vi.fn(),
  })
}

describe('C4 — retirement: the ruled flag state', () => {
  it('SHOW_WEEKLY_UPDATES stays false — no surface serves it, so a true flag would be a dead affordance', () => {
    // If #281 revives weekly updates WITH a route of their own, this flips with it (and this
    // assertion updates as part of that ruling — see config/features.ts).
    expect(SHOW_WEEKLY_UPDATES).toBe(false)
  })
})

describe('C4 — retirement: destinations.tsx carries no Weekly Update / Daily Log entry point', () => {
  it('no destination/module/utility link (workspace or Work-children) mentions the forbidden entry points', () => {
    const allDestinations = [...DESTINATIONS, ...MODULES.flatMap((g) => g.items), ...UTILITY]
    const allLinks = allDestinations.flatMap((d) => [...d.links, ...(d.children ?? [])])
    expect(allLinks.length).toBeGreaterThan(0)
    for (const link of allLinks) {
      expect(link.label).not.toMatch(FORBIDDEN)
      expect(link.path).not.toMatch(/weekly-update|daily-log|\/updates$|^\/ops(\/|$)/i)
    }
  })
})

describe('C4 — retirement: the route table (FR-418, read off the REAL routeConfig)', () => {
  it('/updates redirects to /work/signals in one hop — never a chained redirect through a Weekly Update page', () => {
    const updates = allRedirects().find((r) => r.from === '/updates')
    expect(updates, '/updates must be a redirect-map entry').toBeDefined()
    expect(updates!.to).toBe('/work/signals')
    expect(updates!.replace).toBe(true)
    expectOneHop('/updates', updates!.to)
  })

  it('no route path resurrects a weekly-update spelling', () => {
    const paths = flattenRoutes().map((r) => r.path)
    expect(paths.some((p) => /weekly-update|daily-log/.test(p))).toBe(false)
  })

  it('the Daily Log surface itself stays live at /ops (ruled divergence from v4 — hidden from nav, not deleted)', () => {
    const leaf = leafInThisTable('/ops')
    expect(leaf).toBeDefined()
    expect(leaf!.route.path).not.toBe('*')
    // With SHOW_DAILY_LOG on (the live default) /ops serves OpsPage, not a redirect. A port
    // that silently retires it to `/` (v4's table) turns this red — that retirement is a
    // surface ticket's call, not a route-table side effect.
    expect(isRedirect(leaf!.route.element)).toBe(false)
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

describe('AC-348 — retirement: Events is a Work child, never a root destination', () => {
  it('keeps the retired root out of real navigation registries and route table while Work Events remains', () => {
    const links = [...DESTINATIONS, ...MODULES.flatMap((group) => group.items), ...UTILITY]
      .flatMap((destination) => [...destination.links, ...(destination.children ?? [])])
    expect(links.map((link) => link.path)).not.toContain(RETIRED_EVENTS_PATH)
    expect(links.map((link) => link.path)).toContain('/work/events')
    const paths = flattenRoutes().map((route) => route.path)
    expect(paths).not.toContain(RETIRED_EVENTS_PATH)
    expect(paths).toContain('/work/events')
  })

  it('keeps the retired root out of the rendered command palette', () => {
    memberViewer()
    render(<I18nProvider><MemoryRouter><CommandMenu open onClose={vi.fn()} onShareSignal={vi.fn()} /></MemoryRouter></I18nProvider>)
    for (const option of screen.getAllByRole('option')) {
      expect(option.textContent ?? '').not.toMatch(/^Events$/i)
      expect(option.getAttribute('data-value') ?? '').not.toContain(RETIRED_EVENTS_PATH)
    }
  })
})

// ── DD-WAY-36 (#369): the Work follow-ups path is DELETED, not redirected ────────────────────
// /work/follow-ups used to redirect to an inert ?view=followups the tasks surface never served,
// while the real queue lives at /money/follow-ups behind a finance gate the Work path did not
// carry — a lying redirect. The events precedent (OD-WAY-51): deleted outright. A direct visit
// falls through to the not-found catch-all in ONE hop; the Money surface itself is untouched
// (OD-WAY-34). The static source scan below is the "no rendered link / palette entry / pageTo"
// half: guard-no-links only checks paths that REDIRECT — a deleted path has left its map, so this
// file owns the spelling.
const APP_SRC = resolve(__dirname, '..')

function appSourceFiles(directory: string, output: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') appSourceFiles(fullPath, output)
    } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.includes('.test.')) {
      output.push(fullPath)
    }
  }
  return output
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, ' '))
}

describe('DD-WAY-36 — retirement: the Work follow-ups path is deleted, not redirected', () => {
  it('no route under /work/follow-ups exists in the real table — neither the queue doormat nor the record page', () => {
    const survivors = flattenRoutes().map((route) => route.path).filter((routePath) => routePath.startsWith(RETIRED_FOLLOWUPS_PREFIX))
    expect(survivors, 'these routes must be deleted outright (DD-WAY-36)').toEqual([])
  })

  it('a direct visit falls through to the not-found catch-all — one hop, no redirect', () => {
    for (const requestedUrl of ['/work/follow-ups', '/work/follow-ups/fu-1']) {
      const routeMatch = leafInThisTable(requestedUrl)
      expect(routeMatch, `${requestedUrl} matched nothing at all`).toBeDefined()
      expect(routeMatch!.route.path, `${requestedUrl} must fall through to the not-found catch-all`).toBe('*')
      expect(isRedirect(routeMatch!.route.element), `${requestedUrl} must not redirect before the 404`).toBe(false)
    }
  })

  it('the redirect map carries no /work/follow-ups spelling — deleted paths do not get doormats', () => {
    expect(allRedirects().filter((redirect) => redirect.from.startsWith(RETIRED_FOLLOWUPS_PREFIX))).toEqual([])
  })

  it('no app source names the deleted path — no link target, palette basePath, or pageTo (comments stripped, tests excluded)', () => {
    const offenders: string[] = []
    for (const sourceFile of appSourceFiles(APP_SRC)) {
      const sourceCode = stripComments(readFileSync(sourceFile, 'utf-8'))
      if (sourceCode.includes(RETIRED_FOLLOWUPS_PREFIX)) offenders.push(relative(APP_SRC, sourceFile))
    }
    expect(offenders, `${offenders.join(', ')} still names the deleted /work/follow-ups path`).toEqual([])
  })

  it('no destination/module/utility link names the deleted path', () => {
    const links = [...DESTINATIONS, ...MODULES.flatMap((destinationGroup) => destinationGroup.items), ...UTILITY]
      .flatMap((destination) => [...destination.links, ...(destination.children ?? [])])
    expect(links.map((link) => link.path).some((linkPath) => linkPath.startsWith(RETIRED_FOLLOWUPS_PREFIX))).toBe(false)
  })

  it('the Money follow-ups queue keeps its home (OD-WAY-34 — this retirement does not touch it)', () => {
    const leaf = leafInThisTable('/money/follow-ups')
    expect(leaf?.pathname).toBe('/money/follow-ups')
    // The live Money queue remains flag-gated exactly as before; when lit it is a page, not a
    // redirect. This assertion protects the route without changing OD-WAY-34's dark default.
    expect(isRedirect(leaf!.route.element)).toBe(!SHOW_FOLLOWUPS)
  })
})

describe('C4 — retirement: Home renders no residual Weekly Update / Daily Log links', () => {
  it('a member viewer sees no "write update" / "weekly update" / "daily log" link or region on Home', async () => {
    memberViewer()
    render(
      <I18nProvider>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<HomePage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )

    // Ready sentinel — a JOURNEY STEP, not the oracle: the Signals feed region is what the
    // Home spec guarantees in every arrangement, so waiting on it proves the page finished
    // composing before the sweep runs. The oracle is the absence assertions below.
    await waitFor(() => expect(screen.getByRole('region', { name: /signals/i })).toBeInTheDocument())
    for (const link of screen.queryAllByRole('link')) {
      expect(link.textContent ?? '').not.toMatch(FORBIDDEN)
    }
    expect(screen.queryByRole('region', { name: 'My weekly update' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Today on the Daily Log/i })).toBeNull()
  })
})

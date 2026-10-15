import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { flattenRoutes } from '@/test/route-table'

const SRC = join(__dirname, '..')

/** Every route of the real table that carries a classification handle, with its full path. */
function collectClassifiedRoutes() {
  return flattenRoutes()
    .filter(({ route }) => typeof route.handle === 'object' && route.handle !== null)
    .map(({ path, route }) => ({ path, handle: route.handle as { kind: string } }))
}

/**
 * Pages that render the frame but are reached through a parent's route rather than one of their
 * own, so they carry no entry of their own. Each is listed deliberately; the reverse scan below
 * fails on anything not named here, which is the point.
 */
const FRAME_PAGES_WITHOUT_A_ROUTE = new Set<string>([
  // Routed as `SignalsArchivePage`/`SignalRecordPage`, both of which ARE registered above; the
  // file is named by those entries under its own path.
  // DD-MVP-17: /cafe/log no longer routes to this page — it redirects to /cafe, where
  // `CafeRootPage` (registered above) composes kitchen-log-page as the capture body.
  'pages/kitchen-log-page.tsx',
  // Routed by the `*` catch-all; it names itself as the access boundary does, which silences the ContextRow.
  'pages/not-found-page.tsx',
  // The Work directory at `/work`: carries its own job sentence in its page head (see DEFERRED_PAGE_ROUTES).
  'pages/work-home-page.tsx',
])

/** The page whose divergence from the Tasks door the marker below watches. */
const MONEY_DOOR = 'pages/follow-ups-page.tsx'

// This registry started empty on `dev` (no page rendered `PageFamilyFrame` yet) and every existing
// `context-row.test.tsx` case exercises it through a MOCK, never the real export — so before this
// file, nothing proved the real array's content once a surface actually populated it. #191 is that
// first surface: it must both render `PageFamilyFrame` (home-page.tsx) AND register itself here, or
// ContextRow renders a duplicate orientation signal alongside Home's own status row (Experience-
// Contract Rule 1). This is the direct check on the real, unmocked registry.
describe('PAGE_FAMILY_FRAME_ROUTES (#191)', () => {
  it('registers Home (`/`) on the workspace family', () => {
    const home = PAGE_FAMILY_FRAME_ROUTES.find((r) => r.path === '/')
    expect(home, 'Home must be registered or ContextRow will render a second orientation signal')
      .toBeDefined()
    expect(home?.family).toBe('workspace')
    expect(home?.symbol).toBe('HomePage')
  })

  it.each(['/cafe/production', '/cafe/transfer'])('%s names the shared Café log page frame', (path) => {
    const entry = PAGE_FAMILY_FRAME_ROUTES.find((route) => route.path === path)
    expect(entry).toMatchObject({
      family: 'workspace',
      sourceFile: 'pages/kitchen-log-page.tsx',
      symbol: 'KitchenLogPage',
    })
  })

  it('/cafe/waste names its dedicated Café waste page frame', () => {
    expect(PAGE_FAMILY_FRAME_ROUTES.find(route => route.path === '/cafe/waste')).toMatchObject({
      family: 'workspace',
      sourceFile: 'pages/cafe-waste-page.tsx',
      symbol: 'CafeWastePage',
    })
  })

  it('/cafe/count names its dedicated physical Count page frame', () => {
    expect(PAGE_FAMILY_FRAME_ROUTES.find(route => route.path === '/cafe/count')).toMatchObject({
      family: 'workspace',
      sourceFile: 'pages/cafe-count-page.tsx',
      symbol: 'CafeCountPage',
    })
  })

  it('every classified Café page route uses the one CafePageFrame composition', () => {
    const cafeRoutes = collectClassifiedRoutes()
      .filter(({ path, handle }) => (path === '/cafe' || path.startsWith('/cafe/')) && handle.kind === 'page')
      .map(route => route.path)
      .sort()
    const registeredCafeRoutes = PAGE_FAMILY_FRAME_ROUTES
      .filter(route => route.path === '/cafe' || route.path.startsWith('/cafe/'))
      .map(route => route.path)
      .sort()

    expect(registeredCafeRoutes, 'every live Café page must be covered by the frame registry').toEqual(cafeRoutes)
    for (const route of PAGE_FAMILY_FRAME_ROUTES.filter(entry => entry.path === '/cafe' || entry.path.startsWith('/cafe/'))) {
      const source = readFileSync(join(SRC, route.sourceFile), 'utf8')
      expect(source, `${route.path} must use CafePageFrame`).toContain('<CafePageFrame')
      expect(source, `${route.path} must not build a private PageFamilyFrame`).not.toContain('<PageFamilyFrame')
      expect(source, `${route.path} must not render a private PageHead`).not.toContain('<PageHead')
      expect(source, `${route.path} must not render a page-local h1`).not.toMatch(/<h1(?:\s|>)/)
      expect(source, `${route.path} must not style a private header`).not.toContain('headClassName=')
    }
  })
})

/**
 * #270 — the check that was missing. The registry drifted from reality for the entire v4 port:
 * nineteen surfaces moved onto `PageFamilyFrame` and none added its row, so the list stood at
 * five while ContextRow kept printing the job sentence a second time above a page head that
 * already carried it — and cost 40px of content height on every route but Home.
 *
 * A missing entry and a wrong entry fail in opposite directions (duplicate sentence / silence
 * with nothing filling the gap), so both are checked, against the source files themselves rather
 * than a mock.
 */
describe('issue 270 — the registry describes the pages that really render the frame', () => {
  it.each(PAGE_FAMILY_FRAME_ROUTES.map((e) => [e.path, e.sourceFile, e.symbol] as const))(
    '%s — %s exports %s and renders the frame',
    (_path, sourceFile, symbol) => {
      const full = join(SRC, sourceFile)
      expect(existsSync(full), `${sourceFile} does not exist`).toBe(true)
      const src = readFileSync(full, 'utf8')
      // The symbol must be exported by the file the entry names — an entry pointing at a
      // component that moved is how this list rotted in the first place.
      expect(src, `${sourceFile} does not export ${symbol}`).toMatch(
        new RegExp(`export\\s+(function|const)\\s+${symbol}\\b`),
      )
      // Café pages compose the inner PageFamilyFrame through CafePageFrame; other routes render
      // PageFamilyFrame directly. In either case this entry must point at a real shared frame.
      if (_path === '/cafe' || _path.startsWith('/cafe/')) {
        expect(src, `${sourceFile} renders no CafePageFrame`).toContain('<CafePageFrame')
      } else {
        expect(src, `${sourceFile} renders no PageFamilyFrame`).toContain('PageFamilyFrame')
      }
    },
  )

  // THE REVERSE DIRECTION — and the one that matters, because it is the direction the bug went.
  // Nineteen pages moved onto the frame and none added a row; a check that only validates existing
  // rows would have stayed green through all of it. This reads `pages/` and fails on any page
  // rendering `PageFamilyFrame` that no entry names.
  //
  // Deliberately keyed on the FILE, not the route: one file can serve several paths
  // (dashboard-page → /money and /money/detail), and a page reachable by no route at all is the
  // other half of what this port got wrong.
  it('every page that renders the frame is named by an entry', () => {
    const pagesDir = join(SRC, 'pages')
    const registered = new Set(PAGE_FAMILY_FRAME_ROUTES.map((e) => e.sourceFile))
    const unregistered = readdirSync(pagesDir)
      .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
      .filter((f) => readFileSync(join(pagesDir, f), 'utf8').includes('<PageFamilyFrame'))
      .map((f) => `pages/${f}`)
      .filter((rel) => !registered.has(rel))
      .filter((rel) => !FRAME_PAGES_WITHOUT_A_ROUTE.has(rel))
    expect(
      unregistered,
      `these pages render PageFamilyFrame but no registry entry names them, so ContextRow will ` +
        `print their job sentence a second time: ${unregistered.join(', ')}`,
    ).toEqual([])
  })

  it('registers the converged developer and Money follow-up frames', () => {
    expect(PAGE_FAMILY_FRAME_ROUTES.filter(({ path }) =>
      path.startsWith('/dev/views') || path === '/money/follow-ups',
    )).toMatchObject([
      { path: '/dev/views', family: 'management', sourceFile: 'pages/dev-views-page.tsx', symbol: 'DevViewsPage' },
      { path: '/dev/views/:viewId', family: 'management', sourceFile: 'pages/dev-views-page.tsx', symbol: 'DevViewsPage' },
      { path: '/money/follow-ups', family: 'workspace', sourceFile: MONEY_DOOR, symbol: 'FollowUpsPage' },
    ])
  })

  it('no path is registered twice', () => {
    const paths = PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path)
    expect(paths).toEqual([...new Set(paths)])
  })
})

// ── #424 — the registry describes the ROUTE TABLE, not just the files ────────────────────────
//
// The reverse scan above keys on the FILE: a new route path serving an ALREADY-registered page
// file needs no registry row and fails nothing — while ContextRow prints the job sentence a
// second time on that path (#270's defect class at route granularity). v4's check joined the
// registry against the real classified route table; this restores that join, in both directions.
// The file scan stays: it catches a page that renders the frame but is reachable by no route.
const DEFERRED_PAGE_ROUTES = new Map<string, string>([
  // Already silenced by the sibling dynamic pattern `/work/tasks/:taskId`: ContextRow matches
  // registry rows with `matchPath`, and `:taskId` matches `new`. A dedicated row would be a
  // second way to say the same thing.
  ['/work/tasks/new', 'silenced by the /work/tasks/:taskId pattern'],
  ['/work', 'the Work directory page head carries its own job sentence'],
  ['/dev/views', 'in the router but marked as DEV-only infrastructure'],
  ['/dev/views/:viewId', 'in the router but marked as DEV-only infrastructure'],
])

describe('issue 424 — the registry and the real route table agree', () => {
  const pagePaths = collectClassifiedRoutes()
    .filter(({ handle }) => handle.kind === 'page')
    .map(({ path }) => path)

  it('every classified page route is registered or deliberately deferred', () => {
    const registered = new Set(PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path))
    const missing = pagePaths.filter(
      (path) => !registered.has(path) && !DEFERRED_PAGE_ROUTES.has(path),
    )
    expect(
      missing,
      `these page routes render no registry row, so ContextRow prints the job sentence a second ` +
        `time above the page head that already carries it: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every registry path is classified or deliberately deferred', () => {
    const real = new Set(pagePaths)
    const orphaned = PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path)
      .filter((path) => !real.has(path) && !DEFERRED_PAGE_ROUTES.has(path))
    expect(
      orphaned,
      `these registry rows name no classified or deferred route: ${orphaned.join(', ')}`,
    ).toEqual([])
  })
})

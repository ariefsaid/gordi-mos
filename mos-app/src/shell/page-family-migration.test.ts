import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { routeConfig } from '@/router'
import { collectClassifiedRoutes } from './route-classification'

const SRC = join(__dirname, '..')

/**
 * Pages that render the frame but are reached through a parent's route rather than one of their
 * own, so they carry no entry of their own. Each is listed deliberately; the reverse scan below
 * fails on anything not named here, which is the point.
 */
const FRAME_PAGES_WITHOUT_A_ROUTE = new Set<string>([
  // Routed as `SignalsArchivePage`/`SignalRecordPage`, both of which ARE registered above; the
  // file is named by those entries under its own path.
])

/**
 * The three modules the Tasks door composes to render the follow-up queue. The Money page reaches
 * none of them today; #428 owns making it reach them, and the marker below is what tells whoever
 * lands that change which comments it falsifies.
 */
const SHARED_FOLLOW_UP_QUEUE = [
  'components/follow-ups/use-follow-up-queue.ts',
  'components/follow-ups/follow-up-queue-table.tsx',
  'components/follow-ups/use-follow-up-record-opener.ts',
]

/** Where "the Money page shares none of this" is written down — the reading list for that red. */
const COMMENTS_THIS_CASE_ANCHORS = [
  'components/follow-ups/follow-up-queue-embed.tsx — header, the TWO RENDERERS paragraph',
  'components/follow-ups/follow-up-queue-embed.test.tsx — header, and the AC-904 / AC-907 it() names',
  'components/follow-ups/follow-up-queue-table.tsx — header, "NOT YET the one renderer"',
  'components/follow-ups/use-follow-up-queue.ts — header, "never wired BACK"',
  'components/follow-ups/use-follow-up-record-opener.ts — header, "an intent, not a fact"',
  'components/tasks/tasks-workspace-followups-door.test.tsx — header',
  'i18n/messages.ts — the comment above `followUps.title`',
  'pages/follow-ups-page.test.tsx — the comment inside AC-520',
]

/**
 * Every module reachable from `entry` through imports, transitively: `@/…` and relative specifiers
 * in `import`, `export … from`, and dynamic `import()` alike. Comments are stripped first, so
 * prose that merely NAMES a module is not an edge.
 *
 * Returns module → the module that imported it (empty string for the entry), so a hit can be
 * printed as the chain that produced it.
 */
function importClosure(entry: string): Map<string, string> {
  const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  const resolve = (spec: string, importer: string): string | null => {
    let base: string
    if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = join(dirname(importer), spec)
    else return null // a package, not our source
    const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
    return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null
  }

  const first = join(SRC, entry)
  const importedBy = new Map<string, string | null>([[first, null]])
  const queue = [first]
  while (queue.length > 0) {
    const file = queue.shift() as string
    if (!/\.tsx?$/.test(file)) continue // .css and friends import nothing we resolve
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    for (const [, spec] of code.matchAll(SPECIFIER)) {
      const target = resolve(spec, file)
      if (target === null || importedBy.has(target)) continue
      importedBy.set(target, file)
      queue.push(target)
    }
  }
  return new Map(
    [...importedBy].map(([file, importer]) => [
      relative(SRC, file),
      importer === null ? '' : relative(SRC, importer),
    ]),
  )
}

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
      // And the file must genuinely render the frame: that is the claim the entry makes, and
      // without it ContextRow falls silent with nothing replacing the sentence.
      expect(src, `${sourceFile} renders no PageFamilyFrame`).toContain('PageFamilyFrame')
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

  it('follow-ups is deliberately excluded — that page renders no frame yet', () => {
    // The one place this branch's registry departs from v4's, guarded in both directions. If this
    // fails because follow-ups GAINED a frame, add its two routes and delete this case — that is
    // the cutover, and it should be a deliberate edit rather than a silent drift.
    const src = readFileSync(join(SRC, 'pages/follow-ups-page.tsx'), 'utf8')
    expect(src).not.toContain('PageFamilyFrame')
    const paths = PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path)
    expect(paths).not.toContain('/money/follow-ups')
    expect(paths).not.toContain('/work/follow-ups/:id')
  })

  it('follow-ups still has TWO renderers — the marker #428 deletes when it lands', () => {
    // A known-divergence marker, not a behaviour guard, and it is here because the divergence was
    // rediscovered FOUR times: comments across ten sites asserted it away, and each reader believed
    // them. A comment can be wrong forever; this cannot.
    //
    // The divergence: the Tasks embed composes useFollowUpQueue + FollowUpQueueTable +
    // useFollowUpRecordOpener, and this page reaches none of them — so when SHOW_FOLLOWUPS lights
    // the two doors will render the same record type through two unrelated implementations.
    //
    // IF THIS FAILS, THAT IS THE CUTOVER (#428), NOT A BREAKAGE. The failure message says so and
    // says what to delete. Deliberate edit, not silent drift — the same contract as the frame
    // exclusion above.
    //
    // WHY THE MODULE GRAPH AND NOT A GREP. The first version of this marker read this ONE file for
    // the three literal names. Review dodged it in the most natural spelling of all: the page
    // rendered <FollowUpQueueEmbed/>, which composes all three — a complete cutover with none of
    // the three names in the file, and the marker stayed green. A grep pins how a cutover is
    // SPELLED; the reachable set pins whether it HAPPENED. Rendering the embed, a barrel that
    // re-exports under other names, an aliased import, a dynamic import, and moving the
    // composition into a child component the page renders all land the trio in this closure.
    //
    // Why not lean on consistency.regression.test.tsx RI-IXD-8, which was proposed instead:
    // checked by mutation, the cutover does turn it red — but the SAME cutover with one residual
    // data-table import left behind scores 39/39 green with the divergence entirely gone. It pins
    // direct-import composition, not the divergence, and its message would report a move TOWARD
    // sharing as a regression away from it.
    // A renamed or deleted module would drop out of the closure and leave this case green forever
    // — the same silent-drift failure it exists to prevent, one level up. So the list is checked
    // against disk before it is used for anything.
    const missing = SHARED_FOLLOW_UP_QUEUE.filter((mod) => !existsSync(join(SRC, mod)))
    expect(
      missing,
      `this case watches modules that no longer exist, so it can no longer go red: ` +
        `${missing.join(', ')}. They were renamed, moved or deleted — repoint the list (or, if ` +
        `the shared queue itself is gone, delete the case and the comments it anchors).`,
    ).toEqual([])

    const importedBy = importClosure('pages/follow-ups-page.tsx')
    const reached = SHARED_FOLLOW_UP_QUEUE.filter((mod) => importedBy.has(mod))
    const chains = reached.map((mod) => {
      const chain = [mod]
      for (let at = importedBy.get(mod); at; at = importedBy.get(at)) chain.unshift(at)
      return `      ${chain.join('\n        → ')}`
    })
    expect(
      reached,
      `ISSUE 428 IS LANDING — this red is the marker retiring, not something you broke.\n\n` +
        `pages/follow-ups-page.tsx now reaches the shared follow-up queue, by this path:\n` +
        `${chains.join('\n')}\n\n` +
        `So the Money door no longer diverges from the Tasks door the way these comments say it ` +
        `does. Re-read every one of them and delete or narrow what has stopped being true:\n      ` +
        `${COMMENTS_THIS_CASE_ANCHORS.join('\n      ')}\n\n` +
        `Then delete THIS case — once all three modules are reached there is no divergence left ` +
        `for it to mark. If only some are (a partial cutover), narrow the list it checks to what ` +
        `still diverges. Revisit the /money/follow-ups row in DEFERRED_PAGE_ROUTES below and the ` +
        `frame exclusion above at the same time.\n\n` +
        `The one reading that is NOT a cutover: an unrelated module in the chain above picked the ` +
        `import up by accident. Then the two doors still diverge, the comments still hold, and ` +
        `the fix is to cut that edge — never to weaken this case.`,
    ).toEqual([])
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
  // follow-ups-page.tsx renders no PageFamilyFrame yet (#428 owns that cutover); a row would
  // silence ContextRow with nothing filling the gap (pinned by the case above).
  ['/money/follow-ups', 'no frame on the page yet — #428'],
])

describe('issue 424 — the registry and the real route table agree', () => {
  const pagePaths = collectClassifiedRoutes(routeConfig)
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

  it('every registry path is a real classified page route — a row for a deleted path is a lie', () => {
    const real = new Set(pagePaths)
    const orphaned = PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path).filter((path) => !real.has(path))
    expect(
      orphaned,
      `these registry rows name no route in the real table (deleted? renamed? never served?): ` +
        `${orphaned.join(', ')}`,
    ).toEqual([])
  })
})

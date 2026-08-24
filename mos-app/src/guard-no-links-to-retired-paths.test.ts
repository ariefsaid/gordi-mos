/**
 * MECH-GUARD — issue #225: an in-app link routes through the retired-path doormat.
 *
 * `router.tsx`'s redirect map exists for BOOKMARKS and EXTERNAL links — a deep link saved before a
 * path was renamed still has to arrive somewhere. It is not there for the app's own navigation: a
 * `<Link>`/`navigate()` inside the app that targets a retired path costs an extra render (the
 * redirect element mounts, then immediately forwards) and hides which path is actually canonical
 * from the next reader, who sees the retired spelling and has no reason to doubt it.
 *
 * The redirect map is the authority on what counts as "retired" — `allRedirects()` reads it off the
 * REAL `routeConfig` (see `src/test/route-table.ts`), so this guard never drifts from the table it
 * is checking against. This walks every `.ts`/`.tsx` file under `src/` (excluding the route table
 * itself, the redirect element, and the test helper that reads them — all three legitimately NAME
 * retired paths, because naming them is their entire job) looking for `to="…"`, `to={…}`,
 * `navigate("…")` and `{ pathname: "…" }` targets, and fails if any of them names a path the
 * redirect map would forward elsewhere.
 *
 * Static analysis over source text, not the rendered tree: a regex scan can't see through
 * indirection (a target built from three concatenated variables would slip past it), but every
 * violation found for #225 was a plain string or a single-hole template literal, and a check that
 * catches those in every file forever is worth more than a perfect one that only ever catches one
 * finding by hand.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { allRedirects, pathnameOf } from './test/route-table'

const SRC = resolve(__dirname)

// These three files legitimately hold the retired-path spelling — the table that DEFINES it, the
// element that FORWARDS it, and the helper that READS the table back out for tests. Everything
// else is app or test code, and app code is exactly what this guard is watching.
const EXEMPT = new Set([join('router.tsx'), join('shell', 'route-redirect.tsx'), join('test', 'route-table.ts')])

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(full, out)
    } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

// A "hole" — `${...}` in app code, `:param` in the redirect map — is a wildcard segment: it can
// stand for anything, so two paths that agree everywhere else still name the same route.
function toSegments(path: string): string[] {
  return path.replace(/\$\{[^}]*\}/g, ':*').split('/')
}

function isHole(segment: string): boolean {
  return segment.startsWith(':')
}

function sameRoute(candidate: string, retired: string): boolean {
  const a = toSegments(candidate)
  const b = toSegments(retired)
  return a.length === b.length && a.every((seg, i) => seg === b[i] || isHole(seg) || isHole(b[i]))
}

// `to="/x"`, `to={'/x'}`, `to={\`/x/${id}\`}` — the attribute form react-router's Link/NavLink take.
const LINK_PATTERN = /\bto=\{?["'`](\/[^"'`{}]*(?:\$\{[^}]*\}[^"'`{}]*)*)["'`]/g
// `navigate('/x')`, `navigate(\`/x/${id}\`)` — the imperative form; `navigate({ pathname: … })`
// falls through to PATHNAME_PATTERN below instead.
const NAVIGATE_PATTERN = /\bnavigate\(\s*["'`](\/[^"'`{}]*(?:\$\{[^}]*\}[^"'`{}]*)*)["'`]/g
// `{ pathname: '/x' }` — the object form both `navigate()` and `<Link to={…}>` accept.
const PATHNAME_PATTERN = /\bpathname:\s*["'`](\/[^"'`{}]*(?:\$\{[^}]*\}[^"'`{}]*)*)["'`]/g

/**
 * Blank out comment bodies (keeping newlines, so line numbers would still line up if this ever
 * needs to report one). This codebase narrates the redirect map's history in prose right next to
 * the code that used to trip on it — rail-nav.tsx's own comment two lines above this guard's target
 * says `to="/work"` while explaining why the code no longer does — so scanning raw text without
 * this step makes the guard fail on its own documentation.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
}

function extractTargets(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []
  for (const pattern of [LINK_PATTERN, NAVIGATE_PATTERN, PATHNAME_PATTERN]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(code))) found.push(match[1])
  }
  return found
}

describe('GUARD #225: no in-app navigation target matches a route-table redirect source', () => {
  it('GUARD: every to=/navigate()/pathname target misses every retired path in the redirect map', () => {
    // Only the MAP entries — a retired path forwarding to its canonical replacement. A
    // `flag-fallback` (a route that exists but is switched off, sending the viewer to `/`) is not a
    // retired spelling with a canonical replacement; every route in the table legitimately falls
    // back to `/` while its flag is off, so treating that as "retired" would flag the home link.
    const retiredPaths = allRedirects()
      .filter((r) => r.kind === 'map')
      .map((r) => pathnameOf(r.from))
    // Floor lowered from 15 with the ship gate (#444): six retired paths whose replacement is now
    // hidden name Home instead, which moves them from `map` into `flag-fallback`. The gate's own
    // suite (`shell/ship-gate.test.tsx`) is what holds the links to those hidden surfaces.
    expect(retiredPaths.length, 'the redirect map is empty — this guard would pass on nothing').toBeGreaterThan(10)

    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file)
      if (EXEMPT.has(rel)) continue
      const source = readFileSync(file, 'utf-8')
      for (const target of extractTargets(source)) {
        const hit = retiredPaths.find((retired) => sameRoute(target, retired))
        if (hit) offenders.push(`${rel} → "${target}" matches retired path "${hit}"`)
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

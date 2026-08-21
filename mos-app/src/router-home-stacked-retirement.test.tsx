// router-home-stacked-retirement.test.tsx — OD-REDESIGN-85 (owner, 2026-07-23): the stacked-union
// Home fossil is DELETED, and this guard is what keeps it deleted.
//
// "remove fossil — that's what I've been pounding on" — the ruling names the parts
// (SHOW_HOME_STACKED, stacked-union-home, home-stack/, weekly/, /__home-stacked) and the
// ranked-stream Home is the one Home. OD-REDESIGN-86 (same day) made fossil removal binding
// design law. The reason this guard exists at all: the ruling sat unexecuted for a month because
// nothing failed in the meantime — a deletion ruling with no guard behind it decays into a
// suggestion (#399).
//
// Why a guard and not a one-off deletion (same class as guard-od-v4-10-retirement.test.ts): a
// removed surface comes back as a fragment — a re-added route row, an orphan module nothing
// imports, a message key with no control. This file pins BOTH directions: the fossil is gone AND
// the two role-scope predicates it accidentally hosted live on in lib/role-scope.ts, still gating
// the shipped Home's Objectives door (#397) — a cleanup that loses a live consumer is the same
// defect wearing the other face.
//
// Prose is exempt (comments stripped before scanning): the retirement is documented here and in
// git history, and a guard that forbade explaining itself would be deleted by the next reader.
import { isValidElement } from 'react'
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { RouteObject } from 'react-router-dom'
import { routeConfig } from './router'
import { HomePage } from './pages/home-page'
import { isOwnerDirector, buHeadsForViewer } from '@/lib/role-scope'

const SRC = __dirname
const APP = join(SRC, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(p)
    return /\.(ts|tsx|css)$/.test(p) ? [p] : []
  })
}

/** Block comments, then line comments — the latter only where `//` does not sit inside a string
 *  or a URL (`http://`), which would otherwise blind the scan to real code on that line. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')
}

const SELF = relative(SRC, __filename)
const CODE = sourceFiles(SRC)
  .map((file) => ({ file: relative(SRC, file), text: stripComments(readFileSync(file, 'utf8')) }))
  .filter(({ file }) => file !== SELF)

const RETIRED_TOKENS = [
  '__home-stacked',
  'StackedUnionHome',
  'stacked-union',
  'home-stack',
  'SHOW_HOME_STACKED',
  'MyWeekPanel',
  'MyTasksCard',
  'deriveHomeStack',
  'useCompanyFinanceKpis',
  "'home.stack.",
  "'home.kpi.",
  "'home.subtitle'",
]

const RETIRED_FILES = [
  'src/pages/stacked-union-home.tsx',
  'src/pages/stacked-union-home.css',
  'src/pages/stacked-union-home.test.tsx',
  'src/lib/home-stack.ts',
  'src/lib/home-stack.test.ts',
  'src/lib/use-company-finance-kpis.ts',
  'src/lib/use-company-finance-kpis.test.ts',
  'src/pages/my-week.tsx',
  'src/pages/my-week.test.tsx',
  'src/pages/my-week.hidden.test.tsx',
  'src/router-home-stacked.test.tsx',
  'e2e/home-stacked-union.spec.ts',
]
const RETIRED_DIRS = ['src/components/home-stack', 'src/components/weekly']

function allRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.flatMap((r) => [r, ...(r.children ? allRoutes(r.children) : [])])
}

describe('OD-REDESIGN-85: the stacked-union Home fossil is gone and stays gone', () => {
  it('no route anywhere in the table resolves __home-stacked', () => {
    const offenders = allRoutes(routeConfig).filter((r) => r.path === '__home-stacked')
    expect(offenders, 'the ruling deleted this surface; a re-added route row must turn this red').toEqual([])
  })

  it('the `/` index route renders the ranked-stream HomePage — the one Home', () => {
    const index = allRoutes(routeConfig).find((r) => r.index === true)
    expect(index).toBeDefined()
    expect(isValidElement(index!.element)).toBe(true)
    if (!isValidElement(index!.element)) throw new Error('index route element is not a React element')
    expect(index!.element.type).toBe(HomePage)
  })

  it('no code anywhere in src/ still references the fossil', () => {
    const hits: string[] = []
    for (const token of RETIRED_TOKENS) {
      for (const { file, text } of CODE) {
        text.split('\n').forEach((line, i) => {
          if (line.includes(token)) hits.push(`${file}:${i + 1} → ${token}`)
        })
      }
    }
    expect(hits, 'removed outright, not folded in and not carried over').toEqual([])
  })

  it('the fossil modules and directories are deleted, not left orphaned', () => {
    const surviving = [
      ...RETIRED_FILES.filter((f) => existsSync(join(APP, f))),
      ...RETIRED_DIRS.filter((d) => existsSync(join(APP, d))),
    ]
    expect(surviving, 'an unimported module is still a corpse the next reader has to step over').toEqual([])
  })

  it('the role-scope predicates the fossil hosted live on — the shipped Home still gates its Objectives door', () => {
    expect(typeof isOwnerDirector).toBe('function')
    expect(typeof buHeadsForViewer).toBe('function')
    const homePage = stripComments(readFileSync(join(SRC, 'pages', 'home-page.tsx'), 'utf8'))
    expect(homePage).toContain("from '@/lib/role-scope'")
  })
})

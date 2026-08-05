/**
 * AC-933 (unit, regression) — the OD-V4-10 region-order toggle is RETIRED, not carried.
 *
 * "Given the shipped source, when it is searched for the retired region-order toggle, then
 *  `HomeRegionOrder`, `home-region-order` and `home-order-toggle` have no remaining references."
 *
 * Why a guard and not a one-off deletion check: a removed feature comes back as a fragment — an
 * orphan module nothing imports, a dead CSS block, a message key with no control. Those are the
 * dead-affordance class the audits flagged (anchor A4), and they are invisible to every behavioural
 * test precisely because nothing renders them.
 *
 * #191 port note: v4's copy of this guard carried a third assertion pinning
 * `src/styles/segmented-track.css` — a shared-CSS extraction between the retired toggle and
 * `dashboard/cut-toggle.css` that happened on the v4 line. That extraction was never ported to
 * `dev` (`dev`'s `cut-toggle.css` has no such shared file to keep); asserting it here would be
 * asserting a fact about the dashboard module this PR does not touch, not a fact about Home's
 * port. Dropped rather than carried uninspected — the two token-scan assertions below are
 * unaffected and are what actually proves this port didn't reintroduce the retired toggle.
 *
 * Prose is exempt: comments are stripped before scanning. The retirement is DOCUMENTED in several
 * files (home-layout.ts cites the precedent), and a guard that forbade explaining itself would be
 * deleted by the next reader.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..', '..')

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

// This guard itself is excluded: it must NAME the tokens it forbids, and a scan that matched its
// own vocabulary list would be red forever. (It came out red on the first run for exactly that
// reason — which is also the cheapest possible demonstration that the scan does find these tokens
// when they are present in code rather than prose.)
const SELF = relative(SRC, __filename)
const CODE = sourceFiles(SRC)
  .map((file) => ({ file: relative(SRC, file), text: stripComments(readFileSync(file, 'utf8')) }))
  .filter(({ file }) => file !== SELF)

// The identifiers AC-933 names, plus the two surfaces they reached into: the toggle's own `seg`
// selector family and its message keys. A retired control whose STRINGS survive still ships an
// instruction pointing at nothing.
const RETIRED_TOKENS = [
  'HomeRegionOrder',
  'home-region-order',
  'home-order-toggle',
  'home-order-seg',
  "'home.order.",
]

// The modules the retirement deleted outright (spec §3 retirement surface).
const RETIRED_FILES = [
  'src/lib/home-region-order.ts',
  'src/lib/home-region-order.test.ts',
  'src/components/home/home-order-toggle.tsx',
]

describe('AC-933: the OD-V4-10 region-order toggle leaves no trace in the shipped source', () => {
  it('AC-933: no code anywhere in src/ still references the retired toggle', () => {
    const hits: string[] = []
    for (const token of RETIRED_TOKENS) {
      for (const { file, text } of CODE) {
        text.split('\n').forEach((line, i) => {
          if (line.includes(token)) hits.push(`${file}:${i + 1} → ${token}`)
        })
      }
    }
    expect(hits, 'the toggle is removed outright, not folded in and not carried over').toEqual([])
  })

  it('AC-933: the retired modules are deleted, not left orphaned', () => {
    const surviving = RETIRED_FILES.filter((f) => existsSync(join(SRC, '..', f)))
    expect(surviving, 'an unimported module is still a corpse the next reader has to step over')
      .toEqual([])
  })
})

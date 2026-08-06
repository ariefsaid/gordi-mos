/**
 * MECH-GUARD — issue #241: a module shadowed by a same-named file with a different extension.
 *
 * TypeScript resolves a bare import against `.tsx` before `.ts` is even tried against `.ts`
 * first — the exact order differs by resolver, and that is precisely the hazard: two files that
 * differ only in extension "just work" for a merge (git sees two different paths, no conflict)
 * while the module graph silently picks one and drops the other. This defect class has already
 * landed three times in this stack:
 *
 *  1. `shell/sections.tsx` vs `shell/sections.ts` during the route-table port — the dead file
 *     still carried a capability requirement a ruling had removed, and lacked two exports the
 *     live file had gained. Every importer used the bare path; resolution order was the only
 *     thing standing between the app and the wrong access gate being served.
 *  2. `signals/signal-collection-adapter.ts` (a temporary 168-line stub) vs
 *     `signal-collection-adapter.tsx` (the real 488-line module) — whichever branch merged
 *     second would have gone dark, and nothing caught it until an agent read the tree by hand.
 *  3. (this guard's origin) — a narrow, single-directory version of this same check existed only
 *     for the signals adapter; it is retired by this file, which covers the same hazard for every
 *     module under `src/`.
 *
 * Typecheck, lint, the full unit suite, and an identical bundle all passed through every one of
 * these — dead code does not throw. The check itself is the one-line shell command from #241:
 *
 *     git ls-files src | sed -E 's/\.(ts|tsx)$//' | sort | uniq -d
 *
 * Reimplemented here over the filesystem (not `git ls-files`) so it also catches a shadow before
 * the shadowing file is ever staged, not just at commit time.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

// This file lives directly at the root of src/, so __dirname IS the tree being scanned.
const SRC = __dirname

function allFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') allFiles(full, out)
    } else {
      out.push(full)
    }
  }
  return out
}

/** `foo/bar.tsx` and `foo/bar.ts` → both stem to `foo/bar`; anything else is left untouched. */
function stem(relPath: string): string {
  return relPath.replace(/\.(ts|tsx)$/, '')
}

describe('GUARD #241: no two files in src/ share a path stem across .ts/.tsx', () => {
  it('GUARD: every .ts/.tsx module has a stem that resolves to exactly one file', () => {
    const relPaths = allFiles(SRC).map((f) => relative(SRC, f))

    const byStem = new Map<string, string[]>()
    for (const rel of relPaths) {
      const s = stem(rel)
      if (s === rel) continue // extension wasn't .ts/.tsx — cannot participate in the shadow
      const group = byStem.get(s) ?? []
      group.push(rel)
      byStem.set(s, group)
    }

    const shadowed = [...byStem.entries()].filter(([, files]) => files.length > 1)

    expect(
      shadowed,
      shadowed
        .map(([s, files]) => `"${s}" is shadowed across extensions: ${files.join(', ')}`)
        .join('\n')
    ).toEqual([])
  })
})

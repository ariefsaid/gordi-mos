/**
 * MECH-GUARD — issue #241: a same-named module with a different extension shadows the real one.
 *
 * `feat/194-objectives-projects` ships a temporary `signal-collection-adapter.ts` (168 lines, its
 * own header says #193 will replace it). This line ships the real
 * `signal-collection-adapter.tsx` (488 lines). Different extension ⇒ git's merge sees two
 * DIFFERENT files and lands both with no conflict — but TypeScript's module resolution picks
 * `.ts` before `.tsx`, so whichever branch merges second, the real adapter goes dark and the
 * Signals archive silently renders the stub. Nothing else in the tree catches a module shadowed
 * this way — it has already bitten twice (a stale `sections.tsx` beside `sections.ts` during
 * Stage 2).
 *
 * This guard asserts, at the filesystem level, that exactly one `signal-collection-adapter.*`
 * source module exists in this directory and it is the real `.tsx`. If a sibling `.ts` (or any
 * other extension) ever lands here again — from a merge, a rebase, or a stray file — this test
 * goes red instead of the Signals archive going dark at runtime.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('GUARD #241: signal-collection-adapter has no shadowing sibling module', () => {
  it('GUARD: exactly one signal-collection-adapter source module exists, and it is the real .tsx', () => {
    const siblings = readdirSync(resolve(here))
      .filter((name) => name.startsWith('signal-collection-adapter.'))
      // Test files are a different module identity (Vitest never resolves a bare import to
      // `*.test.*`) — they are not part of the shadowing hazard this guard targets.
      .filter((name) => !name.includes('.test.'))

    expect(
      siblings,
      `expected exactly one non-test signal-collection-adapter module, found: ${siblings.join(', ')}`,
    ).toEqual(['signal-collection-adapter.tsx'])
  })
})

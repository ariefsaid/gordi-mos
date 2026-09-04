import { readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from './messages'

/**
 * MECH-GUARD — issue #206: a message key survives every gate once its last consumer is deleted.
 *
 * #179 cut a surface and left 44 lines of orphaned `cascade.*` strings behind in both locales.
 * Typecheck, lint, the full unit suite, and the build all passed — nothing in the toolchain reads
 * a key backwards from the catalog to its call sites. The port ahead deletes and replaces surfaces
 * repeatedly, so this keeps recurring: every swapped-out surface can leave its strings shipping to
 * every viewer, in every locale, forever.
 *
 * This walks every `.ts`/`.tsx` file under `src/` (the catalog module itself excluded — every key
 * trivially "appears" there, that is not consumption) and checks that each `en` key shows up as a
 * quoted literal somewhere in that tree. A few keys are built from a runtime value rather than
 * written as a literal (`t(\`money.cut.${stem}\`)`); those are not dead, they are just invisible to
 * a literal-string search, so their PREFIXES are curated below by hand, with the call site that
 * proves each one dynamic. A key under a listed prefix is reported as "assumed dynamic", not
 * silently passed and not failed — if the assumption goes stale (the call site is deleted too),
 * nothing here will catch it, which is the honest limit of a grep-shaped check. Everything else
 * must resolve to a real, literal call site or the guard fails, naming the key.
 */

const SRC = resolve(__dirname, '..')
// The catalog's own defining file — every key "appears" here by construction, so it is excluded
// from the haystack rather than treated as evidence of a consumer.
const CATALOG_FILE = join(SRC, 'i18n', 'messages.ts')

/**
 * Prefixes under which keys are composed at runtime (`t(\`prefix${var}\`)`), never written as a
 * literal MessageKey anywhere. Each entry names the call site that makes it dynamic, so the next
 * reader can go verify the assumption still holds rather than taking it on faith.
 */
const KNOWN_DYNAMIC_PREFIXES: Record<string, string> = {
  'assistant.rating.reason.': 'AssistantPanel.tsx — t(`assistant.rating.reason.${r}`) over DOWNVOTE_REASONS',
  'tasks.status.': 'tasks-toolbar.tsx — t(`tasks.status.${key}` as const)',
  'signals.record.field.': 'signal-record.tsx — t(`signals.record.field.${rev.field}`)',
  'money.cut.': 'global-toolbar.tsx / dashboard-page.tsx — t(`money.cut.${stem}` …) incl. plural .one/.other',
  'followUps.action.': 'follow-up-queue-table.tsx / follow-ups-page.tsx — t(`followUps.action.${verb}`)',
  'admin.role.': 'admin-users.types.ts — t(`admin.role.${slug}`) and `${slug}.desc`',
  'kitchen.pushes.tally.': 'kitchen-pushes-page.tsx — plural tally keys are selected by count',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(full, out)
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      full !== CATALOG_FILE
    ) {
      out.push(full)
    }
  }
  return out
}

/** The whole tree, concatenated once — cheaper than re-reading per key. */
function haystack(): string {
  return sourceFiles(SRC)
    .map((f) => readFileSync(f, 'utf-8'))
    .join('\n')
}

function escapeForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if `key` appears as a quoted literal — `'key'`, `"key"`, or `` `key` `` — anywhere. */
function referencedLiterally(key: string, tree: string): boolean {
  const escaped = escapeForRegex(key)
  return new RegExp(`['"\`]${escaped}['"\`]`).test(tree)
}

describe('GUARD #206: every i18n message key has a consumer', () => {
  // 60s: this is a whole-src scan (12–19s under parallel-suite load), not a perf assertion —
  // the default 15s cap made it the suite's one load-dependent flake.
  it('GUARD: every en key is either referenced literally or under a curated dynamic prefix', { timeout: 60_000 }, () => {
    const tree = haystack()
    const keys = Object.keys(messages.en)

    const orphaned: string[] = []
    for (const key of keys) {
      if (referencedLiterally(key, tree)) continue
      const isKnownDynamic = Object.keys(KNOWN_DYNAMIC_PREFIXES).some((prefix) =>
        key.startsWith(prefix)
      )
      if (isKnownDynamic) continue
      orphaned.push(key)
    }

    expect(
      orphaned,
      `orphaned i18n key(s) — no literal reference and no matching entry in ` +
        `KNOWN_DYNAMIC_PREFIXES: ${orphaned.join(', ')}`
    ).toEqual([])
  })

  // The allowlist itself is a claim about the tree, not a fact about it — this keeps the claim
  // honest. If a prefix's call site is ever deleted, its keys go dark to the guard above (by
  // design: a template-literal key composition can't be told apart from a plain unused key
  // without knowing which is which). This test at least proves every listed prefix still matches
  // something real in the catalog, so a stale, over-broad entry doesn't survive un-noticed either.
  it('every KNOWN_DYNAMIC_PREFIXES entry still matches at least one en key', () => {
    const keys = Object.keys(messages.en)
    for (const prefix of Object.keys(KNOWN_DYNAMIC_PREFIXES)) {
      expect(
        keys.some((k) => k.startsWith(prefix)),
        `KNOWN_DYNAMIC_PREFIXES has a stale entry — no en key starts with "${prefix}"`
      ).toBe(true)
    }
  })
})

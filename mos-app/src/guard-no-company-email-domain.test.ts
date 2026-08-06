/**
 * MECH-GUARD — issue #262: test fixtures drift back onto the company's own real email domain.
 *
 * A 2026-07-31 commit moved 43 fixtures off the company domain onto `@example.test` (RFC-2606
 * reserved, guaranteed non-routable) so a fixture address could never be mistaken for — or resolve
 * to — a live one. By the time #262 was filed the domain had reaccumulated across ~40 occurrences:
 * one declared-fictional persona used pervasively, the owner's own address a few times, and a
 * handful of one-off names. None of it was a leak of anyone ELSE's identity — the point was never
 * "whose name is this", it was that a fixture at the real domain is indistinguishable at a glance
 * from a live one, which cost two separate agents a stop-and-verify during the port (one of which
 * turned out to be exactly this regression, mid-revert, blocking a merge until undone).
 *
 * This is the check that keeps it from drifting a third time.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..') // mos-app/
const SRC = resolve(__dirname) // mos-app/src/
const E2E = resolve(ROOT, 'e2e')

// Built from parts, not written whole: the literal string is exactly what this guard forbids, so
// writing it here would make this file a hit against itself the moment anyone re-ran the search
// that found the other 40.
const COMPANY_DOMAIN = ['gordi', 'id'].join('.')
const NEEDLE = `@${COMPANY_DOMAIN}`

/**
 * The two places that keep the real domain ON PURPOSE — both UI copy demonstrating what a REAL
 * MOS login email looks like (logins genuinely use the company's own domain), not fixture data
 * standing in for a person. Neither carries a name or any other enumeration hint — just the
 * generic "you@" placeholder pattern a login field shows regardless of who is looking at it.
 * Paths are relative to `mos-app/`.
 */
// The ONE string that may legitimately carry the company domain: the login form's placeholder,
// which shows staff the address shape to type. It names no person, so it is not an enumeration.
//
// Allowed as a STRING, not as a file. Review demonstrated the earlier file-wide allowance by
// planting a real-looking personal address one line below the sanctioned placeholder — the
// guard passed. An excused file is unwatched forever, which is the opposite of what a guard is for.
const SANCTIONED_LITERAL = 'you@' + COMPANY_DOMAIN

const ALLOWLIST = new Set([
  join('src', 'pages', 'login-page.tsx'), // the real login screen's own email-field placeholder
  join('src', 'pages', 'ui-gallery.tsx'), // DEV-only design-kit gallery, mirrors the same placeholder
])

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') tsFiles(full, out)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe(`GUARD #262: no source or test file resolves to a live address at the company domain`, () => {
  it('GUARD: no @<company>.id address anywhere under src/ or e2e/, outside the two documented exceptions', () => {
    const files = [...tsFiles(SRC), ...tsFiles(E2E)]

    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(ROOT, file)
      let content = readFileSync(file, 'utf-8')
      // Strip only the sanctioned literal, then search what remains — so a real address sitting
      // beside it in the same file is still caught.
      if (ALLOWLIST.has(rel)) content = content.split(SANCTIONED_LITERAL).join('')
      if (content.includes(NEEDLE)) offenders.push(rel)
    }

    expect(
      offenders,
      `found "${NEEDLE}" in: ${offenders.join(', ')} — fixtures use @example.test (RFC-2606 ` +
        `reserved, non-routable); a real address here is indistinguishable from a live one at a ` +
        `glance, which is the entire reason this check exists`
    ).toEqual([])
  })

  // The allowlist itself is a claim, not a fact — this keeps it honest the same way the two
  // dynamic-prefix i18n guards do (#206): if either file stops carrying the real domain (copy
  // change, file deleted), a stale entry should be visible rather than silently doing nothing.
  it('every ALLOWLIST entry still exists and still carries the domain it is excused for', () => {
    for (const rel of ALLOWLIST) {
      const full = resolve(ROOT, rel)
      const content = readFileSync(full, 'utf-8')
      expect(content.includes(NEEDLE), `${rel} is allowlisted but no longer contains "${NEEDLE}"`).toBe(
        true
      )
    }
  })
})

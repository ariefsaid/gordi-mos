import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── The page's own h1 may not rank below the group headers inside it ───────────────────────────
// The compact head steps its title DOWN one rung to pay for the status row it carries. It stepped
// down too far: the greeting landed on `body-lg` (15px) while List's region headers moved up to
// `subheading` (18px), so Home's `h1` rendered SMALLER than the band labels beneath it — a
// hierarchy inversion the signed mockup does not have (its `.hdr-title` is 1.125rem = 18px against
// the 16px root, i.e. our subheading rung).
//
// This asserts the RELATION, not a literal size: whatever rungs the head and the band labels take,
// the head may never sit below the headers it contains. That keeps holding if the ladder is
// re-tuned later, and fails the moment either side crosses the other.
const TOKENS_CSS = readFileSync(join(__dirname, '../../index.css'), 'utf8')
const HEAD_CSS = readFileSync(join(__dirname, '../../shell/page-head.css'), 'utf8')
const STREAM_CSS = readFileSync(join(__dirname, 'home-stream.css'), 'utf8')

/** px value of a `--font-size-*` token, read from the one declared ladder in index.css. */
function tokenPx(name: string): number {
  const m = new RegExp(`${name}:\\s*([\\d.]+)px`).exec(TOKENS_CSS)
  if (!m) throw new Error(`token ${name} is not declared in index.css`)
  return Number(m[1])
}

/** Resolve a rule's `font-size: var(--font-size-x)` to px. `nth` picks a later (media-query) copy. */
function fontSizePx(css: string, selector: string, nth = 0): number {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g')
  const bodies = [...css.matchAll(re)].map((m) => m[1])
  const body = bodies[nth]
  if (body === undefined) throw new Error(`no rule #${nth} for ${selector}`)
  const token = /font-size:\s*var\((--font-size-[a-z-]+)\)/.exec(body)
  if (!token) throw new Error(`${selector} #${nth} declares no tokenised font-size`)
  return tokenPx(token[1])
}

describe('Home head outranks the region headers beneath it', () => {
  it('the compact head title is at least as large as a List band label (desktop)', () => {
    const title = fontSizePx(HEAD_CSS, '.content-header--compact .ch-title', 0)
    const band = fontSizePx(STREAM_CSS, '.stream-band-label')
    expect(title, `h1 ${title}px must not rank below its band labels (${band}px)`)
      .toBeGreaterThanOrEqual(band)
  })

  it('the phone override keeps the same rank (it re-declares the title size)', () => {
    const title = fontSizePx(HEAD_CSS, '.content-header--compact .ch-title', 1)
    const band = fontSizePx(STREAM_CSS, '.stream-band-label')
    expect(title, `h1 ${title}px must not rank below its band labels (${band}px) on phone`)
      .toBeGreaterThanOrEqual(band)
  })

  it('and stays on the declared ladder — it steps DOWN from the page-title rung, never up', () => {
    const title = fontSizePx(HEAD_CSS, '.content-header--compact .ch-title', 0)
    expect(title).toBeLessThan(tokenPx('--font-size-page-title'))
  })
})

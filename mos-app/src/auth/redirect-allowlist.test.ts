// AC-013 — the magic link is only as good as what GoTrue will redirect to.
//
// LoginPage asks for `${origin}/mos${returnTarget}`; GoTrue drops a redirect_to that matches no
// allowlist entry and substitutes site_url, so the client call passing its own unit test proves
// nothing about the link that lands in the person's mail. This pins the dev allowlist patterns
// that admit an in-app path. Production redirect URLs are environment configuration, set on the
// deployed project rather than in this file.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Vitest runs from mos-app; the toml is the repo root's.
const config = readFileSync(resolve(process.cwd(), '../supabase/config.toml'), 'utf8')

const allowlist = /^additional_redirect_urls = (\[.*\])$/m.exec(config)?.[1]

describe('AC-013: the dev auth allowlist admits an in-app redirect target', () => {
  it('declares a /mos path pattern for both dev hosts', () => {
    expect(allowlist).toBeDefined()
    const urls: string[] = JSON.parse(allowlist as string)
    expect(urls).toContain('http://localhost:5173/mos/**')
    expect(urls).toContain('http://127.0.0.1:5173/mos/**')
  })

  it('scopes the pattern to /mos — never the whole origin', () => {
    const urls: string[] = JSON.parse(allowlist as string)
    for (const url of urls) {
      if (!url.includes('*')) continue
      expect(url).toMatch(/\/mos\/\*\*$/)
    }
  })
})

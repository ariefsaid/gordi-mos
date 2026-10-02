// AC-013 — the magic link is only as good as what GoTrue will redirect to.
//
// LoginPage asks GoTrue to return to the configured app base path. A redirect target omitted from
// the allowlist is silently replaced with site_url, so pin the local in-app path coverage here.
// Target-environment redirect URLs are maintained separately.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APP_BASE_PATH, appUrl } from '@/config/app-build-settings'

// Vitest runs from mos-app; the toml is the repo root's.
const config = readFileSync(resolve(process.cwd(), '../supabase/config.toml'), 'utf8')

const allowlist = /^additional_redirect_urls = (\[.*\])$/m.exec(config)?.[1]

describe('AC-013: the dev auth allowlist admits an in-app redirect target', () => {
  it('declares a local app-path pattern for both dev hosts', () => {
    expect(allowlist).toBeDefined()
    const urls: string[] = JSON.parse(allowlist as string)
    expect(urls).toContain('http://localhost:5173/**')
    expect(urls).toContain('http://127.0.0.1:5173/**')
    expect(new URL(appUrl('/work/tasks'), 'http://localhost:5173').pathname.startsWith(APP_BASE_PATH)).toBe(true)
  })

  it('scopes every wildcard to a local development host', () => {
    const urls: string[] = JSON.parse(allowlist as string)
    const expected = [
      'http://localhost:5173/**',
      'http://127.0.0.1:5173/**',
    ]
    for (const url of urls.filter((candidate) => candidate.includes('*'))) {
      expect(expected).toContain(url)
    }
  })
})

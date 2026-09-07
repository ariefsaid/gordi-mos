// AC-027 (#802) — a hard reload with no connection lands on a static offline page.
//
// The document is served by the service worker as the navigation fallback, so both halves have to
// hold: the page itself must carry the brand block, the sentence and the control, and the worker
// must actually name it. `public/` is copied verbatim into the build output by Vite, so the file
// asserted here is byte-for-byte the one that ships.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const OFFLINE_HTML = readFileSync(resolve(process.cwd(), 'public/offline.html'), 'utf8')
const SW = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('AC-027 — the offline fallback document', () => {
  it('carries the brand block, the sentence and the one control', () => {
    expect(OFFLINE_HTML).toContain('Gordi MOS')
    expect(OFFLINE_HTML).toMatch(/class="mark-square">G</)
    expect(OFFLINE_HTML).toMatch(/class="mark-dot"/)
    expect(OFFLINE_HTML).toContain('MOS needs a connection')
    expect(OFFLINE_HTML).toContain('Try again')
  })

  it('says the same thing in Indonesian', () => {
    expect(OFFLINE_HTML).toContain('MOS membutuhkan koneksi')
    expect(OFFLINE_HTML).toContain('Coba lagi')
  })

  it('stands alone — no bundle, stylesheet or font it could not fetch', () => {
    expect(OFFLINE_HTML).not.toMatch(/<script[^>]+src=/)
    expect(OFFLINE_HTML).not.toMatch(/<link[^>]+rel="stylesheet"/)
  })

  it('the service worker precaches it and serves it as the navigation fallback', () => {
    expect(SW).toContain("const OFFLINE_URL = '/mos/offline.html'")
    expect(SW).toMatch(/cache\.add\(new Request\(OFFLINE_URL/)
    expect(SW).toMatch(/event\.request\.mode !== 'navigate'/)
    expect(SW).toMatch(/fetch\(event\.request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)/)
  })
})

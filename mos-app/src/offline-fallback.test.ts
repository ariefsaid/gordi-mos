// AC-027 (#802) — a hard reload with no connection lands on a static offline page.
//
// The document is served by the service worker as the navigation fallback, so both halves have to
// hold: the page itself must carry the brand block, the sentence and the control, and the worker
// must actually name it. `public/` is copied verbatim into the build output by Vite, so the file
// asserted here is byte-for-byte the one that ships.
//
// The visible-DOM assertions parse OFFLINE_HTML into an actual document rather than string-matching
// the file — the earlier `toContain('MOS needs a connection')` passed on the <title> alone, so
// deleting the visible <h1> was silent. Querying rendered elements turns any such deletion red.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const OFFLINE_HTML = readFileSync(resolve(process.cwd(), 'public/offline.html'), 'utf8')
const SW = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('AC-027 — the offline fallback document', () => {
  it('carries the brand block, the sentence and the one control', () => {
    const doc = parse(OFFLINE_HTML)
    // The visible heading — not the <title>, which the earlier assertion accidentally matched.
    const heading = doc.querySelector('h1#title')
    expect(heading).not.toBeNull()
    expect(heading!.textContent).toBe('MOS needs a connection')
    // The one control.
    const retry = doc.querySelector('button#retry')
    expect(retry).not.toBeNull()
    expect(retry!.textContent).toBe('Try again')
    // The brand block: wordmark + navy square with "G" + orange dot.
    const brand = doc.querySelector('.brand')
    expect(brand).not.toBeNull()
    expect(brand!.querySelector('.wordmark')!.textContent).toBe('Gordi MOS')
    expect(brand!.querySelector('.mark-square')!.textContent).toBe('G')
    expect(brand!.querySelector('.mark-dot')).not.toBeNull()
  })

  it('says the same thing in Indonesian', () => {
    // Indonesian copy is swapped by the inline <script> at runtime based on the persisted locale,
    // so it lives as string literals in the script body rather than as pre-rendered DOM nodes.
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
    expect(SW).toMatch(/caches\.match\(OFFLINE_URL,\s*\{\s*cacheName:\s*OFFLINE_CACHE\s*\}\)/)
  })

  it('the activate sweep only deletes THIS app\'s caches — Cache Storage is origin-scoped, other apps live here too', () => {
    // The prefix constant the worker defines, so the same source line does both jobs.
    expect(SW).toMatch(/const CACHE_PREFIX = 'mos-'/)
    // The filter must both keep foreign caches (k.startsWith(CACHE_PREFIX)) and keep the offline
    // cache the worker just opened (k !== OFFLINE_CACHE) — the missing prefix filter was the bug.
    expect(SW).toMatch(/keys\.filter\(\(k\) => k\.startsWith\(CACHE_PREFIX\) && k !== OFFLINE_CACHE\)/)
  })

  it('the fallback lookup is scoped to the offline cache — a sibling app may cache the same URL', () => {
    expect(SW).toMatch(/caches\.match\(OFFLINE_URL,\s*\{\s*cacheName:\s*OFFLINE_CACHE\s*\}\)/)
  })
})

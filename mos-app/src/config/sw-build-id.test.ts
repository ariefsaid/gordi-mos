import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { stampServiceWorker, SW_BUILD_ID_PLACEHOLDER } from './sw-build-id'

const SW = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('service worker cache name', () => {
  it('is derived from the build id, never a fixed literal', () => {
    expect(SW).toContain(SW_BUILD_ID_PLACEHOLDER)
    expect(SW).toMatch(/const OFFLINE_CACHE = `\$\{CACHE_PREFIX\}offline-\$\{BUILD_ID\}`/)
  })

  it('differs between releases and leaves no placeholder behind', () => {
    const a = stampServiceWorker(SW, 'aaaaaaaaaaaaaaaa1111')
    const b = stampServiceWorker(SW, 'bbbbbbbbbbbbbbbb2222')
    expect(a).not.toBe(b)
    expect(a).not.toContain(SW_BUILD_ID_PLACEHOLDER)
    expect(a).toContain("const BUILD_ID = 'aaaaaaaaaaaa'")
  })
})

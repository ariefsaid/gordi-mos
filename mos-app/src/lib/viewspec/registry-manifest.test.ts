// Director build-note (2026-07-04, pre-T7): registry.ts imports React primitive component
// types (transitively React/CSS) — importing it from a Deno edge function would fail
// deno check/bundle. registry-manifest.ts is a PURE module (names + descriptor metadata
// ONLY, zero React/CSS imports) that edge functions import instead. This test asserts (a)
// the manifest exposes the same primitive catalog as registry.ts, and (b) an import-graph
// scan of registry-manifest.ts's own source text contains no React/CSS import specifier
// (static source-text guard — the fastest, most direct proof the module stays import-free
// of anything Deno cannot resolve/bundle).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registryManifest, validatePrimitiveInManifest } from './registry-manifest'

describe('registry-manifest — pure, React-free primitive catalog (Director build-note pre-T7)', () => {
  it('exposes exactly the 5 live + 2 stub primitives (same catalog as registry.ts)', () => {
    expect(registryManifest.keys().sort()).toEqual([
      'ChartFrame', 'CutToggle', 'DataTable', 'FreshnessLabel', 'KPITile', 'data-grid', 'doc-editor',
    ])
  })

  it('5 live primitives have status "live"', () => {
    for (const n of ['KPITile', 'ChartFrame', 'CutToggle', 'DataTable', 'FreshnessLabel']) {
      expect(registryManifest.get(n)?.status).toBe('live')
    }
  })

  it('2 stub primitives have status "stub"', () => {
    expect(registryManifest.get('doc-editor')?.status).toBe('stub')
    expect(registryManifest.get('data-grid')?.status).toBe('stub')
  })

  it('validatePrimitiveInManifest is true for all 7, false for unknown', () => {
    for (const n of registryManifest.keys()) expect(validatePrimitiveInManifest(n)).toBe(true)
    expect(validatePrimitiveInManifest('NotARealPrimitive')).toBe(false)
  })

  it('get returns undefined for unknown (never throws)', () => {
    expect(registryManifest.get('nope')).toBeUndefined()
  })

  it('import-graph guard: the manifest source contains no React/CSS/@ alias import', () => {
    const source = readFileSync(resolve(__dirname, 'registry-manifest.ts'), 'utf-8')
    // No import of React, no @/ alias (Vite-only, unresolvable under Deno), no .css.
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/from ['"]@\//)
    expect(source).not.toMatch(/\.css['"]/)
    // No import statement pulling in anything under components/ (where React/CSS live).
    expect(source).not.toMatch(/from ['"][^'"]*components\//)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The agent consent step and the permission settings must not be framable (ADR-0060 D7); the
// SPA cannot set frame-ancestors itself, so the static host's header file carries it.
describe('public/_headers', () => {
  const headers = readFileSync('public/_headers', 'utf8')
  const rules = headers.split('\n').filter((line) => !line.startsWith('#'))

  it('covers every path', () => {
    expect(rules).toContain('/*')
  })

  it('forbids framing with both the modern and the legacy header', () => {
    expect(rules).toContain("  Content-Security-Policy: frame-ancestors 'none'")
    expect(rules).toContain('  X-Frame-Options: DENY')
  })
})

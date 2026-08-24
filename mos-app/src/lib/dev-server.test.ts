import { describe, expect, it } from 'vitest'
import {
  MOS_DEV_IDENTITY_PATH,
  MOS_DEV_PORT_ENV,
  assertDevServerOwnership,
  devServerBaseUrl,
  devServerIdentityUrl,
  devServerPort,
  worktreeFingerprint,
} from './dev-server'

// Fixture roots — verified (FNV-1a) to derive DIFFERENT ports (20719 vs 28410), so the
// inequality assertions below are deterministic, not lucky.
const TREE_A = '/worktrees/factory-a/mos-app'
const TREE_B = '/worktrees/factory-b/mos-app'

describe('dev-server worktree scoping (#419)', () => {
  it('is stable for one worktree: same root → same port, same fingerprint', () => {
    expect(devServerPort(TREE_A, undefined)).toBe(devServerPort(TREE_A, undefined))
    expect(worktreeFingerprint(TREE_A)).toBe(worktreeFingerprint(TREE_A))
  })

  it('separates worktrees: different roots → different ports and fingerprints (AC-1)', () => {
    expect(devServerPort(TREE_A, undefined)).not.toBe(devServerPort(TREE_B, undefined))
    expect(worktreeFingerprint(TREE_A)).not.toBe(worktreeFingerprint(TREE_B))
  })

  it('keeps derived ports inside the dedicated 20000–29999 band', () => {
    for (const dir of [TREE_A, TREE_B, '/checkout-x/mos-app', '/checkout-y/mos-app']) {
      const port = devServerPort(dir, undefined)
      expect(port).toBeGreaterThanOrEqual(20000)
      expect(port).toBeLessThan(30000)
    }
  })

  it('addresses the app and the identity endpoint from the derived port', () => {
    const port = devServerPort(TREE_A, undefined)
    expect(MOS_DEV_IDENTITY_PATH).toBe('/_mos_dev_identity')
    expect(worktreeFingerprint(TREE_A)).toMatch(/^mos-dev-[0-9a-f]{8}$/)
    expect(devServerBaseUrl(TREE_A, undefined)).toBe(`http://localhost:${port}/mos/`)
    expect(devServerIdentityUrl(TREE_A, undefined)).toBe(`http://localhost:${port}${MOS_DEV_IDENTITY_PATH}`)
  })

  it('needs no environment variable for ordinary use; an explicit override is honoured and validated (AC-3, AC-4)', () => {
    expect(devServerPort(TREE_A, undefined)).toBe(20719) // verified FNV-1a derivation for this fixture
    expect(devServerPort(TREE_A, '5199')).toBe(5199)
    for (const bad of ['not-a-port', '0', '1023', '70000']) {
      expect(() => devServerPort(TREE_A, bad)).toThrow(MOS_DEV_PORT_ENV)
    }
  })

  it('refuses a listener this worktree does not own (AC-2, AC-4)', () => {
    const mine = worktreeFingerprint(TREE_A)
    const port = devServerPort(TREE_A, undefined)
    expect(() => assertDevServerOwnership(mine, mine, port)).not.toThrow()
    expect(() => assertDevServerOwnership(mine, 'mos-dev-decafbad', port)).toThrow(/REFUSING/)
    expect(() => assertDevServerOwnership(mine, null, port)).toThrow(/REFUSING/)
  })
})
import { describe, expect, it } from 'vitest'
import { localViewAsPassword, validateLocalViewAsBuild } from './local-view-as'

describe('local view-as gate', () => {
  it('is unavailable outside Vite development mode', () => {
    expect(localViewAsPassword(false, 'local-password')).toBeNull()
  })

  it('is unavailable in development when no password is configured', () => {
    expect(localViewAsPassword(true, '')).toBeNull()
  })

  it('returns the configured password only in development', () => {
    expect(localViewAsPassword(true, 'local-password')).toBe('local-password')
  })
})

describe('local view-as build guard', () => {
  it('rejects a production build when the local password is set', () => {
    expect(() => validateLocalViewAsBuild({ command: 'build', password: 'local-password' }))
      .toThrow(/local development/i)
  })

  it('allows development and builds without the local password', () => {
    expect(() => validateLocalViewAsBuild({ command: 'serve', password: 'local-password' })).not.toThrow()
    expect(() => validateLocalViewAsBuild({ command: 'build', password: undefined })).not.toThrow()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { resolveHomeLayout, setHomeLayout } from './home-layout'

describe('Home layout preference (OD-V4-9)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to Focused when a person has no saved choice', () => {
    expect(resolveHomeLayout('person-1')).toBe('focused')
  })

  it('round-trips a saved choice for the same person', () => {
    setHomeLayout('person-1', 'overview')
    expect(resolveHomeLayout('person-1')).toBe('overview')
  })

  it('AC-924: keeps a saved choice isolated to its person', () => {
    setHomeLayout('person-1', 'list')
    expect(resolveHomeLayout('person-2')).toBe('focused')
  })

  it('AC-922: falls back to Focused for an invalid stored value', () => {
    window.localStorage.setItem('gordi.home.layout.person-1', 'not-a-layout')
    expect(resolveHomeLayout('person-1')).toBe('focused')
  })

  it('AC-923: falls back to Focused when localStorage throws on read', () => {
    const originalGetItem = window.localStorage.getItem
    try {
      window.localStorage.getItem = () => { throw new Error('private mode') }
      expect(resolveHomeLayout('person-1')).toBe('focused')
    } finally {
      window.localStorage.getItem = originalGetItem
    }
  })

  it('does not block a layout change when storage rejects the write', () => {
    const originalSetItem = window.localStorage.setItem
    try {
      window.localStorage.setItem = () => { throw new Error('quota') }
      expect(() => setHomeLayout('person-1', 'list')).not.toThrow()
    } finally {
      window.localStorage.setItem = originalSetItem
    }
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { resolveHomeLayout, setHomeLayout } from './home-layout'

describe('home layout preference (OD-V4-9)', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('AC-920: defaults to focused when nothing is stored', () => {
    expect(resolveHomeLayout('person-1')).toBe('focused')
  })

  it('AC-921: round-trips a stored choice', () => {
    setHomeLayout('person-1', 'overview')
    expect(resolveHomeLayout('person-1')).toBe('overview')
  })

  it('AC-922: falls back to focused on an unrecognised stored value', () => {
    window.localStorage.setItem('gordi.home.layout.person-1', 'nonsense')
    expect(resolveHomeLayout('person-1')).toBe('focused')
  })

  it('AC-924: is scoped per person', () => {
    setHomeLayout('person-1', 'list')
    expect(resolveHomeLayout('person-2')).toBe('focused')
  })

  it('AC-923: resolves to focused when localStorage throws', () => {
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => { throw new Error('private mode') }
    expect(resolveHomeLayout('person-1')).toBe('focused')
    window.localStorage.getItem = original
  })

  it('does not throw when a write fails', () => {
    const original = window.localStorage.setItem
    window.localStorage.setItem = () => { throw new Error('quota') }
    expect(() => setHomeLayout('person-1', 'list')).not.toThrow()
    window.localStorage.setItem = original
  })
})

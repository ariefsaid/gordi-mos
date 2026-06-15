import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExpandPref } from './useExpandPref'

beforeEach(() => localStorage.clear())

describe('useExpandPref (AC-104, AC-105) — per-user-global expand persistence', () => {
  it('AC-105: defaults to false when nothing is persisted', () => {
    const { result } = renderHook(() => useExpandPref())
    expect(result.current[0]).toBe(false)
  })

  it('AC-105: reads the persisted value (true) on mount', () => {
    localStorage.setItem('mos.tasks.expandDefault', 'true')
    const { result } = renderHook(() => useExpandPref())
    expect(result.current[0]).toBe(true)
  })

  it('AC-104: toggling persists to localStorage', () => {
    const { result } = renderHook(() => useExpandPref())
    act(() => result.current[1](e => !e))
    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('mos.tasks.expandDefault')).toBe('true')
    act(() => result.current[1](e => !e))
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem('mos.tasks.expandDefault')).toBe('false')
  })

  it('accepts a direct boolean value as well as an updater', () => {
    const { result } = renderHook(() => useExpandPref())
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('mos.tasks.expandDefault')).toBe('true')
  })
})

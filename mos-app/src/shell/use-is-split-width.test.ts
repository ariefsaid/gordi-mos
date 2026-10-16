import { describe, it, expect, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsSplitWidth } from './use-is-split-width'

function mountMain(width: number) {
  const main = document.createElement('main')
  main.id = 'main-content'
  Object.defineProperty(main, 'clientWidth', { value: width })
  document.body.appendChild(main)
  return main
}

describe('useIsSplitWidth (content-track split threshold)', () => {
  afterEach(() => document.getElementById('main-content')?.remove())

  it('lets a record open beside the list when the content track holds both', () => {
    mountMain(1700)
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(true)
  })

  it('opens the record as a full page when the content track is too narrow', () => {
    mountMain(900)
    const { result } = renderHook(() => useIsSplitWidth())
    expect(result.current).toBe(false)
  })
})

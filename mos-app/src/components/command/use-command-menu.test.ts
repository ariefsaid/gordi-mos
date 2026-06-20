import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCommandMenu } from './use-command-menu'

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
  })
}

// AC-K02: a global ⌘K (mac) / Ctrl+K (other) hotkey opens the command menu.
describe('useCommandMenu (AC-K02)', () => {
  it('AC-K02: starts closed', () => {
    const { result } = renderHook(() => useCommandMenu())
    expect(result.current.open).toBe(false)
  })

  it('AC-K02: Cmd+K opens the menu', () => {
    const { result } = renderHook(() => useCommandMenu())
    pressKey('k', { metaKey: true })
    expect(result.current.open).toBe(true)
  })

  it('AC-K02: Ctrl+K opens the menu (non-mac)', () => {
    const { result } = renderHook(() => useCommandMenu())
    pressKey('k', { ctrlKey: true })
    expect(result.current.open).toBe(true)
  })

  it('AC-K02: a plain "k" keypress does NOT open the menu', () => {
    const { result } = renderHook(() => useCommandMenu())
    pressKey('k')
    expect(result.current.open).toBe(false)
  })

  it('AC-K02: the Cmd+K keydown is prevented (does not type "k" elsewhere)', () => {
    renderHook(() => useCommandMenu())
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    act(() => { document.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
  })

  it('AC-K02: setOpen(false) closes the menu', () => {
    const { result } = renderHook(() => useCommandMenu())
    pressKey('k', { metaKey: true })
    act(() => result.current.setOpen(false))
    expect(result.current.open).toBe(false)
  })
})

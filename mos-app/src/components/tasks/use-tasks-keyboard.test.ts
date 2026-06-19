import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTasksKeyboard } from './use-tasks-keyboard'

function fireKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('useTasksKeyboard (AC-109)', () => {
  let onOpen: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>
  let onNew: ReturnType<typeof vi.fn>
  let onExpand: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onOpen = vi.fn(); onClose = vi.fn(); onNew = vi.fn(); onExpand = vi.fn()
    // Reset focus to the body between tests so single-key suppression is off.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  afterEach(() => {
    document.querySelectorAll('input,select,textarea').forEach(el => el.remove())
  })

  function setup(rowCount = 3, enabled = true) {
    return renderHook(() => useTasksKeyboard({ rowCount, enabled, onOpen, onClose, onNew, onExpand }))
  }

  it('AC-109: j moves the cursor down and k moves it up (clamped to bounds)', () => {
    const { result } = setup(3)
    expect(result.current.cursor).toBe(-1) // nothing focused yet
    act(() => fireKey('j'))
    expect(result.current.cursor).toBe(0)
    act(() => fireKey('j'))
    expect(result.current.cursor).toBe(1)
    act(() => fireKey('j')); act(() => fireKey('j')) // clamp at last row (index 2)
    expect(result.current.cursor).toBe(2)
    act(() => fireKey('k'))
    expect(result.current.cursor).toBe(1)
  })

  it('AC-109: Enter opens the cursor row; o is an alias', () => {
    setup(3)
    act(() => fireKey('j'))
    act(() => fireKey('Enter'))
    expect(onOpen).toHaveBeenCalledWith(0)
    act(() => fireKey('j'))
    act(() => fireKey('o'))
    expect(onOpen).toHaveBeenLastCalledWith(1)
  })

  it('AC-109: Enter with no cursor opens the first row', () => {
    const { result } = setup(3)
    expect(result.current.cursor).toBe(-1)
    act(() => fireKey('Enter'))
    expect(onOpen).toHaveBeenCalledWith(0)
  })

  it('AC-109: Esc closes; n opens create; e toggles expand', () => {
    setup(3)
    act(() => fireKey('Escape'))
    expect(onClose).toHaveBeenCalled()
    act(() => fireKey('n'))
    expect(onNew).toHaveBeenCalled()
    act(() => fireKey('e'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('AC-109: single-letter hotkeys are SUPPRESSED while a text input has focus (Esc still works)', () => {
    setup(3)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => fireKey('n'))
    act(() => fireKey('j'))
    act(() => fireKey('e'))
    expect(onNew).not.toHaveBeenCalled()
    expect(onExpand).not.toHaveBeenCalled()
    // Esc always works even from a field
    act(() => fireKey('Escape'))
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-109: hotkeys are suppressed while a <select> or <textarea> has focus', () => {
    setup(3)
    const sel = document.createElement('select')
    document.body.appendChild(sel)
    sel.focus()
    act(() => fireKey('n'))
    expect(onNew).not.toHaveBeenCalled()
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()
    act(() => fireKey('e'))
    expect(onExpand).not.toHaveBeenCalled()
  })

  it('disabled: no key is handled when enabled=false', () => {
    setup(3, false)
    act(() => fireKey('n'))
    act(() => fireKey('Escape'))
    expect(onNew).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cursor clamps when rowCount shrinks below the current cursor', () => {
    const { result, rerender } = renderHook(
      ({ rc }) => useTasksKeyboard({ rowCount: rc, enabled: true, onOpen, onClose, onNew, onExpand }),
      { initialProps: { rc: 5 } },
    )
    act(() => { fireKey('j'); fireKey('j'); fireKey('j'); fireKey('j') }) // cursor → 3
    expect(result.current.cursor).toBe(3)
    rerender({ rc: 2 }) // list shrinks
    expect(result.current.cursor).toBeLessThanOrEqual(1)
  })

  it('setCursor lets the caller sync the cursor to the open/selected row', () => {
    const { result } = setup(5)
    act(() => result.current.setCursor(2))
    expect(result.current.cursor).toBe(2)
    act(() => fireKey('j'))
    expect(result.current.cursor).toBe(3)
  })
})

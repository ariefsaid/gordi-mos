import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCollectionKeyboard } from './use-collection-keyboard'

function fireKey(key: string, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('useCollectionKeyboard — shared collection j/k cursor (AC-109, GAP-9)', () => {
  let onOpen: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>
  let onNew: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onOpen = vi.fn(); onClose = vi.fn(); onNew = vi.fn()
    // Reset focus to the body between tests so single-key suppression is off.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  afterEach(() => {
    document.querySelectorAll('input,select,textarea').forEach(el => el.remove())
  })

  function setup(rowCount = 3, enabled = true, overlayActive = false) {
    return renderHook(() => useCollectionKeyboard({ rowCount, enabled, overlayActive, onOpen, onClose, onNew }))
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

  it('AC-109: Esc closes; n opens create (GAP-2: the e expand key is retired)', () => {
    setup(3)
    act(() => fireKey('Escape'))
    expect(onClose).toHaveBeenCalled()
    act(() => fireKey('n'))
    expect(onNew).toHaveBeenCalled()
  })

  it('AC-109: single-letter hotkeys are SUPPRESSED while a text input has focus', () => {
    setup(3)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => fireKey('n'))
    act(() => fireKey('j'))
    expect(onNew).not.toHaveBeenCalled()
  })

  // D-B3 / RULED I5 (fix work-order item 11): a focused field owns its own Escape (discard the
  // draft, close a picker) — the window layer must NOT also fire an unguarded close.
  it('Escape from a focused field is NOT handled by the window layer (field-Escape isolation)', () => {
    setup(3)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => fireKey('Escape'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // D-B3/D-F1 (fix work-order item 11): while an overlay session is live, the overlay host owns
  // the ONE guarded Escape path — the window layer stands down so host.close is never raced by
  // an unguarded onCloseDrawer (dirty-field guard would be bypassed).
  it('Escape is NOT handled while an overlay session is active (the host owns the guarded close)', () => {
    setup(3, true, true)
    act(() => fireKey('Escape'))
    expect(onClose).not.toHaveBeenCalled()
    // The rest of the layer still works (j/k cursor is list-side, not panel-side).
    act(() => fireKey('j'))
    act(() => fireKey('Enter'))
    expect(onOpen).toHaveBeenCalledWith(0)
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
    act(() => fireKey('n'))
    expect(onNew).not.toHaveBeenCalled()
  })

  it('preserves native select handling for j and k instead of moving the collection cursor', () => {
    const { result } = setup(3)
    const sel = document.createElement('select')
    for (const value of ['Jasmine', 'Kale']) {
      const option = document.createElement('option')
      option.textContent = value
      option.value = value
      sel.appendChild(option)
    }
    document.body.appendChild(sel)
    sel.focus()

    let selectReceived = 0
    sel.addEventListener('keydown', () => { selectReceived += 1 })
    let jEvent: KeyboardEvent
    let kEvent: KeyboardEvent
    act(() => { jEvent = fireKey('j', sel) })
    act(() => { kEvent = fireKey('k', sel) })

    expect(result.current.cursor).toBe(-1)
    expect(selectReceived).toBe(2)
    expect(jEvent!.defaultPrevented).toBe(false)
    expect(kEvent!.defaultPrevented).toBe(false)
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
      ({ rc }) => useCollectionKeyboard({ rowCount: rc, enabled: true, onOpen, onClose, onNew }),
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

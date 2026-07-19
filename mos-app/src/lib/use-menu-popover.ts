/**
 * useMenuPopover — the ONE popover interaction contract (convention audit 2026-07-18,
 * "four overlays, four dismissal contracts" — Nielsen #4). Every menu-style popover gets:
 *   - outside-pointerdown close
 *   - Escape close (with focus returned to the trigger by the caller's `close`)
 *   - WAI-ARIA menu keyboard: focus moves to the first menuitem on open;
 *     ArrowDown/ArrowUp cycle; Home/End jump.
 * CommandMenu keeps its own richer combobox controller; StatusTrigger keeps its
 * listbox contract. This hook backs role="menu" popovers (UserChip, RowMenu).
 */
import { useEffect } from 'react'

export function useMenuPopover(
  open: boolean,
  close: () => void,
  menuRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return

    const items = (): HTMLElement[] =>
      menuRef.current
        ? Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        : []

    // WAI-ARIA menu button pattern: focus enters the menu on open.
    items()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      const list = items()
      if (list.length === 0) return
      const idx = list.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        list[(idx + 1 + list.length) % list.length]?.focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        list[(idx - 1 + list.length) % list.length]?.focus()
      } else if (e.key === 'Home') {
        e.preventDefault()
        list[0]?.focus()
      } else if (e.key === 'End') {
        e.preventDefault()
        list[list.length - 1]?.focus()
      }
    }

    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      close()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, close, menuRef, triggerRef])
}

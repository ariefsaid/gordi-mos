import { useEffect } from 'react'
import { focusableWithin } from '@/lib/focusable'
import { isTopEscapeLayer, useEscapeLayer } from './use-escape-layer'

/**
 * useMenuPopover — the ONE menu interaction contract:
 *   - outside-pointerdown close
 *   - top-layer Escape close with focus returned to the trigger
 *   - focus enters the first menuitem on open; arrows cycle; Home/End jump
 *   - Tab closes the menu and advances focus beyond its opener
 * CommandMenu keeps its richer combobox controller. This hook backs role="menu" popovers.
 */
export function useMenuPopover(
  open: boolean,
  close: () => void,
  menuRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  useEscapeLayer(open, menuRef, close, {
    onTab: (event) => {
      const menu = menuRef.current
      if (!menu) return

      // Menus may be portaled at the end of document.body. Tab still continues from their
      // opener's place in the focus scope, not from the portal's DOM position. Preserve a
      // containing modal's trap even though this menu owns the current Tab event.
      const scope = triggerRef.current?.closest<HTMLElement>('[aria-modal="true"]') ?? document.body
      const outsideMenu = focusableWithin(scope).filter((node) => !menu.contains(node))
      const trigger = triggerRef.current
      const triggerIndex = trigger ? outsideMenu.indexOf(trigger) : -1
      const targetIndex = event.shiftKey ? triggerIndex - 1 : triggerIndex + 1
      const target = triggerIndex < 0
        ? null
        : outsideMenu[targetIndex]
          ?? (scope !== document.body ? outsideMenu[event.shiftKey ? outsideMenu.length - 1 : 0] : null)

      event.preventDefault()
      close()
      // The close callback may restore focus to the trigger; move onward after it runs so Tab
      // lands beyond the opener rather than back on the menu's focused item.
      queueMicrotask(() => target?.focus())
    },
  })

  useEffect(() => {
    if (!open) return

    const items = (): HTMLElement[] =>
      menuRef.current
        ? Array.from(menuRef.current.querySelectorAll<HTMLElement>(
            '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
          ))
        : []

    items()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      const menu = menuRef.current
      if (!menu || !isTopEscapeLayer(menu) || !menu.contains(document.activeElement)) return

      const list = items()
      if (list.length === 0) return
      const index = list.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        list[(index + 1 + list.length) % list.length]?.focus()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        list[(index - 1 + list.length) % list.length]?.focus()
      } else if (event.key === 'Home') {
        event.preventDefault()
        list[0]?.focus()
      } else if (event.key === 'End') {
        event.preventDefault()
        list[list.length - 1]?.focus()
      }
    }

    const onPointerDown = (event: MouseEvent) => {
      // A non-top menu stays mounted until its owner is dismissed; never skip the top layer.
      if (!isTopEscapeLayer(menuRef.current)) return
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
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

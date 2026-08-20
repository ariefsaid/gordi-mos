import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const CONTROL_SELECTOR = 'button, a[href], select, input, textarea, [contenteditable="true"]'

function panelControls(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter((control) => {
    if (control.hidden || control.getAttribute('aria-hidden') === 'true') return false
    if (control.closest('[hidden], [aria-hidden="true"]')) return false
    if (control.getAttribute('type') === 'hidden') return false
    if ('disabled' in control && (control as HTMLButtonElement).disabled) return false
    if (control.getAttribute('aria-disabled') === 'true') return false
    if (control.getAttribute('tabindex') === '-1') return false
    const style = window.getComputedStyle(control)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

/** Shared keyboard/focus behavior for the phone and desktop View & filters doors. */
export function useViewOptionsKeyboard(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      // Defer one microtask so the trigger's click transaction can finish before focus
      // enters the panel; the first control still receives focus on the open transition.
      queueMicrotask(() => panelControls(panelRef.current)[0]?.focus())
    }
    wasOpen.current = open
  }, [open, panelRef])

  return (event: KeyboardEvent<HTMLElement>) => {
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const target = event.target as HTMLElement
    if (target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]')) return
    const panel = panelRef.current
    const controls = panelControls(panel)
    const current = controls.indexOf(target)
    if (current < 0) return
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length
    event.preventDefault()
    controls[next]?.focus()
  }
}

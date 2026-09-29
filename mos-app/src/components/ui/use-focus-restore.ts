// useFocusRestore — hands focus back to the text field a person was typing in when a save that
// disabled the form fails. A browser drops focus from a control the moment it becomes disabled, so
// after the failure the person lands on <body> with their text still in the field.
//
// Attach the returned ref to the form (or dialog body). It remembers the last text-entry element
// focused inside; when `busy` falls back to false and `failed` is set, that element gets focus again
// (only if it is inside the container, still mounted, enabled, and focus is not already somewhere useful).
import { useEffect, useRef, type RefObject } from 'react'

const TEXT_ENTRY = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, [contenteditable=""], [contenteditable="true"]'

export function useFocusRestore<T extends HTMLElement = HTMLElement>(busy: boolean, failed: boolean): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const lastTextField = useRef<HTMLElement | null>(null)
  const wasBusy = useRef(false)

  // Listen on the document: the container may mount after this hook does (a list that loads later),
  // and an autofocused field can fire focusin before its container's ref is attached. Membership is
  // checked when focus is restored.
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches(TEXT_ENTRY)) {
        lastTextField.current = target
      }
    }
    // A field focused before this effect ran (autofocus on mount) has already fired its focusin.
    const active = document.activeElement
    if (active instanceof HTMLElement && containerRef.current?.contains(active) && active.matches(TEXT_ENTRY)) {
      lastTextField.current = active
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  useEffect(() => {
    const finished = wasBusy.current && !busy
    wasBusy.current = busy
    if (!finished || !failed) return
    const field = lastTextField.current
    if (!containerRef.current?.contains(field)) return
    const lost = !document.activeElement || document.activeElement === document.body
    if (!lost || !field || !field.isConnected) return
    if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.disabled) return
    field.focus()
  }, [busy, failed])

  return containerRef
}

import { useEffect, useRef, type RefObject } from 'react'

const TEXT_ENTRY = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, [contenteditable=""], [contenteditable="true"]'
const FORM_CONTROL = 'input:not([type=hidden]):not([type=file]), button, select, textarea, [role=button], [role=combobox], [role=checkbox], [role=radio], [role=switch], [contenteditable=""], [contenteditable="true"]'

type FocusRestoreOptions = { includeFormControls?: boolean }

function isUsableControl(element: HTMLElement): boolean {
  if (!element.isConnected || element.tabIndex < 0 || element.matches(':disabled,[aria-disabled="true"],[hidden],[inert]')) return false
  const style = getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

export function useFocusRestore<T extends HTMLElement = HTMLElement>(
  busy: boolean,
  failed: boolean,
  options?: FocusRestoreOptions,
): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const lastControl = useRef<HTMLElement | null>(null)
  const wasBusy = useRef(false)
  const includeFormControls = options?.includeFormControls === true
  const selector = includeFormControls ? FORM_CONTROL : TEXT_ENTRY

  // The default retains the established text-entry behavior. Opted-in owners additionally track
  // only usable controls inside this container, even though the listener is document-wide so it
  // catches autofocus when a lazily rendered form attaches its ref during the same commit.
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement
        && target.matches(selector)
        && (!includeFormControls || (containerRef.current?.contains(target) && isUsableControl(target)))
      ) {
        lastControl.current = target
      }
    }

    const active = document.activeElement
    if (
      active instanceof HTMLElement
      && containerRef.current?.contains(active)
      && active.matches(selector)
      && (!includeFormControls || isUsableControl(active))
    ) {
      lastControl.current = active
    }

    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [includeFormControls, selector])

  useEffect(() => {
    const finished = wasBusy.current && !busy
    wasBusy.current = busy
    if (!finished || !failed) return

    const container = containerRef.current
    const active = document.activeElement
    const focusWasLost = !active || active === document.body
    if (!container || !focusWasLost) return

    const remembered = lastControl.current
    if (!includeFormControls) {
      if (!remembered || !container.contains(remembered) || !remembered.isConnected) return
      if ((remembered instanceof HTMLInputElement || remembered instanceof HTMLTextAreaElement) && remembered.disabled) return
      remembered.focus()
      return
    }

    const preferred = remembered && container.contains(remembered) && isUsableControl(remembered)
      ? remembered
      : null
    // Broader recovery is opt-in so existing text-only owners keep their established fallback
    // behavior. If an opted-in form's original control was removed or stayed disabled, prefer
    // its usable native submit action before falling back to the first usable local control.
    const submitFallback = container instanceof HTMLFormElement
      ? Array.from(container.elements).find((element): element is HTMLElement => (
          element instanceof HTMLElement
          && container.contains(element)
          && (
            (element instanceof HTMLButtonElement && element.type === 'submit')
            || (element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'image'))
          )
          && isUsableControl(element)
        )) ?? null
      : null
    const localFallback = Array.from(container.querySelectorAll<HTMLElement>(selector)).find(isUsableControl) ?? null
    const target = preferred ?? submitFallback ?? localFallback
    target?.focus({ preventScroll: true })
  }, [busy, failed, includeFormControls, selector])

  return containerRef
}

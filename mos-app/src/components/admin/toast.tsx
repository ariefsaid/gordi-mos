// Toast — lightweight success notification for admin actions.
// A polite aria-live region that announces the message to AT without moving focus.
// Auto-dismisses after a timeout (controlled by useToast).
// Single toast at a time (last action wins).
//
// Tokens per DESIGN.md: popover surface (white popover bg + foreground text, single
// 1px border on all sides), bottom-RIGHT placement, overlay shadow. v4 impeccable pass
// (2026-07-27) dropped the colored left-accent stripe — craft-floor.md's refuse list
// names "a colored border-left/border-right above 1px" as the side-tab slop tell, and
// the mechanical scan (`impeccable detect`) flagged this exact line. The success state
// is already carried by the message copy; the border stays a single uniform hairline.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ToastState } from './use-toast'
import { OverlayPortal } from '@/components/ui/overlay-portal'
import { focusableWithin } from '@/lib/focusable'

function focusElement(element: HTMLElement | null): boolean {
  if (!element?.isConnected || element === document.body) return false
  element.focus()
  return document.activeElement === element
}

function fallbackFocusTarget(toastContainer: HTMLElement | null): HTMLElement | null {
  const modals = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter((element) => !element.closest('[hidden], [aria-hidden="true"], [inert]'))
  const modal = modals.at(-1) ?? null
  const main = document.getElementById('main-content')
  const scope = modal ?? main
  const withinScope = focusableWithin(scope).find((element) => !toastContainer?.contains(element))
  if (withinScope) return withinScope
  return focusableWithin(document.body).find((element) => !toastContainer?.contains(element)) ?? null
}

function restoreFocus(target: HTMLElement | null, toastContainer: HTMLElement | null) {
  if (focusElement(target)) return
  focusElement(fallbackFocusTarget(toastContainer))
}

function bottomOverlayOffset() {
  const viewportBottom = window.innerHeight
  const tops = [...document.querySelectorAll<HTMLElement>('[data-overlay-edge="bottom"]')]
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.height > 0 && rect.top < viewportBottom && rect.bottom > viewportBottom - 320)
    .map((rect) => rect.top)

  return tops.length === 0 ? 24 : Math.max(24, Math.ceil(viewportBottom - Math.min(...tops) + 16))
}

export interface ToastProps {
  toast: ToastState | null
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const restoreFocusAfterDismissRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)
  const updatePosition = useCallback(() => {
    if (containerRef.current) containerRef.current.style.bottom = `${bottomOverlayOffset()}px`
  }, [])
  const schedulePositionUpdate = useCallback(() => {
    if (pendingFrameRef.current !== null) return
    pendingFrameRef.current = window.requestAnimationFrame(() => {
      pendingFrameRef.current = null
      updatePosition()
    })
  }, [updatePosition])

  useLayoutEffect(updatePosition)
  useLayoutEffect(() => {
    if (!toast) {
      const shouldRestoreFocus = restoreFocusAfterDismissRef.current
      restoreFocusAfterDismissRef.current = false
      const returnFocus = returnFocusRef.current
      returnFocusRef.current = null
      if (shouldRestoreFocus) restoreFocus(returnFocus, containerRef.current)
      return
    }
    const activeElement = document.activeElement as HTMLElement
    if (!containerRef.current?.contains(activeElement) && activeElement !== document.body) {
      returnFocusRef.current = activeElement
    }
  }, [toast])
  useEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target === document.body || containerRef.current?.contains(target)) return
      if (!returnFocusRef.current?.isConnected) returnFocusRef.current = target
    }
    document.addEventListener('focusin', rememberFocus)
    return () => document.removeEventListener('focusin', rememberFocus)
  }, [])
  useEffect(() => {
    const observer = new MutationObserver(schedulePositionUpdate)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedulePositionUpdate)
    window.addEventListener('scroll', schedulePositionUpdate, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedulePositionUpdate)
      window.removeEventListener('scroll', schedulePositionUpdate, true)
      if (pendingFrameRef.current !== null) window.cancelAnimationFrame(pendingFrameRef.current)
    }
  }, [schedulePositionUpdate])

  const dismiss = () => {
    restoreFocusAfterDismissRef.current = true
    onDismiss()
  }

  return (
    <OverlayPortal>
      <div
        ref={containerRef}
        aria-live="polite"
        aria-atomic="true"
        // role="status" is the accessible equivalent to polite live region
        role="status"
        className="fixed right-6 pointer-events-none"
        style={{ minWidth: 280, maxWidth: 420, bottom: '24px', zIndex: 'var(--z-toast)' }}
      >
        {toast && (
          <div
            className="flex items-center gap-3 rounded-lg px-4 py-3 pointer-events-auto"
            style={{
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-overlay)',
            }}
          >
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={dismiss}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                event.preventDefault()
                event.stopPropagation()
                dismiss()
              }}
              aria-label="Dismiss notification"
              data-focus-trap-target="toast-dismiss"
              data-touch-target="true"
              className="toast-dismiss text-current opacity-60 hover:opacity-100 transition-opacity"
              style={{ lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </OverlayPortal>
  )
}

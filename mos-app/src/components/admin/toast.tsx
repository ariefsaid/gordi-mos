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
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="text-current opacity-60 hover:opacity-100 transition-opacity"
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

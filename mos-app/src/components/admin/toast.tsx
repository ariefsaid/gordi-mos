// Toast — lightweight success notification for admin actions.
// A polite aria-live region that announces the message to AT without moving focus.
// Auto-dismisses after a timeout (controlled by useToast).
// Single toast at a time (last action wins).
//
// Tokens per DESIGN.md (DIV-G6 conformance, fix work-order item 25): popover surface
// (white popover bg + foreground text, single 1px border), the 3px left accent stripe
// (success green — this is the success toast; the generic accent stripe is Action
// Blue), bottom-RIGHT placement, overlay shadow. No behavior change.

import type { ToastState } from './use-toast'

export interface ToastProps {
  toast: ToastState | null
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      // role="status" is the accessible equivalent to polite live region
      role="status"
      className="fixed bottom-6 right-6 pointer-events-none"
      style={{ minWidth: 280, maxWidth: 420, zIndex: 'var(--z-toast)' }}
    >
      {toast && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 pointer-events-auto"
          style={{
            background: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--success)',
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
  )
}

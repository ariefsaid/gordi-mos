// Toast — lightweight success notification for admin actions.
// A polite aria-live region that announces the message to AT without moving focus.
// Auto-dismisses after a timeout (controlled by useToast).
// Single toast at a time (last action wins).

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
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ minWidth: 280, maxWidth: 420 }}
    >
      {toast && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 pointer-events-auto"
          style={{
            background: 'var(--foreground)',
            color: 'var(--card)',
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

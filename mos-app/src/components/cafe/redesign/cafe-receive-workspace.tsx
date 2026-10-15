import type { ReactNode } from 'react'
import './cafe-receive-workspace.css'

export function CafeReceiveWorkspace({ stage, children }: { stage: 'count' | 'explain' | 'sent'; children: ReactNode }) {
  return <div className="cafe-receive-workspace" data-stage={stage}>{children}</div>
}

/** The PO choice. Pass `open` + `onOpenChange` to let the page open it from a control outside the panel. */
export function CafeReceivePoPanel({ children, title, unavailable = false, open, onOpenChange }: {
  children: ReactNode; title: string; unavailable?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void
}) {
  return <details
    className={`cafe-receive-po-panel${unavailable ? ' cafe-receive-po-panel--unavailable' : ''}`}
    open={open}
    onToggle={onOpenChange ? event => onOpenChange(event.currentTarget.open) : undefined}
  ><summary>{title}</summary>{children}</details>
}

export function CafeReceiveHistoryPanel({ children }: { children: ReactNode }) {
  return <section className="cafe-receive-history-panel">{children}</section>
}

import type { ReactNode } from 'react'
import './worksheet.css'
import '@/components/ui/Disclosure.css'

/** Generic full-width work surface for dense, editable Café rows. Children own data and handlers. */
export function Worksheet({ children, label, className = '' }: {
  children: ReactNode
  label: string
  className?: string
}) {
  return <section className={`cafe-worksheet ${className}`.trim()} aria-label={label}>{children}</section>
}

/** Progressive disclosure for secondary task detail; content remains mounted while closed. */
export function Panel({ title, children, open, className = '' }: {
  title: string
  children: ReactNode
  open?: boolean
  className?: string
}) {
  return <details className={`cafe-redesign-panel ${className}`.trim()} open={open}>
    <summary>{title}</summary>
    <div className="cafe-redesign-panel__body">{children}</div>
  </details>
}

/** A decision row inside one record (Approve / Reject on a receipt or request). Page-level bars use ui/action-bar. */
export function DecisionBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cafe-redesign-action-bar ${className}`.trim()}>{children}</div>
}

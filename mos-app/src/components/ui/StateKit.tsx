// StateKit — the ONE error/empty/skeleton kit (IXD-5, PR-2).
// ErrorState: role=alert message + optional .btn-outline Retry.
// EmptyState: title + copy + actions slot.
// SkeletonRows: N shimmer rows (default bar; pass `row` for pane-specific shapes).
// Used across the data panes (Tasks, Ops, weekly). The lightweight inline "Retry"
// link in the My Week 56–64px density strips stays inline (their height can't fit
// the full block) — those strips do NOT use this kit.
import type { ReactNode } from 'react'
import { Button } from './Button'
import './CardHead.css' // owns the error-state / empty-state / skeleton tokens

export interface ErrorStateProps {
  message: ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({ message, onRetry, retryLabel = 'Retry', className }: ErrorStateProps) {
  return (
    <div role="alert" className={`error-state${className ? ` ${className}` : ''}`}>
      <span className="error-state-text">{message}</span>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export interface EmptyStateProps {
  title: ReactNode
  copy?: ReactNode
  /** Actions row (CTAs). */
  children?: ReactNode
  className?: string
}

export function EmptyState({ title, copy, children, className }: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`}>
      <h3 className="empty-title">{title}</h3>
      {copy && <p className="empty-copy">{copy}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  )
}

export interface SkeletonRowsProps {
  count?: number
  className?: string
  /** Custom row renderer; defaults to a simple two-bar shimmer row. */
  row?: (i: number) => ReactNode
}

export function SkeletonRows({ count = 3, className, row }: SkeletonRowsProps) {
  return (
    <div className={`skeleton-rows${className ? ` ${className}` : ''}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) =>
        row ? row(i) : (
          <div key={i} className="skeleton-row">
            <div className="skeleton-bar skeleton-bar--pill" />
            <div className="skeleton-bar skeleton-bar--line" />
          </div>
        ),
      )}
    </div>
  )
}

// StateKit — the ONE error/empty/skeleton kit (IXD-5, PR-2).
// ErrorState: role=alert message + optional .btn-outline Retry.
// EmptyState: title + copy + actions slot.
// SkeletonRows: N shimmer rows (default bar; pass `row` for pane-specific shapes).
// Used across the data panes (Tasks, Ops, weekly). The lightweight inline "Retry"
// link in the My Week 56–64px density strips stays inline (their height can't fit
// the full block) — those strips do NOT use this kit.
import { useId, type ReactNode } from 'react'
import { Button } from './button'
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

export type EmptyStateVariant = 'quiet' | 'next-step' | 'awaiting'

export interface EmptyStateProps {
  title: ReactNode
  copy?: ReactNode
  note?: ReactNode
  variant?: EmptyStateVariant
  icon?: ReactNode
  /** Actions row (CTAs). */
  children?: ReactNode
  className?: string
}

function defaultEmptyGlyph(variant: EmptyStateVariant) {
  switch (variant) {
    case 'next-step':
      return '+'
    case 'awaiting':
      return '↻'
    case 'quiet':
    default:
      return '✓'
  }
}

export function EmptyState({
  title,
  copy,
  note,
  variant = 'quiet',
  icon,
  children,
  className,
}: EmptyStateProps) {
  const titleId = useId()

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      data-testid="empty-state"
      data-empty-variant={variant}
      className={`empty-state empty-state--${variant}${className ? ` ${className}` : ''}`}
    >
      <div className="empty-state-frame">
        <div className="empty-state-icon" aria-hidden="true">
          <span className="empty-state-glyph">{icon ?? defaultEmptyGlyph(variant)}</span>
        </div>
        <div className="empty-state-body">
          <h3 id={titleId} className="empty-title">{title}</h3>
          {copy && <p className="empty-copy">{copy}</p>}
          {note && <p className="empty-note">{note}</p>}
        </div>
        {children && <div className="empty-actions">{children}</div>}
      </div>
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

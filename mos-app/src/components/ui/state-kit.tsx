// StateKit — the ONE error/empty/skeleton kit (IXD-5, PR-2).
// ErrorState: role=alert message + optional .btn-outline Retry.
// EmptyState: title + copy + actions slot.
// SkeletonRows: N shimmer rows (default bar; pass `row` for pane-specific shapes).
// Used across the data panes (Tasks, Ops, weekly). The lightweight inline "Retry"
// link in the My Week 56–64px density strips stays inline (their height can't fit
// the full block) — those strips do NOT use this kit.
import { useId, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from './button'
import './CardHead.css' // owns the error-state / empty-state / skeleton tokens

export interface ErrorStateProps {
  message: ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({ message, onRetry, retryLabel, className }: ErrorStateProps) {
  // #359: the default label comes from the catalog, not a literal 'Retry' — 25 of 31 call
  // sites pass nothing, so the literal was the app's most widespread untranslated string.
  const t = useT()
  return (
    <div role="alert" className={`error-state${className ? ` ${className}` : ''}`}>
      <span className="error-state-text">{message}</span>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel ?? t('common.retry')}
        </Button>
      )}
    </div>
  )
}

export type EmptyStateVariant = 'quiet' | 'next-step' | 'awaiting' | 'blank'

/** A pickable starter prompt (the Assistant's empty-state suggestions — v4 cohesion item #2). */
export interface EmptyStateSuggestion {
  label: string
  onSelect: () => void
}

export interface EmptyStateProps {
  title: ReactNode
  copy?: ReactNode
  note?: ReactNode
  variant?: EmptyStateVariant
  icon?: ReactNode
  /**
   * Pickable starter prompts, rendered as a stacked button list below the copy. Ported from v4's
   * `state-kit.tsx` with the Deputy chrome cutover — the one call site is the Assistant panel's
   * empty state (one empty-state grammar app-wide; the `.empty-suggestion*` rules already shipped
   * in CardHead.css waiting for this prop).
   */
  suggestions?: EmptyStateSuggestion[]
  /**
   * Heading level for the title. Defaults to 3, which is what every call site on this branch
   * already renders — the prop exists so a surface whose EmptyState sits directly under the page
   * h1 can pass 2 and not skip a level. (v4 raised the DEFAULT to 2; that changes the outline of
   * ~20 existing call sites and belongs to the PR that ports those surfaces, not to the route
   * table.)
   */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /**
   * Drop the `region` landmark + its labelling when this EmptyState sits inside an already-labelled
   * landmark. Ported from v4's `state-kit.tsx`.
   * Two independent call sites need it: #191 (Home) — region-rows.tsx's tabpanel/section around a
   * region already carries its own accessible name, so an all-clear EmptyState inside it must not
   * add a second, redundant region; #192 (Tasks) — RecordViewer's empty body is already inside the
   * record panel/page's own labelled region. Default false keeps every existing call site's
   * semantics.
   */
  nested?: boolean
  /** Actions row (CTAs). */
  children?: ReactNode
  className?: string
}

function defaultEmptyGlyph(variant: EmptyStateVariant) {
  switch (variant) {
    case 'next-step':
      return '+'
    case 'awaiting':
      return '↻' // a real data source exists and will fill this
    case 'blank':
      return '—' // empty BY DESIGN: no source, nothing pending — never ✓ (false success) nor ↻ (false pending)
    case 'quiet':
    default:
      return '✓' // an EARNED all-clear ("you're all caught up") — not a generic empty
  }
}

export function EmptyState({
  title,
  copy,
  note,
  variant = 'quiet',
  icon,
  suggestions,
  headingLevel = 3,
  nested = false,
  children,
  className,
}: EmptyStateProps) {
  const titleId = useId()
  const Heading = `h${headingLevel}` as const

  return (
    <div
      role={nested ? undefined : 'region'}
      aria-labelledby={nested ? undefined : titleId}
      data-testid="empty-state"
      data-empty-variant={variant}
      className={`empty-state empty-state--${variant}${className ? ` ${className}` : ''}`}
    >
      <div className="empty-state-frame">
        <div className="empty-state-icon" aria-hidden="true">
          <span className="empty-state-glyph">{icon ?? defaultEmptyGlyph(variant)}</span>
        </div>
        <div className="empty-state-body">
          <Heading id={titleId} className="empty-title">{title}</Heading>
          {copy && <p className="empty-copy">{copy}</p>}
          {note && <p className="empty-note">{note}</p>}
        </div>
        {suggestions && suggestions.length > 0 && (
          <div className="empty-suggestions">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                className="empty-suggestion"
                onClick={s.onSelect}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
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

export interface LoadingShellProps {
  /** Number of skeleton rows to render. */
  count?: number
  /** Override the status announcement (defaults to the shared `common.loading`). */
  label?: string
  className?: string
  /** Custom row renderer, forwarded to SkeletonRows for pane-specific shapes. */
  row?: (i: number) => ReactNode
}

/**
 * LoadingShell — THE one loading grammar. A single busy status region (`role=status` +
 * `aria-busy` + one localized label) wrapping the shared SkeletonRows, so a route whose code is
 * still in flight announces itself once, the same way, everywhere.
 *
 * It is the sanctioned Suspense fallback for every code-split route (router.tsx, NFR-012/AC-019).
 * SkeletonRows alone is `aria-hidden`, so a bare skeleton fallback would leave a screen reader
 * with silence while a chunk downloads.
 */
export function LoadingShell({ count = 3, label, className, row }: LoadingShellProps) {
  const t = useT()
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? t('common.loading')}
      className={`loading-shell${className ? ` ${className}` : ''}`}
    >
      <SkeletonRows count={count} row={row} />
    </div>
  )
}

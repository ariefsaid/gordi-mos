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
  // harden (2026-07-28): the default was the hardcoded English literal 'Retry'. ~15 of the
  // ~20 ErrorState call sites pass no retryLabel, so the recovery button — the single
  // control an error state exists to offer — stayed English in the Indonesian locale
  // app-wide. Defaulting against the catalog fixes every one of those call sites at the
  // primitive, which is where a systemic i18n hole belongs (fix the system, not screens).
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

/** A pickable starter prompt (the Assistant's empty-state suggestions fold in here — item #2). */
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
  /** Pickable starter prompts, rendered as a stacked button list below the copy. */
  suggestions?: EmptyStateSuggestion[]
  /** Drop the region landmark when this sits inside an already-labelled landmark
   * (e.g. the Assistant drawer) — avoids a redundant nested region. */
  nested?: boolean
  /** AUTH-1 (census DO-14) / FINDING 4 (v4 shell a11y audit, 2026-07-27): the heading level for
   * the empty-state title. Defaults to 2 — the EmptyState is most commonly the first content
   * region directly under a page's own h1 (PageFamilyFrame's PageHead), and h1 → h3 with no h2
   * between is an outline skip (measured live on Task detail, Money, Inbox, Café Review — four
   * independent call sites via this ONE shared component). Raising the default to the
   * non-skipping level fixes every un-annotated call site at once; a call site whose EmptyState
   * sits under its OWN section h2 (nested one level deeper) still passes an explicit
   * `headingLevel={3}` to stay correct in that context — the default only covers the common,
   * previously-broken case. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
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
  nested = false,
  headingLevel = 2,
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
 * LoadingShell — THE one loading grammar (cohesion-debt 2026-07-19, item #3).
 * A single busy status region (`role=status` + `aria-busy` + one localized
 * label) wrapping the shared SkeletonRows. Replaces every bespoke loader idiom
 * and banishes the literal "Loading…" text.
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

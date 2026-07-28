// ChartFrame — the general titled chart surface (design-plan §2.2). Reusable shell;
// the chart body is an injected child (frame-agnostic — never knows the series).
// tableFallback is MANDATORY (NFR-accessibility): the a11y table equivalent, and
// doubles as the phone primary view when the chart is unreadable.
import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState } from '@/components/ui/state-kit'
import './chart-frame.css'

export interface ChartFrameProps {
  title: string
  freshness?: ReactNode
  controls?: ReactNode
  children: ReactNode
  /** MANDATORY — the screen-reader / no-JS table equivalent of the chart series */
  tableFallback: ReactNode
  state?: 'ready' | 'loading' | 'empty' | 'error'
  onRetry?: () => void
  ariaLabel: string
}

export function ChartFrame({
  title,
  freshness,
  controls,
  children,
  tableFallback,
  state = 'ready',
  onRetry,
  ariaLabel,
}: ChartFrameProps) {
  const t = useT()
  return (
    <section className="chart-frame" role="region" aria-label={ariaLabel}>
      <div className="chart-frame-head">
        <h3 className="chart-frame-title">{title}</h3>
        {freshness && <div className="chart-frame-freshness">{freshness}</div>}
      </div>

      {controls && <div className="chart-frame-controls">{controls}</div>}

      <div className="chart-frame-body">
        {state === 'loading' && (
          <div className="chart-frame-skeleton" aria-hidden="true" />
        )}
        {/* Cohesion-debt 2026-07-19, item #2: the empty state was a hardcoded-English
            `.chart-frame-empty` div — now the shared kit EmptyState (blank = empty by
            design for this cut) + the i18n `chart.empty` key. */}
        {state === 'empty' && (
          <EmptyState variant="blank" title={t('chart.empty')} />
        )}
        {/* harden (2026-07-28): was a bespoke `.chart-frame-error` div with hardcoded
            English copy and a hand-rolled `.chart-frame-retry` button — one of THREE
            divergent error implementations inside Money alone (this, DataTable's
            `.dt-error`, and dashboard-page's shared ErrorState). All three now compose
            the one kit, so an error looks and recovers the same everywhere. */}
        {state === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.chart') })}
            onRetry={onRetry}
          />
        )}
        {state === 'ready' && children}
      </div>

      {/* Mandatory a11y equivalent — always in the DOM regardless of chart state
          (screen-reader / no-JS fallback; also the phone primary view when the
          chart itself is unreadable, per the sr-only class below). */}
      <div className="chart-frame-fallback">{tableFallback}</div>
    </section>
  )
}

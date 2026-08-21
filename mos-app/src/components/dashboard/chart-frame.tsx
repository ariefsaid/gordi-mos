// ChartFrame — the general titled chart surface (design-plan §2.2). Reusable shell;
// the chart body is an injected child (frame-agnostic — never knows the series).
// tableFallback is MANDATORY (NFR-accessibility): the a11y table equivalent, and
// doubles as the phone primary view when the chart is unreadable.
import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
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
        {state === 'empty' && (
          <div className="chart-frame-empty" role="status">
            {t('chart.empty')}
          </div>
        )}
        {/* #400: the failure copy joins the same `common.loadFailed` sentence every other
            load failure in the app already uses, so the one state a user meets on a bad
            connection stops being the one state that answers them in English. */}
        {state === 'error' && (
          <div className="chart-frame-error">
            <p className="chart-frame-error-text">
              {t('common.loadFailed', { what: t('common.what.chart') })}
            </p>
            {onRetry && (
              <button type="button" className="chart-frame-retry" onClick={onRetry}>
                {t('common.retry')}
              </button>
            )}
          </div>
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

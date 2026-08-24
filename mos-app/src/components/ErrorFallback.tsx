/**
 * ErrorFallback — UI for ErrorBoundary and RouteErrorBoundary.
 *
 * Uses DESIGN.md tokens (calm centered card with apologetic heading,
 * reload button, accessible). Exposed as a named export for reuse
 * by RouteErrorBoundary.
 *
 * #400 (ported from v4) — three defects on the app's LAST-RESORT recovery screen:
 *
 *  1. It made a claim the code does not honour. "The error has been logged and our team will
 *     look into it" — but no telemetry sink is registered anywhere in the app, so nothing is
 *     transmitted; no team sees it. Telling a floor user their crash is already being handled
 *     is the most consequential place to be wrong, because it is the copy that stops them
 *     reporting it themselves. Replaced with what is actually true and with the one recovery
 *     instruction that helps.
 *  2. English only. Unlike every other surface, this one renders ABOVE I18nProvider when
 *     the top-level boundary catches, so useT() would silently fall back to English there.
 *     It therefore resolves the catalog against the persisted locale via translateFor —
 *     correct in BOTH mount positions and cannot throw inside an already-crashed tree.
 *  3. Sub-44px controls on a phone-first product whose floor is >=44px on phone (PRODUCT.md
 *     Accessibility). The recovery buttons were the smallest targets in the app, on the
 *     screen reached with the least patience. Now >=44px on phone via the shared
 *     `data-touch-target` seam the rest of the app uses (Button.css's
 *     `@media (max-width: 767.98px)` block), and 32px on desktop like every other control.
 *
 *     #411: this used to ALSO inline `minHeight: '44px'` alongside the seam, plus five other
 *     properties `.btn` already sets. An inline min-height wins at every width, so the crash
 *     screen shipped 44px desktop buttons no other surface has — and made the seam it had just
 *     added unobservable. DESIGN.md § Density is the authority ("Standard controls are 32px;
 *     phone targets are at least 44px"), and it is the media query, not the markup, that knows
 *     which width it is. The class + the attribute deliver the documented behaviour on their own.
 */
import { readPersistedLocale } from '@/i18n/I18nProvider'
import { translateFor } from '@/i18n/use-t'

export interface ErrorFallbackProps {
  onReset?: () => void
}

export function ErrorFallback({ onReset }: ErrorFallbackProps) {
  const tr = translateFor(readPersistedLocale())

  return (
    <div
      role="alert"
      className="error-boundary"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '16px',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          maxWidth: '400px',
          padding: '24px',
          borderRadius: 'var(--radius-lg)', // 12px card radius
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-rest)',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            margin: '0 0 12px 0',
            fontSize: 'var(--font-size-subheading)', // subheading
            fontWeight: 600,
            fontFamily: 'var(--font-display)',
            color: 'var(--foreground)',
            lineHeight: 1.3,
          }}
        >
          {tr('errorBoundary.title')}
        </h2>
        <p
          style={{
            margin: '0 0 20px 0',
            fontSize: 'var(--font-size-body)', // body
            fontWeight: 400,
            color: 'var(--muted-foreground)',
            lineHeight: 1.45,
          }}
        >
          {tr('errorBoundary.copy')}
        </p>
        {/* `alignItems: center` — without it the column stretches both buttons to the card's
            full 352px, which is the phone submit-bar treatment (`.btn-touch`), not the crash
            screen's. They keep their intrinsic width and stay centred under the copy. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {onReset && (
            <button
              onClick={onReset}
              className="btn btn-outline"
              data-touch-target="true"
              type="button"
            >
              {tr('common.retry')}
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary"
            data-touch-target="true"
            type="button"
          >
            {tr('errorBoundary.reload')}
          </button>
        </div>
      </div>
    </div>
  )
}

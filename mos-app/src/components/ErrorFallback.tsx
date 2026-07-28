/**
 * ErrorFallback — UI for ErrorBoundary and RouteErrorBoundary.
 *
 * Uses DESIGN.md tokens (calm centered card with apologetic heading,
 * reload button, accessible). Exposed as a named export for reuse
 * by RouteErrorBoundary.
 *
 * harden (2026-07-28) — three defects on the app's LAST-RESORT recovery screen:
 *
 *  1. It made a claim the code does not honour. "The error has been logged and our team will
 *     look into it" — but `registerErrorSink()` is never called anywhere in the app, so
 *     `reportError` only reaches `console.error` on the user's own device. Nothing is
 *     transmitted; no team sees it. PRODUCT.md's brand commitment is explicit — "never invent
 *     numbers, claims, or customers in UI copy" — and telling a floor user their crash is
 *     already being handled is the most consequential place to be wrong, because it is the copy
 *     that stops them reporting it themselves. Replaced with what is actually true and with the
 *     one recovery instruction that helps.
 *  2. English only. Unlike every other surface, this one renders ABOVE `I18nProvider` when the
 *     top-level boundary catches, so `useT()` would silently fall back to English there. It
 *     therefore resolves the catalog against `readPersistedLocale()` — the same localStorage key
 *     the provider itself seeds from — which is correct in BOTH mount positions and cannot throw
 *     inside an already-crashed tree.
 *  3. 32px controls on a phone-first product whose stated floor is >=44px (PRODUCT.md
 *     Accessibility). The recovery buttons were the smallest targets in the app, on the screen
 *     reached with the least patience. Now >=44px on coarse pointers via the shared
 *     `data-touch-target` seam the rest of the app uses.
 */
import { messages } from '@/i18n/messages'
import { readPersistedLocale } from '@/i18n/I18nProvider'

export interface ErrorFallbackProps {
  onReset?: () => void
}

export function ErrorFallback({ onReset }: ErrorFallbackProps) {
  const locale = readPersistedLocale()
  const tr = (key: keyof typeof messages.en) => messages[locale][key] ?? messages.en[key]

  const buttonStyle = {
    minHeight: '44px',
    padding: '0 16px',
    borderRadius: 'var(--radius-sm)', // 8px control radius
    fontSize: 'var(--font-size-body-lg)',
    fontWeight: 600,
    cursor: 'pointer',
  } as const

  return (
    <div
      role="alert"
      className="error-boundary"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // R6-P2 (owner review r2): dvh so a mobile URL bar can't crop the centered card.
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
            fontSize: '18px', // subheading
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
            fontSize: '14px', // body
            fontWeight: 400,
            color: 'var(--muted-foreground)',
            lineHeight: 1.45,
          }}
        >
          {tr('errorBoundary.copy')}
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {onReset && (
            <button
              onClick={onReset}
              className="btn btn-outline"
              style={buttonStyle}
              data-touch-target="true"
              type="button"
            >
              {tr('common.retry')}
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary"
            style={buttonStyle}
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

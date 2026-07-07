/**
 * ErrorFallback — UI for ErrorBoundary and RouteErrorBoundary.
 *
 * Uses DESIGN.md tokens (calm centered card with apologetic heading,
 * reload button, accessible). Exposed as a named export for reuse
 * by RouteErrorBoundary.
 */

export interface ErrorFallbackProps {
  onReset?: () => void
}

export function ErrorFallback({ onReset }: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="error-boundary"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
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
          Something went wrong
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
          We apologize for the inconvenience. The error has been logged and our team will look into it.
        </p>
        {onReset && (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={onReset}
              className="btn btn-outline"
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: 'var(--radius-sm)', // 8px control radius
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              type="button"
            >
              Try again
            </button>
          </div>
        )}
        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary"
          style={{
            height: '32px',
            padding: '0 12px',
            borderRadius: 'var(--radius-sm)', // 8px control radius
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            ...(onReset ? { marginTop: '12px' } : {}),
          }}
          type="button"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
/**
 * Telemetry sink for error reporting — ADR-0010 D7 injection point.
 *
 * This is a ponytail-thin seam: all errors call reportError(), which
 * console.errors with a stable prefix, then forwards to a registered sink
 * (e.g., Sentry/PostHog adapter) without changing call sites.
 */

export type ErrorSink = (error: unknown, context?: Record<string, unknown>) => void

let sink: ErrorSink | null = null

const TELEMETRY_PREFIX = '[MOS-Telemetry]'

/**
 * Register a global error sink for telemetry. Future calls to reportError
 * will forward errors to this sink. Only one sink is active at a time.
 *
 * @param fn - The error sink function, or null to unregister.
 */
export function registerErrorSink(fn: ErrorSink | null): void {
  sink = fn
}

/**
 * Report an error to telemetry.
 *
 * Always console.errors with a stable prefix for local debugging.
 * If a sink is registered, forwards the error to it (e.g., Sentry/PostHog).
 * Never throws; safe to call from error boundaries.
 *
 * @param error - The error to report (Error, string, or unknown)
 * @param context - Optional structured context (componentStack, route, etc.)
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const errorInfo = normalizeError(error)

  // Always console.error with stable prefix for local debugging
  console.error(
    TELEMETRY_PREFIX,
    errorInfo.message,
    context ? { ...errorInfo.meta, ...context } : errorInfo.meta
  )

  // Forward to registered sink (e.g., Sentry/PostHog adapter)
  if (sink) {
    try {
      sink(error, context)
    } catch (sinkError) {
      // Sink should never throw; if it does, log but don't crash
      console.error(TELEMETRY_PREFIX, 'Error sink failed:', sinkError)
    }
  }
}

/**
 * Normalize an error into a consistent shape.
 */
function normalizeError(error: unknown): { message: string; meta: Record<string, unknown> } {
  if (error instanceof Error) {
    return {
      message: error.message,
      meta: {
        name: error.name,
        stack: error.stack,
      },
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
      meta: {},
    }
  }

  return {
    message: String(error),
    meta: { raw: error },
  }
}
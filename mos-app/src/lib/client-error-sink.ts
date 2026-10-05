import type { ErrorSink } from './telemetry'

export type ClientErrorReport = {
  message: string
  stack: string
  route: string
  releaseSha: string
  userAgent: string
}

export type ClientErrorSinkOptions = {
  isSignedIn: () => Promise<boolean>
  report: (error: ClientErrorReport) => Promise<void>
  releaseSha: string
  getRoute: () => string
  getUserAgent: () => string
}

const MESSAGE_LIMIT = 1000
const STACK_LIMIT = 8000
const ROUTE_LIMIT = 500
const USER_AGENT_LIMIT = 500

function sanitizeText(value: string, limit: number): string {
  return value
    .replace(/((?:https?:\/\/|\/)[^\s"'<>?#]+)\?[^\s"'<>#]*/gi, '$1')
    .replace(/\b((?:access|refresh|id)_token|token|password|authorization|api[_-]?key)\s*[:=]\s*[^\s,;)}]+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .slice(0, limit)
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
      stack: error.stack ?? '',
    }
  }
  if (typeof error === 'string') return { message: error, stack: '' }
  return { message: 'Unhandled non-Error value', stack: '' }
}

export function createClientErrorSink(options: ClientErrorSinkOptions): ErrorSink {
  return error => {
    void (async () => {
      try {
        if (!await options.isSignedIn()) return
        const details = describe(error)
        const route = options.getRoute().split(/[?#]/, 1)[0] ?? ''
        await options.report({
          message: sanitizeText(details.message, MESSAGE_LIMIT),
          stack: sanitizeText(details.stack, STACK_LIMIT),
          route: sanitizeText(route, ROUTE_LIMIT),
          releaseSha: sanitizeText(options.releaseSha, 64),
          userAgent: sanitizeText(options.getUserAgent(), USER_AGENT_LIMIT),
        })
      } catch {
        // Reporting is best-effort: telemetry must not create another app error.
      }
    })()
  }
}

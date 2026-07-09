// T5 — logStructuredError: the ONE structured-error-logging choke point for every edge
// function. Asserts a structured console.error line carrying {fn, errorCode, contextId?}
// and NEVER an arbitrary payload slot (a compile-time scrub, not just a runtime discipline).
import { describe, it, expect, vi, afterEach } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- edge-function shared module lives outside src/ (D7)
import { logStructuredError } from '../../../../supabase/functions/_shared/errorLog'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('_shared/errorLog — logStructuredError (T5)', () => {
  it('logs a structured line with fn + errorCode', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logStructuredError({ fn: 'compose-view', errorCode: 'MISSING_API_KEY' })
    expect(spy).toHaveBeenCalledWith('[compose-view] MISSING_API_KEY', { fn: 'compose-view', errorCode: 'MISSING_API_KEY' })
  })

  it('includes contextId when supplied', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logStructuredError({ fn: 'agent-chat', errorCode: 'UPSTREAM_ERROR', contextId: 'run-123' })
    expect(spy).toHaveBeenCalledWith('[agent-chat] UPSTREAM_ERROR', {
      fn: 'agent-chat',
      errorCode: 'UPSTREAM_ERROR',
      contextId: 'run-123',
    })
  })

  it('omits contextId entirely (no stray undefined key) when not supplied', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logStructuredError({ fn: 'compose-view', errorCode: 'X' })
    const loggedContext = spy.mock.calls[0][1] as Record<string, unknown>
    expect('contextId' in loggedContext).toBe(false)
  })
})

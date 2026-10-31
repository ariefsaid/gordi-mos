import { describe, expect, it, vi } from 'vitest'
import { installGlobalErrorListeners, type GlobalErrorTarget } from './global-error-listeners'

describe('global error listeners', () => {
  it('reports window errors and unhandled rejections with only the current path', () => {
    const eventTarget = new EventTarget()
    const target = Object.assign(eventTarget, { location: { pathname: '/tasks', search: '?token=secret' } }) as GlobalErrorTarget
    const report = vi.fn()
    const dispose = installGlobalErrorListeners(target, report)
    const error = new Error('render failed')
    const errorEvent = new ErrorEvent('error', { error, message: error.message })
    const rejectionEvent = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejectionEvent, 'reason', { value: 'async failed' })

    eventTarget.dispatchEvent(errorEvent)
    eventTarget.dispatchEvent(rejectionEvent)

    expect(report).toHaveBeenNthCalledWith(1, error, { route: '/tasks' })
    expect(report).toHaveBeenNthCalledWith(2, 'async failed', { route: '/tasks' })
    dispose()
    eventTarget.dispatchEvent(new ErrorEvent('error', { message: 'after cleanup' }))
    expect(report).toHaveBeenCalledTimes(2)
  })
})

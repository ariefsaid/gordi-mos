import { describe, expect, it, vi } from 'vitest'
import { createClientErrorSink } from './client-error-sink'

describe('client error sink', () => {
  it('sends only a signed-in error summary with a query-free route and release identity', async () => {
    const report = vi.fn().mockResolvedValue(undefined)
    const sink = createClientErrorSink({
      isSignedIn: vi.fn().mockResolvedValue(true),
      report,
      releaseSha: 'release-123',
      getRoute: () => '/tasks?token=route-secret',
      getUserAgent: () => 'test-agent',
    })

    sink(new Error('Request failed at https://mos.example/tasks?access_token=message-secret on /tasks?route-token=message-secret'), {
      password: 'must-not-be-sent',
    })
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())

    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Error: Request failed at https://mos.example/tasks on /tasks',
      stack: expect.not.stringContaining('access_token=message-secret'),
      route: '/tasks',
      releaseSha: 'release-123',
      userAgent: 'test-agent',
    }))
    expect(JSON.stringify(report.mock.calls)).not.toContain('must-not-be-sent')
  })

  it('does not send reports for signed-out users or throw when delivery fails', async () => {
    const report = vi.fn().mockRejectedValue(new Error('offline'))
    const signedOutSink = createClientErrorSink({
      isSignedIn: vi.fn().mockResolvedValue(false),
      report,
      releaseSha: 'release-123',
      getRoute: () => '/home',
      getUserAgent: () => 'test-agent',
    })
    expect(() => signedOutSink(new Error('ignored'))).not.toThrow()
    await Promise.resolve()
    expect(report).not.toHaveBeenCalled()

    const failingSink = createClientErrorSink({
      isSignedIn: vi.fn().mockResolvedValue(true),
      report,
      releaseSha: 'release-123',
      getRoute: () => '/home',
      getUserAgent: () => 'test-agent',
    })
    expect(() => failingSink(new Error('offline'))).not.toThrow()
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
  })
})

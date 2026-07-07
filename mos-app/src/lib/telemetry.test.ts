import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportError, registerErrorSink } from './telemetry'

describe('telemetry', () => {
  beforeEach(() => {
    // Clear any registered sink before each test
    registerErrorSink(null)
    vi.restoreAllMocks()
  })

  describe('reportError', () => {
    it('console.errors with a stable prefix when no sink is registered', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      reportError(error)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MOS-Telemetry]',
        'Test error',
        expect.objectContaining({
          name: 'Error',
          stack: expect.any(String),
        })
      )
    })

    it('forwards error to registered sink', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const sinkSpy = vi.fn()
      registerErrorSink(sinkSpy)

      const error = new Error('Test error')
      const context = { route: '/tasks', userId: '123' }

      reportError(error, context)

      expect(consoleSpy).toHaveBeenCalled() // Still console.errors
      expect(sinkSpy).toHaveBeenCalledWith(error, context)
    })

    it('normalizes Error instances with name, message, and stack', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      reportError(error)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MOS-Telemetry]',
        'Test error',
        expect.objectContaining({
          name: 'Error',
          stack: expect.any(String),
        })
      )
    })

    it('normalizes string errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      reportError('string error')

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MOS-Telemetry]',
        'string error',
        {}
      )
    })

    it('normalizes unknown errors to string', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      reportError({ custom: 'object' })

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MOS-Telemetry]',
        '[object Object]',
        { raw: { custom: 'object' } }
      )
    })

    it('includes context in console.error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      reportError('test', { route: '/home', userId: 'abc' })

      expect(consoleSpy).toHaveBeenCalledWith(
        '[MOS-Telemetry]',
        'test',
        { route: '/home', userId: 'abc' }
      )
    })

    it('never throws when sink throws', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      registerErrorSink(() => {
        throw new Error('Sink failed')
      })

      expect(() => reportError('test')).not.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MOS-Telemetry]',
        'Error sink failed:',
        expect.any(Error)
      )
    })

    it('handles null sink gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      registerErrorSink(null)

      expect(() => reportError('test')).not.toThrow()
      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('registerErrorSink', () => {
    it('replaces existing sink', () => {
      const sink1 = vi.fn()
      const sink2 = vi.fn()

      registerErrorSink(sink1)
      reportError('error1')
      expect(sink1).toHaveBeenCalledTimes(1)

      registerErrorSink(sink2)
      reportError('error2')
      expect(sink1).toHaveBeenCalledTimes(1) // unchanged
      expect(sink2).toHaveBeenCalledTimes(1)
    })

    it('null sink unregisters', () => {
      const sink = vi.fn()
      registerErrorSink(sink)

      registerErrorSink(null)
      reportError('error')

      expect(sink).not.toHaveBeenCalled()
    })
  })
})
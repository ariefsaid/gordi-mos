import { describe, it, expect } from 'vitest'
import { isNetworkError } from './network-error'

describe('isNetworkError', () => {
  it.each([
    new TypeError('Failed to fetch'), // Chromium
    new TypeError('NetworkError when attempting to fetch resource.'), // Firefox
    new TypeError('Load failed'), // Safari
    new Error('Network request failed'),
    { message: 'fetch failed' }, // a wrapped transport failure that is not an Error instance
  ])('recognises %o as a transport failure', (error) => {
    expect(isNetworkError(error)).toBe(true)
  })

  it.each([
    new TypeError("Cannot read properties of undefined (reading 'map')"),
    new Error('row level security policy violation'),
    { status: 500 },
    'boom',
    null,
    undefined,
  ])('leaves %o to the crash boundary', (error) => {
    expect(isNetworkError(error)).toBe(false)
  })
})

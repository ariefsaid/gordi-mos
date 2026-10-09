import { describe, it, expect } from 'vitest'
import { isModuleLoadError, isNetworkError } from './network-error'

describe('isModuleLoadError', () => {
  it.each([
    new TypeError('Failed to fetch dynamically imported module: /assets/page.js'), // Chromium
    new TypeError('error loading dynamically imported module: /assets/page.js'), // Firefox
    new TypeError('Importing a module script failed.'), // Safari
  ])('recognises %o as a module download failure', (error) => {
    expect(isModuleLoadError(error)).toBe(true)
  })

  it.each([
    new TypeError('Failed to fetch'),
    new Error('Importing a module was rejected by the page'),
    { message: 'Network request failed' },
  ])('leaves %o as an ordinary failure', (error) => {
    expect(isModuleLoadError(error)).toBe(false)
  })
})

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

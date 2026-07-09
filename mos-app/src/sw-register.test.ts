import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './sw-register'

describe('registerServiceWorker (T29)', () => {
  it('registers the app service worker on window load when supported', () => {
    const register = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))

    expect(register).toHaveBeenCalledWith('/mos/sw.js')
  })
})

import { describe, expect, it } from 'vitest'

describe('Vitest fetch/router constructor seam', () => {
  it('lets the Request constructor accept the signal created by AbortController', () => {
    const controller = new AbortController()

    expect(() => new Request('http://localhost/mos/other', { signal: controller.signal })).not.toThrow()
  })
})

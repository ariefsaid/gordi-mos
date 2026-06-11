import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// R2: jsdom has no real matchMedia — provide a default stub (matches: false) so
// useIsNarrow() doesn't throw. Individual tests override window.matchMedia as needed.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListenerCalled: false,
      addEventListenerCallbacks: [] as EventListenerOrEventListenerObject[],
      addEventListener: function (
        _type: string,
        cb: EventListenerOrEventListenerObject,
      ) {
        ;(this.addEventListenerCallbacks as EventListenerOrEventListenerObject[]).push(cb)
      },
      removeEventListener: function (
        _type: string,
        _cb: EventListenerOrEventListenerObject,
      ) {},
      dispatchEvent: () => false,
    }),
  })
}

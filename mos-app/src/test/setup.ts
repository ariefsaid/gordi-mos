import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom has no ResizeObserver — @tanstack/react-virtual needs it to observe the
// scroll element. A no-op stub lets the virtualizer mount; tests that assert
// windowing stub the scroll element's offsetHeight to seed a viewport.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

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
      removeEventListener: function () {},
      dispatchEvent: () => false,
    }),
  })
}

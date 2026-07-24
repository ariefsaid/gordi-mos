import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// React Router constructs navigation requests with the jsdom AbortSignal realm while
// Node's undici Request validates against its own AbortSignal constructor. These tests
// exercise client-side history/state only (no loaders), so omit that signal at the test
// boundary instead of producing unhandled cross-realm RequestInit failures.
if (typeof globalThis.Request !== 'undefined') {
  const NativeRequest = globalThis.Request
  globalThis.Request = class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init?.signal ? { ...init, signal: undefined } : init)
    }
  } as typeof Request
}

// Paired with css:false in vite.config.ts (the root overhead/contention fix), raise RTL's
// default async budget ONCE, GLOBALLY. Under parallel-test load the host event loop can be
// preempted long enough that the stock 1000ms waitFor lapses on even a trivial assertion
// (the original tasks-workspace flake was `await waitFor(() => screen.getByText('A task'))`
// after a resolved mock — pure starvation, never a logic race). A single global raise is the
// deterministic replacement for the per-test `waitFor(..., { timeout })` whack-a-mole that
// only moved the flake from file to file. 3000ms is comfortably under the default 5000ms
// test timeout and gives ~3x headroom once css:false has cut the per-env CPU.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
})

// Node 26+ no longer provides a global localStorage by default; jsdom does not
// inject one either. Several hooks (useTasksViewPref, useTheme)
// persist to localStorage, and tests call localStorage.clear() in beforeEach.
// Provide a minimal spec-compliant stub so the test environment is usable.
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  const store = new Map<string, string>()
  const localStorageStub: Storage = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k) },
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageStub,
    configurable: true,
    writable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageStub,
      configurable: true,
      writable: true,
    })
  }
}

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

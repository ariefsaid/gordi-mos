import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// Paired with css:false in vite.config.ts (the root overhead/contention fix), raise RTL's
// default async budget ONCE, GLOBALLY. Under parallel-test load the host event loop can be
// preempted long enough that the stock 1000ms waitFor lapses on even a trivial assertion
// (the original tasks-workspace flake was `await waitFor(() => screen.getByText('A task'))`
// after a resolved mock — pure starvation, never a logic race). A single global raise is the
// deterministic replacement for the per-test `waitFor(..., { timeout })` whack-a-mole that
// only moved the flake from file to file.
//
// Raised 3000 → 5000 (2026-07-30). 3000 was chosen to sit "comfortably under the default
// 5000ms test timeout" — but that left only 2000ms of slack, and on a shared CI runner the
// kitchen-plan `saved` assertion lapsed at 3078ms, i.e. exactly at this budget, reddening CI
// on a commit that touched no app code. The test timeout is now an explicit 15000ms
// (vite.config.ts), so 5000 here keeps a 3x margin beneath it instead of a 1.6x one.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})

// Node 26+ no longer provides a global localStorage by default; jsdom does not
// inject one either. Several hooks (useExpandPref, useTasksViewPref, useTheme)
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

// ci-guard probe: temporary, reverted in the next commit

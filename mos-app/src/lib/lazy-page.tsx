import { lazy, useState, type ComponentProps, type ComponentType, type LazyExoticComponent } from 'react'

// `lazyPage` is `React.lazy` plus the loader kept on the component. That is what lets the route
// tests prove WHICH module a split route resolves to — `preload()` and compare the export by
// identity — instead of trusting a name or a comment; it also gives a future prefetch-on-hover
// somewhere to hook in. `withSuspense` wraps each split element in the app's one sanctioned
// loading grammar (LoadingShell), so no route invents its own spinner.
//
// **Why the wrapper around React.lazy isn't just `lazy()`** (#802): `React.lazy` caches the
// resolved OR REJECTED module promise forever. If the browser was offline when a chunk import
// first ran, that lazy holds the rejection, and every later render — including the
// `ContentErrorBoundary`'s Retry remount — re-throws the same `TypeError: Failed to fetch
// dynamically imported module`. Offline is supposed to be recoverable inside the frame, so this
// wrapper stores each fresh `React.lazy(loader)` in `useState`: the boundary's Retry bumps its
// remount key, the wrapper mounts anew, `useState`'s initializer runs again, and the new lazy has
// not been rejected yet — so it re-runs the import. A resolved import is memoised in the outer
// `cached` slot so a later navigation to the same route resolves synchronously (no Suspense flash),
// and a rejected import is NOT memoised — that is the whole point.

/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors React.lazy's own type parameter */
type Preloadable<T extends ComponentType<any>> = ComponentType<ComponentProps<T>> & {
  /** The module loader, exposed so a test can resolve what this route actually renders. */
  preload: () => Promise<{ default: T }>
}

export function lazyPage<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): Preloadable<T> {
  let cached: { default: T } | undefined
  const cachingLoader = (): Promise<{ default: T }> => {
    if (cached !== undefined) return Promise.resolve(cached)
    return loader().then((mod) => {
      cached = mod
      return mod
    })
  }

  function LazyRoute(props: ComponentProps<T>) {
    const [Impl] = useState<LazyExoticComponent<T>>(() => lazy(cachingLoader))
    return <Impl {...(props as ComponentProps<T>)} />
  }
  const Wrapper = LazyRoute as unknown as Preloadable<T>
  Wrapper.preload = cachingLoader
  return Wrapper
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
// dynamically imported module`. Offline is supposed to be recoverable inside the frame, so a
// rejected import drops the shared `React.lazy`: the boundary's Retry bumps its remount key, the
// wrapper mounts anew, `useState`'s initializer finds no lazy and creates a fresh one, which
// re-runs the import. Every other mount reuses the one shared lazy, including React's own retry
// of a first mount that suspended: once it has resolved, later mounts render synchronously, and a
// retry never starts a new pending load (which an open `act` scope would wait on forever).

/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors React.lazy's own type parameter */
type Preloadable<T extends ComponentType<any>> = ComponentType<ComponentProps<T>> & {
  /** The module loader, exposed so a test can resolve what this route actually renders. */
  preload: () => Promise<{ default: T }>
}

export function lazyPage<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): Preloadable<T> {
  let cached: { default: T } | undefined
  let shared: LazyExoticComponent<T> | undefined
  const cachingLoader = (): Promise<{ default: T }> => {
    if (cached !== undefined) return Promise.resolve(cached)
    return loader().then((mod) => {
      cached = mod
      return mod
    })
  }
  const sharedLazy = (): LazyExoticComponent<T> => {
    shared ??= lazy(() =>
      cachingLoader().catch((error: unknown) => {
        shared = undefined
        throw error
      }),
    )
    return shared
  }

  function LazyRoute(props: ComponentProps<T>) {
    const [Impl] = useState(sharedLazy)
    return <Impl {...(props as ComponentProps<T>)} />
  }
  const Wrapper = LazyRoute as unknown as Preloadable<T>
  Wrapper.preload = cachingLoader
  return Wrapper
}
/* eslint-enable @typescript-eslint/no-explicit-any */

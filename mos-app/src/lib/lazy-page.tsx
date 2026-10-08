import { lazy, useState, type ComponentProps, type ComponentType, type LazyExoticComponent } from 'react'

// `lazyPage` is `React.lazy` plus the loader kept on the component. That is what lets the route
// tests prove WHICH module a split route resolves to — `preload()` and compare the export by
// identity — instead of trusting a name or a comment; it also gives a future prefetch-on-hover
// somewhere to hook in. `withSuspense` wraps each split element in the app's one sanctioned
// loading grammar (LoadingShell), so no route invents its own spinner.
//
// React.lazy caches a rejected promise. Drop the shared lazy after failure so an explicit remount
// gets a fresh wrapper; successful imports remain shared across mounts, including React's own
// retry of a first mount that suspended.

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

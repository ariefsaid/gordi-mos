import { useLayoutEffect } from 'react'

type InertLease = { count: number; wasInert: boolean }
const inertLeases = new WeakMap<HTMLElement, InertLease>()

/** Make the application root inert while one or more blocking overlays are active. */
export function useInertAppRoot(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return
    const appRoot = document.getElementById('root')
    if (!appRoot) return

    let lease = inertLeases.get(appRoot)
    if (!lease) {
      lease = { count: 0, wasInert: appRoot.hasAttribute('inert') }
      inertLeases.set(appRoot, lease)
    }
    lease.count += 1
    appRoot.setAttribute('inert', '')

    return () => {
      const current = inertLeases.get(appRoot)
      if (!current) return
      current.count -= 1
      if (current.count === 0) {
        if (current.wasInert) appRoot.setAttribute('inert', '')
        else appRoot.removeAttribute('inert')
        inertLeases.delete(appRoot)
      }
    }
  }, [active])
}

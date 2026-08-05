// router-home-stacked.test.tsx — the `/` index binding, post-#191.
// SHOW_HOME_STACKED is retired (config/features.ts): the `/` index route now always renders the
// ported (v4) HomePage, which superseded both prior `dev` compositions the flag used to switch
// between. This file is kept (rather than deleted) because its second assertion is still live and
// still worth locking: the DEV-only `/__home-stacked` preview route is unconditional on anything
// and still resolves to `StackedUnionHome`, so that component stays reachable for reference/visual
// diffing even though nothing routes a real viewer to it anymore.
import { isValidElement } from 'react'
import { describe, it, expect } from 'vitest'
import { routeConfig } from './router'
import { HomePage } from './pages/home-page'
import { StackedUnionHome } from './pages/stacked-union-home'

// Walk to the AppShell route's children (same lookup as router.test.tsx).
function shellChildren() {
  const protectedRoute = routeConfig.find(
    (r) =>
      Array.isArray(r.children) &&
      r.children.some((c) => Array.isArray(c.children) && c.children.some((cc) => cc.path === 'tasks')),
    )!
  const shell = protectedRoute.children!.find((c) => Array.isArray(c.children))!
  return shell.children!
}

describe('post-#191: the `/` index route is unconditionally the ported HomePage', () => {
  it('the `/` index route renders HomePage', () => {
    const children = shellChildren()
    const index = children.find((r) => r.index === true)!
    expect(index).toBeDefined()
    expect(isValidElement(index.element)).toBe(true)
    if (!isValidElement(index.element)) throw new Error('index route element is not a React element')
    expect(index.element.type).toBe(HomePage)
  })

  it('the DEV-only /__home-stacked preview route still renders the stacked-union Home', () => {
    const children = shellChildren()
    const preview = children.find((r) => r.path === '__home-stacked')
    expect(preview).toBeDefined()
    expect(isValidElement(preview!.element)).toBe(true)
    if (!isValidElement(preview!.element)) throw new Error('preview route element is not a React element')
    expect(preview!.element.type).toBe(StackedUnionHome)
  })
})

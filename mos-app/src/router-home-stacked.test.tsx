// router-home-stacked.test.tsx — the SHOW_HOME_STACKED flag branch (AC-HS15).
// Locks the binding safety property: with the REAL default flag (false in features.ts), the `/`
// index route renders Home v1 (HomePage) — the stacked composition never reaches production `/`
// until the owner flips the flag. Also confirms the DEV-only preview route resolves to the stacked
// component so e2e + visual verification is deterministic regardless of the flag.
//
// NOTE: this file deliberately does NOT mock `./config/features` (unlike router.test.tsx) so the
// real default value of SHOW_HOME_STACKED is exercised.
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

describe('AC-HS15: SHOW_HOME_STACKED flag branch (v1 stays default; DEV preview)', () => {
  it('the `/` index route renders Home v1 (HomePage) while the flag is off (default)', () => {
    const children = shellChildren()
    const index = children.find((r) => r.index === true)!
    expect(index).toBeDefined()
    expect(isValidElement(index.element)).toBe(true)
    if (!isValidElement(index.element)) throw new Error('index route element is not a React element')
    expect(index.element.type).toBe(HomePage)
  })

  it('the DEV-only /__home-stacked preview route renders the stacked-union Home', () => {
    const children = shellChildren()
    const preview = children.find((r) => r.path === '__home-stacked')
    expect(preview).toBeDefined()
    expect(isValidElement(preview!.element)).toBe(true)
    if (!isValidElement(preview!.element)) throw new Error('preview route element is not a React element')
    expect(preview!.element.type).toBe(StackedUnionHome)
  })
})

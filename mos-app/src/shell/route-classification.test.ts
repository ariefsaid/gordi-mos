// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flattenRoutes } from '@/test/route-table'

describe('route classification', () => {
  it("each redirect's declared target matches the path its element actually forwards to", () => {
    // The handle is metadata; the element is the behaviour. Nothing keeps them in step except
    // this, and a handle that disagrees with its element is a comment that lies.
    const declared = flattenRoutes()
      .filter(({ route }) => (route.handle as { kind?: string } | undefined)?.kind === 'redirect')
      .map(({ path, route }) => ({ path, route, target: (route.handle as { target: string }).target }))
    expect(declared.length).toBeGreaterThan(15)

    for (const { path, route, target } of declared) {
      const element = route.element as { props?: { to?: string } } | undefined
      expect(element?.props?.to, `${path} declares ${target}`).toBe(target)
    }
  })
})

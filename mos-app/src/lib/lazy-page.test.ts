import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// First-load weight: the assistant panel (markdown renderer) and Home must stay out of the eager
// import graph of the router and shell; they load through lazyPage.
const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8')
const staticImports = (src: string) =>
  [...src.matchAll(/^import[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])

describe('eager import path', () => {
  it('shell does not statically import the assistant panel', () => {
    expect(staticImports(read('shell/app-shell.tsx')).filter((s) => /assistant/i.test(s))).toEqual([])
  })
  it('router does not statically import Home', () => {
    expect(staticImports(read('router.tsx')).filter((s) => /home-page/.test(s))).toEqual([])
  })
})

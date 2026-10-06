import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement, Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { lazyPage } from './lazy-page'

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

describe('lazyPage', () => {
  // React retries a suspended first mount by mounting it again. That retry must find the import
  // already resolved; if it starts a new pending load, an open `act` scope never settles.
  it('renders an import that resolves while an act scope is open', { timeout: 5000 }, async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const Page = lazyPage(() => gate.then(() => ({ default: () => createElement('p', null, 'page loaded') })))
    render(createElement(Suspense, { fallback: null }, createElement(Page)))

    await act(async () => {
      release()
      await gate
    })

    expect(screen.getByText('page loaded')).toBeInTheDocument()
  })
})

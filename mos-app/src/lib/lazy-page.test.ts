import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement, Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
  it('delivers a rejected first import to the error boundary without loading again', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader = vi.fn(() => new Promise<{ default: () => null }>((_resolve, reject) => {
      setTimeout(() => reject(new TypeError('Failed to fetch dynamically imported module')), 0)
    }))
    const Page = lazyPage(loader)
    try {
      render(createElement(ErrorBoundary, {
        fallback: createElement('p', null, 'Retry page download'),
        children: createElement(Suspense, { fallback: createElement('p', null, 'Loading page') }, createElement(Page)),
      }))
      expect(await screen.findByText('Retry page download', {}, { timeout: 1000 })).toBeInTheDocument()
      expect(loader).toHaveBeenCalledTimes(1)
    } finally {
      consoleError.mockRestore()
    }
  })

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

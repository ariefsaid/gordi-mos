import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const css = read('src/pages/cafe-receive-page.css').replace(/\/\*[\s\S]*?\*\//g, '')
const layout = read('src/components/kitchen/cafe-capture-layout.css').replace(/\/\*[\s\S]*?\*\//g, '')
const pageSources = {
  count: read('src/pages/cafe-count-page.tsx'),
  receive: read('src/pages/cafe-receive-page.tsx'),
  request: read('src/pages/cafe-request-page.tsx'),
  log: read('src/pages/kitchen-log-page.tsx'),
  waste: read('src/pages/cafe-waste-page.tsx'),
}

describe('Capture pages reuse shared layout without cross-page stylesheet dependencies', () => {
  it('routes every capture surface through the shared table component', () => {
    for (const source of [pageSources.count, pageSources.receive, pageSources.request, pageSources.log, pageSources.waste]) {
      expect(source).toMatch(/CafeCaptureTable/)
    }
    expect(pageSources.count).toMatch(/CafeCaptureQuantityControl/)
    expect(pageSources.receive).toMatch(/CafeCaptureQuantityControl/)
    expect(pageSources.request).toMatch(/CafeCaptureQuantityControl/)
  })

  it('keeps each page from importing another capture page stylesheet', () => {
    expect(pageSources.count).not.toMatch(/cafe-count-page\.css/)
    expect(pageSources.receive).not.toMatch(/cafe-count-page\.css|cafe-request-page\.css|kitchen-log-page\.css/)
    expect(pageSources.request).not.toMatch(/cafe-count-page\.css|cafe-receive-page\.css|kitchen-log-page\.css/)
    expect(pageSources.waste).not.toMatch(/kitchen-log-page\.css/)
  })

  it('keeps row, table and footer geometry in the shared capture skin', () => {
    expect(layout).toMatch(/\.cafe-capture-table \.dt-table\s*\{/)
    expect(layout).toMatch(/\.cafe-capture-row\s*\{/)
    expect(layout).toMatch(/\.cafe-capture-footer/)
    expect(css).not.toMatch(/\.cafe-count__list|\.cafe-count__row|\.cafe-count__quantity-control/)
    expect(css).toMatch(/\.cafe-receive__open-pos\s*\{/)
    expect(css).toMatch(/\.cafe-receive__damage-flag\s*\{/)
  })
})

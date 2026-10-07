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
    expect(layout).not.toMatch(/bottom:\s*-(?:48|40)px|margin-bottom:\s*-(?:48|40)px/)
  })

  it('owns Production and Waste draft notices once in the shared skin', () => {
    const logCss = read('src/pages/kitchen-log-page.css')
    const wasteCss = read('src/pages/cafe-waste-page.css')
    expect(layout.match(/\.kl-capture-draft-list\s*\{/g)).toHaveLength(1)
    expect(layout).toMatch(/\.kl-capture-draft-notice\s*\{/)
    expect(logCss).not.toContain('.kl-capture-draft-')
    expect(wasteCss).not.toContain('.kl-capture-draft-')
  })
})

describe('Receive arrival date on phones', () => {
  it('keeps the localized arrival date field wide on phones by moving its hint below', () => {
    const phoneStart = css.indexOf('@media (max-width: 639px)')
    expect(phoneStart).toBeGreaterThanOrEqual(0)
    const phone = css.slice(phoneStart)
    expect(phone).toMatch(/\.cafe-receive__date\s*\{\s*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s*;\s*gap:\s*8px\s*;\s*\}/)
    expect(phone).toMatch(/\.cafe-receive__date-hint\s*\{\s*grid-column:\s*2\s*;\s*\}/)
  })
})

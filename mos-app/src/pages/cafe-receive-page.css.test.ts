import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const css = read('src/pages/cafe-receive-page.css').replace(/\/\*[\s\S]*?\*\//g, '')
const layout = read('src/components/kitchen/cafe-capture-layout.css').replace(/\/\*[\s\S]*?\*\//g, '')
const controls = read('src/components/kitchen/cafe-capture-controls.css').replace(/\/\*[\s\S]*?\*\//g, '')
const tableCss = read('src/components/dashboard/data-table.css').replace(/\/\*[\s\S]*?\*\//g, '')
const captureTable = read('src/components/kitchen/cafe-capture-table.tsx')
const pageSources = {
  count: read('src/pages/cafe-count-page.tsx'),
  receive: read('src/pages/cafe-receive-page.tsx'),
  request: read('src/pages/cafe-request-page.tsx'),
  waste: read('src/pages/cafe-waste-page.tsx'),
}

describe('Capture pages reuse shared layout without cross-page stylesheet dependencies', () => {
  it('keeps quantity controls on directly entered capture pages', () => {
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
    expect(css).not.toMatch(/\.cafe-count__list|\.cafe-count__row/)
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

describe('Receive rows use shared capture geometry on direct entry', () => {
  it('loads the capture-control skin directly and uses its fixed quantity width and height', () => {
    expect(pageSources.receive).toMatch(/^import '@\/components\/kitchen\/cafe-capture-controls\.css'$/m)
    expect(pageSources.receive).toMatch(/className="cafe-capture-page cafe-count cafe-receive"/)
    expect(controls).toMatch(/\.cafe-count \.cafe-capture-quantity-field\s*\{[^}]*width:\s*var\(--cafe-capture-quantity-width\)[^}]*height:\s*var\(--cafe-capture-control-height\)/)
  })

  it('keeps the unit beside the fixed-width field without a Receive grid column', () => {
    expect(captureTable).toMatch(/className="cafe-count__quantity-control">\s*<input[\s\S]*?className="cafe-capture-quantity-field"[\s\S]*?<span className="cafe-count__unit cafe-capture-unit"/)
    expect(layout).toMatch(/\.cafe-count__quantity-control\s*\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.cafe-receive \.cafe-count__quantity-control\s*\{[^}]*width:\s*max-content/)
    expect(css).not.toMatch(/\.cafe-receive \.cafe-count__quantity-control\s*\{[^}]*grid-template-columns/)
  })

  it('keeps the Received table label muted through the shared table skin', () => {
    expect(tableCss).toMatch(/\.dt-table thead th\s*\{[^}]*color:\s*var\(--muted-foreground\)/)
  })

  it('sets the open-PO section and toolbar to the row and sticky-band measure', () => {
    expect(css).toMatch(/\.cafe-receive__open-pos,\s*\.cafe-receive \.ktb\s*\{[^}]*width:\s*min\(100%,\s*var\(--cafe-capture-content-measure\)\)[^}]*max-width:\s*var\(--cafe-capture-content-measure\)/)
    expect(layout).toMatch(/\.cafe-capture-table\s*\{[^}]*width:\s*min\(100%,\s*var\(--cafe-capture-content-measure/)
    expect(layout).toMatch(/\.cafe-capture-footer,[\s\S]*?width:\s*min\(100%,\s*var\(--cafe-capture-content-measure/)
  })
})

describe('Receive arrival date on phones', () => {
  it('keeps the localized arrival date field wide on phones without repeating its value', () => {
    const phoneStart = css.indexOf('@media (max-width: 639px)')
    expect(phoneStart).toBeGreaterThanOrEqual(0)
    const phone = css.slice(phoneStart)
    expect(phone).toMatch(/\.cafe-receive__date\s*\{\s*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s*;\s*gap:\s*8px\s*;\s*\}/)
    expect(pageSources.receive).toMatch(/<DateField[\s\S]*?\bfullWidth\b/)
    expect(css).not.toContain('.cafe-receive__date-hint')
  })
})

describe('Café review and entry pages share their field grammar', () => {
  it('aligns review queue bodies with the page gutter', () => {
    expect(layout).toMatch(/\.cafe-capture-review-page\s*\{[^}]*padding:\s*20px 0 0/)
  })

  it('uses the shared DateField without repeating the selected date below it', () => {
    expect(pageSources.receive).toMatch(/<DateField/)
    expect(pageSources.request).toMatch(/<DateField/)
    expect(css).not.toContain('.cafe-receive__date-hint')
  })
})

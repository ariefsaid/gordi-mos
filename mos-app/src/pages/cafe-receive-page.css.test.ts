// Receive reuses the Count row (cafe-count-page.css) and the shared Café capture controls. These pin
// what that reuse needs: the shared stylesheet loaded by Receive itself, the unit beside its box,
// a muted field label, and one measure for every block above and inside the row list.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')
const css = stripComments(read('src/pages/cafe-receive-page.css'))
const countCss = stripComments(read('src/pages/cafe-count-page.css'))
const aliases = read('src/styles/tokens/aliases.css')
const tsx = read('src/pages/cafe-receive-page.tsx')
const requestTsx = read('src/pages/cafe-request-page.tsx')
const requestRow = read('src/components/kitchen/cafe-item-quantity-row.tsx')

function rule(selector: string, source = css): string {
  const index = source.indexOf(`${selector} {`)
  expect(index, `expected a ${selector} rule`).toBeGreaterThanOrEqual(0)
  const open = source.indexOf('{', index)
  return source.slice(open + 1, source.indexOf('}', open))
}

describe('Receive capture rows match the shared Café capture layout', () => {
  it('loads the shared capture-controls stylesheet itself, so its height never depends on the page visited before', () => {
    expect(tsx).toMatch(/^import '@\/components\/kitchen\/cafe-capture-controls\.css'$/m)
    expect(tsx).toMatch(/className="cafe-capture-quantity-field"/)
    expect(tsx).toMatch(/className="cafe-count__unit cafe-capture-unit"/)
  })

  it('loads shared capture controls for Request rows and applies their field and unit classes', () => {
    expect(requestTsx).toMatch(/<CafeItemQuantityRow\b/)
    expect(requestRow).toMatch(/^import ['"]@\/components\/kitchen\/cafe-capture-controls\.css['"]$/m)
    expect(requestRow).toMatch(/className="cafe-capture-quantity-field"/)
    expect(requestRow).toMatch(/className="cafe-count__unit cafe-capture-unit"/)
  })

  it('keeps the unit beside its box on the shared quantity width (no Receive column override)', () => {
    expect(rule('.cafe-count__quantity-control', countCss))
      .toMatch(/grid-template-columns:\s*var\(--cafe-capture-quantity-width,\s*7\.5rem\)\s+110px/)
    expect(css).not.toMatch(/\.cafe-count__quantity-control\s*\{[^}]*grid-template-columns/)
    expect(css).not.toMatch(/\.cafe-receive \.cafe-count__row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*360px\)/)
  })

  it('keeps an invalid row\'s field group whole instead of dissolving it into the row grid', () => {
    const invalidGroup = '.cafe-receive .cafe-count__row:has(.cafe-count__field-error) .cafe-count__input-group'
    expect(rule(invalidGroup)).toMatch(/display:\s*flex/)
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{\s*\.cafe-receive \.cafe-count__row:has\(\.cafe-count__field-error\) \.cafe-count__input-group\s*\{\s*display:\s*grid/)
  })

  it('keeps the visible Received label muted at the label size', () => {
    const label = rule('.cafe-receive .cafe-count__input-group > label')
    expect(label).toMatch(/color:\s*var\(--muted-foreground\)/)
    expect(label).toMatch(/font-size:\s*var\(--font-size-label\)/)
  })

  it('uses the shared content-measure token for the list, footer and Receive blocks', () => {
    expect(aliases).toMatch(/--cafe-capture-content-measure:\s*772px/)
    expect(rule('.cafe-count__list', countCss)).toContain('max-width: var(--cafe-capture-content-measure)')
    expect(countCss).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*?\.cafe-count__footer\s*\{[^}]*width:\s*min\(100%,\s*var\(--cafe-capture-content-measure\)\)/)
    const capped = rule('.cafe-receive__open-pos,\n.cafe-receive .ktb,\n.cafe-receive__counted,\n.cafe-receive__recent')
    expect(capped).toContain('max-width: var(--cafe-capture-content-measure)')
    expect(`${countCss}${css}`).not.toContain('772px')
  })
})

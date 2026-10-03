import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/shell/rail-nav.css'), 'utf8')
const childList = css.match(/\.rail-item-children\s*\{([^}]*)\}/)?.[1] ?? ''

describe('the rail child list', () => {
  it('keeps its tokenized indent without drawing a hairline', () => {
    expect(childList).toContain('margin-left: var(--rail-child-guide-x)')
    expect(childList).toContain('padding-left: var(--rail-child-pad)')
    expect(childList).not.toMatch(/\b(?:border|box-shadow)\b/)
  })
})

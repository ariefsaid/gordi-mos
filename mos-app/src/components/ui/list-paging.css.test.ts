import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/ui/list-paging.css'), 'utf8')

function ruleBody(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('ListPaging responsive and error styles', () => {
  it('reserves the error message space and uses the established error text token', () => {
    const error = ruleBody('.list-paging p.list-paging__error')
    expect(error).toMatch(/min-height:\s*\d+(?:\.\d+)?em/)
    expect(error).toMatch(/color:\s*var\(--status-lost-text\)/)
    expect(ruleBody('.list-paging__error--hidden')).toMatch(/visibility:\s*hidden/)
  })

  it('keeps the load-more target at least 44px on touch layouts including 768px', () => {
    const touchRule = css.match(/@media[^{]*pointer:\s*coarse[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\),\s*\(max-width:\s*768px\)/)
    expect(touchRule).toMatch(/\.list-paging \.btn\s*\{[^}]*min-height:\s*44px/)
  })
})

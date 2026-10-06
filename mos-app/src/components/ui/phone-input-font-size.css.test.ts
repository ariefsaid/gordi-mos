import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function blockAfter(source: string, marker: string): string {
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Missing CSS marker: ${marker}`)
  const open = source.indexOf('{', start)
  if (open < 0) throw new Error(`Missing CSS block for: ${marker}`)

  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`Unterminated CSS block for: ${marker}`)
}

describe('phone text-control type floor', () => {
  it('keeps text inputs, textareas, and selects at least 16px through the shared phone rule', () => {
    const tokenMatch = /--font-size-touch-input:\s*(\d+(?:\.\d+)?)px/.exec(css)
    expect(tokenMatch, 'shared touch-input token').not.toBeNull()
    expect(Number(tokenMatch?.[1])).toBeGreaterThanOrEqual(16)

    const phoneRule = blockAfter(css, '@media (max-width: 768px)')
    const selector = '#root :is('
    const controlRule = blockAfter(phoneRule, selector)

    expect(phoneRule).toContain('input:not(')
    expect(phoneRule).toContain('textarea')
    expect(phoneRule).toContain('select')
    expect(controlRule).toMatch(/font-size:\s*var\(--font-size-touch-input\)/)
  })
})

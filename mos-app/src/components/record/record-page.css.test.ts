import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/record/record-page.css'), 'utf8')
const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBody(selector: RegExp): string {
  const match = selector.exec(uncommented)
  if (!match) throw new Error(`Missing CSS rule: ${selector}`)
  const open = uncommented.indexOf('{', match.index)
  let depth = 0
  for (let i = open; i < uncommented.length; i += 1) {
    if (uncommented[i] === '{') depth += 1
    if (uncommented[i] === '}' && --depth === 0) return uncommented.slice(open + 1, i)
  }
  throw new Error(`Unclosed CSS rule: ${selector}`)
}

describe('record-page typography and measure', () => {
  it('uses the documented 1180px readable measure for the page, chrome, and skeleton', () => {
    expect(ruleBody(/\.rp--page\s*\{/)).toMatch(/max-width:\s*1180px/)
    expect(uncommented).toMatch(/\.page-frame__content:has\(\.rp--page, \.rp--skeleton\) \.record-page-chrome\s*\{[^}]*max-width:\s*1180px/)
    expect(ruleBody(/\.rp--skeleton\s*\{/)).toMatch(/max-width:\s*1180px/)
  })

  it('centers the 720px reading column and 300px aside inside the page measure', () => {
    expect(uncommented).toMatch(/\.rp--page \.rp-body\s*\{\s*grid-template-columns:\s*minmax\(0,\s*720px\)\s+300px;\s*justify-content:\s*center;/)
  })

  it('sets section, setup, and disclosure headings on the existing subheading rung', () => {
    for (const selector of [/\.rp-section__title\s*\{/, /\.rp-setup__title\s*\{/, /\.rp-disclosure\s*\{/]) {
      const body = ruleBody(selector)
      expect(body).toMatch(/font-family:\s*var\(--font-display\)/)
      expect(body).toMatch(/font-size:\s*var\(--font-size-subheading\)/)
      expect(body).toMatch(/font-weight:\s*600/)
    }
  })
})

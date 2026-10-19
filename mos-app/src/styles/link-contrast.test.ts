// Accessibility (WCAG AA 4.5:1): text links read in the readable link token, never the action fill (#1714).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens/round1.css'), 'utf8')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return path.endsWith('.css') ? [path] : []
  })
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('text link contrast', () => {
  it('the dark readable link token reaches 4.5:1 on every dark surface', () => {
    const dark = tokens.slice(tokens.indexOf('\n.dark {'))
    const value = (name: string) => new RegExp(`--mos-${name}: (#[0-9a-f]{6})`, 'i').exec(dark)![1]!
    const link = value('accent-hover')
    for (const surface of ['canvas', 'surface', 'band', 'hover']) {
      expect(contrast(link, value(surface))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('no stylesheet colours text with the action fill', () => {
    const offenders = cssFiles(resolve(process.cwd(), 'src'))
      .filter(file => /(?<![-\w])color:\s*var\(--primary\)/.test(readFileSync(file, 'utf8')))
      // SortIndicator is a glyph, not text.
      .filter(file => !file.endsWith('SortIndicator.css'))
    expect(offenders).toEqual([])
  })
})

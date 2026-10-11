// Recipe names are the primary links on a dark or light surface: they use the AA-safe link text token.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'cafe-recipes.css'), 'utf8')

describe('cafe-recipes.css', () => {
  it('recipe links use the readable link token, not the action fill', () => {
    const body = css.slice(css.indexOf('.cafe-recipes__open {'), css.indexOf('}', css.indexOf('.cafe-recipes__open {')))
    expect(body).toContain('color: var(--text-on-accent-tint)')
    expect(body).not.toContain('var(--primary)')
  })
})

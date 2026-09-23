/**
 * GUARD — Pins #703: any underline rule in the Signal feed stylesheet makes feed copy appear
 * interactive when it is not. This whole-file assertion catches a reintroduced hover underline.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const css = stripComments(
  readFileSync(resolve(__dirname, 'signal-feed-rows.css'), 'utf8'),
)

describe('GUARD #703: Signal feed copy never underlines', () => {
  it('rejects any text-decoration underline rule in the stylesheet', () => {
    expect(css).not.toMatch(/text-decoration:\s*underline/)
  })
})

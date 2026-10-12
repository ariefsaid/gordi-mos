import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-count-review-queue.css'), 'utf8')

describe('Café count review empty action', () => {
  it('places the outlined refresh below its empty-state explanation', () => {
    expect(css).toMatch(/\.cafe-count-review__empty\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*flex-start/)
  })
})

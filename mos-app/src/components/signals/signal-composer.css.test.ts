import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'signal-composer.css'), 'utf8')

describe('SignalComposer visual roles', () => {
  it('uses readable secondary text for the persistent occurrence hint', () => {
    const rule = css.match(/\.signal-composer-field-hint\s*\{([^}]*)\}/s)?.[1] ?? ''

    expect(rule).toContain('color: var(--muted-foreground)')
    expect(rule).not.toContain('var(--text-light)')
  })
})

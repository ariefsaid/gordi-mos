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

  // #855 defect #7/#29: below 16px, mobile Safari zooms the viewport on focus. The textarea (14px
  // base) and the datetime-local input (15px base) must both step up to the reserved
  // --font-size-touch-input rung inside the phone media query.
  it('steps the textarea and datetime input up to --font-size-touch-input on phone', () => {
    const phoneBlock = css.match(/@media \(max-width: 767\.98px\) \{([\s\S]*)\}\s*$/)?.[1] ?? ''
    expect(phoneBlock).toMatch(/\.signal-composer-mention-anchor textarea\s*\{[^}]*font-size:\s*var\(--font-size-touch-input\)/)
    expect(phoneBlock).toMatch(/\.signal-composer-datetime input\s*\{[^}]*font-size:\s*var\(--font-size-touch-input\)/)
  })

  // #855 defect #5: "Shift+Enter to send" is a keyboard hint — hide it without a real keyboard,
  // not only under a coarse (touch) pointer.
  it('hides the Shift+Enter hint under (hover: none), (pointer: coarse) — not pointer: coarse alone', () => {
    expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\) \{\s*\.signal-composer-send-hint/)
  })
})

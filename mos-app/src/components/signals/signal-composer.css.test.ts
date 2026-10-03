import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'signal-composer.css'), 'utf8')
const dateFieldCss = readFileSync(resolve(__dirname, '../ui/DateField.css'), 'utf8')

describe('SignalComposer visual roles', () => {
  it('uses readable secondary text for the persistent occurrence hint', () => {
    const rule = css.match(/(?:^|\n)\.signal-composer-field-hint\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rule).toContain('color: var(--muted-foreground)')
    expect(rule).not.toContain('var(--text-light)')
  })

  // Below 16px, mobile Safari zooms on focus. The date and time controls keep readable text
  // and a 44px touch floor on phone.
  it('gives the occurred date and time controls a 44px floor and touch-input text on phone', () => {
    const phoneBlock = css.match(/@media \(max-width: 767\.98px\) \{([\s\S]*)\}\s*$/)?.[1] ?? ''
    expect(phoneBlock).toMatch(/\.signal-composer-mention-anchor textarea\s*\{[^}]*font-size:\s*var\(--font-size-touch-input\)/)
    expect(phoneBlock).toMatch(/\.signal-composer-time\s*\{[^}]*min-height:\s*44px/)
    expect(phoneBlock).toMatch(/\.signal-composer-time\s*\{[^}]*font-size:\s*var\(--font-size-touch-input\)/)
    const datePhoneBlock = dateFieldCss.match(/@media \(max-width: 767\.98px\) \{([\s\S]*)\}\s*$/)?.[1] ?? ''
    expect(datePhoneBlock).toMatch(/\.mk-date__field[^}]*font-size:\s*var\(--font-size-touch-input\)/)
    expect(datePhoneBlock).toMatch(/\.mk-date__box[^}]*min-height:\s*44px/)
    expect(datePhoneBlock).toMatch(/\.mk-date__cal[^}]*min-height:\s*44px/)
  })

  it('keeps desktop Signal date validation on a second row while the controls share one alignment', () => {
    expect(css).toMatch(/grid-template-areas:\s*"label date time hint"\s*"\. error \. \."/)
    expect(css).toMatch(/\.signal-composer-occurred-pill \.mk-date\s*\{\s*display:\s*contents;\s*\}/)
  })

  // "Shift+Enter to send" is a keyboard hint — hide it without a real keyboard, not only under a
  // coarse (touch) pointer.
  it('hides the Shift+Enter hint under (hover: none), (pointer: coarse) — not pointer: coarse alone', () => {
    expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\) \{\s*\.signal-composer-send-hint/)
  })
})

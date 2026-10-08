import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/money/pending-bill-payment-form.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const textInputCss = readFileSync(resolve(process.cwd(), 'src/components/ui/TextInput.css'), 'utf8')
const dateFieldCss = readFileSync(resolve(process.cwd(), 'src/components/ui/DateField.css'), 'utf8')

const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null
}

describe('pending bill payment form field sizing', () => {
  it('stretches the amount input to match the shared 32px date and text field boxes', () => {
    expect(textInputCss).toMatch(/\.mk-textinput__box\s*\{[^}]*height:\s*32px/)
    expect(dateFieldCss).toMatch(/\.mk-date__box\s*\{[^}]*height:\s*32px/)
    expect(dateFieldCss).toMatch(/\.mk-date__field\s*\{[^}]*align-self:\s*stretch/)
    expect(rule('.pending-bill-payment-form__amount .mk-textinput__field') ?? '').toMatch(/align-self:\s*stretch/)
  })

  it('keeps the native proof field full-width, tappable and on the shared field surface', () => {
    const input = rule(".pending-bill-payment-form__proof input[type='file']") ?? ''
    expect(input).toMatch(/width:\s*100%/)
    expect(input).toMatch(/min-height:\s*44px/)
    expect(input).toMatch(/border:\s*1px solid var\(--input\)/)
  })

  it('styles the native file chooser button with the shared control surface tokens', () => {
    const button = rule(".pending-bill-payment-form__proof input[type='file']::file-selector-button") ?? ''
    expect(button).toMatch(/border:\s*1px solid var\(--border\)/)
    expect(button).toMatch(/border-radius:\s*var\(--radius-sm\)/)
    expect(button).toMatch(/background:\s*var\(--secondary\)/)
    expect(button).toMatch(/color:\s*var\(--foreground\)/)
  })
})

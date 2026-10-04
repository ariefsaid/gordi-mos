import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'report-missing-item.css'), 'utf8')

describe('ReportMissingItem phone field', () => {
  it('keeps the actual focused text input at the touch-input floor without disabling zoom', () => {
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*?\.kl-missing-form \.mk-textinput__field\s*\{\s*font-size:\s*var\(--font-size-touch-input\)/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// I4: WCAG-AA regression lock for the create-form error TEXT.
// DESIGN.md §field-error + plan §6.6 ratified --field-error-text =
// --status-lost-text (hsl(0 72% 45%)) for the helper/error LINE below a field:
// base --destructive (~3.6:1) fails AA as small text on white; the darkened red
// clears AA (≥4.5:1). The invalid field's *outline*/asterisk may stay
// --destructive (non-text affordance), but the error/submit-error TEXT must not.
const cssPath = resolve(process.cwd(), 'src/components/tasks/TaskSurface.css')
const css = readFileSync(cssPath, 'utf8')

function ruleBody(selector: string): string {
  // grab the {...} block following the selector
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector} in TaskSurface.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('TaskSurface.css — field-error text uses the AA token (I4)', () => {
  it('.tc-field-error color uses --status-lost-text (the AA-darkened red), not base --destructive', () => {
    const body = ruleBody('.tc-field-error')
    expect(body).toMatch(/color:\s*hsl\(var\(--status-lost-text\)\)/)
    expect(body).not.toMatch(/color:\s*hsl\(var\(--destructive\)\)/)
  })

  it('.tc-submit-error text color uses --status-lost-text, not base --destructive', () => {
    const body = ruleBody('.tc-submit-error')
    expect(body).toMatch(/color:\s*hsl\(var\(--status-lost-text\)\)/)
    // the tinted background may still reference --destructive (e.g. /0.10),
    // but the standalone text `color:` must be the AA token.
    expect(body).not.toMatch(/color:\s*hsl\(var\(--destructive\)\)\s*;/)
  })
})

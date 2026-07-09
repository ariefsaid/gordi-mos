import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const buttonCss = readFileSync(resolve(process.cwd(), 'src/components/ui/Button.css'), 'utf8')
const windowSelectorCss = readFileSync(resolve(process.cwd(), 'src/components/dashboard/window-selector.css'), 'utf8')
const cutToggleCss = readFileSync(resolve(process.cwd(), 'src/components/dashboard/cut-toggle.css'), 'utf8')

function mediaBody(css: string, query: string): string {
  const idx = css.indexOf(query)
  expect(idx, `expected to find ${query}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated media query: ${query}`)
}

describe('B-i: phone tap-target floor is encoded in shared CSS', () => {
  it('raises shared buttons, chips, touch-target markers, and icon-only utility controls to 44px on phone', () => {
    const body = mediaBody(buttonCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.btn[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.chip[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\[data-touch-target='true'\][\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.tap-target-phone--icon[\s\S]*min-width:\s*44px/)
    expect(body).toMatch(/\.tap-target-phone--icon[\s\S]*min-height:\s*44px/)
  })

  it('raises the dashboard window selector track, tabs, and custom date controls to 44px on phone', () => {
    const body = mediaBody(windowSelectorCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.window-selector-seg[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.window-selector-range[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.window-selector-field[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.window-selector-tab[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/input\[type='date'\][\s\S]*min-height:\s*44px/)
  })

  it('raises the dashboard cut-toggle track and tabs to 44px on phone', () => {
    const body = mediaBody(cutToggleCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.cut-toggle[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.cut-toggle-tab[\s\S]*min-height:\s*44px/)
  })
})

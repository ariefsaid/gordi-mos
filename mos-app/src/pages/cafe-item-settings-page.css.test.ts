import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-item-settings-page.css'), 'utf8')

describe('Café item table scan width', () => {
  it('gives editable MOS names enough of the desktop table for ordinary aliases', () => {
    expect(css).toMatch(/\.cafe-items__table--editable th:nth-child\(2\),\s*\.cafe-items__table--editable td:nth-child\(2\) \{ width: 33%; \}/)
    expect(css).toMatch(/\.cafe-items__table--editable th:nth-child\(3\),\s*\.cafe-items__table--editable td:nth-child\(3\) \{ width: 15%; \}/)
    expect(css).toMatch(/\.cafe-items__table--editable th:nth-child\(4\),\s*\.cafe-items__table--editable td:nth-child\(4\) \{ width: 10%; \}/)
    expect(css).toMatch(/\.cafe-items__table--editable th:nth-child\(5\),\s*\.cafe-items__table--editable td:nth-child\(5\) \{ width: 13%; \}/)
    expect(css).toMatch(/\.cafe-items__table--editable th:nth-child\(6\),\s*\.cafe-items__table--editable td:nth-child\(6\) \{ width: 8%; \}/)
  })
})

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectContrast } from './design-quality/measurements'

// Browser-level CSS contract: resolve the shipped tokens and interaction cascade without
// requiring a writable account or taking screenshots. Component tests bind these roles to UI.
const read = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8')
const css = [
  'styles/tokens/theme-light.css', 'styles/tokens/theme-dark.css', 'styles/tokens/aliases.css',
  'index.css', 'shell/appearance-control.css', 'components/signals/signal-record.css',
  'components/signals/signal-composer.css', 'components/signals/signal-attention-picker.css',
  'components/tasks/task-record-document.css', 'components/admin/admin-settings.css',
].map(read).join('\n').replace(/@import[^;]+;/g, '')

for (const theme of ['light', 'dark']) {
  for (const width of [390, 1440]) {
    test(`${theme} functional text stays readable at ${width}px in each interaction state`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.setContent(`<html class="${theme}"><body>
        <main style="background: var(--card); color: var(--foreground); padding: 16px">
          <div style="background: var(--popover)">
            <button class="appearance-control-option" aria-checked="true">Dark</button>
            <button class="person-menu-item" style="color: var(--status-lost-text)">Archive</button>
          </div>
          <ul class="signal-record-mentions"><li>Person · Example</li></ul>
          <p class="checklist-save-error">Could not save <button class="checklist-retry">Retry</button></p>
          <span class="signal-composer-field-hint">WIB</span>
          <span class="signal-composer-send-hint">Shift+Enter to send</span>
          <span class="signal-attention-picker-meaning">Act now</span>
        </main></body></html>`)
      await page.addStyleTag({ content: css })
      // These fixture defaults match Tailwind's button reset; interaction paint is production CSS.
      await page.addStyleTag({ content: 'body { margin: 0; background: var(--background); } button { background: transparent; border: 0; font-size: 14px; }' })
      const context = { route: 'functional-text', journey: 'read labels and recovery', fixture: 'shipped CSS', viewport: String(width), theme, language: 'en', state: 'default' }
      const selector = 'button, .signal-record-mentions li, .signal-composer-field-hint, .signal-composer-send-hint, .signal-attention-picker-meaning'
      const check = async (state: string) => {
        const rows = await collectContrast(page, context, state, selector)
        expect(rows.length).toBeGreaterThanOrEqual(7)
        for (const row of rows) {
          expect(row.observed, row.selector).toBe(true)
          expect(row.ratio, `${row.selector}: ${row.foreground} on ${row.background}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      await check('default')
      for (const name of ['Dark', 'Archive', 'Retry']) {
        const button = page.getByRole('button', { name, exact: true })
        await button.hover()
        await check(`${name} hover`)
        await button.focus()
        await check(`${name} focus`)
      }
      for (const hint of ['.signal-composer-field-hint', '.signal-composer-send-hint', '.signal-attention-picker-meaning']) {
        expect(await page.locator(hint).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11)
      }
    })
  }
}

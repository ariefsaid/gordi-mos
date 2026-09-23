import { test } from '@playwright/test'
import { assertTapFloor } from './helpers/tap-floor'

test('tap-floor waits for a visible target to acquire its settled box', async ({ page }) => {
  await page.setContent(`
    <a id="delayed-target" href="#" style="display:inline-block; width:0; height:0">Delayed target</a>
    <script>
      setTimeout(() => {
        const target = document.getElementById('delayed-target')
        target.style.width = '44px'
        target.style.height = '44px'
      }, 100)
    </script>
  `)

  await assertTapFloor(page, '#delayed-target', 'delayed target', { axes: 'both' })
})

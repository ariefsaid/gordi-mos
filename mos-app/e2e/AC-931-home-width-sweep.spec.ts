/**
 * AC-931 / NFR-923 — the Home daily brief must not overflow at the intermediate widths where
 * shell geometry changes. The old three-arrangement sweep was retired with those arrangements;
 * this measures the one shipped composition at the same six widths.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

async function measure(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('.home-frame')
    if (!frame) return null

    let scroller: HTMLElement | null = frame.parentElement
    while (scroller) {
      const overflowX = getComputedStyle(scroller).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') break
      scroller = scroller.parentElement
    }

    const offenders: string[] = []
    if (scroller) {
      const limit = scroller.getBoundingClientRect().left + scroller.clientWidth
      for (const element of Array.from(frame.querySelectorAll<HTMLElement>('*'))) {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.right > limit + 1) {
          offenders.push(element.tagName.toLowerCase() + '.' + element.className)
        }
      }
    }

    return {
      scrollerFound: !!scroller,
      scrollerClient: scroller?.clientWidth ?? 0,
      scrollerScroll: scroller?.scrollWidth ?? 0,
      frameClient: frame.clientWidth,
      frameScroll: frame.scrollWidth,
      frameWidth: Math.round(frame.getBoundingClientRect().width),
      paintedNodes: frame.querySelectorAll('*').length,
      offenders: offenders.slice(0, 6),
    }
  })
}

const WIDTHS = [390, 620, 768, 940, 1100, 1280] as const

test.describe('AC-931 / NFR-923: the Home daily brief fits at every supported width', () => {
  test('does not require horizontal scrolling at 390 / 620 / 768 / 940 / 1100 / 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await loginAs(page, VIEWER.email, VIEWER.password)
    await expect(page.locator('.home-frame')).toBeVisible()
    await expect(page.locator('[data-testid="home-daily-brief"]')).toBeVisible()

    const table: string[] = []
    const overflowing: string[] = []
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(120)
      const measured = await measure(page)
      expect(measured, width + ': no Home frame was measured').not.toBeNull()
      const result = measured!
      expect(result.scrollerFound, width + ': no scrollable Home ancestor').toBe(true)
      expect(result.scrollerClient, width + ': the scroll container collapsed').toBeGreaterThan(300)
      expect(result.frameWidth, width + ': the Home frame collapsed').toBeGreaterThan(300)
      expect(result.paintedNodes, width + ': the Home frame rendered nothing').toBeGreaterThan(20)

      const scrollerOverflow = result.scrollerScroll - result.scrollerClient
      const frameOverflow = result.frameScroll - result.frameClient
      const worst = Math.max(scrollerOverflow, frameOverflow)
      table.push(width + 'px frame=' + result.frameWidth + ' overflow=' + Math.max(0, worst) + 'px')
      if (worst > 1) {
        overflowing.push(width + 'px: +' + worst + 'px [' + (result.offenders.join(' | ') || 'wide track') + ']')
      }
    }

    console.log('\n' + table.join('\n'))
    expect(overflowing, 'a person must never scroll Home sideways').toEqual([])
  })
})

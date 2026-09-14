/**
 * AC-931 / NFR-923 (geometry) — no Home arrangement produces horizontal page overflow at any
 * supported width.
 *
 * This is intentionally a real-browser measurement: jsdom has no layout engine and cannot prove
 * that a grid or long row title fits. The sweep also verifies the selected arrangement at every
 * width so a preference failure cannot make all measurements exercise Focused by accident.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

const WIDTHS = [390, 620, 768, 940, 1100, 1280] as const
const LAYOUTS = ['Focused', 'Overview', 'List'] as const
type HomeArrangement = typeof LAYOUTS[number]

const ARRANGEMENT_SELECTORS: Record<HomeArrangement, string> = {
  Focused: '.home-tabs[role="tablist"]',
  Overview: '.home-bento',
  List: '.stream-group',
}

async function arrangementOf(page: Page): Promise<HomeArrangement | 'NONE'> {
  const frame = page.locator('.home-frame')
  const found: HomeArrangement[] = []
  for (const layout of LAYOUTS) {
    const selector = `.home-layout ${ARRANGEMENT_SELECTORS[layout]}`
    if (await frame.locator(selector).count()) found.push(layout)
  }
  return found.length === 1 ? found[0] : 'NONE'
}

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
          const classes = typeof element.className === 'string' && element.className
            ? '.' + element.className.trim().split(/\s+/).join('.')
            : ''
          offenders.push(element.tagName.toLowerCase() + classes)
        }
      }
    }

    return {
      innerWidth: window.innerWidth,
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

async function pickLayout(page: Page, name: string) {
  await page.getByRole('button', { name: /Cahya Cafe/i }).click()
  await page.getByRole('menuitem', { name: /personal profile/i }).click()
  await page.waitForURL(/\/profile$/)
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '').endsWith('/mos'))
  await expect(page.locator('.home-frame')).toBeVisible()
  expect(await arrangementOf(page), `picking ${name} must change Home`).toBe(name)
}

test.describe('AC-931 / NFR-923: Home fits in every arrangement at every supported width', () => {
  for (const layout of LAYOUTS) {
    test(`AC-931: ${layout} fits at 390 / 620 / 768 / 940 / 1100 / 1280`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await loginAs(page, VIEWER.email, VIEWER.password)
      await expect(page.locator('.home-frame')).toBeVisible()
      await pickLayout(page, layout)

      const table: string[] = []
      const overflowing: string[] = []
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await expect(page.locator('.home-frame')).toBeVisible()
        await page.waitForTimeout(120)

        expect(await arrangementOf(page), `${layout}@${width}: wrong arrangement measured`).toBe(layout)
        const measured = await measure(page)
        expect(measured, `${layout}@${width}: no Home frame was measured`).not.toBeNull()
        const result = measured!
        expect(result.innerWidth, `${layout}@${width}: viewport did not resize`).toBe(width)
        expect(result.scrollerFound, `${layout}@${width}: no scrollable Home ancestor`).toBe(true)
        expect(result.scrollerClient, `${layout}@${width}: scroll container collapsed`).toBeGreaterThan(300)
        expect(result.frameWidth, `${layout}@${width}: Home frame collapsed`).toBeGreaterThan(300)
        expect(result.paintedNodes, `${layout}@${width}: Home rendered nothing`).toBeGreaterThan(20)

        const scrollerOverflow = result.scrollerScroll - result.scrollerClient
        const frameOverflow = result.frameScroll - result.frameClient
        const worst = Math.max(scrollerOverflow, frameOverflow)
        table.push(`${layout} ${width}px frame=${result.frameWidth} overflow=${Math.max(0, worst)}px`)
        if (worst > 1) {
          overflowing.push(`${layout}@${width}px: +${worst}px [${result.offenders.join(' | ') || 'wide track'}]`)
        }
      }

      console.log('\n' + table.join('\n'))
      expect(overflowing, 'a person must never scroll Home sideways').toEqual([])
    })
  }

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.getByRole('button', { name: /Cahya Cafe/i }).click()
    await page.getByRole('menuitem', { name: /personal profile/i }).click()
    await page.waitForURL(/\/profile$/)
    const radio = page.getByRole('radio', { name: /^Focused/ })
    await page.locator('label').filter({ has: radio }).click()
    await expect(radio).toBeChecked()
    await page.close()
  })
})

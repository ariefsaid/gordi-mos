/**
 * AC-931 / NFR-923 (geometry) — no Home arrangement produces horizontal page overflow, at ANY
 * width from 390px up.
 *
 * "Given each of the three layouts at 390, 620, 768, 940, 1100 and 1280px, when Home renders,
 *  then no layout produces horizontal overflow."
 *
 * WHY THIS LIVES IN PLAYWRIGHT AND NOT IN JSDOM. The spec files this AC as `(unit, geometry)`, but
 * overflow is a MEASUREMENT: `scrollWidth > clientWidth` on a real layout engine. jsdom has none —
 * every box is 0×0 — so no jsdom assertion can distinguish an overflowing Home from a fitting one.
 * The two existing jsdom guards (guard-home-container-query.css.test.ts,
 * guard-home-layout.css.test.ts) are STRUCTURAL PROXIES: they assert the authored CSS declares a
 * container and that grid tracks use `minmax(0, …)`. Both are worth having and neither can detect
 * overflow. This file is the measured oracle they stand in for, so the lowest SUFFICIENT layer is
 * here.
 *
 * NFR-923 exists because the defect was found at every INTERMEDIATE width and missed twice by
 * checking only 390 and 1280 — hence the six-point sweep, all three arrangements, 18 measurements.
 *
 * ── THE FALSE-PASS FIREWALL (read before trusting a green run) ────────────────────────────────
 * A collapsed or unpainted pane reports "no overflow" for everything: 0 ≤ 0 is true, and the sweep
 * goes green having measured nothing. That false pass has already been produced twice on this
 * feature's mockups. So every measurement is gated on the harness proving it measured something
 * real FIRST — the viewport is exactly the width we asked for, the Home frame occupies a genuine
 * width, the frame contains a painted arrangement, and it is the arrangement this test PICKED —
 * and the sweep aborts on the gate rather than reporting on a pane that was never there.
 *
 * ── WHY NOT `document.documentElement.scrollWidth` ────────────────────────────────────────────
 * That is the obvious oracle and it is a DEAD one in this app. The shell scrolls an inner element:
 * `main.page-frame--v3` carries `overflow: auto` and is the real scroll container, while every
 * ancestor above it — including `body` and `html` — carries `overflow-x: hidden`. So the document's
 * scrollWidth is pinned to its clientWidth no matter what Home does. Measured, not assumed: with a
 * deliberate 3000px box injected into `.home-frame`, `documentElement.scrollWidth` did not move
 * from 620 at a 620px viewport, while the main scroller read client=620 / scroll=3016.
 *
 * A document-level assertion would therefore have been GREEN FOREVER — incapable of failing, which
 * is precisely the false pass this file exists to prevent. The oracle is the SCROLLER: the nearest
 * scrollable ancestor of the Home frame, whose overflow is what a person actually has to drag. The
 * frame's own box is measured too, because that is where the defect appears first.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

/** The arrangement Home is currently in, read by its shape. Re-checked at EVERY width: without it
 *  a preference that silently failed to apply would let all three tests sweep the same (Focused)
 *  arrangement and report 18 green measurements of one layout. */
async function arrangementOf(page: Page): Promise<string> {
  const frame = page.locator('.home-frame')
  if (await frame.getByRole('tablist', { name: /home regions/i }).count()) return 'Focused'
  if (await frame.locator('.home-layout > .home-bento').count()) return 'Overview'
  if (await frame.locator('.home-layout > .stream-group').count()) return 'List'
  return 'NONE'
}

// The spec's six points, intermediate widths included — that is the whole requirement.
const WIDTHS = [390, 620, 768, 940, 1100, 1280] as const
const LAYOUTS = ['Focused', 'Overview', 'List'] as const

/** A short, human-readable identifier for an offending element (diagnostics only). */
const DESCRIBE_EL = `(el) => {
  const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : ''
  return el.tagName.toLowerCase() + cls
}`

async function measure(page: Page) {
  return page.evaluate(`(() => {
    const describeEl = ${DESCRIBE_EL}
    const frame = document.querySelector('.home-frame')
    if (!frame) return null
    // The element a person would actually have to drag sideways: the nearest ancestor that
    // scrolls. html/body are overflow-x:hidden here, so they can never report overflow.
    let scroller = frame.parentElement
    while (scroller) {
      const ox = getComputedStyle(scroller).overflowX
      if (ox === 'auto' || ox === 'scroll') break
      scroller = scroller.parentElement
    }
    const offenders = []
    if (scroller) {
      const limit = scroller.getBoundingClientRect().left + scroller.clientWidth
      for (const el of Array.from(frame.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > limit + 1) offenders.push(describeEl(el) + ' → right=' + Math.round(r.right))
      }
    }
    return {
      innerWidth: window.innerWidth,
      scrollerFound: !!scroller,
      scrollerName: scroller ? describeEl(scroller).split('.').slice(0, 2).join('.') : '(none)',
      scrollerClient: scroller ? scroller.clientWidth : 0,
      scrollerScroll: scroller ? scroller.scrollWidth : 0,
      frameClient: frame.clientWidth,
      frameScroll: frame.scrollWidth,
      frameWidth: Math.round(frame.getBoundingClientRect().width),
      paintedNodes: frame.querySelectorAll('*').length,
      offenders: offenders.slice(0, 6),
    }
  })()`) as Promise<{
    innerWidth: number; scrollerFound: boolean; scrollerName: string
    scrollerClient: number; scrollerScroll: number
    frameClient: number; frameScroll: number; frameWidth: number
    paintedNodes: number; offenders: string[]
  } | null>
}

/** Pick an arrangement the way a person does — the radio is visually hidden behind its
 *  wireframe-thumbnail card, so the clickable thing is the option's label. */
async function pickLayout(page: Page, name: string) {
  await page.getByRole('link', { name: /personal profile/i }).click()
  await page.waitForURL(/\/profile$/)
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '').endsWith('/mos'))
  await expect(page.locator('.home-frame')).toBeVisible()
  expect(await arrangementOf(page), `picking ${name} must actually change Home`).toBe(name)
}

test.describe('AC-931 / NFR-923: Home fits, in every arrangement, at every width', () => {
  for (const layout of LAYOUTS) {
    test(`AC-931: ${layout} produces no horizontal overflow at 390 / 620 / 768 / 940 / 1100 / 1280`, async ({ page }) => {
      // The picker itself is only reachable on a desktop-shaped window; the sweep resizes after.
      await page.setViewportSize({ width: 1280, height: 900 })
      await loginAs(page, VIEWER.email, VIEWER.password)
      await expect(page.locator('.home-frame')).toBeVisible()
      await pickLayout(page, layout)

      const table: string[] = []
      const overflowing: string[] = []

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await expect(page.locator('.home-frame')).toBeVisible()
        // Let the container query settle before reading geometry.
        await page.waitForTimeout(120)
        expect(await arrangementOf(page), `${layout}@${width}: the sweep must be measuring the arrangement it picked`)
          .toBe(layout)
        const m = await measure(page)

        // ── harness gate: refuse to report on a pane that was never really there ──────────────
        expect(m, `${layout}@${width}: no .home-frame — nothing was measured`).not.toBeNull()
        const g = m!
        expect(g.innerWidth, `${layout}@${width}: the viewport did not actually resize`).toBe(width)
        expect(g.scrollerFound, `${layout}@${width}: found no scrollable ancestor — with html/body at overflow-x:hidden this measurement would be green forever`)
          .toBe(true)
        expect(g.scrollerClient, `${layout}@${width}: the scroll container collapsed — any overflow result here is meaningless`)
          .toBeGreaterThan(300)
        expect(g.frameWidth, `${layout}@${width}: the Home frame measured ${g.frameWidth}px — a collapsed pane reports "no overflow" for everything`)
          .toBeGreaterThan(300)
        expect(g.paintedNodes, `${layout}@${width}: the Home frame rendered nothing to overflow with`)
          .toBeGreaterThan(20)

        const scrollerOver = g.scrollerScroll - g.scrollerClient
        const frameOver = g.frameScroll - g.frameClient
        const worst = Math.max(scrollerOver, frameOver)
        table.push(
          `${layout.padEnd(8)} ${String(width).padStart(4)}px  frame=${String(g.frameWidth).padStart(4)}`
          + `  scroller ${String(g.scrollerClient).padStart(4)}/${String(g.scrollerScroll).padStart(4)}`
          + `  frameBox ${String(g.frameClient).padStart(4)}/${String(g.frameScroll).padStart(4)}`
          + `  overflow=${worst > 1 ? `+${worst}px` : 'none'}`,
        )
        if (worst > 1) {
          overflowing.push(`${layout}@${width}px: +${worst}px [${g.offenders.join(' | ') || 'no single element past the edge — a track or gap is over-wide'}]`)
        }
      }

      console.log('\n' + table.join('\n'))
      expect(overflowing, 'a person must never have to scroll Home sideways (NFR-923)').toEqual([])
    })
  }

  test.afterAll(async ({ browser }) => {
    // Leave the shared persona on its default so no later spec inherits this one's choice.
    const page = await browser.newPage()
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.getByRole('link', { name: /personal profile/i }).click()
    await page.waitForURL(/\/profile$/)
    const radio = page.getByRole('radio', { name: /^Focused/ })
    await page.locator('label').filter({ has: radio }).click()
    await expect(radio).toBeChecked()
    await page.close()
  })
})

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { stubAccountLocale } from './helpers/account-locale'

// Three cells cover every layout branch once: 390 = switcher + page record, 768 = switcher + panel
// record, 1440 = no switcher + 52px rows (1280 re-ran that branch). Each locale appears at least once.
for (const [locale, width] of [['en', 390], ['id', 768], ['en', 1440]] as const) {
  test(`Work catalog row geometry and long settled copy ${locale} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900})
    await stubAccountLocale(page,locale)
    await loginAs(page,'dewi.dev@example.test',DEMO_PASSWORD)
    for(const collection of ['projects','objectives']) {
      const endpoint=collection==='projects'?'work_lines':'objectives'
      await page.route(`**/rest/v1/${endpoint}*`,async route=>{
        const response=await route.fetch()
        const rows=await response.json()
        if(Array.isArray(rows)&&rows.length) rows[0].name=locale==='en'
          ? 'Prepare the café service handover with detailed checks for equipment and supplies across every station'
          : 'Siapkan serah terima layanan kafe dengan pemeriksaan peralatan dan persediaan untuk setiap stasiun'
        await route.fulfill({response,json:rows})
      })
      await page.goto(`work/${collection}`)
      const switcher = page.locator('[data-anatomy="work-collection-switcher"]')
      if (width <= 919) {
        await expect(switcher, `${collection}: phone collection switcher is visible`).toBeVisible()
        const targets = await switcher.locator('a').evaluateAll(nodes => nodes.map(el => {
          const box = el.getBoundingClientRect()
          return { href: el.getAttribute('href'), width: box.width, height: box.height }
        }))
        expect(targets, `${collection}: all four phone collection targets render`).toHaveLength(4)
        for (const target of targets) {
          expect(target.width, `${collection}: ${target.href} is at least 44px wide`).toBeGreaterThanOrEqual(44)
          expect(target.height, `${collection}: ${target.href} is at least 44px high`).toBeGreaterThanOrEqual(44)
        }
        await expect(switcher.locator(`[href="/work/${collection}"]`), `${collection}: selected switcher link owns the location`).toHaveAttribute('aria-current', 'location')
      } else {
        await expect(switcher, `${collection}: desktop has no phone collection switcher`).toHaveCount(0)
      }
      const rows=page.locator('.catalog-collection__row')
      const rowLinks=page.locator('.catalog-collection__row-link')
      await expect(rows.first(), `${collection}: first collection row renders`).toBeVisible()
      const dimensions=await rows.evaluateAll(nodes=>nodes.map(el=>{
        const link=el.querySelector('.catalog-collection__row-link')
        return {name:link?.getAttribute('aria-label')||link?.textContent,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}
      }))
      for (const row of dimensions) {
        expect(row.height, `${collection}: row meets the height floor at ${width}px`).toBeGreaterThanOrEqual(width >= 1280 ? 52 : 44)
        expect(row.name?.trim(), `${collection}: row has an accessible name`).toBeTruthy()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${collection}: collection has no horizontal page overflow`).toBe(true)
      await rowLinks.first().focus()
      await expect(rowLinks.first(), `${collection}: first row link receives focus`).toBeFocused()
      expect(await rowLinks.first().evaluate(el => getComputedStyle(el).outlineStyle), `${collection}: focused row link shows an outline`).not.toBe('none')
      const controls = await page.locator('main button, main [role="combobox"]').evaluateAll(nodes => nodes.map(el => {
        // Tap floor is measured on the hit area: the help glyph's 44x44 area is its ::before (same rule as helpers/tap-floor.ts).
        const box=el.getBoundingClientRect()
        const before=getComputedStyle(el,'::before')
        const px=(value:string)=>Number.parseFloat(value)||0
        const left=px(before.left),top=px(before.top)
        return {name:el.getAttribute('aria-label')||el.textContent,height:Math.max(box.height,top+px(before.height))-Math.min(0,top),width:Math.max(box.width,left+px(before.width))-Math.min(0,left),y:box.y+Math.min(0,top)}
      }).filter(control => control.width>0 && control.height>0))
      for (const control of controls) {
        expect(control.name?.trim(), `${collection}: control has an accessible name`).toBeTruthy()
        if (width === 390) {
          expect(control.height, `${collection}: phone control meets the 44px height floor`).toBeGreaterThanOrEqual(44)
          expect(control.width, `${collection}: phone control meets the 44px width floor`).toBeGreaterThanOrEqual(44)
        }
      }
      expect(controls[0].y + controls[0].height, `${collection}: first control remains above the viewport fold`).toBeLessThanOrEqual(900)
      await rowLinks.first().press('Enter')
      // Phone records are canonical full pages with one collection Back; wider layouts keep the
      // named shared Work panel (section.rp, data-record-mode="panel") headed by the record itself.
      const recordName = String(dimensions[0]?.name ?? '').trim()
      expect(recordName, `${collection}: first record has an accessible name`).toBeTruthy()
      const record = page.getByRole('region', { name: recordName, exact: true })
      await expect(record, `${collection}: opened record is visible`).toBeVisible()
      await expect(record, `${collection}: opened record uses the expected page or panel mode`).toHaveAttribute('data-record-mode', width < 768 ? 'page' : 'panel')
      await expect(page.getByRole('heading', { name: recordName, exact: true }), `${collection}: opened record heading is visible`).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${collection}: opened record has no horizontal page overflow`).toBe(true)
      if (width < 768) {
        await expect(page, `${collection}: phone record uses its canonical page URL`).toHaveURL(new RegExp(`/work/${collection}/[0-9a-f-]{36}$`))
        const back = page.locator('.record-page-back')
        await expect(back, `${collection}: phone record has one collection Back link`).toHaveCount(1)
        await expect(back, `${collection}: Back returns to its owning collection`).toHaveAttribute('href', new RegExp(`/work/${collection}$`))
        await back.click()
        // The collection canonicalises its own layout into the URL once mounted (use-record-collection),
        // so Back lands on the bare path or on it with that one param, depending on timing.
        await expect(page, `${collection}: Back returns to the collection URL`).toHaveURL(new RegExp(`/work/${collection}(\\?layout=list)?$`))
        await expect(rowLinks.first(), `${collection}: collection rows return after Back`).toBeVisible()
        await expect(switcher.locator(`[href="/work/${collection}"]`), `${collection}: returned collection owns the location`).toHaveAttribute('aria-current', 'location')
      } else {
        await page.keyboard.press('Escape')
        await expect(record, `${collection}: Escape closes the record panel`).not.toBeVisible()
        await expect(page.locator('[data-overlay-host][data-overlay-owner="work"]'), `${collection}: closing clears the Work overlay`).toHaveCount(0)
        await expect(rowLinks.first(), `${collection}: closing restores focus to the opener`).toBeFocused()
      }
      await page.unroute(`**/rest/v1/${endpoint}*`)
    }
  })
}

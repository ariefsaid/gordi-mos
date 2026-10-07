import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { stubAccountLocale } from './helpers/account-locale'

for (const locale of ['en','id']) for (const width of [390,768,1280,1440]) {
  test(`Work catalog row geometry and long settled copy ${locale} ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900})
    await stubAccountLocale(page,locale as 'en'|'id')
    await loginAs(page,'dewi.dev@example.test',DEMO_PASSWORD)
    const measurements=[]
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
        await expect(switcher).toBeVisible()
        const targets = await switcher.locator('a').evaluateAll(nodes => nodes.map(el => {
          const box = el.getBoundingClientRect()
          return { href: el.getAttribute('href'), width: box.width, height: box.height }
        }))
        expect(targets).toHaveLength(4)
        for (const target of targets) {
          expect(target.width).toBeGreaterThanOrEqual(44)
          expect(target.height).toBeGreaterThanOrEqual(44)
        }
        await expect(switcher.locator(`[href="/work/${collection}"]`)).toHaveAttribute('aria-current', 'location')
      } else {
        await expect(switcher).toHaveCount(0)
      }
      const rows=page.locator('.catalog-collection__row')
      const rowLinks=page.locator('.catalog-collection__row-link')
      await expect(rows.first()).toBeVisible()
      const dimensions=await rows.evaluateAll(nodes=>nodes.map(el=>{
        const link=el.querySelector('.catalog-collection__row-link')
        return {name:link?.getAttribute('aria-label')||link?.textContent,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}
      }))
      for(const row of dimensions){expect(row.height).toBeGreaterThanOrEqual(width>=1280?52:44);expect(row.name?.trim()).toBeTruthy()}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await rowLinks.first().focus()
      await expect(rowLinks.first()).toBeFocused()
      expect(await rowLinks.first().evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none')
      const controls = await page.locator('main button, main [role="combobox"]').evaluateAll(nodes => nodes.map(el => {
        // Tap floor is measured on the hit area: the help glyph's 44x44 area is its ::before (same rule as helpers/tap-floor.ts).
        const box=el.getBoundingClientRect()
        const before=getComputedStyle(el,'::before')
        const px=(value:string)=>Number.parseFloat(value)||0
        const left=px(before.left),top=px(before.top)
        return {name:el.getAttribute('aria-label')||el.textContent,height:Math.max(box.height,top+px(before.height))-Math.min(0,top),width:Math.max(box.width,left+px(before.width))-Math.min(0,left),y:box.y+Math.min(0,top)}
      }).filter(control => control.width>0 && control.height>0))
      for(const control of controls) {
        expect(control.name?.trim()).toBeTruthy()
        if(width===390) {expect(control.height).toBeGreaterThanOrEqual(44);expect(control.width).toBeGreaterThanOrEqual(44)}
      }
      expect(controls[0].y+controls[0].height).toBeLessThanOrEqual(900)
      measurements.push({collection,width,locale,rows:dimensions,controls})
      await page.screenshot({animations:'disabled',path:testInfo.outputPath(`${collection}-${locale}-${width}.png`)})
      await rowLinks.first().press('Enter')
      // Phone records are canonical full pages with one collection Back; wider layouts keep the
      // named shared Work panel (section.rp, data-record-mode="panel") headed by the record itself.
      const recordName = String(dimensions[0]?.name ?? '').trim()
      expect(recordName).toBeTruthy()
      const record = page.getByRole('region', { name: recordName, exact: true })
      await expect(record).toBeVisible()
      await expect(record).toHaveAttribute('data-record-mode', width < 768 ? 'page' : 'panel')
      await expect(page.getByRole('heading', { name: recordName, exact: true })).toBeVisible()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({animations:'disabled',path:testInfo.outputPath(`${collection}-record-${locale}-${width}.png`)})
      if (width < 768) {
        await expect(page).toHaveURL(new RegExp(`/work/${collection}/[0-9a-f-]{36}$`))
        const back = page.locator('.record-page-back')
        await expect(back).toHaveCount(1)
        await expect(back).toHaveAttribute('href', new RegExp(`/work/${collection}$`))
        await back.click()
        // The collection canonicalises its own layout into the URL once mounted (use-record-collection),
        // so Back lands on the bare path or on it with that one param, depending on timing.
        await expect(page).toHaveURL(new RegExp(`/work/${collection}(\\?layout=list)?$`))
        await expect(rowLinks.first()).toBeVisible()
        await expect(switcher.locator(`[href="/work/${collection}"]`)).toHaveAttribute('aria-current', 'location')
      } else {
        await page.keyboard.press('Escape')
        await expect(record).not.toBeVisible()
        await expect(page.locator('[data-overlay-host][data-overlay-owner="work"]')).toHaveCount(0)
        await expect(rowLinks.first()).toBeFocused()
      }
      await page.unroute(`**/rest/v1/${endpoint}*`)
    }
    writeFileSync(testInfo.outputPath('row-measurements.json'),JSON.stringify(measurements,null,2))
    await testInfo.attach('row-measurements',{body:JSON.stringify(measurements,null,2),contentType:'application/json'})
  })
}

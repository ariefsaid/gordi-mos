import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'

for (const locale of ['en','id']) for (const width of [390,768,1280,1440]) {
  test(`Work catalog row geometry and long settled copy ${locale} ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900})
    await page.addInitScript(locale=>localStorage.setItem('mos.locale',locale),locale)
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
      const rows=page.locator('.catalog-collection__row-link')
      await expect(rows.first()).toBeVisible()
      const dimensions=await rows.evaluateAll(nodes=>nodes.map(el=>({name:el.getAttribute('aria-label')||el.textContent,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})))
      for(const row of dimensions){expect(row.height).toBeGreaterThanOrEqual(width>=1280?52:44);expect(row.name?.trim()).toBeTruthy()}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await rows.first().focus()
      await expect(rows.first()).toBeFocused()
      expect(await rows.first().evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none')
      const controls = await page.locator('main button, main [role="combobox"]').evaluateAll(nodes => nodes.map(el => {
        const box=el.getBoundingClientRect()
        return {name:el.getAttribute('aria-label')||el.textContent,height:box.height,width:box.width,y:box.y}
      }).filter(control => control.width>0 && control.height>0))
      for(const control of controls) {
        expect(control.name?.trim()).toBeTruthy()
        if(width===390) {expect(control.height).toBeGreaterThanOrEqual(44);expect(control.width).toBeGreaterThanOrEqual(44)}
      }
      expect(controls[0].y+controls[0].height).toBeLessThanOrEqual(900)
      measurements.push({collection,width,locale,rows:dimensions,controls})
      await page.screenshot({animations:'disabled',path:testInfo.outputPath(`${collection}-${locale}-${width}.png`)})
      await rows.first().press('Enter')
      await expect(page.locator('.record-viewer')).toBeVisible()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({animations:'disabled',path:testInfo.outputPath(`${collection}-record-${locale}-${width}.png`)})
      await page.keyboard.press('Escape')
      await expect(page.locator('.record-viewer')).not.toBeVisible()
      await expect(page.locator('[data-overlay-host][data-overlay-owner="work"]')).toHaveCount(0)
      await expect(rows.first()).toBeFocused()
      await page.unroute(`**/rest/v1/${endpoint}*`)
    }
    writeFileSync(testInfo.outputPath('row-measurements.json'),JSON.stringify(measurements,null,2))
    await testInfo.attach('row-measurements',{body:JSON.stringify(measurements,null,2),contentType:'application/json'})
  })
}

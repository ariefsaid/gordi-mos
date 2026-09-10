import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { localSqlRead } from './helpers/local-sql-read'
import { localSql } from './helpers/local-sql'

// Start only when the actual Team has no current opening. Existing history is never cleared.
for (const width of [390, 1440]) {
  test(`AC-630: canonical opening start, pending choice and persisted Task at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const [team] = await localSqlRead<{id:string}>(`select id from shared.teams where code='gordi_hq_kitchen'`)
    expect(team).toBeTruthy()
    const existing = await localSqlRead(`select r.id from mos.process_runs r join mos.work_lines w on w.id=r.work_line_id where w.code='cafe_opening' and r.owning_team_id='${team.id}' and r.period_key=to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')`)
    expect(existing, 'Existing current opening must be preserved, never reset').toHaveLength(0)
    let runId: string | undefined
    try {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
      await loginAs(page, 'krishna.dev@example.test', DEMO_PASSWORD)
      await page.goto('cafe')
      const response = page.waitForResponse(r => /\/rpc\/spawn_process_run/.test(r.url()) && r.ok())
      await page.getByRole('button', { name: "Start today's opening", exact: true }).click()
      const spawned = await (await response).json()
      expect(spawned.idempotent).toBe(false)
      runId = spawned.run_id
      const [created] = await localSqlRead<{id:string}>(`select r.id from mos.process_runs r join mos.work_lines w on w.id=r.work_line_id where w.code='cafe_opening' and r.owning_team_id='${team.id}' and r.period_key=to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')`)
      runId = created.id
      await page.getByRole('link', {name:/view opening tasks/i}).click()
      await expect(page.getByText('Open the café floor', { exact: true }).first()).toBeVisible()
      await page.goto('work/projects/e3000000-0000-0000-0000-000000000001')
      await page.getByRole('tab', {name:'Occurrences',exact:true}).click()
      const occurrence = page.locator('li').filter({has:page.getByRole('link',{name:/view tasks/i})}).filter({has:page.locator(`a[href*="${runId}"]`)}).first()
      const assign = occurrence.getByRole('button',{name:/to assign/i})
      await assign.click()
      const dialog = page.getByRole('dialog',{name:/assign/i})
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('Brew station handover')
      await expect(dialog).toContainText('Café Opening')
      await expect(dialog).toContainText('Supervisor')
      const candidates = dialog.getByRole('group',{name:'Choose PIC'}).getByRole('button')
      await expect(candidates).toHaveCount(2)
      const candidateMeasurements=[]
      for(const candidate of await candidates.all()) {
        await expect(candidate).toHaveClass(/btn-outline/)
        expect(await candidate.getAttribute('aria-pressed')).not.toBe('true')
        const box=await candidate.boundingBox(); candidateMeasurements.push({name:await candidate.innerText(),...box}); expect(Number(box!.height.toFixed(2))).toBeGreaterThanOrEqual(44)
      }
      expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({animations:'disabled',path:testInfo.outputPath(`pending-${width}.png`)})
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(assign).toBeFocused()
      await assign.click()
      await dialog.getByRole('button',{name:'Cahya Cafe',exact:true}).click()
      await expect(dialog).not.toBeVisible()
      await page.goto(`work/tasks?occurrence=${runId}`)
      await expect(page.getByText('Brew station handover',{exact:true}).first()).toBeVisible()
      await page.reload()
      await expect(page.getByText('Brew station handover',{exact:true}).first()).toBeVisible()
      const [task] = await localSqlRead<{responsible_person_id:string,team_id:string}>(`select responsible_person_id,team_id from mos.tasks where process_run_id='${runId}' and title='Brew station handover'`)
      expect(task.responsible_person_id).toBe('40000000-0000-0000-0000-000000000001')
      expect(task.team_id).toBe(team.id)
      writeFileSync(testInfo.outputPath('occurrence-evidence.json'),JSON.stringify({width,runId,teamId:team.id,task,candidateMeasurements},null,2))
    } finally {
      if(runId) await localSql(`delete from mos.process_run_pending_tasks where process_run_id='${runId}'; delete from mos.tasks where process_run_id='${runId}'; delete from mos.process_runs where id='${runId}';`)
    }
  })
}

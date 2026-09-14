import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { readFileSync } from 'node:fs'
import { localSql } from './helpers/local-sql'
import { taskCleanupSql } from './fixtures/cleanup'

// Fixed Home fixture IDs are reserved by this suite; refuse a collision before mutation.
const HOME_IDS = ['e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000002']
const ORG = '10000000-0000-0000-0000-000000000001'
let ownsHome = false
import { localSqlRead } from './helpers/local-sql-read'
test.beforeAll(async () => {
  const existing = await localSqlRead(`select id from mos.tasks where id in (${HOME_IDS.map(id => `'${id}'`).join(',')})`)
  if (existing.length) throw new Error('Reserved Home fixture IDs already exist; preserve them')
  ownsHome = true
  const seed = readFileSync(new URL('../../supabase/seed.dev-home-work.sql', import.meta.url), 'utf8')
  await localSql(seed.slice(seed.indexOf('insert into mos.tasks')))
  const fixture = await localSqlRead<{id:string,due_today:boolean,assigned:boolean}>(`select id, due_date=(now() at time zone 'Asia/Jakarta')::date as due_today, responsible_person_id='40000000-0000-0000-0000-000000000007'::uuid as assigned from mos.tasks where id in (${HOME_IDS.map(id => `'${id}'`).join(',')})`)
  expect(fixture).toHaveLength(2)
  expect(fixture.every(row => row.due_today && row.assigned)).toBe(true)
  console.log('Owned Barista due-today fixture', JSON.stringify(fixture))
})
test.afterAll(async () => {
  if (ownsHome) await localSql(taskCleanupSql(HOME_IDS, ORG))
})

const personas = [
  { label: 'Barista', email: 'bulan.dev@example.test', taskView: 'My work' },
  { label: 'Cafe Ops', email: 'cahya.dev@example.test', taskView: 'Team work' },
  { label: 'Director', email: 'dewi.dev@example.test', taskView: 'All' },
] as const

for (const width of [390, 1440]) {
 test(`a Signal keeps its context while opening and cancelling a Task draft at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
  await loginAs(page, 'dewi.dev@example.test', DEMO_PASSWORD)
  await page.goto('work/signals')
  await page.locator('main [data-signal-id][role="button"]').first().click()
  const sourceUrl = page.url()
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unfinished follow-up draft')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Unfinished follow-up draft')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
})
}

for (const width of [390, 1440]) {
  test(`inline Task creation retains its title while choosing ownership at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
    await loginAs(page, 'dewi.dev@example.test', DEMO_PASSWORD)
    await page.goto('work/tasks?create=1')
    const title = `[e2e] Inline task ${width}`
    const draft = page.getByRole('textbox', { name: 'Edit task title', exact: true })
    await draft.fill(title)
    await page.getByRole('combobox', { name: 'Team', exact: true }).click()
    await page.getByRole('listbox', { name: 'Team', exact: true }).getByRole('option', { name: 'HQ Operations', exact: true }).click()
    await expect(draft).toHaveValue(title)
    await page.getByRole('combobox', { name: 'Supervisor', exact: true }).click()
    await page.getByRole('option', { name: 'Cahya Cafe', exact: true }).click()
    await expect(draft).toHaveValue(title)
    let failedOnce = false
    await page.route('**/rest/v1/tasks*', async (route) => {
      if (route.request().method() === 'POST' && !failedOnce) {
        failedOnce = true
        await route.abort('failed')
      } else await route.continue()
    })
    await draft.press('Enter')
    await expect(page.getByRole('button', { name: 'Retry', exact: true }).first()).toBeVisible()
    await expect(draft).toHaveValue(title)
    await expect(page.getByRole('combobox', { name: 'Team', exact: true })).toContainText('HQ Operations')
    await expect(page.getByRole('combobox', { name: 'Supervisor', exact: true })).toContainText('Cahya Cafe')
    await page.getByRole('button', { name: 'Retry', exact: true }).first().click()
    await expect(draft).not.toBeVisible()
    const saved = page.getByRole('link').filter({ hasText: title }).first()
    await expect(saved).toBeVisible()
    await page.reload()
    await expect(page.getByRole('link').filter({ hasText: title }).first()).toBeVisible()
  })
}

for (const width of [390, 1440]) {
test(`a Signal lists its newly created follow-up Task without losing the source at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
  await loginAs(page, 'dewi.dev@example.test', DEMO_PASSWORD)
  await page.goto('./')
  const opener = page.getByRole('button', { name: /^Open signal:/ }).first()
  const sourceName = await opener.getAttribute('aria-label')
  await opener.click()
  const sourceUrl = page.url()
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('[e2e] Signal follow-up context')
  await page.getByRole('form', { name: 'Create task form' }).getByRole('combobox', { name: 'Team', exact: true }).click()
  await page.getByRole('listbox', { name: 'Team', exact: true }).getByRole('option', { name: 'HQ Operations', exact: true }).click()
  await page.getByRole('combobox', { name: 'Supervisor', exact: true }).click()
  await page.getByRole('option', { name: 'Cahya Cafe', exact: true }).click()
  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).not.toBeVisible()
  await expect(page.getByRole('link', { name: /^\[e2e\] Signal follow-up context(?: Open)?$/ })).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
  await page.getByRole('link', { name: /^\[e2e\] Signal follow-up context(?: Open)?$/ }).click()
  await expect(page.getByRole('region', { name: '[e2e] Signal follow-up context', exact: true })).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
  await page.getByRole('button', { name: /^back/i }).click()
  await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: sourceName!, exact: true }).click()
  await expect(page.getByRole('link', { name: /^\[e2e\] Signal follow-up context(?: Open)?$/ })).toBeVisible()
})

}

test('a Task opens its Project and Back restores the Task in its queue', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
  await loginAs(page, 'dewi.dev@example.test', DEMO_PASSWORD)
  await page.goto('work/tasks')
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /^AC204 Brief the floor(?: Retail Ops)?$/ }).click()
  const task = page.getByRole('region', { name: 'AC204 Brief the floor', exact: true })
  await expect(task).toBeVisible()
  await expect(page).toHaveURL(/record=4e204000-0000-0000-0000-000000000101/)
  const sourceUrl = page.url()
  await task.getByRole('link', { name: 'AC204 Menu launch', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'AC204 Menu launch', exact: true })).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
  await page.getByRole('button', { name: /^back/i }).click()
  await expect(task).toBeVisible()
  await expect(page).toHaveURL(sourceUrl)
})

test('an Objective opens its related Project and Back restores the source record', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
  await loginAs(page, 'dewi.dev@example.test', DEMO_PASSWORD)
  await page.goto('work/objectives')
  await page.getByRole('link', { name: 'AC204 Grow revenue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AC204 Grow revenue', exact: true })).toBeVisible()
  const projectLink = page.getByRole('region', { name: 'AC204 Grow revenue', exact: true }).getByRole('link', { name: 'AC204 Menu launch', exact: true })
  const projectHref = await projectLink.getAttribute('href')
  expect(projectHref).toMatch(/^\/mos\/work\/projects\//)
  // A related record must load even when an unrelated whole-Task-collection read fails.
  await page.route('**/rest/v1/tasks*', async (route) => {
    const request = route.request()
    const query = new URL(request.url()).searchParams
    if (request.method() === 'GET' && !query.has('work_line_id') && !query.has('objective_id')) {
      await route.abort('failed')
    } else await route.continue()
  })
  await projectLink.click()
  await expect(page.getByRole('heading', { name: 'AC204 Menu launch', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/work\/objectives\?/)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const project = page.getByRole('region', { name: 'AC204 Menu launch', exact: true })
  await project.getByRole('button', { name: 'More actions', exact: true }).click()
  await project.getByRole('menuitem', { name: 'Copy link', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(projectHref!, page.url()).href)
  await page.getByRole('button', { name: /^back/i }).click()
  await expect(page.getByRole('heading', { name: 'AC204 Grow revenue', exact: true })).toBeVisible()
})

for (const persona of personas) {
  test(`${persona.label} lands in the right Task scope and an explicit view survives refresh`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
    await loginAs(page, persona.email, DEMO_PASSWORD)
    await page.goto('work/tasks')
    await expect(page.getByRole('tab', { name: persona.taskView, exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Overdue', exact: true }).click()
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Overdue', exact: true })).toHaveAttribute('aria-selected', 'true')
  })
}

test('ordinary barista Home offers opening work before the management brief on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
  await loginAs(page, 'bulan.dev@example.test', DEMO_PASSWORD)
  await page.goto('./')
  const main = page.locator('main')
  const opening = main.getByRole('link', { name: /opening/i }).first()
  await expect(opening).toBeVisible()
  const box = await opening.boundingBox()
  expect(box?.y).toBeLessThan(600)
  await expect(main.getByText('Failed checks', { exact: true })).toHaveCount(0)
  await expect(main.getByRole('link', { name: /objectives/i })).toHaveCount(0)
  await expect(main.getByText('Check the espresso recipe before service', { exact: true })).toBeVisible()
  await expect(main.getByText('Prepare the bar handover', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('barista-home.png') })
  await opening.click()
  await expect(page).toHaveURL(/\/cafe(?:[/?]|$)/)
})

test('a barista completes assigned work from Home and the result survives refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
  await loginAs(page, 'bulan.dev@example.test', DEMO_PASSWORD)
  await page.goto('./')
  await page.locator('main a[href*="/work/tasks/e9000000-0000-0000-0000-000000000001"]').first().click()
  const record = page.getByRole('region', { name: 'Check the espresso recipe before service', exact: true })
  await expect(record).toBeVisible()
  await record.getByRole('button', { name: 'Mark complete', exact: true }).click()
  await expect(record.getByRole('button', { name: 'Edit Status', exact: true })).toContainText('Done')
  await page.reload()
  await expect(record.getByRole('button', { name: 'Edit Status', exact: true })).toContainText('Done')
})

for (const persona of [
  { label: 'Finance', email: 'fitri.dev@example.test' },
  { label: 'Sales', email: 'sari.dev@example.test' },
]) {
  test(`${persona.label} Home excludes Café opening and production jobs`, async ({page}) => {
    await page.setViewportSize({width:390,height:844})
    await page.addInitScript(() => localStorage.setItem('mos.locale','en'))
    await loginAs(page,persona.email,DEMO_PASSWORD)
    await page.goto('./')
    await expect(page.getByRole('heading',{name:/Home|Good|Today/}).first()).toBeVisible()
    await expect(page.getByTestId('home-cafe-door')).toHaveCount(0)
    await expect(page.locator('main a[href*="/cafe"]')).toHaveCount(0)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  })
}

for (const persona of ['bulan','cahya']) {
  test(`${persona} Objective quiet empty, real record and return`, async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('mos.locale','en'))
    await loginAs(page,`${persona}.dev@example.test`,DEMO_PASSWORD)
    await page.route('**/rest/v1/objectives*',route => route.fulfill({json:[]}))
    await page.goto('./')
    if(persona==='cahya') await expect(page.getByText('No active Objectives yet.',{exact:true})).toBeVisible()
    else await expect(page.locator('.home-objectives-door')).toHaveCount(0)
    await page.goto('work/objectives')
    await expect(page.getByRole('heading',{name:'Objectives',exact:true})).toBeVisible()
    await expect(page.getByText('No objectives yet',{exact:true})).toBeVisible()
    await expect(page.getByRole('link',{name:'AC204 Grow revenue',exact:true})).toHaveCount(0)
    await page.unroute('**/rest/v1/objectives*')
    await page.reload()
    const row=page.getByRole('link',{name:'AC204 Grow revenue',exact:true})
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByRole('region',{name:'AC204 Grow revenue',exact:true})).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region',{name:'AC204 Grow revenue',exact:true})).not.toBeVisible()
    await expect(row).toBeVisible()
    if(persona==='cahya') {
      await page.goto('./')
      const objective=page.locator('.home-objectives-door').getByRole('link',{name:/AC204 Grow revenue/})
      await objective.click()
      await expect(page.getByRole('heading',{name:'AC204 Grow revenue',exact:true})).toBeVisible()
      await page.goBack()
      await expect(objective).toBeVisible()
    }
  })
}

for(const width of [390,1440]) test(`Task Objective relation and absent Project stay truthful at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900})
  await page.addInitScript(()=>localStorage.setItem('mos.locale','en'))
  await loginAs(page,'dewi.dev@example.test',DEMO_PASSWORD)
  await page.goto('work/tasks')
  await page.getByRole('link',{name:/^AC204 Sign the lease/}).click()
  const task=page.getByRole('region',{name:'AC204 Sign the lease',exact:true})
  await expect(task).toBeVisible()
  await task.getByRole('link',{name:'AC204 Grow revenue',exact:true}).first().click()
  await expect(page.getByRole('region',{name:'AC204 Grow revenue',exact:true})).toBeVisible()
  if(width===390) await page.goBack()
  else await page.getByRole('button',{name:/^Back/i}).click()
  await expect(task).toBeVisible()
  await expect(task.getByRole('link',{name:'AC204 Menu launch',exact:true})).toHaveCount(0)
})

// TEMPORARY #751 debug probe — deleted before commit.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

const __dirname = dirname(fileURLToPath(import.meta.url))
function env(key: string): string {
  for (const line of readFileSync(resolve(__dirname, '../.env.e2e'), 'utf-8').split('\n')) {
    if (line.startsWith(key + '=')) return line.slice(key.length + 1).trim()
  }
  return ''
}
const SUPABASE_URL = env('VITE_SUPABASE_URL')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const ORG = '10000000-0000-0000-0000-000000000001'
const TASK_ID = '75100000-0000-0000-0000-000000000001'

async function sql(query: string) {
  const res = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY }, body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

test('probe the record-page flex chain at 390', async ({ page }) => {
  await sql(`
    delete from mos.tasks where id = '${TASK_ID}';
    insert into mos.tasks (
      id, org_id, title, business_unit_id, status,
      responsible_person_id, accountable_person_id, consulted_person_ids, informed_person_ids,
      description, due_date, created_by
    )
    select '${TASK_ID}', '${ORG}', 'Guard pinned header 751', bu.id, 'Open',
           '${VIEWER.personId}', '${VIEWER.personId}', '{}', '{}',
           'Guard 751 long body. ' || repeat('Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore. ', 80),
           '2026-12-01', '${VIEWER.personId}'
    from (select id from shared.business_units where org_id = '${ORG}' order by id limit 1) bu;
  `)
  await page.setViewportSize({ width: 390, height: 844 })
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto(`work/tasks/${TASK_ID}`)
  await page.waitForURL(new RegExp(`/work/tasks/${TASK_ID}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Guard pinned header 751' })).toBeVisible({ timeout: 30_000 })
  const chain = await page.evaluate(() => {
    const selectors = [
      'main[data-page-family="focused-record"]',
      '.page-frame__content',
      '.record-doc',
      '.record-doc .record-details',
      '.record-viewer',
      '.record-viewer__body',
    ]
    return selectors.map((sel) => {
      const el = document.querySelector(sel)
      if (!el) return { sel, missing: true }
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        sel,
        display: cs.display,
        flexDirection: cs.flexDirection,
        flex: cs.flex,
        minHeight: cs.minHeight,
        overflow: cs.overflow,
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }
    })
  })
  console.log('[probe-751]', JSON.stringify(chain, null, 1))
  await sql(`delete from mos.tasks where id = '${TASK_ID}'`)
})

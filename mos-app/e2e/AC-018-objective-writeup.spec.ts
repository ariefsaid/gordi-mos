// AC-018 (objective write-up, e2e): an admin opens an Objective's Write-up tab for the first time,
// writes a heading and a paragraph, saves, reloads, and the content returns through the editor.
// The editor code loads only with that tab — neither the collection page nor the opened record requests it.
// FR-011 / FR-013 / NFR-003. Fixtures seeded by global-setup; this spec adds its own Objective.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'
import { localSqlRead } from './helpers/local-sql-read'

const ORG = '10000000-0000-0000-0000-000000000001'
const OBJ = 'c1000000-0000-0000-0000-000000000018'
const OBJ_NAME = 'E2E Write-up Objective'

function loadEnv(filePath: string): Record<string, string> {
  try {
    const entries: Array<[string, string]> = []
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator <= 0) throw new Error(`invalid entry in ${filePath}`)
      entries.push([trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()])
    }
    return Object.fromEntries(entries)
  } catch (error) {
    // CI supplies the keys as environment variables and has no file.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error(`[AC-018] could not read ${filePath}`, { cause: error })
  }
}
const env = loadEnv(resolve(process.cwd(), '.env.e2e'))
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const supabaseUrl = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
async function execSql(query: string) {
  if (!serviceRoleKey) throw new Error('[AC-018] SUPABASE_SERVICE_ROLE_KEY not set')
  const response = await fetch(`${supabaseUrl}/pg/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey }, body: JSON.stringify({ query }) })
  if (!response.ok) throw new Error(`[AC-018] SQL exec failed: ${response.status}`)
}

let ownsObjective = false
test.beforeAll(async () => {
  const existing = await localSqlRead(`select id from mos.objectives where id='${OBJ}'`)
  if (existing.length) throw new Error('Reserved write-up fixture already exists; preserve it')
  ownsObjective = true
  await execSql(`INSERT INTO mos.objectives (id, org_id, name) VALUES ('${OBJ}', '${ORG}', '${OBJ_NAME}') ON CONFLICT (id) DO NOTHING;`)
})
test.afterAll(async () => { if (ownsObjective) await execSql(`DELETE FROM mos.objectives WHERE id='${OBJ}';`) })

test.describe('AC-018: Objective write-up editor', () => {
  test.skip(isShipGated('/work/objectives'), 'ship-gated surface — no route')

  test('admin writes a heading and a paragraph, saves, reloads, and reads them back; the editor loads only when the write-up opens', async ({ page }) => {
    const editorRequests: string[] = []
    page.on('request', (request) => {
      if (/vendor-editor|objective-writeup-editor/.test(request.url())) editorRequests.push(request.url())
    })
    const writeUpSaves: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && /objectives/.test(request.url()) && /write_up/.test(request.postData() ?? '')) writeUpSaves.push(request.url())
    })
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('work/objectives')
    // #1292 gives catalog rows and cells their own accessible owners, so identify the row by its record link.
    const objectiveRow = page.getByRole('row').filter({
      has: page.getByRole('link', { name: OBJ_NAME, exact: true }),
    })
    await expect(objectiveRow).toBeVisible({ timeout: 10_000 })
    expect(editorRequests).toEqual([])

    await page.goto(`work/objectives/${OBJ}`)
    const openPrompt = page.getByRole('button', { name: 'Write why this Objective matters' })
    await expect(openPrompt).toBeVisible({ timeout: 10_000 })
    await page.waitForLoadState('networkidle')
    expect(editorRequests).toEqual([])
    await openPrompt.click()
    const editor = page.getByRole('textbox', { name: 'Objective write-up' })
    await expect(editor).toBeVisible({ timeout: 15_000 })
    expect(editorRequests.length).toBeGreaterThan(0)

    await editor.click()
    await page.keyboard.type('## Why this matters')
    await page.keyboard.press('Enter')
    await page.keyboard.type('We open two new sites.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
    // Typing saved nothing on its own: one deliberate Save, one request.
    await page.waitForTimeout(3500)
    expect(writeUpSaves).toHaveLength(1)

    await page.reload()
    await expect(page.getByText('We open two new sites.')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Edit write-up' }).click()
    await expect(page.getByRole('heading', { name: 'Why this matters' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('We open two new sites.')).toBeVisible()
  })
})

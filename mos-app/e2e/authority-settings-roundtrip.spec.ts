import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { loginAs } from './helpers/login'

// Every changed authority row, Team, BU, record and person belongs to this fresh tenant.
// The existing tenant's matrix and dev personas are never changed by this journey.
test('R6: Admin matrix and designated Team lead survive reload and govern own/cross-BU/member actions', async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const env = Object.fromEntries(readFileSync(new URL('../.env.e2e', import.meta.url), 'utf8').split('\n')
    .filter((line) => line.trim() && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]))
  const url = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!
  expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname)
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const org = randomUUID(), ownBu = randomUUID(), crossBu = randomUUID(), team = randomUUID()
  const ownProject = randomUUID(), crossProject = randomUUID()
  const actors = ['Admin', 'Lead', 'Member'].map((role) => ({ role, person: randomUUID(), email: `e2e.r6.${role.toLowerCase()}.${org}@example.test`, user: '' }))
  const password = 'E2e-roundtrip-123!'
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
  let tenantCreated = false
  try {
    for (const actor of actors) {
      const result = await admin.auth.admin.createUser({ email: actor.email, password, email_confirm: true })
      if (result.error) throw result.error
      actor.user = result.data.user.id
    }
    await localSql(`
      INSERT INTO shared.orgs (id,name,slug) VALUES ('${org}','R6 authority fixture','r6-${org}');
    `)
    tenantCreated = true
    await localSql(`
      INSERT INTO shared.business_units (id,org_id,name) VALUES ('${ownBu}','${org}','R6 Own BU'),('${crossBu}','${org}','R6 Cross BU');
      INSERT INTO shared.teams (id,org_id,business_unit_id,name,code) VALUES ('${team}','${org}','${ownBu}','R6 Test Team','r6-team');
      ${actors.map((actor) => `INSERT INTO shared.people (id,org_id,user_id,full_name,email) VALUES ('${actor.person}','${org}','${actor.user}','R6 ${actor.role}','${actor.email}');
      INSERT INTO shared.person_access_roles (org_id,person_id,access_role) VALUES ('${org}','${actor.person}','${actor.role === 'Admin' ? 'admin' : 'member'}');
      INSERT INTO shared.team_memberships (org_id,person_id,team_id,is_primary) VALUES ('${org}','${actor.person}','${team}',true);`).join('\n')}
      INSERT INTO mos.work_lines (id,org_id,name,type,business_unit_id) VALUES
      ('${ownProject}','${org}','R6 Own Project','project','${ownBu}'),('${crossProject}','${org}','R6 Cross Project','project','${crossBu}');
    `)
    const pages: Page[] = []
    for (const actor of actors) {
      const context = await browser.newContext()
      contexts.push(context)
      const page = await context.newPage()
      await loginAs(page, actor.email, password)
      pages.push(page)
    }
    const [settings, lead, member] = pages
    for (const collection of ['projects', 'objectives', 'tasks']) {
      const query = collection === 'tasks' ? 'archived=1' : 'view=archived'
      await member.goto(`work/${collection}?${query}`)
      await expect(member.getByRole('heading', { name: 'Nothing archived yet', exact: true })).toBeVisible()
      await expect(member.getByRole('button', { name: 'Clear filters', exact: true })).toHaveCount(0)
      if (collection !== 'tasks') await expect(member.getByRole('button', { name: 'Current status', exact: true })).toHaveText('Archived')
      await member.screenshot({ path: testInfo.outputPath(`${collection}-archived-empty.png`), fullPage: true })
    }
    await settings.goto('admin/access')
    const originalRead = settings.waitForResponse((response) => response.url().endsWith('/rpc/list_role_authority') && response.ok())
    await settings.reload()
    const original = await (await originalRead).json() as { action: string; role: string; scope: string }[]
    const originalScope = original.find((row) => row.action === 'workline.manage' && row.role === 'team_lead')!.scope
    const labels: Record<string, string> = { none: 'No additional permission', own_bu: 'Own Business Unit', org: 'Organization' }
    async function choose(label: string, value: string) {
      await settings.getByRole('combobox', { name: label, exact: true }).click()
      await settings.getByRole('listbox', { name: label, exact: true })
        .getByRole('option', { name: value, exact: true }).click()
    }
    async function saveScope(value: string) {
      const picker = settings.getByRole('combobox', { name: 'Manage Projects & Processes — Team lead', exact: true })
      if (!(await picker.innerText()).includes(value)) {
        await choose('Manage Projects & Processes — Team lead', value)
        const saved = settings.waitForResponse((response) => response.url().endsWith('/rpc/save_role_authority') && response.ok())
        await settings.getByRole('button', { name: 'Save access rules', exact: true }).click()
        await saved
      }
      await settings.reload()
      await expect(picker).toContainText(value)
    }
    async function designate(value: string) {
      await choose('R6 Test Team team lead', value)
      const saved = settings.waitForResponse((response) => response.url().endsWith('/rpc/save_team_lead_assignment') && response.ok())
      await settings.getByRole('button', { name: 'Save R6 Test Team team lead' }).click()
      await saved
      await settings.reload()
      await expect(settings.getByRole('combobox', { name: 'R6 Test Team team lead' })).toContainText(value)
    }
    async function recordAction(page: Page, id: string, allowed: boolean) {
      await page.goto(`work/projects/${id}`)
      await expect(page.getByRole('heading', { name: id === ownProject ? 'R6 Own Project' : 'R6 Cross Project', exact: true })).toBeVisible()
      const archive = page.getByRole('button', { name: 'Archive', exact: true })
      // Record actions live in the shared overflow menu; its absence is itself the denied affordance.
      const more = page.getByRole('button', { name: /more actions/i })
      if (await more.count()) await more.click()
      if (allowed) await expect(page.getByRole('menuitem', { name: 'Archive', exact: true }).or(archive)).toBeVisible()
      else await expect(page.getByRole('menuitem', { name: 'Archive', exact: true }).or(archive)).toHaveCount(0)
      await page.keyboard.press('Escape')
    }
    await expect(settings.getByRole('combobox', { name: 'R6 Test Team team lead' })).toContainText('No designated lead')
    await saveScope('No additional permission')
    await designate('R6 Lead')
    await recordAction(lead, ownProject, false)
    await saveScope('Own Business Unit')
    await recordAction(lead, ownProject, true)
    await recordAction(lead, crossProject, false)
    await recordAction(member, ownProject, false)
    await designate('No designated lead')
    await recordAction(lead, ownProject, false)
    await saveScope(labels[originalScope])
    const restoredRead = settings.waitForResponse((response) => response.url().endsWith('/rpc/list_role_authority') && response.ok())
    await settings.reload()
    expect(await (await restoredRead).json()).toEqual(original)
    await expect(settings.getByRole('combobox', { name: 'R6 Test Team team lead' })).toContainText('No designated lead')
    await settings.screenshot({ path: testInfo.outputPath('authority-restored.png'), fullPage: true })
    await settings.getByRole('combobox', { name: 'R6 Test Team team lead' }).scrollIntoViewIfNeeded()
    await settings.locator('[data-team-lead-row]').screenshot({ path: testInfo.outputPath('team-lead-restored.png') })
    // Also restore physical absence of the one override row; effective defaults were restored through UI above.
    await localSql(`DELETE FROM shared.role_authority WHERE org_id = '${org}' AND action = 'workline.manage' AND role = 'team_lead';`)
    const residualAuthority = await localSqlRead(`SELECT 1 AS present FROM shared.role_authority WHERE org_id = '${org}'`)
    const residualLead = await localSqlRead(`SELECT 1 AS present FROM shared.team_lead_assignments WHERE org_id = '${org}'`)
    expect([...residualAuthority, ...residualLead], 'R6 restoration must leave no tenant rows').toHaveLength(0)
    console.log('R6: matrix original restored; designation original null restored; own-BU grant, cross-BU denial, unrelated-member denial, and designation removal verified after reload')
  } finally {
    for (const context of contexts) await context.close()
    // This ID was allocated and inserted by this invocation. Its cascading children are all fixture-owned.
    if (tenantCreated) await localSql(`DELETE FROM shared.orgs WHERE id = '${org}';`)
    for (const actor of actors) if (actor.user) {
      const result = await admin.auth.admin.deleteUser(actor.user)
      expect(result.error, 'owned auth user cleanup').toBeNull()
    }
  }
})

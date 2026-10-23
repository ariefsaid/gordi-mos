// AC-041 [e2e] — one journey per stage of staff attendance (spec docs/specs/staff-attendance.spec.md).
//
//   Stage 1  a lead publishes a week; the member sees the shift on Home.
//   Stage 2  a member reports sick; a teammate at the same Site claims; the lead confirms.
//   Stage 3  a member consents, then clocks in with a mocked position and a mocked camera photo;
//            the lead's today view shows them as in.
//
// The rules (time windows, geofence maths, claim races, retention) are pgTAP's. This asserts only
// that each stage's goal is reachable by the people it is for, end to end, on a real stack.
//
// Every journey runs in its own fresh tenant (the authority-settings-roundtrip pattern): its Site,
// Team, people and auth users are created here and removed afterwards, so no dev persona, Team or
// roster is touched and re-runs never collide. The member acts at 390 px, the lead on desktop.
//
// Position is mocked through the browser context (geolocation + permission) and the camera through
// setInputFiles on the capture input; the app code under test is unchanged.

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { loginAs } from './helpers/login'
import { chooseSelectOption } from './helpers/select'

const PASSWORD = 'E2e-attendance-123!'
const SITE_NAME = 'E2E Attendance Site'
const TEAM_NAME = 'E2E Attendance Team'
const SITE_PIN = { latitude: -6.2, longitude: 106.8 }
const PHONE = { width: 390, height: 844 }
const SELFIE = fileURLToPath(new URL('./fixtures/photos/waste-food-photo.jpg', import.meta.url))

type Who = 'lead' | 'member' | 'teammate'
interface Actor { person: string; user: string; email: string; name: string }

function loadEnv(): Record<string, string> {
  const file = new URL('../.env.e2e', import.meta.url)
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return Object.fromEntries(text.split('\n')
    .filter((line) => line.trim() && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]))
}

function wibDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

// Stages 2 and 3 need a shift that starts a few minutes from now and still belongs to today's
// WIB date; in the last half hour of the day there is no such shift, so those journeys stand down.
function tooLateInWibDay(): boolean {
  const wib = new Date(Date.now() + 7 * 3600_000)
  return wib.getUTCHours() * 60 + wib.getUTCMinutes() >= 23 * 60 + 30
}

async function createWorld() {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!
  expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname)
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const org = randomUUID(), bu = randomUUID(), site = randomUUID(), team = randomUUID()
  const actors = Object.fromEntries((['lead', 'member', 'teammate'] as const).map((who) => [who, {
    person: randomUUID(), user: '', name: `E2E Roster ${who[0].toUpperCase()}${who.slice(1)}`,
    email: `e2e.ac041.${who}.${org}@example.test`,
  }])) as Record<Who, Actor>
  let tenantCreated = false

  try {
    for (const actor of Object.values(actors)) {
      const result = await admin.auth.admin.createUser({ email: actor.email, password: PASSWORD, email_confirm: true })
      if (result.error) throw result.error
      actor.user = result.data.user.id
    }
    await localSql(`INSERT INTO shared.orgs (id,name,slug) VALUES ('${org}','AC-041 attendance fixture','ac041-${org}');`)
    tenantCreated = true
    await localSql(`
      INSERT INTO shared.business_units (id,org_id,name) VALUES ('${bu}','${org}','AC-041 BU');
      INSERT INTO shared.sites (id,org_id,name,code,latitude,longitude,attendance_radius_m)
        VALUES ('${site}','${org}','${SITE_NAME}','ac041-site',${SITE_PIN.latitude},${SITE_PIN.longitude},100);
      INSERT INTO shared.teams (id,org_id,business_unit_id,site_id,name,code)
        VALUES ('${team}','${org}','${bu}','${site}','${TEAM_NAME}','ac041-team');
      ${Object.values(actors).map((actor) => `
      INSERT INTO shared.people (id,org_id,user_id,full_name,email) VALUES ('${actor.person}','${org}','${actor.user}','${actor.name}','${actor.email}');
      INSERT INTO shared.person_access_roles (org_id,person_id,access_role) VALUES ('${org}','${actor.person}','member');
      INSERT INTO shared.team_memberships (org_id,person_id,team_id,is_primary) VALUES ('${org}','${actor.person}','${team}',true);`).join('\n')}
      INSERT INTO shared.team_lead_assignments (org_id,team_id,lead_person_id,assigned_by)
        VALUES ('${org}','${team}','${actors.lead.person}','${actors.lead.person}');
      INSERT INTO ops.staff_shift_templates (org_id,site_id,name,start_time,end_time,created_by)
        VALUES ('${org}','${site}','E2E Evening','16:00','23:00','${actors.lead.person}');
    `)
  } catch (error) {
    await cleanupWorld({ admin, org, actors, tenantCreated })
    throw error
  }
  return { admin, org, site, team, actors, tenantCreated }
}

type World = Awaited<ReturnType<typeof createWorld>>

async function cleanupWorld(world: Pick<World, 'admin' | 'org' | 'actors' | 'tenantCreated'>) {
  // The org id was allocated by this invocation; everything under it is fixture-owned.
  if (world.tenantCreated) {
    try { await localSql(`DELETE FROM shared.orgs WHERE id = '${world.org}';`) }
    catch (error) { console.warn(`[AC-041] fixture tenant ${world.org} left in the disposable database: ${String(error)}`) }
  }
  for (const actor of Object.values(world.actors)) if (actor.user) await world.admin.auth.admin.deleteUser(actor.user)
}

/** A published roster with one shift for a Person, written directly: stages 2 and 3 start from a
 *  published week, which stage 1 proves is reachable through the app. */
async function seedPublishedShift(world: World, personId: string, start: Date, end: Date): Promise<string> {
  const roster = randomUUID(), shift = randomUUID()
  await localSql(`
    INSERT INTO ops.staff_rosters (id,org_id,team_id,site_id,week_start,status,created_by,published_at)
      VALUES ('${roster}','${world.org}','${world.team}','${world.site}','${mondayOf(wibDate(start))}','published','${world.actors.lead.person}',now());
    INSERT INTO ops.staff_shifts (id,org_id,roster_id,team_id,site_id,person_id,local_date,template_name,start_at,end_at,created_by)
      VALUES ('${shift}','${world.org}','${roster}','${world.team}','${world.site}','${personId}','${wibDate(start)}','E2E Evening',
        '${start.toISOString()}','${end.toISOString()}','${world.actors.lead.person}');
  `)
  return shift
}

async function signedIn(browser: Browser, contexts: BrowserContext[], actor: Actor, options: Parameters<Browser['newContext']>[0] = {}): Promise<Page> {
  const context = await browser.newContext(options)
  contexts.push(context)
  const page = await context.newPage()
  await loginAs(page, actor.email, PASSWORD)
  return page
}

test.describe('AC-041 staff attendance journeys', () => {
  test.setTimeout(180_000)
  let world: World
  const contexts: BrowserContext[] = []

  test.beforeEach(async () => { world = await createWorld() })
  test.afterEach(async () => {
    for (const context of contexts.splice(0)) await context.close()
    await cleanupWorld(world)
  })

  test('AC-041 stage 1: a lead publishes a week and the member sees the shift on Home', async ({ browser }) => {
    const { lead, member } = world.actors
    const nextMonday = addDays(mondayOf(wibDate(new Date())), 7)
    const leadPage = await signedIn(browser, contexts, lead)
    const memberPage = await signedIn(browser, contexts, member, { viewport: PHONE })

    await leadPage.goto('staff/shifts')
    await leadPage.getByRole('tab', { name: 'Team roster', exact: true }).click()
    const loaded = leadPage.waitForResponse((response) => response.url().includes('/rpc/get_staff_roster')
      && (response.request().postData() ?? '').includes(nextMonday))
    await leadPage.getByRole('button', { name: 'Next week', exact: true }).click()
    await loaded
    await leadPage.getByRole('button', { name: 'Add shift', exact: true }).click()
    const form = leadPage.getByRole('dialog')
    await expect(form.getByLabel('Shift date')).toHaveValue(nextMonday)

    await chooseSelectOption(leadPage, leadPage.getByRole('combobox', { name: 'Person', exact: true }), member.name)
    await chooseSelectOption(leadPage, leadPage.getByRole('combobox', { name: 'Shift hours', exact: true }), /^E2E Evening/)
    await form.getByRole('button', { name: 'Add shift', exact: true }).click()
    await expect(leadPage.getByText('Shift saved.')).toBeVisible()

    // A draft week is the lead's working copy: the member sees nothing yet.
    await memberPage.goto('')
    const upcoming = memberPage.getByRole('region', { name: 'Your next shifts' })
    await expect(upcoming).toContainText('No upcoming shifts are published yet.')

    await leadPage.getByRole('button', { name: 'Publish week', exact: true }).click()
    await expect(leadPage.getByText(/Week published/)).toBeVisible()

    await memberPage.reload()
    await expect(upcoming).toContainText('16:00–23:00 WIB')
    await expect(upcoming).toContainText(`${SITE_NAME} · ${TEAM_NAME}`)
  })

  test('AC-041 stage 2: a member reports sick, a teammate claims the open shift and the lead confirms', async ({ browser }) => {
    test.skip(tooLateInWibDay(), 'needs a shift that starts later today (WIB)')
    const { lead, member, teammate } = world.actors
    const start = new Date(Date.now() + 20 * 60_000)
    const shift = await seedPublishedShift(world, member.person, start, new Date(start.getTime() + 2 * 3600_000))

    const memberPage = await signedIn(browser, contexts, member, { viewport: PHONE })
    await memberPage.goto('staff/shifts')
    await memberPage.getByRole('tab', { name: 'Absence', exact: true }).click()
    await memberPage.getByRole('button', { name: 'Report sick today', exact: true }).click()
    await expect(memberPage.getByText(/^Accepted\./)).toBeVisible()

    const teammatePage = await signedIn(browser, contexts, teammate, { viewport: PHONE })
    await teammatePage.goto('staff/shifts')
    await teammatePage.getByRole('tab', { name: 'Open shifts', exact: true }).click()
    await teammatePage.getByRole('button', { name: 'Claim this shift', exact: true }).click()
    await expect(teammatePage.getByText('Claim held.')).toBeVisible()

    const leadPage = await signedIn(browser, contexts, lead)
    await leadPage.goto('staff/shifts')
    await leadPage.getByRole('tab', { name: 'Requests', exact: true }).click()
    const claim = leadPage.getByText(new RegExp(`${teammate.name} claimed ${member.name}.s shift`))
    await expect(claim).toBeVisible()
    await leadPage.getByRole('button', { name: 'Confirm cover', exact: true }).click()
    await expect(claim).toHaveCount(0)

    await expect.poll(async () => (await localSqlRead<{ person_id: string }>(
      `select person_id from ops.staff_shifts where id = '${shift}'`))[0]?.person_id).toBe(teammate.person)
  })

  test('AC-041 stage 3: a member consents and clocks in with a mocked position and photo, and the lead sees them in', async ({ browser }) => {
    test.skip(tooLateInWibDay(), 'needs a shift that starts later today (WIB)')
    const { lead, member } = world.actors
    const start = new Date(Date.now() + 10 * 60_000)
    await seedPublishedShift(world, member.person, start, new Date(start.getTime() + 4 * 3600_000))

    // On the Site's pin, with a good fix.
    const memberPage = await signedIn(browser, contexts, member, {
      viewport: PHONE,
      permissions: ['geolocation'],
      geolocation: { ...SITE_PIN, accuracy: 10 },
    })
    await memberPage.goto('staff/shifts?view=clock')
    await memberPage.getByLabel('I agree to the statement above.').check()
    await memberPage.getByRole('button', { name: 'Agree and continue', exact: true }).click()

    await memberPage.getByRole('button', { name: 'Check my location', exact: true }).click()
    await expect(memberPage.getByText(/±10 m/)).toBeVisible()
    await memberPage.getByLabel('Take selfie').setInputFiles(SELFIE)
    await memberPage.getByRole('button', { name: 'Clock in', exact: true }).click()
    await expect(memberPage.getByText('Clock-in recorded.', { exact: false })).toBeVisible({ timeout: 20_000 })

    const leadPage = await signedIn(browser, contexts, lead)
    await leadPage.goto('staff/shifts')
    await leadPage.getByRole('tab', { name: /^Today.s attendance$/ }).click()
    const row = leadPage.locator('article', { hasText: member.name })
    await expect(row).toContainText('Clocked in')
  })
})

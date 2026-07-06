import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

const ORG = '10000000-0000-0000-0000-000000000001'
const RETAIL_OPS_BU = '20000000-0000-0000-0000-000000000014'
const OBJ = 'c3050000-0000-0000-0000-000000000010'
const WL = 'c3050000-0000-0000-0000-000000000001'

async function seedCascadeFixtures() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) throw new Error('Cascade e2e needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')

  const query = `
    insert into mos.objectives (id, org_id, name)
    values ('${OBJ}', '${ORG}', 'Operational Excellence')
    on conflict (id) do update set name = excluded.name;

    insert into mos.work_lines (id, org_id, name, type)
    values ('${WL}', '${ORG}', 'Daily IG Content', 'process')
    on conflict (id) do update set name = excluded.name, type = excluded.type;

    insert into mos.tasks (
      id, org_id, title, business_unit_id, status,
      responsible_person_id, accountable_person_id,
      consulted_person_ids, informed_person_ids,
      description, due_date, created_by, objective_id, work_line_id
    ) values
      ('c3050000-0000-0000-0000-000000000101', '${ORG}', 'AC-305 linked task', '${RETAIL_OPS_BU}', 'Open',
        '${VIEWER.personId}', '${VIEWER.personId}', '{}', '{}', 'Seeded for AC-305 linked branch.', null, '${VIEWER.personId}', '${OBJ}', '${WL}'),
      ('c3050000-0000-0000-0000-000000000102', '${ORG}', 'AC-305 unlinked task', '${RETAIL_OPS_BU}', 'Open',
        '${VIEWER.personId}', '${VIEWER.personId}', '{}', '{}', 'Seeded for AC-305 unlinked branch.', null, '${VIEWER.personId}', null, '${WL}'),
      ('c3050000-0000-0000-0000-000000000103', '${ORG}', 'AC-305 no work line task', '${RETAIL_OPS_BU}', 'Open',
        '${VIEWER.personId}', '${VIEWER.personId}', '{}', '{}', 'Seeded for AC-305 no-work-line branch.', null, '${VIEWER.personId}', '${OBJ}', null)
    on conflict (id) do update
      set title = excluded.title,
          objective_id = excluded.objective_id,
          work_line_id = excluded.work_line_id,
          responsible_person_id = excluded.responsible_person_id,
          accountable_person_id = excluded.accountable_person_id;
  `

  const res = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`seed failed: ${res.status} ${await res.text()}`)
}

test.describe('AC-305: everyone cascade journey', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('member can open Work → Cascade and narrow to Mine on phone', async ({ page }) => {
    await seedCascadeFixtures()
    await loginAs(page, VIEWER.email, VIEWER.password)

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await page.getByRole('button', { name: /open navigation/i }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Cascade' }).click()

    await expect(page).toHaveURL(/\/work\/cascade$/)
    await expect(page.getByRole('heading', { name: 'Work cascade' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Operational Excellence')).toBeVisible()
    await expect(page.getByText('Daily IG Content').first()).toBeVisible()
    await expect(page.getByText('AC-305 linked task')).toBeVisible()

    await page.getByRole('button', { name: 'Mine' }).click()

    await expect(page.getByRole('status', { name: 'Workload summary' })).toBeVisible()
    await expect(page.getByText('AC-305 linked task')).toBeVisible()
    await expect(page.getByText('(Unlinked)')).toBeVisible()
    await expect(page.getByText('AC-305 unlinked task')).toBeVisible()
    await expect(page.getByText('No Project/Process').first()).toBeVisible()
    await expect(page.getByText('AC-305 no work line task')).toBeVisible()
  })
})

// AC-524 [e2e] — Follow-up lifecycle at the server boundary.
// The feature ships dark (SHOW_FOLLOWUPS=false), so this curated e2e drives the same
// RPC the UI calls and verifies the DB state without requiring the chrome link to be live.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const vars: Record<string, string> = {}
    for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq !== -1) vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch { return {} }
}

const e2eEnv = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY = e2eEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ORG = '10000000-0000-0000-0000-000000000001'
const FU = 'b2400000-0000-0000-0000-000000000524'

async function sql(query: string): Promise<Array<Record<string, unknown>>> {
  if (!SERVICE_KEY) throw new Error('[AC-524] SUPABASE_SERVICE_ROLE_KEY not set')
  const res = await fetch(SUPABASE_URL + '/pg/query', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY }, body: JSON.stringify({ query }) })
  if (!res.ok) throw new Error('[AC-524] SQL failed: ' + (await res.text()).slice(0, 500))
  return (await res.json()) as Array<Record<string, unknown>>
}

function claims(person: string, roles: string[] = []) {
  return JSON.stringify({ org_id: ORG, person_id: person, access_roles: roles }).replaceAll("'", "''")
}

test('AC-524: chase→promise→partial→settle-with-evidence→confirm reaches confirmed', async () => {
  await sql(`
    delete from mos.follow_ups where id='${FU}';
    insert into shared.roles (id, org_id, business_unit_id, name) values ('b2400000-0000-0000-0000-000000000f10','${ORG}',(select id from shared.business_units where org_id='${ORG}' and code='b2b_sales' limit 1),'E2E FU Sales Lead') on conflict (id) do nothing;
    insert into shared.people (id, org_id, full_name) values ('b2400000-0000-0000-0000-000000000d10','${ORG}','E2E Sales Chaser') on conflict (id) do nothing;
    insert into shared.person_roles (org_id, person_id, role_id) values ('${ORG}','b2400000-0000-0000-0000-000000000d10','b2400000-0000-0000-0000-000000000f10') on conflict (person_id, role_id) do nothing;
    insert into mos.follow_ups (id, org_id, counterparty, kind, lane, source_invoice_ref, original_amount, running_balance, state, due_date) values ('${FU}','${ORG}','AC-524 Buyer','b2b_ar','b2b_sales','AC-524-INV',1000000,1000000,'open','2026-07-01');
  `)

  await sql(`set local role authenticated; set local request.jwt.claims='${claims('b2400000-0000-0000-0000-000000000d10')}';
    select mos.transition_follow_up('${FU}','chase','{}'::jsonb);
    select mos.transition_follow_up('${FU}','promise','{"promise_date":"2026-07-08"}'::jsonb);
    select mos.transition_follow_up('${FU}','partial','{"amount":300000,"cash_in_date":"2026-07-09","evidence":"TRF-AC-524-A"}'::jsonb);
    select mos.transition_follow_up('${FU}','settle','{"cash_in_date":"2026-07-10","evidence":"TRF-AC-524-B"}'::jsonb);
    reset role;`)
  await sql(`set local role authenticated; set local request.jwt.claims='${claims('40000000-0000-0000-0000-000000000002', ['finance'])}';
    select mos.transition_follow_up('${FU}','confirm','{}'::jsonb);
    reset role;`)

  const rows = await sql(`select state, running_balance, (select count(*) from mos.follow_up_events where follow_up_id='${FU}') as events from mos.follow_ups where id='${FU}'`)
  expect(rows[0]?.state).toBe('confirmed')
  expect(Number(rows[0]?.running_balance)).toBe(0)
  expect(rows[0]?.events).toBe(5)

  await sql(`delete from mos.follow_ups where id='${FU}'`)
})

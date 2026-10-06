-- #1436 — "Ask branch lead" on the Money Branch page: mos.ask_branch_lead creates one Task for the
-- branch's lead whose title and description carry a link to the Branch page and never a money
-- figure (Tasks are readable beyond Money's tiers). Only the margin tier (finance, manager) may ask.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.day', ((now() at time zone 'Asia/Jakarta')::date - 1)::text, true);

-- Gordi HQ (bf01) reports as ERP code GHQ, with a revenue figure that must never reach the Task.
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, branch_id, transactions,
   clean_revenue, snapshot_as_of, source_contract_version)
values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.day')::date, 'POS', 'GHQ', 'GHQ', 'Gordi HQ',
        '00000000-0000-0000-0000-00000000bf01', 212, 14234567.89, now(), 'v1'),
       ('00000000-0000-0000-0000-0000000000a1', current_setting('app.day')::date, 'POS', 'UNM', 'UNM', 'Unmapped', null,
        10, 100000, now(), 'v1');

-- d4 leads the Gordi HQ kitchen Team.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select t.org_id, '00000000-0000-0000-0000-0000000000d4', t.id, true, current_date - 1
  from shared.teams t
 where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_kitchen';
insert into shared.team_lead_assignments (org_id, team_id, lead_person_id)
select t.org_id, t.id, '00000000-0000-0000-0000-0000000000d4'
  from shared.teams t
 where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_kitchen';

select has_function('mos', 'ask_branch_lead', array['text', 'integer', 'date', 'text', 'text'],
  'mos.ask_branch_lead(branch_code, period, day, app_url, locale) exists');
select ok(not has_function_privilege('anon', 'mos.ask_branch_lead(text, integer, date, text, text)', 'EXECUTE'),
  'anon cannot ask a branch lead');

-- The app calls from its own origin; PostgREST exposes the request's headers to SQL.
select set_config('request.headers', '{"origin":"https://ops.example.test"}', true);


set local role authenticated;

-- Below the margin tier: a supervisor (revenue only) and a plain member are refused.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member","supervisor"]}');
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  '42501', null, 'a supervisor cannot ask a branch lead');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  '42501', null, 'a member cannot ask a branch lead');

-- Finance asks.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","finance"]}');
select set_config('app.task_id', mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')::text, true);

reset role;
select is((select responsible_person_id from mos.tasks where id = current_setting('app.task_id')::uuid),
  '00000000-0000-0000-0000-0000000000d4'::uuid, 'the Task is for the branch lead');
select is((select accountable_person_id from mos.tasks where id = current_setting('app.task_id')::uuid),
  '00000000-0000-0000-0000-0000000000d2'::uuid, 'the asker supervises it');
select is((select created_by from mos.tasks where id = current_setting('app.task_id')::uuid),
  '00000000-0000-0000-0000-0000000000d2'::uuid, 'the asker created it');
select is((select t.code from mos.tasks k join shared.teams t on t.id = k.team_id where k.id = current_setting('app.task_id')::uuid),
  'gordi_hq_kitchen', 'it belongs to the branch''s Team');
select is((select description from mos.tasks where id = current_setting('app.task_id')::uuid),
  'https://ops.example.test/mos/money/branch/GHQ?period=7&d=' || current_setting('app.day'),
  'the description is the link to this Branch view and nothing else');
select is((select title from mos.tasks where id = current_setting('app.task_id')::uuid),
  'Check Gordi HQ sales for ' || to_char(current_setting('app.day')::date, 'Dy FMDD Mon'),
  'the title names the branch and the day');
select ok((select title || ' ' || description !~ '(Rp|%|jt\M|14[.,]?2|14234567|\d+,\d)'
             from mos.tasks where id = current_setting('app.task_id')::uuid),
  'no money figure leaks into the Task');
select is((select count(*)::int from mos.task_events where task_id = current_setting('app.task_id')::uuid and event_type = 'created'),
  1, 'the created event is logged');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","finance"]}');
select is(mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en'),
  current_setting('app.task_id')::uuid, 'asking again about the same view returns the open Task');

-- A manager asks in Indonesian about another period.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member","manager"]}');
select set_config('app.task_id_id', mos.ask_branch_lead('GHQ', 30, current_setting('app.day')::date, 'https://ops.example.test/mos', 'id')::text, true);
reset role;
select matches((select title from mos.tasks where id = current_setting('app.task_id_id')::uuid),
  '^Periksa penjualan Gordi HQ untuk (Min|Sen|Sel|Rab|Kam|Jum|Sab) [0-9]{1,2} (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)$',
  'the Indonesian title');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","finance"]}');
select throws_ok($$select mos.ask_branch_lead('GHQ', 14, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  '22023', null, 'a period outside 7, 30 and 60 is refused');
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos?x=Rp 14,2 jt', 'en')$$,
  '22023', null, 'an app URL carrying anything beyond scheme, host and path is refused');
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://elsewhere.example.test/mos', 'en')$$,
  '22023', null, 'a link to a host other than the request origin is refused');
select set_config('request.headers', '{}', true);
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  '22023', null, 'a call with no request origin is refused');
select set_config('request.headers', '{"origin":"https://ops.example.test"}', true);
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date + 2, 'https://ops.example.test/mos', 'en')$$,
  '22023', null, 'a day after today is refused');
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date - 200, 'https://ops.example.test/mos', 'en')$$,
  '22023', null, 'a day before the Money window is refused');
select throws_ok($$select mos.ask_branch_lead('UNM', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  'P0002', null, 'an ERP code not linked to a MOS branch has no lead to ask');

-- Another org's finance cannot reach this branch.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","finance"]}');
select throws_ok($$select mos.ask_branch_lead('GHQ', 7, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  'P0002', null, 'another org cannot ask about this branch');

-- An archived lead is nobody to ask.
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","finance"]}');
select throws_ok($$select mos.ask_branch_lead('GHQ', 60, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  'P0002', null, 'an archived lead is nobody to ask');
reset role;
update shared.people set archived_at = null where id = '00000000-0000-0000-0000-0000000000d4';

-- No lead on the branch's Team: nobody to ask.
reset role;
delete from shared.team_lead_assignments where org_id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","finance"]}');
select throws_ok($$select mos.ask_branch_lead('GHQ', 60, current_setting('app.day')::date, 'https://ops.example.test/mos', 'en')$$,
  'P0002', null, 'a branch whose Team has no lead has nobody to ask');

select * from finish();
rollback;

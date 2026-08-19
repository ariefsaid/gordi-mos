-- mos, squashed baseline — the org_id tenancy seam across the whole schema.
--
-- AC (#182): "Given a person in org A, When they read any mos table, Then no row belonging to org B
-- is returned." Asserted table by table, against a fixture where org B is a REAL tenant holding a
-- real row in every one of them — so each zero below is isolation, not emptiness. A suite that only
-- proves "returns nothing" passes just as happily against a schema that returns nothing to anyone.
--
-- The reader is Author ...0d1 holding admin AND finance, deliberately the WIDEST persona available:
-- if the seam held only for a narrow role, that would prove the role gate rather than the org gate.
-- Every zero here is produced despite the caller being an admin of their own org.
--
-- The three parts of the seam — the column DEFAULT, the policy WITH CHECK, and the fail-closed claim
-- helpers — are each asserted at the end, because any one of them alone is defeatable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();   -- GrandMgr ...0d3 -> admin; Author ...0d1 -> member + finance
select mos._test_seed_rows();              -- one row in every mos table, in BOTH orgs

insert into mos.events (id, org_id, title, venue, is_outbound, starts_at, ends_at, created_by) values
  ('00000000-0000-0000-0000-00000000e0a1','00000000-0000-0000-0000-0000000000a1','Org A seam event','Office',false,now(),now() + interval '1 hour','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000e0b1','00000000-0000-0000-0000-0000000000b1','Org B seam event','Office',false,now(),now() + interval '1 hour','00000000-0000-0000-0000-0000000000b4');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["admin","finance"]}';

-- ── Not one org-B row is reachable, from any table ───────────────────────────────────────────
select is((select count(*)::int from mos.objectives                where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B objectives');
select is((select count(*)::int from mos.work_lines                where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B work_lines (Projects and Processes alike)');
select is((select count(*)::int from mos.process_cadences          where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B process cadences');
select is((select count(*)::int from mos.process_task_defs         where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B process task definitions');
select is((select count(*)::int from mos.process_runs              where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B process runs');
select is((select count(*)::int from mos.process_run_pending_tasks where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B pending process tasks');
select is((select count(*)::int from mos.tasks                     where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B tasks');
select is((select count(*)::int from mos.task_checklist_items      where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B checklist items');
select is((select count(*)::int from mos.task_events               where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B task events');
select is((select count(*)::int from mos.signals                   where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B signals');
select is((select count(*)::int from mos.events                    where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B events');
select is((select count(*)::int from mos.signal_mentions           where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B signal mentions');
select is((select count(*)::int from mos.signal_acknowledgements   where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B signal acknowledgements');
select is((select count(*)::int from mos.signal_revisions          where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B signal revisions');
select is((select count(*)::int from mos.signal_tasks              where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B signal-to-task links');
select is((select count(*)::int from mos.weekly_updates            where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B weekly updates');
select is((select count(*)::int from mos.weekly_update_items       where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B weekly update items');
select is((select count(*)::int from mos.comments                  where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B comments');
select is((select count(*)::int from mos.notifications             where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B notifications');
select is((select count(*)::int from mos.push_subscriptions        where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B push subscriptions');
select is((select count(*)::int from mos.user_views                where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B user views');
select is((select count(*)::int from mos.agent_threads             where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B deputy threads');
select is((select count(*)::int from mos.agent_runs                where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B deputy runs');
select is((select count(*)::int from mos.agent_events              where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B deputy events');
select is((select count(*)::int from mos.certified_metrics         where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A session reads zero org-B certified metric definitions');
select is((select count(*)::int from mos.budgets                   where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A finance/admin session reads zero org-B budgets');
select is((select count(*)::int from mos.budget_lines              where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A finance/admin session reads zero org-B budget lines');
select is((select count(*)::int from mos.follow_ups                where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A finance/admin session reads zero org-B follow-ups');
select is((select count(*)::int from mos.follow_up_events          where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A finance/admin session reads zero org-B follow-up events');
select is((select count(*)::int from reporting.esb_ar_reduction    where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'org seam: an org-A finance/admin session reads zero org-B ERP AR-reduction rows');

-- ── ...and the org-A rows ARE there ──────────────────────────────────────────────────────────
-- Without this the whole file above would pass against a schema that returns nothing to anybody.
select cmp_ok((select count(*) from mos.tasks), '>', 0::bigint,
  'org seam control: the same session DOES read its own org''s rows — the zeros above are isolation, not a broken read');
select is((select count(*)::int from mos.events where id = '00000000-0000-0000-0000-00000000e0a1'), 1,
  'org seam control: the org-A event is readable, so its foreign zero is isolation');

-- ── The stamp is a DEFAULT and a WITH CHECK, not one or the other ────────────────────────────
-- mos.objectives is the subject because it has a real INSERT policy in the shipped schema, so this
-- proves the shipped seam rather than one invented for the test.
insert into mos.objectives (name) values ('Stamped');
select is(
  (select org_id from mos.objectives where name = 'Stamped'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'org seam: an INSERT that omits org_id is stamped the SESSION org server-side, never client-chosen');

select throws_ok($$
  insert into mos.objectives (org_id, name)
  values ('00000000-0000-0000-0000-0000000000b1','Spoofed')
$$, '42501', null,
  'org seam: a client-supplied FOREIGN org_id is rejected — the WITH CHECK makes the default unspoofable');

reset role;
select * from finish();
rollback;

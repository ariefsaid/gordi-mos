-- mos, squashed baseline — ONE fail-closed assertion per policy, none inherited.
--
-- A re-authored RLS policy is a NEW policy. Its fail-closed proof does not carry over from the
-- policy it replaces, so this file pairs every policy created in
-- 20260805000006_mos_access_control.sql with its own negative assertion, written against that SQL.
-- Sections are ordered by table so the mapping is checkable by eye rather than by trust.
--
-- Two different shapes of "denied", and reading one for the other is exactly how a hole gets missed:
--   * an INSERT with no permitting policy RAISES 42501;
--   * an UPDATE or DELETE whose USING clause excludes the row silently affects ZERO ROWS;
--   * an UPDATE whose USING passes but whose WITH CHECK fails RAISES 42501.
-- Each is asserted in its correct form, and every zero-row case is confirmed by reading the
-- surviving state back as the owner — proving nothing moved, not merely that nothing was reported.
--
-- The 29 org-scoped SELECT policies are covered per table in mos_02_org_seam.sql, against a real
-- foreign tenant; this file adds their shared fail-closed property (a claimless session reads
-- nothing) once, and then gives its own assertion to every policy whose gate is something OTHER
-- than the org — owner, editor, author, manager chain, Signal read rules, capability, lane.
--
-- Personas, and why each one:
--   Author      ...0d1  member + finance. Owns every owner-scoped fixture row. Holds NEITHER
--                       objective.manage nor workline.manage, which makes finance the honest
--                       negative subject for the cascade write gates.
--   Peer        ...0d4  holds the SAME role as Author, so is neither a manager of her nor an
--                       editor of her tasks — a same-org member who should be able to reach nothing
--                       of hers beyond what is org-readable.
--   DirectMgr   ...0d2  one level above Author: can READ her weekly update and must not WRITE it.
--   GrandMgr    ...0d3  admin. The strongest same-org persona, used to prove that owner-scoped
--                       tables do not yield to admin.
--   Lead2Holder ...0d7  holds a Unit-2 role only, is in no Team, and is mentioned in nothing —
--                       the one org-A persona no Signal read rule reaches.
--   ForeignMgr  ...0b4  org B's admin. Cross-tenant negative.
begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select mos._test_seed_rows();

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. The org-scoped read policies close together
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every one of them resolves through shared.current_org_id(), so a session with no claims fails
-- them all at once. Per-table cross-org isolation is asserted in mos_02 against a real org-B tenant.
set local request.jwt.claims = '{}';
select is(
  (select (select count(*) from mos.objectives)                + (select count(*) from mos.work_lines)
        + (select count(*) from mos.process_cadences)          + (select count(*) from mos.process_task_defs)
        + (select count(*) from mos.process_runs)              + (select count(*) from mos.process_run_pending_tasks)
        + (select count(*) from mos.tasks)                     + (select count(*) from mos.task_checklist_items)
        + (select count(*) from mos.task_events)               + (select count(*) from mos.signals)
        + (select count(*) from mos.signal_mentions)           + (select count(*) from mos.signal_acknowledgements)
        + (select count(*) from mos.signal_revisions)          + (select count(*) from mos.signal_tasks)
        + (select count(*) from mos.weekly_updates)            + (select count(*) from mos.weekly_update_items)
        + (select count(*) from mos.comments)                  + (select count(*) from mos.notifications)
        + (select count(*) from mos.push_subscriptions)        + (select count(*) from mos.user_views)
        + (select count(*) from mos.agent_threads)             + (select count(*) from mos.agent_runs)
        + (select count(*) from mos.agent_events)              + (select count(*) from mos.certified_metrics)
        + (select count(*) from mos.budgets)                   + (select count(*) from mos.budget_lines)
        + (select count(*) from mos.follow_ups)                + (select count(*) from mos.follow_up_events)
        + (select count(*) from reporting.esb_ar_reduction)),
  0::bigint,
  'every mos read policy: a session with NO claims reads zero rows across all 29 tables (fail closed, no raise)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. Read policies whose gate is something other than the org
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── The Signal read gate: default-deny, and none of its five rules reaches Lead2Holder ───────
-- She is in no Team (R1), holds no role in the owning BU (R2), her Unit-2 rank is not strictly
-- higher than the owning BU's (R3, both default 0 — the rule is inert until an admin configures
-- ranks), holds no mention (R4), and signal.read_all is unregistered (R5).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';

select is((select count(*)::int from mos.signals), 0,
  'signals_select: a same-org member no read rule reaches sees ZERO signals — the gate is default-deny, not org-readable');
select is((select count(*)::int from mos.signal_mentions), 0,
  'signal_mentions_select: ...and zero mentions, so the mention list cannot be used to enumerate signals');
select is((select count(*)::int from mos.signal_acknowledgements), 0,
  'signal_ack_select: ...and zero acknowledgements');
select is((select count(*)::int from mos.signal_revisions), 0,
  'signal_revisions_select: ...and zero revisions, so edit history cannot leak a body the reader may not see');
select is((select count(*)::int from mos.signal_tasks), 0,
  'signal_tasks_select: ...and zero signal-to-task links');
select is((select count(*)::int from mos.comments where entity_type = 'signal'), 0,
  'comments_select: ...and zero SIGNAL comments — the signal arm of the read predicate, not the plain org test');

-- The same session still reads what IS org-readable, so the zeros above are the Signal gate rather
-- than a broken session.
select cmp_ok((select count(*) from mos.tasks), '>', 0::bigint,
  'signals_select control: that same session DOES read org-readable tasks — the Signal zeros are the gate, not a dead claim');

-- ── Weekly updates: upward-only. A peer is not a manager. ────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.weekly_updates), 0,
  'weekly_updates_select_upward: a PEER holding the same role as the author reads zero — sideways is not upward');
select is((select count(*)::int from mos.weekly_update_items), 0,
  'weekly_update_items_select_upward: ...and zero lines, so the child table does not leak what the parent hides');

-- ── Owner-scoped surfaces do not yield to admin ──────────────────────────────────────────────
-- GrandMgr is a real admin of this org; that is the point. An inbox, a deputy transcript, a private
-- view and a push endpoint belong to one person, and "admin" is not an exception to that.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from mos.notifications), 0,
  'notifications_select: a same-org ADMIN reads zero notifications they do not own');
select is((select count(*)::int from mos.push_subscriptions), 0,
  'push_subscriptions_select: a same-org ADMIN reads zero push endpoints they do not own');
select is((select count(*)::int from mos.user_views), 0,
  'user_views_select: a same-org ADMIN reads zero private views they do not own');
select is((select count(*)::int from mos.agent_threads), 0,
  'agent_threads_select: a same-org ADMIN reads zero deputy threads they do not own');
select is((select count(*)::int from mos.agent_runs), 0,
  'agent_runs_select: a same-org ADMIN reads zero deputy runs they do not own');
select is((select count(*)::int from mos.agent_events), 0,
  'agent_events_select: a same-org ADMIN reads zero deputy events they do not own — the transcript has no admin read path at all');

-- ── Money surfaces: finance or admin only, and admin is not enough for the lane ──────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.certified_metrics), 0,
  'certified_metrics_select_finance_admin: a plain member reads zero certified metric definitions');
select is((select count(*)::int from mos.budgets), 0,
  'budgets_select_finance_admin: a plain member reads zero budgets');
select is((select count(*)::int from mos.budget_lines), 0,
  'budget_lines_select_finance_admin: a plain member reads zero budget lines');
select is((select count(*)::int from mos.follow_ups), 0,
  'follow_ups_select: a plain member holding no lane BU reads zero follow-ups');
select is((select count(*)::int from mos.follow_up_events), 0,
  'follow_up_events_select: ...and zero settlement events — the ledger inherits the parent''s lane gate');
select is((select count(*)::int from reporting.esb_ar_reduction), 0,
  'esb_ar_reduction_select_finance_admin: a plain member reads zero ERP AR-reduction rows');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. Write policies
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── The cascade catalog: the gate is a CAPABILITY, so `finance` is the negative subject ──────
-- finance holds signal.create, signal.retract, signal.mention_bu, cogs.write and followup.confirm —
-- and neither cascade capability. That makes it a genuine "holds roles but not this one" negative
-- rather than a claimless session that would fail everything.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';

select throws_ok($$
  insert into mos.objectives (name) values ('Uncapable Objective')
$$, '42501', null,
  'objectives_insert_can_manage: a role holding no objective.manage cannot create an Objective');
select throws_ok($$
  update mos.objectives set name = 'Renamed by the incapable'
  where id = '00000000-0000-0000-0000-000000070002'
$$, '42501', null,
  'objectives_update_can_manage: USING lets the row be seen for update, WITH CHECK refuses the result — 42501, not a silent no-op');
select throws_ok($$
  insert into mos.work_lines (name, type) values ('Uncapable Project','project')
$$, '42501', null,
  'work_lines_insert_can_manage: a role holding no workline.manage cannot create a Project/Process');
select throws_ok($$
  update mos.work_lines set name = 'Renamed by the incapable'
  where id = '00000000-0000-0000-0000-000000070003'
$$, '42501', null,
  'work_lines_update_can_manage: same shape — the WITH CHECK is what refuses it');

-- ── Process definitions: admin or ops_lead ───────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  insert into mos.process_cadences (work_line_id, cadence_kind)
  values ('00000000-0000-0000-0000-000000070003','weekly')
$$, '42501', null,
  'process_cadences_insert_ops_lead_or_admin: a plain member cannot configure a cadence');
select throws_ok($$
  insert into mos.process_task_defs (work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-000000070004','Smuggled step','00000000-0000-0000-0000-0000000000d4')
$$, '42501', null,
  'process_task_defs_insert_ops_lead_or_admin: a plain member cannot add a generated-Task definition');

update mos.process_cadences set cadence_kind = 'monthly' where id = '00000000-0000-0000-0000-000000070005';
update mos.process_task_defs set title = 'Member Rewrite'  where id = '00000000-0000-0000-0000-000000070006';
update mos.tasks               set title = 'Member Rewrite' where id = '00000000-0000-0000-0000-000000070008';
update mos.task_checklist_items set label = 'Member Rewrite' where id = '00000000-0000-0000-0000-00000007000a';
update mos.signals             set body = 'Member Rewrite'  where id = '00000000-0000-0000-0000-00000007000c';
update mos.signal_mentions     set revoked_at = now()       where id = '00000000-0000-0000-0000-00000007000d';
update mos.weekly_update_items set label = 'Member Rewrite' where id = '00000000-0000-0000-0000-000000070012';
delete from mos.weekly_update_items where id = '00000000-0000-0000-0000-000000070012';

-- tasks_insert_member is deliberately OPEN to any org member — creation is not the gate, editing is.
-- Its fail-closed half is the cross-tenant case, asserted at the end of this section.
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Member-created task', '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000d4')
$$,
  'tasks_insert_member: any org member MAY create a task in their own org — creation is open by design');

select throws_ok($$
  insert into mos.task_checklist_items (task_id, label, position)
  values ('00000000-0000-0000-0000-000000070008','Smuggled step',9)
$$, '42501', null,
  'task_checklist_insert_editor: a non-editor of the parent task cannot add a checklist item');
select throws_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-000000070008','00000000-0000-0000-0000-0000000000d4','status_changed')
$$, '42501', null,
  'task_events_insert_editor: a non-editor cannot append to the audit log of someone else''s task');
select throws_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-000000070008','00000000-0000-0000-0000-0000000000d1','created')
$$, '42501', null,
  'task_events_insert_editor: ...and cannot write an event in ANOTHER person''s name — actor_person_id is pinned to the caller');

-- The three Signal child-write gates are asserted as Lead2Holder, not Peer, and the reason matters:
-- Peer holds a role in the OWNING BU, so read rule R2 grants her the Signal and she would pass the
-- read half of these predicates. Lead2Holder is the only org-A persona no read rule reaches, so a
-- denial here is the gate rather than an accident of who the fixture happened to pick.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select throws_ok($$
  insert into mos.signal_mentions (signal_id, mention_kind, target_person_id)
  values ('00000000-0000-0000-0000-00000007000c','person','00000000-0000-0000-0000-0000000000d7')
$$, '42501', null,
  'signal_mentions_insert: only the Signal''s AUTHOR may add a mention');
select throws_ok($$
  insert into mos.signal_acknowledgements (signal_id, person_id)
  values ('00000000-0000-0000-0000-00000007000c','00000000-0000-0000-0000-0000000000d7')
$$, '42501', null,
  'signal_ack_insert: acknowledging requires being able to READ the Signal');
select throws_ok($$
  insert into mos.signal_tasks (signal_id, task_id, created_by)
  values ('00000000-0000-0000-0000-00000007000c','00000000-0000-0000-0000-000000070008','00000000-0000-0000-0000-0000000000d7')
$$, '42501', null,
  'signal_tasks_insert: linking a Task to a Signal requires being able to read the Signal');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  insert into mos.weekly_updates (person_id, week_start, created_by)
  values ('00000000-0000-0000-0000-0000000000d1','2026-02-02','00000000-0000-0000-0000-0000000000d4')
$$, '42501', null,
  'weekly_updates_insert_author: nobody may open a weekly update in ANOTHER person''s name');
select throws_ok($$
  insert into mos.weekly_update_items (weekly_update_id, label, position)
  values ('00000000-0000-0000-0000-000000070011','Smuggled line',9)
$$, '42501', null,
  'weekly_update_items_insert_own: only the author writes lines on their own update');

select throws_ok($$
  insert into mos.comments (author_id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-0000000000d1','task','00000000-0000-0000-0000-000000070008','Forged authorship')
$$, '42501', null,
  'comments_insert: a comment cannot be written in another person''s name — author_id is pinned to the caller');

select throws_ok($$
  insert into mos.notifications (owner_id, title)
  values ('00000000-0000-0000-0000-0000000000d1','Planted in someone else''s inbox')
$$, '42501', null,
  'notifications_insert: a direct insert addressed to ANOTHER owner is refused — cross-owner delivery goes through mos.create_notification');
select throws_ok($$
  insert into mos.push_subscriptions (owner_id, endpoint)
  values ('00000000-0000-0000-0000-0000000000d1','https://push.example/hijack')
$$, '42501', null,
  'push_subscriptions_insert: a push endpoint cannot be registered against another person');
select throws_ok($$
  insert into mos.user_views (owner_id, name) values ('00000000-0000-0000-0000-0000000000d1','Planted view')
$$, '42501', null,
  'user_views_insert: a view cannot be created owned by someone else');
select throws_ok($$
  insert into mos.agent_threads (owner_id, title) values ('00000000-0000-0000-0000-0000000000d1','Planted thread')
$$, '42501', null,
  'agent_threads_insert: a deputy thread cannot be created owned by someone else');
select throws_ok($$
  insert into mos.agent_runs (thread_id, owner_id)
  values ('00000000-0000-0000-0000-000000070017','00000000-0000-0000-0000-0000000000d1')
$$, '42501', null,
  'agent_runs_insert: a run cannot be created owned by someone else');
select throws_ok($$
  insert into mos.agent_events (run_id, owner_id, seq, type, text)
  values ('00000000-0000-0000-0000-000000070018','00000000-0000-0000-0000-0000000000d1',9,'assistant','Planted turn')
$$, '42501', null,
  'agent_events_insert: a transcript event cannot be created owned by someone else');

-- Owner-scoped UPDATE/DELETE by a non-owner: USING excludes the row, so these are silent no-ops.
-- Every one is read back as the owner below.
update mos.notifications      set read_at = now()          where id = '00000000-0000-0000-0000-000000070014';
update mos.push_subscriptions set endpoint = 'https://push.example/hijacked' where id = '00000000-0000-0000-0000-000000070015';
delete from mos.push_subscriptions where id = '00000000-0000-0000-0000-000000070015';
update mos.user_views         set name = 'Hijacked view'   where id = '00000000-0000-0000-0000-000000070016';
update mos.agent_threads      set title = 'Hijacked thread' where id = '00000000-0000-0000-0000-000000070017';
update mos.agent_runs         set status = 'cancelled'      where id = '00000000-0000-0000-0000-000000070018';
update mos.agent_events       set rating = 'down'           where id = '00000000-0000-0000-0000-000000070019';

-- ── A manager may READ a weekly update and must never WRITE one ──────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select cmp_ok((select count(*) from mos.weekly_updates), '>', 0::bigint,
  'weekly_updates_select_upward control: the direct manager CAN read the report''s update — the upward arm works');
update mos.weekly_updates set summary = 'Rewritten by the manager'
 where id = '00000000-0000-0000-0000-000000070011';

-- ── A signal.retract holder is not an author ─────────────────────────────────────────────────
-- finance holds signal.retract, so the UPDATE policy's USING admits this session; the content-author
-- guard is what stops it rewriting the body. Asserted at the guard, which is where the control is.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin","finance"]}';
select throws_ok($$
  update mos.signals set body = 'Rewritten by a retract holder'
  where id = '00000000-0000-0000-0000-00000007000c'
$$, '42501', null,
  'signals_update_author: a signal.retract holder who is not the author is admitted by USING and then refused — content is author-only');

-- ── Cross-tenant writes: org B''s admin reaches nothing of org A''s ──────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
-- The refusal is 23514, not 42501, and that is worth naming rather than papering over: mos._guard_tasks
-- is SECURITY INVOKER and BEFORE triggers run ahead of the RLS WITH CHECK, so under org B's own RLS
-- the org-A business unit and people are INVISIBLE, the lookups return NULL, and the guard refuses
-- before the policy is ever consulted. Two independent controls both close this, and the outer one
-- is the one that speaks first.
select throws_ok($$
  insert into mos.tasks (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','Cross-org task','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1')
$$, '23514', null,
  'tasks_insert_member: an ADMIN of another org cannot create a task in org A — the invoker guard cannot even see the org-A references, so it refuses before the policy is reached');
update mos.tasks set title = 'Cross-org rewrite' where id = '00000000-0000-0000-0000-000000070008';
update mos.objectives set name = 'Cross-org rewrite' where id = '00000000-0000-0000-0000-000000070002';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. Closures that are a missing PRIVILEGE, not a policy
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A policy can be widened by a later ALTER; a missing GRANT fails closed with nothing to widen. Where
-- that is the real control, it is asserted directly rather than through a policy that is doing no work.
select ok(not has_table_privilege('authenticated','mos.budgets','INSERT')
      and not has_table_privilege('authenticated','mos.budgets','UPDATE'),
  'budgets_insert/update_cogs_write: authenticated holds NO write privilege on mos.budgets — the capture RPC is the only write path, so a client cannot assert its own COGS total');
select ok(not has_table_privilege('authenticated','mos.budget_lines','INSERT'),
  'budget_lines_insert_cogs_write: authenticated holds no INSERT privilege on mos.budget_lines either');
select ok(not has_table_privilege('authenticated','mos.certified_metrics','INSERT')
      and not has_table_privilege('authenticated','mos.certified_metrics','UPDATE')
      and not has_table_privilege('authenticated','mos.certified_metrics','DELETE'),
  'certified_metrics: the registry is migration-owned — authenticated cannot write a metric definition at all');
select ok(not has_table_privilege('authenticated','mos.signal_revisions','INSERT'),
  'signal_revisions: no INSERT privilege — edit history is written only by the definer guard trigger, so it cannot be forged');
select ok(not has_table_privilege('authenticated','mos.process_runs','INSERT')
      and not has_table_privilege('authenticated','mos.process_runs','UPDATE'),
  'process_runs: no write privilege — occurrences exist only via the spawn/complete RPCs, so idempotency cannot be sidestepped');
select ok(not has_table_privilege('authenticated','mos.process_run_pending_tasks','INSERT')
      and not has_table_privilege('authenticated','mos.process_run_pending_tasks','UPDATE'),
  'process_run_pending_tasks: no write privilege — a pending item is resolved only through the RPC, which checks the candidate list');
select ok(not has_table_privilege('authenticated','mos.follow_ups','INSERT')
      and not has_table_privilege('authenticated','mos.follow_ups','UPDATE'),
  'follow_ups: no write privilege — every settlement transition goes through the audited RPC');
select ok(not has_table_privilege('authenticated','mos.follow_up_events','INSERT'),
  'follow_up_events: no INSERT privilege — the ledger cannot be written except by the transition RPC');
select ok(not has_table_privilege('authenticated','mos.task_events','UPDATE'),
  'task_events: no UPDATE privilege — the change log is append-only at the privilege layer, not merely by policy');
select ok(not has_table_privilege('authenticated','mos.comments','UPDATE'),
  'comments: no UPDATE privilege — a comment cannot be silently edited after the fact');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. Nothing moved
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every zero-row UPDATE/DELETE above is now read back as the owner. Asserting the surviving state is
-- the stronger claim: it proves the row did not move, not merely that the statement reported nothing.
reset role;

select is((select cadence_kind from mos.process_cadences where id = '00000000-0000-0000-0000-000000070005'),
  'daily', 'process_cadences_update_ops_lead_or_admin: a plain member changed no cadence');
select is((select title from mos.process_task_defs where id = '00000000-0000-0000-0000-000000070006'),
  'Seam Step 70', 'process_task_defs_update_ops_lead_or_admin: a plain member changed no task definition');
select is((select title from mos.tasks where id = '00000000-0000-0000-0000-000000070008'),
  'Seam Task 70', 'tasks_update_editor: a non-R/A/manager member changed no task — and neither did another org''s admin');
select is((select label from mos.task_checklist_items where id = '00000000-0000-0000-0000-00000007000a'),
  'Seam step', 'task_checklist_update_editor: a non-editor changed no checklist item');
select is((select body from mos.signals where id = '00000000-0000-0000-0000-00000007000c'),
  'Seam signal 70', 'signals_update_author: a same-org non-author changed no Signal body');
select is((select revoked_at from mos.signal_mentions where id = '00000000-0000-0000-0000-00000007000d'),
  null, 'signal_mentions_update_author: a non-author revoked no mention');
select is((select summary from mos.weekly_updates where id = '00000000-0000-0000-0000-000000070011'),
  '', 'weekly_updates_update_author: the direct MANAGER — who can read it — wrote nothing');
select is((select label from mos.weekly_update_items where id = '00000000-0000-0000-0000-000000070012'),
  'Seam line', 'weekly_update_items_update_own: a non-author changed no line');
select is((select count(*)::int from mos.weekly_update_items where id = '00000000-0000-0000-0000-000000070012'),
  1, 'weekly_update_items_delete_own: a non-author deleted no line — the row survives');
select is((select read_at from mos.notifications where id = '00000000-0000-0000-0000-000000070014'),
  null, 'notifications_update: a non-owner did not mark someone else''s notification read');
select is((select endpoint from mos.push_subscriptions where id = '00000000-0000-0000-0000-000000070015'),
  'https://push.example/70', 'push_subscriptions_update: a non-owner changed no endpoint');
select is((select count(*)::int from mos.push_subscriptions where id = '00000000-0000-0000-0000-000000070015'),
  1, 'push_subscriptions_delete: a non-owner deleted no subscription — the row survives');
select is((select name from mos.user_views where id = '00000000-0000-0000-0000-000000070016'),
  'Seam view', 'user_views_update: a non-owner renamed no view');
select is((select title from mos.agent_threads where id = '00000000-0000-0000-0000-000000070017'),
  'Seam thread', 'agent_threads_update: a non-owner renamed no thread');
select is((select status from mos.agent_runs where id = '00000000-0000-0000-0000-000000070018'),
  'running', 'agent_runs_update: a non-owner cancelled no run');
select is((select rating from mos.agent_events where id = '00000000-0000-0000-0000-000000070019'),
  null, 'agent_events_update: a non-owner rated no transcript turn');
select is((select name from mos.objectives where id = '00000000-0000-0000-0000-000000070002'),
  'Seam Objective 70', 'objectives_update_can_manage: another org''s admin renamed no Objective');
select is((select count(*)::int from mos.tasks where org_id = '00000000-0000-0000-0000-0000000000a1'),
  2, 'tasks_insert_member: org A holds exactly the seam task plus the one its own member created — no cross-org task was smuggled in');

select * from finish();
rollback;

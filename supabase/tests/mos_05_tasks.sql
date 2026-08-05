-- mos, squashed baseline — tasks, their children, and the one guard that protects all three.
--
-- The task contract in one line: reading is org-wide because cross-unit visibility IS the product
-- (OD-P1-3), creating is open to any member, editing is R / A / a manager of either, and archiving
-- is narrower still — Accountable or a manager, never a Responsible acting alone.
--
-- The guard assertions below are the merged mos._guard_tasks, which replaced four separate trigger
-- functions. Each section names the invariant's origin so a reader can check nothing was dropped in
-- the merge. Note the deliberate error-code split, which is a contract and not an inconsistency:
-- reaching outside your tenant through a cascade or occurrence reference is 42501, while writing a
-- row whose directory references do not agree with its own org is 23514.
--
-- Personas from shared._test_seed_directory:
--   Author    ...0d1  Staff R    — R and A of the task under test
--   DirectMgr ...0d2  Lead R     — one level above Author, so an editor AND an archiver
--   Peer      ...0d4  Staff R    — the SAME role as Author, so neither
--   Report    ...0d5  SubR       — below Author; downward is not a manager either
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select shared._test_seed_directory();

insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000000a1','Author Task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
-- A task where R and A differ, so the archive gate can be told apart from the edit gate.
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-0000000000a1','Split RACI Task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
        '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1');
insert into mos.task_checklist_items (id, org_id, task_id, label, position)
values ('00000000-0000-0000-0000-000000005003','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000005001','Existing step', 0);

set local role authenticated;

-- ── Read: org-wide, on purpose ───────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is((select count(*)::int from mos.tasks), 2,
  'tasks are ORG-readable: a member who is on neither task reads both — cross-unit visibility is the product, not a leak');

-- ── Create: open to any member, and R/A are structurally required ────────────────────────────
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Member Task','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, 'any org member may create a task');
-- A task with no R or no A is refused, and it is worth naming WHICH control speaks: the guard runs
-- as a BEFORE trigger, so it reaches a NULL reference before the NOT NULL column constraint does —
-- its same-org lookup finds no row, and NULL is distinct from the task's org. The column constraint
-- is the second line, not the first. Both are present; the outer one answers.
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, accountable_person_id, created_by)
  values ('No R','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5')
$$, '23514', null,
  'a task without a Responsible is refused — RACI is not optional and not an app-layer convention');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, created_by)
  values ('No A','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5')
$$, '23514', null, 'a task without an Accountable is refused the same way');
select ok(
  (select attnotnull from pg_attribute
    where attrelid = 'mos.tasks'::regclass and attname = 'responsible_person_id')
  and (select attnotnull from pg_attribute
    where attrelid = 'mos.tasks'::regclass and attname = 'accountable_person_id'),
  '...and both columns are NOT NULL underneath, so the invariant survives even if the guard is ever detached');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, status, responsible_person_id, accountable_person_id, created_by)
  values ('Bad status','00000000-0000-0000-0000-0000000000a2','Pending','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, '23514', null,
  'status is one of Open / In Progress / Blocked / Done — "decided not to do" is an archive, not a fifth status');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('   ','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, '23514', null, 'a blank title is refused — btrim(title) <> '''' rejects whitespace, not merely the empty string');

-- ── Edit gate ────────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update mos.tasks set title = 'Peer Rewrite' where id = '00000000-0000-0000-0000-000000005001';
select is((select title from mos.tasks where id = '00000000-0000-0000-0000-000000005001'),
  'Author Task', 'edit gate: a PEER holding the same role as R/A changes nothing — sideways is not a manager');
select throws_ok($$
  insert into mos.task_checklist_items (task_id, label, position)
  values ('00000000-0000-0000-0000-000000005001','Peer step',9)
$$, '42501', null,
  'edit gate: the same peer cannot add a checklist item either — the child tables reuse can_edit_task rather than restating it');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set status = 'In Progress' where id = '00000000-0000-0000-0000-000000005001'
$$, 'edit gate: the Responsible can move their own task''s status');
select lives_ok($$
  update mos.task_checklist_items set is_done = true where id = '00000000-0000-0000-0000-000000005003'
$$, 'edit gate: ...and can tick its checklist items');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set status = 'Blocked' where id = '00000000-0000-0000-0000-000000005001'
$$, 'edit gate: an up-chain manager of R/A can edit the task');

-- ── Archive gate: narrower than the edit gate ────────────────────────────────────────────────
-- Task ...5002 has R = Peer and A = Author. Peer may EDIT it and must not archive it. That gap is
-- the whole point of a separate gate, and it is the one an "if you can edit you can archive"
-- simplification silently closes.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set status = 'In Progress' where id = '00000000-0000-0000-0000-000000005002'
$$, 'archive gate precondition: the Responsible CAN edit this task');
select throws_ok($$
  update mos.tasks set archived_at = now() where id = '00000000-0000-0000-0000-000000005002'
$$, '42501', null,
  'archive gate: a Responsible who is NOT the Accountable cannot archive — archiving is how "decided not to do" is expressed, so it is the A''s call');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = now() where id = '00000000-0000-0000-0000-000000005002'
$$, 'archive gate: the Accountable can archive');
select lives_ok($$
  update mos.tasks set archived_at = null where id = '00000000-0000-0000-0000-000000005002'
$$, 'archive gate: ...and unarchive — the gate is symmetric, so a soft delete is genuinely reversible');

-- ── Events: append-only, self-attributed, and the one activity clock ─────────────────────────
select lives_ok($$
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-0000000000d1','status_changed')
$$, 'an editor can append a task event');
select is(
  (select date_trunc('second', t.last_activity_at) = date_trunc('second', e.created_at)
     from mos.tasks t
     join mos.task_events e on e.task_id = t.id
    where t.id = '00000000-0000-0000-0000-000000005001'
    order by e.created_at desc limit 1),
  true,
  'an event bumps the parent task''s last_activity_at to the EVENT''s time — one canonical clock, not whichever writer committed last');
select ok(not has_table_privilege('authenticated','mos.task_events','UPDATE')
      and not has_table_privilege('authenticated','mos.task_events','DELETE'),
  'the change log is append-only at the PRIVILEGE layer — a policy could be widened later, a missing grant cannot');

-- ── The merged guard: immutability (from the round-2 tenancy guard) ──────────────────────────
select throws_ok($$
  update mos.tasks set created_by = '00000000-0000-0000-0000-0000000000d4'
  where id = '00000000-0000-0000-0000-000000005001'
$$, '42501', null,
  'guard: created_by is immutable — the UPDATE policy re-reads the row by id and so evaluates the gate against the OLD value, which is exactly why a policy cannot cover this');
select throws_ok($$
  update mos.tasks set org_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '00000000-0000-0000-0000-000000005001'
$$, '42501', null, 'guard: org_id is immutable on a task — a row cannot be walked into another tenant');

-- ── The merged guard: directory references are same-org (23514) ──────────────────────────────
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Foreign BU','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1')
$$, '23514', null, 'guard: business_unit_id must be same-org — an FK checks existence only, and FK lookups bypass RLS');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Foreign R','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b4',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1')
$$, '23514', null, 'guard: a Responsible from another org is refused');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('Foreign A','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000d1')
$$, '23514', null, 'guard: an Accountable from another org is refused');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
                         consulted_person_ids)
  values ('Foreign C','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',
          array['00000000-0000-0000-0000-0000000000b4'::uuid])
$$, '23514', null,
  'guard: the consulted array is checked element by element — it is a bare uuid[] with no FK, so nothing else would catch it');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
                         informed_person_ids)
  values ('Foreign I','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',
          array['00000000-0000-0000-0000-0000000000b4'::uuid])
$$, '23514', null, 'guard: and so is the informed array');
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
                         consulted_person_ids, informed_person_ids)
  values ('Same-org RACI','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',
          array['00000000-0000-0000-0000-0000000000d2'::uuid],
          array['00000000-0000-0000-0000-0000000000d4'::uuid])
$$, 'guard control: same-org RACI arrays pass, so the check is not simply rejecting every array');

-- ── The merged guard: a supplied Team must be same-org and BU-equal ──────────────────────────
reset role;
insert into shared.sites (id, org_id, name, code) values
  ('00000000-0000-0000-0000-000000005a10','00000000-0000-0000-0000-0000000000a1','Task Site','task_site');
insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
  ('00000000-0000-0000-0000-000000005b10','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000005a10','Unit-1 Team','u1_team'),
  ('00000000-0000-0000-0000-000000005b11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3',null,'Unit-2 Team','u2_team');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  update mos.tasks set team_id = '00000000-0000-0000-0000-000000005b10'
  where id = '00000000-0000-0000-0000-000000005001'
$$, 'guard: a Team whose BU matches the task''s is accepted');
select throws_ok($$
  update mos.tasks set team_id = '00000000-0000-0000-0000-000000005b11'
  where id = '00000000-0000-0000-0000-000000005001'
$$, '23514', null,
  'guard: a Team in a DIFFERENT business unit is refused — the task BU and its Team''s BU must agree, or the two ownership stories diverge');
select lives_ok($$
  update mos.tasks set team_id = null where id = '00000000-0000-0000-0000-000000005001'
$$, 'guard: team_id is genuinely optional — clearing it is allowed, because the NOT NULL enforcement was deliberately not carried into this baseline');

-- ── The merged guard: occurrence provenance is RPC-only ──────────────────────────────────────
select throws_ok($$
  update mos.tasks set process_run_id = gen_random_uuid()
  where id = '00000000-0000-0000-0000-000000005001'
$$, '42501', null,
  'guard: a direct authenticated write cannot stamp process_run_id — otherwise any member could forge "this Task came from a recurring process occurrence"');

reset role;
select * from finish();
rollback;

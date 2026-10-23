-- Task description as a block document (#1838): description <-> body sync, the shape/size guard,
-- edit rights, single history record, and the Inbox notice for @mentions.
-- Personas (shared._test_seed_directory + mos._test_seed_signal_tree): Author d1 (PIC, member of
-- OwnTeam), DirectMgr d2 (the PIC's manager, may edit), Peer d4 (may not edit), Report d5, GrandMgr d3.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();
-- A second OwnTeam member, so a Team mention has someone besides the author to reach.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-000000005b01',false);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');

-- ── AC-004 conversion + sync, text -> document ───────────────────────────────────────────────
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, description)
values ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-0000000000a1','Doc task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1',
        E'line one\nline two');
select is((select jsonb_array_length(body) from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), 2,
  'AC-004: a plain description becomes one paragraph block per line');
select is((select body -> 1 -> 'content' -> 0 ->> 'text' from mos.tasks where id = '00000000-0000-0000-0000-000000007001'),
  'line two', 'AC-004: the paragraph holds the line text');
select is(mos._block_document_from_text('   '), null, 'AC-004: a blank description has no document');

update mos.tasks set description = E'a\n\nb\nc' where id = '00000000-0000-0000-0000-000000007001';
select is((select jsonb_array_length(body) from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), 4,
  'AC-004: a text-only write (agent API, older client) rebuilds the paragraphs, blank lines kept');

-- ── AC-004 sync, document -> text ────────────────────────────────────────────────────────────
update mos.tasks set body = jsonb_build_array(
  jsonb_build_object('type','heading','props',jsonb_build_object('level',1),'content',jsonb_build_array(jsonb_build_object('type','text','text','Plan','styles','{}'::jsonb))),
  jsonb_build_object('type','paragraph','content',jsonb_build_array(
    jsonb_build_object('type','text','text','Ask ','styles','{}'::jsonb),
    jsonb_build_object('type','mention','props',jsonb_build_object('kind','person','id','00000000-0000-0000-0000-0000000000d4')),
    jsonb_build_object('type','text','text',' then see ','styles','{}'::jsonb),
    jsonb_build_object('type','recordLink','props',jsonb_build_object('kind','task','id','00000000-0000-0000-0000-000000007001'))),
    'children', jsonb_build_array(jsonb_build_object('type','bulletListItem','content',jsonb_build_array(jsonb_build_object('type','text','text','nested','styles','{}'::jsonb))))))
where id = '00000000-0000-0000-0000-000000007001';
select is((select description from mos.tasks where id = '00000000-0000-0000-0000-000000007001'),
  E'Plan\nAsk @Peer then see \nnested',
  'AC-004: the plain-text copy follows the document (mention as @Name, record link omitted, children after parent)');

update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(
  jsonb_build_object('type','text','text',repeat('x',3000),'styles','{}'::jsonb))))
where id = '00000000-0000-0000-0000-000000007001';
select is((select char_length(description) from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), 2000,
  'AC-004: the plain-text copy is capped at the description column limit');

update mos.tasks set body = '[{"type":"paragraph","content":[]}]'::jsonb where id = '00000000-0000-0000-0000-000000007001';
select ok((select body is null and description is null from mos.tasks where id = '00000000-0000-0000-0000-000000007001'),
  'AC-004: an empty document stores no body and no description');

update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(
  jsonb_build_object('type','text','text','kept','styles','{}'::jsonb)))),
  description = 'ignored' where id = '00000000-0000-0000-0000-000000007001';
select is((select description from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), 'kept',
  'AC-004: when both are written the document wins');

-- ── AC-005 the database guards the document ──────────────────────────────────────────────────
select throws_ok($$
  update mos.tasks set body = '{"type":"doc"}'::jsonb where id = '00000000-0000-0000-0000-000000007001'
$$, '23514', null, 'AC-005: a document that is not a block array is refused');
select throws_ok($$
  update mos.tasks set body = jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(
    jsonb_build_object('type','text','text',repeat('x',300000),'styles','{}'::jsonb))))
  where id = '00000000-0000-0000-0000-000000007001'
$$, '23514', null, 'AC-005: a document over 256 KB is refused');
select throws_ok($$
  insert into mos.tasks (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, body)
  values ('00000000-0000-0000-0000-0000000000a1','Bad','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1','"text"'::jsonb)
$$, '23514', null, 'AC-005: an insert with a non-array document is refused');

-- Edit rights are the Task's: the PIC's manager edits, a peer cannot.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select lives_ok($$
  update mos.tasks set body = '[{"type":"paragraph","content":[{"type":"text","text":"by manager","styles":{}}]}]'::jsonb
  where id = '00000000-0000-0000-0000-000000007001'
$$, 'AC-005: the PIC''s manager may change the document');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
update mos.tasks set body = '[{"type":"paragraph","content":[{"type":"text","text":"by peer","styles":{}}]}]'::jsonb
  where id = '00000000-0000-0000-0000-000000007001';
select is((select description from mos.tasks where id = '00000000-0000-0000-0000-000000007001'), 'by manager',
  'AC-005: a person who cannot edit the Task cannot change its document (the row is skipped)');

-- ── History records the edit once (description is the audit copy) ────────────────────────────
reset role;
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'tasks' and field_name = 'description'
             and record_key = '00000000-0000-0000-0000-000000007001' and new_value = 'by manager'), 1,
  'a document edit records one description change in history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'tasks' and field_name = 'body'
             and record_key = '00000000-0000-0000-0000-000000007001'), 0,
  'the document itself is never copied into history');

-- ── AC-006 mention notices ───────────────────────────────────────────────────────────────────
-- A fresh Task so earlier edits do not count.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-0000000000a1','Mention task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1');
create temp table doc_parts (label text primary key, inline jsonb) on commit drop;
grant select on doc_parts to authenticated;
reset role;
insert into doc_parts values
  ('peer', '{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}}'),
  ('self', '{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d1"}}'),
  ('team', '{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-000000005b01"}}'),
  ('grand', '{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000d3"}}'),
  ('foreign', '{"type":"mention","props":{"kind":"person","id":"00000000-0000-0000-0000-0000000000b4"}}'),
  ('sibling', '{"type":"mention","props":{"kind":"team","id":"00000000-0000-0000-0000-000000005b02"}}');
create function pg_temp.doc(variadic p_labels text[]) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('type','paragraph','content',
    coalesce((select jsonb_agg(inline) from doc_parts where label = any(p_labels)), '[]'::jsonb)
    || '[{"type":"text","text":" hi","styles":{}}]'::jsonb))
$$;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.tasks set body = pg_temp.doc('peer', 'self') where id = '00000000-0000-0000-0000-000000007002';
reset role;
select is((select array_agg(owner_id order by owner_id) from mos.notifications
            where metadata ->> 'source' = 'task_mention' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007002'),
  array['00000000-0000-0000-0000-0000000000d4']::uuid[],
  'AC-006: a newly mentioned person gets a notice; mentioning yourself gives none');
select is((select metadata -> 'actor' ->> 'name' from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d4' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007002'),
  'Author', 'AC-006: the notice names the author as the actor');
select is((select title || ' / ' || body from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d4' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007002'),
  'You were mentioned in a Task / Mention task', 'AC-006: the notice carries the Task title');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.tasks set body = pg_temp.doc('peer', 'self', 'team') where id = '00000000-0000-0000-0000-000000007002';
reset role;
select is((select array_agg(owner_id order by owner_id) from mos.notifications
            where metadata ->> 'source' = 'task_mention' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007002'),
  array['00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000d5']::uuid[],
  'AC-006: a newly mentioned Team notifies its other active members, not the author, not a second time for Peer');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mos.tasks set body = pg_temp.doc('team') where id = '00000000-0000-0000-0000-000000007002';
update mos.tasks set body = pg_temp.doc('peer', 'team') where id = '00000000-0000-0000-0000-000000007002';
reset role;
select is((select count(*)::int from mos.notifications
            where metadata ->> 'source' = 'task_mention' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007002'),
  2, 'AC-006: removing and re-adding a mention does not notify again (once per person per Task)');

-- A write with no person session (a superuser or service write): the notice still lands.
update mos.tasks set body = pg_temp.doc('peer', 'team', 'grand') where id = '00000000-0000-0000-0000-000000007002';
select is((select count(*)::int from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007002'), 1,
  'AC-006: a write without a person session still notifies the mentioned person');

-- A Task created with a mention in its document notifies on insert.
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, body)
values ('00000000-0000-0000-0000-000000007003','00000000-0000-0000-0000-0000000000a1','Insert mention',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1', pg_temp.doc('peer'));
select is((select count(*)::int from mos.notifications
            where metadata ->> 'source' = 'task_mention' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007003'), 1,
  'AC-006: a Task created with a mention in its document notifies the mentioned person');

-- Archived people and other orgs are not notified.
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d3';
update mos.tasks set body = pg_temp.doc('grand', 'peer', 'team') || '[]'::jsonb where id = '00000000-0000-0000-0000-000000007003';
select is((select count(*)::int from mos.notifications
            where owner_id = '00000000-0000-0000-0000-0000000000d3' and metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007003'), 0,
  'AC-006: an archived person is not notified');

select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000b4'), 0,
  'AC-006: a person from another org is never notified');
update mos.tasks set body = pg_temp.doc('foreign') where id = '00000000-0000-0000-0000-000000007003';
select is((select count(*)::int from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000b4'), 0,
  'AC-006: mentioning a person from another org notifies nobody');

-- An archived Team notifies none of its members (a fresh Task, so nobody was notified for it yet).
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000007004','00000000-0000-0000-0000-0000000000a1','Team mention',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1');
update shared.teams set archived_at = now() where id = '00000000-0000-0000-0000-000000005b02';
update mos.tasks set body = pg_temp.doc('sibling') where id = '00000000-0000-0000-0000-000000007004';
select is((select count(*)::int from mos.notifications where metadata #>> '{entity,id}' = '00000000-0000-0000-0000-000000007004'), 0,
  'AC-006: an archived Team notifies none of its members');

-- One save may notify at most 50 people, as Signal mentions.
update shared.teams set archived_at = null where id = '00000000-0000-0000-0000-000000005b02';
insert into shared.people (org_id, full_name)
  select '00000000-0000-0000-0000-0000000000a1', 'Crowd ' || g from generate_series(1, 50) g;
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
  select org_id, id, '00000000-0000-0000-0000-000000005b02', false from shared.people where full_name like 'Crowd %';
update mos.tasks set body = pg_temp.doc('self') where id = '00000000-0000-0000-0000-000000007004';
select throws_ok($$update mos.tasks set body = pg_temp.doc('sibling', 'self') where id = '00000000-0000-0000-0000-000000007004'$$,
  '22023', null, 'AC-006: a save that would notify more than 50 people is refused');

-- Plain-text helper reads a Team mention as @TeamName.
select is(mos._block_document_plain_text(pg_temp.doc('team'), '00000000-0000-0000-0000-0000000000a1'), '@OwnTeam hi',
  'AC-004: a Team mention reads as @TeamName in the plain-text copy');

-- Rollback shape: the sync trigger leaves a description-only write on a body-less Task alone.
select ok(mos._block_document_is_blank('[]'::jsonb) and not mos._block_document_is_blank(pg_temp.doc('peer')),
  'a document with only a mention is not blank');

select * from finish();
rollback;

-- Objective write-up history records authored-content changes, not empty-editor state or block IDs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select shared._test_seed_directory();

insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000001238', '00000000-0000-0000-0000-0000000000a1', 'History objective');

update mos.objectives
   set write_up = '[{"id":"empty-one","type":"paragraph","content":[]}]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select write_up from mos.objectives where id = '00000000-0000-0000-0000-000000001238'),
  null::jsonb, 'an empty BlockNote paragraph is stored as no write-up');
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  0, 'null to an empty BlockNote document creates no write-up history');

update mos.objectives set write_up = '[]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
update mos.objectives set write_up = null
 where id = '00000000-0000-0000-0000-000000001238';
select is((select write_up from mos.objectives where id = '00000000-0000-0000-0000-000000001238'),
  null::jsonb, 'empty-array and null saves have the same stored representation');
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  0, 'empty-array and null saves add no history');

update mos.objectives
   set write_up = '[{"id":"authored-one","type":"paragraph","content":[{"type":"text","text":"First draft","styles":{}}]}]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  1, 'adding authored text creates one write-up history row');

update mos.objectives
   set write_up = '[{"id":"authored-two","type":"paragraph","content":[{"type":"text","text":"First draft","styles":{}}]}]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  1, 'a regenerated BlockNote ID does not create history for identical authored content');

update mos.objectives
   set write_up = '[{"id":"authored-two","type":"paragraph","content":[{"type":"text","text":"First draft","styles":{}}]}]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  1, 'saving the unchanged document creates no history');

update mos.objectives
   set write_up = '[{"id":"authored-two","type":"paragraph","content":[{"type":"text","text":"Second draft","styles":{}}]}]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  2, 'a real content edit creates exactly one additional history row');

update mos.objectives
   set write_up = '[{"id":"now-empty","type":"paragraph","content":[]}]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select write_up from mos.objectives where id = '00000000-0000-0000-0000-000000001238'),
  null::jsonb, 'emptying authored content is stored as no write-up');
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  3, 'emptying a non-empty document creates exactly one history row');

update mos.objectives set write_up = '[]'::jsonb
 where id = '00000000-0000-0000-0000-000000001238';
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000001238'
              and action = 'update' and field_name = 'write_up'),
  3, 'saving empty again creates no additional history');

select * from finish();
rollback;

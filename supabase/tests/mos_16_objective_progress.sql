-- Objective door roll-up posture (AC-070 / NFR-001).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_view('mos', 'objective_progress', 'Home reads Objective progress from a named view');
select col_type_is('mos', 'objective_progress', 'id', 'uuid', 'Objective progress keeps the Objective id');
select col_type_is('mos', 'objective_progress', 'done', 'integer', 'Objective progress exposes a done count');
select col_type_is('mos', 'objective_progress', 'total', 'integer', 'Objective progress exposes a total count');

select * from finish();
rollback;

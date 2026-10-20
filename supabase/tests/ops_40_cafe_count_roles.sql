-- #1377 AC-036: Count read, submit, review and branch-switch authority.
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units unit set erp_is_stock = true, esb_product_id = item.esb_product_id
from ops.wip_items item where item.id = unit.wip_item_id
  and item.org_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
update ops.item_units set confirmed_at = now() where org_id in (
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select team.org_id, person.id, team.id, true, current_date - 1
from shared.teams team cross join shared.people person
where team.code = 'gordi_hq_kitchen' and team.org_id = '00000000-0000-0000-0000-0000000000a1'
  and person.id in ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d5');

create function pg_temp.claim(p_person text, p_roles text[]) returns void language sql as $$
  select shared._test_set_access_roles(jsonb_build_object(
    'org_id', case when p_person = 'b4' then '00000000-0000-0000-0000-0000000000b1'
                   else '00000000-0000-0000-0000-0000000000a1' end,
    'person_id', '00000000-0000-0000-0000-0000000000' || p_person,
    'access_roles', p_roles)::text)
$$;
create function pg_temp.submit(p_branch text, p_item text) returns jsonb language sql as $$
  select ops.submit_cafe_counts(('00000000-0000-0000-0000-00000000' || p_branch)::uuid, 'kitchen',
    jsonb_build_array(jsonb_build_object('client_key', gen_random_uuid(),
      'item_id', '00000000-0000-0000-0000-00000000' || p_item, 'quantity', '7,5'))) -> 0
$$;

-- Ready lines counted by someone other than any of the matrix reviewers.
set local role authenticated;
select pg_temp.claim('b4', array['member', 'admin']);
select set_config('app.foreign', pg_temp.submit('bf09', 'ab09') ->> 'line_id', true);
select pg_temp.claim('d3', array['member', 'admin']);
select set_config('app.hq', pg_temp.submit('bf01', 'ab01') ->> 'line_id', true);
select set_config('app.other', pg_temp.submit('bf02', 'ab01') ->> 'line_id', true);
select pg_temp.claim('d2', array['member', 'ops_lead']);
select set_config('app.admin', pg_temp.submit('bf03', 'ab01') ->> 'line_id', true);
reset role;
set local role service_role;
select ops.record_cafe_count_expected_balance(current_setting('app.hq')::uuid, 7.5);
select ops.record_cafe_count_expected_balance(current_setting('app.other')::uuid, 7.5);
select ops.record_cafe_count_expected_balance(current_setting('app.admin')::uuid, 7.5);
reset role;

create function pg_temp.check_persona(p_name text, p_person text, p_roles text[], p_branch text, p_item text)
returns setof text language plpgsql security invoker as $$
declare
  v_own uuid;
  v_title text := 'AC-036 ' || p_name || ': ';
begin
  perform pg_temp.claim(p_person, p_roles);
  return next is((select count(*)::int from ops.cafe_count_lines), 3 + case p_person when 'd5' then 0 when 'd4' then 1 when 'd2' then 2 else 3 end,
    v_title || 'reads same-org lines, including other streams');
  return next is((select posting_enabled from ops.cafe_count_posting_switches
    where branch_id = '00000000-0000-0000-0000-00000000bf01'), false, v_title || 'reads the default-off branch switch');
  return next ok(exists (select 1 from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf02', 'kitchen')),
    v_title || 'can switch the countable list away from the Team default');
  v_own := (pg_temp.submit(p_branch, p_item) ->> 'line_id')::uuid;
  return next ok(v_own is not null, v_title || 'submits on a chosen stream');
  return next ok((select org_id = shared.current_org_id() and submitted_by = shared.current_person_id()
    and status = 'Submitted' and source = 'mos' and posting_status = 'not_posted' and expected_status = 'waiting'
    from ops.cafe_count_lines where id = v_own), v_title || 'server stamps ownership and initial states');
  return next throws_ok('update ops.cafe_count_lines set status = ''Confirmed'' where id = ' || quote_literal(v_own),
    '42501', null, v_title || 'cannot bypass review by direct UPDATE');
  return next throws_ok('delete from ops.cafe_count_lines where id = ' || quote_literal(v_own),
    '42501', null, v_title || 'cannot delete Count facts');
  return next throws_ok('insert into ops.cafe_count_lines default values', '42501', null,
    v_title || 'cannot bypass server-stamped submit by direct INSERT');
  return next throws_ok('select ops.submit_cafe_counts(''00000000-0000-0000-0000-00000000bf09'', ''kitchen'', ''[]'')',
    '22023', 'CAFE_COUNT_STREAM_NOT_FOUND', v_title || 'cannot submit into another org');
  return next is((select count(*)::int from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf09', 'kitchen')),
    0, v_title || 'cannot switch into another org''s item list');
  return next throws_ok('update ops.cafe_count_posting_switches set posting_enabled = true', '42501', null,
    v_title || 'cannot bypass the admin switch RPC');
  if p_person <> 'd3' then
    return next throws_ok('select ops.set_cafe_count_posting_enabled(''00000000-0000-0000-0000-00000000bf01'', true)',
      '42501', 'CAFE_COUNT_POSTING_ADMIN_ONLY', v_title || 'cannot enable posting');
  else
    return next is(ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', true) ->> 'posting_enabled',
      'true', v_title || 'admin enables posting');
    perform ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', false);
  end if;
end;
$$;

set local role authenticated;
select * from pg_temp.check_persona('floor member', 'd5', array['member'], 'bf02', 'ab02');
select is((select branch_id from shared.default_stream()), '00000000-0000-0000-0000-00000000bf01'::uuid,
  'AC-036 floor default is Team-derived, not the chosen submit stream');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.hq')::uuid, 2)$$,
  '42501', 'CAFE_COUNT_REVIEW_FORBIDDEN', 'AC-036 floor member cannot confirm');
select * from pg_temp.check_persona('stream supervisor', 'd4', array['member', 'supervisor'], 'bf02', 'ab03');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.other')::uuid, 2)$$,
  '42501', 'CAFE_COUNT_REVIEW_FORBIDDEN', 'AC-036 supervisor cannot confirm another stream');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.hq')::uuid, 1)$$,
  'P0019', 'CAFE_COUNT_VERSION_STALE', 'AC-036 supervisor must present the current version');
select is(ops.confirm_cafe_count_line(current_setting('app.hq')::uuid, 2) ->> 'posting_status', 'not_needed',
  'AC-036 supervisor confirms a second person''s matching line without an ERP document');
select * from pg_temp.check_persona('ops lead', 'd2', array['member', 'ops_lead'], 'bf03', 'ab02');
select is(ops.confirm_cafe_count_line(current_setting('app.other')::uuid, 2) ->> 'status', 'Confirmed',
  'AC-036 ops lead confirms outside their default stream');
select * from pg_temp.check_persona('admin', 'd3', array['member', 'admin'], 'bf03', 'ab03');
select is(ops.confirm_cafe_count_line(current_setting('app.admin')::uuid, 2) ->> 'status', 'Confirmed',
  'AC-036 admin confirms outside their default stream');
select throws_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf09', true)$$,
  '22023', 'CAFE_COUNT_BRANCH_NOT_FOUND', 'AC-036 admin cannot switch posting for another org');

select pg_temp.claim('b4', array['member', 'admin']);
select is((select count(*)::int from ops.cafe_count_lines
  where org_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'AC-036 another org sees no foreign Count rows');
select is((select count(*)::int from ops.cafe_count_posting_switches
  where org_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'AC-036 another org sees no posting switches');
select is((select count(*)::int from ops.cafe_count_floor_lines('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date)), 0, 'AC-036 another org sees no floor states');
select is((select count(*)::int from ops.cafe_count_review_figures(array[current_setting('app.hq')::uuid])), 0,
  'AC-036 another org sees no reviewer figures');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.hq')::uuid, 3)$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_FOUND', 'AC-036 another org cannot confirm a Count');
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.other')::uuid, 1)$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_SUBMITTED', 'AC-036 another org cannot recount a Count');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.other')::uuid, 'reason')$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_SUBMITTED', 'AC-036 another org cannot explain a Count');
select throws_ok($$select ops.reject_cafe_count_line(current_setting('app.other')::uuid, 3, 'note')$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_FOUND', 'AC-036 another org cannot reject a Count');
select throws_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '22023', 'CAFE_COUNT_BRANCH_NOT_FOUND', 'AC-036 another org cannot change the posting switch');
select throws_ok($$select pg_temp.submit('bf01', 'ab01')$$, '22023', 'CAFE_COUNT_STREAM_NOT_FOUND',
  'AC-036 another org cannot submit into this org');
select is((select count(*)::int from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')), 0,
  'AC-036 another org cannot switch into this org');
select is((select counted_quantity from ops.cafe_count_lines where id = current_setting('app.foreign')::uuid),
  7.5::numeric, 'AC-036 another org can still submit and read in its own branch');

select * from finish();
rollback;

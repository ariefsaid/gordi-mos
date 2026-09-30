-- api_v1 — key-result value bounds and truthful Objective write comments (#1063).
--
-- 1. A key result's target_value and current_value are finite numbers smaller than 1e15 in size with
--    at most 6 decimal places; the database refuses anything else for every writer.
-- 2. set_key_result_current_value states that bound as invalid_input before it reaches the table.
-- 3. The comments of the two Objective content writes say how a target or setting change is refused:
--    neither operation has an input for one, and only api_v1.refused_action answers with
--    refused.targets.
--
-- DOWN (manual): alter table mos.objective_key_results
--   drop constraint objective_key_results_current_value_bounded,
--   drop constraint objective_key_results_target_value_bounded;
-- and restore api_v1.set_key_result_current_value and both comments from
-- 20260930000008_api_v1_objectives.sql.

begin;

alter table mos.objective_key_results
  add constraint objective_key_results_target_value_bounded
    check (target_value is null or (abs(target_value) < 1000000000000000 and scale(target_value) <= 6)),
  add constraint objective_key_results_current_value_bounded
    check (current_value is null or (abs(current_value) < 1000000000000000 and scale(current_value) <= 6));

create or replace function api_v1.set_key_result_current_value(
  key_result_id uuid, current_value numeric, expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id      uuid := set_key_result_current_value.key_result_id;
  v_value   numeric := set_key_result_current_value.current_value;
  v_expected_updated_at timestamptz := set_key_result_current_value.expected_updated_at;
  v_updated_at timestamptz;
  v_row     mos.objective_key_results;
  v_row_count integer;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then perform api_private.invalid('key_result_id', 'key_result_id is required.'); end if;
  if v_value is not null and v_value in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    perform api_private.invalid('current_value', 'current_value must be a finite number.');
  end if;
  if v_value is not null and (abs(v_value) >= 1000000000000000 or scale(v_value) > 6) then
    perform api_private.invalid('current_value', 'current_value must be smaller than 1000000000000000 in size and have at most 6 decimal places.');
  end if;

  perform api_private.begin_write('set_key_result_current_value', null);

  perform 1 from mos.objective_key_results k where k.id = v_id;
  if not found then
    perform api_private.not_found('Key result');
  end if;
  select k.updated_at into v_updated_at from mos.objective_key_results k where k.id = v_id for update;
  if not found then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;
  if v_expected_updated_at is not null and v_updated_at is distinct from v_expected_updated_at then
    raise exception using errcode = 'PT409', detail = 'conflict',
      message = 'This key result changed since you read it. Read it again and retry.';
  end if;

  update mos.objective_key_results k set current_value = v_value where k.id = v_id
  returning * into v_row;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;

  perform api_private.log_write('set_key_result_current_value', 'key_result', v_id, null);
  return jsonb_build_object('item',
    api_private.key_result_json(v_row) || jsonb_build_object('objective_id', v_row.objective_id));
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

comment on function api_v1.edit_objective_write_up(uuid, jsonb, timestamptz) is
  'Purpose: replace an Objective''s write-up; allowed for an ops lead, an admin, and the head of the Objective''s own Business Unit. Inputs: id; write_up (a list of at most 256 KB of blocks, each an object with a text type; use an empty list to clear); expected_updated_at (required; the updated_at you read, a newer one is a conflict). Returns: {item} (the Objective as get_objective returns it). Errors: invalid_input (write_up, expected_updated_at), not_found, forbidden, conflict, rate_limited. This operation has no input for an Objective''s name, unit, period, owner or key-result targets and never returns refused.targets; only refused_action answers such a request with refused.targets.';
comment on function api_v1.set_key_result_current_value(uuid, numeric, timestamptz) is
  'Purpose: record where a key result stands; allowed for an ops lead, an admin, and the head of the Objective''s own Business Unit. Inputs: key_result_id; current_value (a finite number smaller than 1000000000000000 in size with at most 6 decimal places, or null to clear); expected_updated_at (optional; a newer one is a conflict). Returns: {item} (the key result plus objective_id). Errors: invalid_input (current_value), not_found, forbidden, conflict, rate_limited. This operation has no input for targets, units, due dates, owners or adding or removing key results and never returns refused.targets; only refused_action answers such a request with refused.targets.';

commit;

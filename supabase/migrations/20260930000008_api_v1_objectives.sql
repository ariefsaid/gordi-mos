-- Shared operation layer, slice (c): Objectives in `api_v1` (integration-operation-layer.spec.md,
-- objective-targets-and-writeup.spec.md).
--
-- Rules this migration keeps (same as slices (a) and (b)):
--   * Every api_v1 function is SECURITY INVOKER with an empty search_path, executable by
--     `authenticated` only, so RLS and the mos._guard_objectives / mos._guard_objective_key_results
--     triggers decide exactly as for a direct table write.
--   * The only Objective writes are the write-up (content tier) and one key result's current_value
--     (content tier). Neither function accepts a structural field; every other Objective or
--     key-result change is api_v1.refused_action -> refused.targets.
--
-- DOWN (manual, before production):
--   drop function api_v1.list_objectives(uuid, boolean, integer, integer, text, boolean, text, integer),
--     api_v1.get_objective(uuid), api_v1.edit_objective_write_up(uuid, jsonb, timestamptz),
--     api_v1.set_key_result_current_value(uuid, numeric, timestamptz);
--   drop function api_private.objective_json(mos.objectives), api_private.objective_detail(uuid),
--     api_private.key_result_json(mos.objective_key_results);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_private: record shapes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_private.key_result_json(k mos.objective_key_results)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id,
    'what', k.what,
    'target_value', k.target_value,
    'current_value', k.current_value,
    'unit', k.unit,
    'due_date', k.due_date,
    'owner_person_id', k.owner_person_id,
    'updated_at', k.updated_at)
$$;

-- The Objective as list_objectives returns it: no write-up, progress from mos.objective_progress
-- (null once archived), key results in creation order.
create function api_private.objective_json(o mos.objectives)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'business_unit_id', o.business_unit_id,
    'is_company_wide', o.is_company_wide,
    'period_year', o.period_year,
    'period_quarter', o.period_quarter,
    'accountable_person_id', o.accountable_person_id,
    'progress', (select jsonb_build_object('done', p.done, 'total', p.total)
                   from mos.objective_progress p where p.id = o.id),
    'key_results', coalesce((select jsonb_agg(api_private.key_result_json(k) order by k.created_at, k.id)
                               from mos.objective_key_results k where k.objective_id = o.id), '[]'::jsonb),
    'archived_at', o.archived_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at)
$$;

-- The Objective as get_objective returns it (null when the caller cannot read it).
create function api_private.objective_detail(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api_private.objective_json(o) || jsonb_build_object('write_up', o.write_up)
    from mos.objectives o where o.id = p_id
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: reads
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.list_objectives(
  business_unit_id uuid default null, company_wide boolean default null,
  period_year integer default null, period_quarter integer default null,
  q text default null, include_archived boolean default false,
  cursor text default null, "limit" integer default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_business_unit_id uuid := list_objectives.business_unit_id;
  v_company_wide boolean := list_objectives.company_wide;
  v_period_year integer := list_objectives.period_year;
  v_period_quarter integer := list_objectives.period_quarter;
  v_query  text := api_private.text_arg(list_objectives.q, 'q', 200, false);
  v_include_archived boolean := coalesce(list_objectives.include_archived, false);
  v_page_size integer := api_private.page_limit(list_objectives."limit");
  v_cursor jsonb := api_private.decode_cursor(list_objectives.cursor);
  v_items jsonb; v_has_more boolean; v_last_key text; v_last_id uuid;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_period_quarter is not null and v_period_quarter not between 1 and 4 then
    perform api_private.invalid('period_quarter', 'period_quarter must be 1 to 4.');
  end if;

  -- Order: newest year first (no year last), the whole year before its quarters, then name.
  -- One "C"-collated text key drives both the order and the cursor, so pages never repeat or skip.
  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_page_size), '[]'::jsonb),
         coalesce(max(r.rn) > v_page_size, false),
         (array_agg(r.k order by r.rn) filter (where r.rn = v_page_size))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_page_size))[1]
    into v_items, v_has_more, v_last_key, v_last_id
    from (
      select s.id, s.k, row_number() over (order by s.k, s.id) as rn, api_private.objective_json(s.o) as item
        from (
          select o.id, o, (coalesce(lpad((10000 - o.period_year)::text, 5, '0'), '99999')
                           || '|' || coalesce(o.period_quarter::text, '0') || '|' || o.name) collate "C" as k
            from mos.objectives o
           where o.org_id = shared.current_org_id()
             and (v_include_archived or o.archived_at is null)
             and (v_business_unit_id is null or o.business_unit_id = v_business_unit_id)
             and (v_company_wide is null or o.is_company_wide = v_company_wide)
             and (v_period_year is null or o.period_year = v_period_year)
             and (v_period_quarter is null or o.period_quarter = v_period_quarter)
             and (v_query is null or o.name ilike api_private.like_pattern(v_query))) s
       where v_cursor is null or (s.k, s.id) > (v_cursor ->> 0, (v_cursor ->> 1)::uuid)
       order by s.k, s.id
       limit v_page_size + 1) r;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when v_has_more then api_private.encode_cursor(v_last_key, v_last_id) end);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.get_objective(id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id     uuid := get_objective.id;
  v_item   jsonb;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then
    perform api_private.invalid('id', 'id is required.');
  end if;
  v_item := api_private.objective_detail(v_id);
  if v_item is null then
    perform api_private.not_found('Objective');
  end if;
  return jsonb_build_object('item', v_item);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: content writes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.edit_objective_write_up(id uuid, write_up jsonb, expected_updated_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id       uuid := edit_objective_write_up.id;
  v_write_up jsonb := edit_objective_write_up.write_up;
  v_expected_updated_at timestamptz := edit_objective_write_up.expected_updated_at;
  v_updated_at timestamptz;
  v_row_count integer;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then perform api_private.invalid('id', 'id is required.'); end if;
  if v_write_up is null or jsonb_typeof(v_write_up) <> 'array' or exists (
       select 1 from jsonb_array_elements(v_write_up) e
        where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'type') is distinct from 'string') then
    perform api_private.invalid('write_up', 'write_up must be a list of blocks, each an object with a text type.');
  end if;
  if pg_column_size(v_write_up) > 262144 then
    perform api_private.invalid('write_up', 'write_up is too large.');
  end if;
  if v_expected_updated_at is null then
    perform api_private.invalid('expected_updated_at', 'expected_updated_at is required.');
  end if;

  perform api_private.begin_write('edit_objective_write_up', null);

  perform 1 from mos.objectives o where o.id = v_id;
  if not found then
    perform api_private.not_found('Objective');
  end if;
  select o.updated_at into v_updated_at from mos.objectives o where o.id = v_id for update;
  if not found then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;
  if v_updated_at is distinct from v_expected_updated_at then
    raise exception using errcode = 'PT409', detail = 'conflict',
      message = 'This Objective changed since you read it. Read it again and retry.';
  end if;

  -- Always written, even when unchanged: the guard, not this function, decides who may.
  update mos.objectives o set write_up = v_write_up where o.id = v_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;

  perform api_private.log_write('edit_objective_write_up', 'objective', v_id, null);
  return jsonb_build_object('item', api_private.objective_detail(v_id));
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.set_key_result_current_value(
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Function comments (the source of the generated reference)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
comment on function api_v1.list_objectives(uuid, boolean, integer, integer, text, boolean, text, integer) is
  'Purpose: Objectives in the caller''s org, newest period first (the whole year before its quarters, then by name). Inputs: business_unit_id, company_wide (true for Company-wide Objectives only, false to exclude them), period_year, period_quarter (1 to 4), q (name contains, at most 200 characters), include_archived (default false), cursor, limit (default 50, at most 100). Returns: {items [Objective: id, name, business_unit_id, is_company_wide, period_year, period_quarter, accountable_person_id, progress {done, total} or null, key_results [{id, what, target_value, current_value, unit, due_date, owner_person_id, updated_at}], archived_at, created_at, updated_at], next_cursor}. Errors: invalid_input (period_quarter, q, cursor, limit).';
comment on function api_v1.get_objective(uuid) is
  'Purpose: one Objective with its key results and its write-up (a list of blocks, or null). Inputs: id. Returns: {item} (the list_objectives shape plus write_up). Errors: not_found, invalid_input (id).';
comment on function api_v1.edit_objective_write_up(uuid, jsonb, timestamptz) is
  'Purpose: replace an Objective''s write-up; allowed for an ops lead, an admin, and the head of the Objective''s own Business Unit. Inputs: id; write_up (a list of at most 256 KB of blocks, each an object with a text type; use an empty list to clear); expected_updated_at (required; the updated_at you read, a newer one is a conflict). Returns: {item} (the Objective as get_objective returns it). Errors: invalid_input (write_up, expected_updated_at), not_found, forbidden, conflict, rate_limited. An Objective''s name, unit, period, owner and key-result targets can''t be changed here: refused.targets.';
comment on function api_v1.set_key_result_current_value(uuid, numeric, timestamptz) is
  'Purpose: record where a key result stands; allowed for an ops lead, an admin, and the head of the Objective''s own Business Unit. Inputs: key_result_id; current_value (a finite number, or null to clear); expected_updated_at (optional; a newer one is a conflict). Returns: {item} (the key result plus objective_id). Errors: invalid_input (current_value), not_found, forbidden, conflict, rate_limited. Targets, units, due dates, owners and adding or removing key results can''t be changed here: refused.targets.';

comment on function api_private.key_result_json(mos.objective_key_results) is 'Helper: the key-result record shape returned inside every Objective read.';
comment on function api_private.objective_json(mos.objectives) is 'Helper: the Objective record shape (no write-up) with progress and key results.';
comment on function api_private.objective_detail(uuid) is 'Helper: the Objective record plus its write-up; null when the caller cannot read it.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Execute grants: authenticated only, on this migration's functions (earlier functions keep their own)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where (p.pronamespace = 'api_v1'::regnamespace
            and p.proname in ('list_objectives', 'get_objective', 'edit_objective_write_up', 'set_key_result_current_value'))
        or (p.pronamespace = 'api_private'::regnamespace
            and p.proname in ('key_result_json', 'objective_json', 'objective_detail'))
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;

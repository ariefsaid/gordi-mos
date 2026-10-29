-- Restore the previous aggregate function.
create or replace function mos.aggregate_compiled(p_compiled jsonb)
returns table(group_key jsonb, agg_value numeric)
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_entity         text := p_compiled->>'entity';
  v_schema         text;
  v_table          text;
  v_group_by       text := p_compiled->>'resolvedGroupBy';
  v_agg_fn         text := p_compiled->'resolvedAggregate'->>'fn';
  v_agg_col        text := p_compiled->'resolvedAggregate'->>'column';
  v_agg_alias      text := p_compiled->'resolvedAggregate'->>'alias';
  v_order_col      text := p_compiled->'resolvedOrderBy'->>'column';
  v_order_dir      text := p_compiled->'resolvedOrderBy'->>'dir';
  v_has_time_range boolean := (p_compiled ? 'resolvedTimeRange');
  v_filters        jsonb := coalesce(p_compiled->'resolvedFilters', '[]'::jsonb);
  v_requires_time  boolean := false;
  v_allowed        text[];
  v_numeric        text[];
  v_groupable      text[];
  v_sql            text;
  v_where          text := '';
  v_select         text;
  v_group_clause   text := '';
  v_order_clause   text := '';
  v_agg_expr       text;
  v_filter_count   int := jsonb_array_length(v_filters);
  v_i              int;
  v_f              jsonb;
  v_col            text;
  v_op             text;
  v_val            text;
  v_val_from       text;
  v_val_to         text;
  v_arr            text[];
  v_j              int;
begin
  -- ── The second trust boundary: dispatch plus an allow-set per whitelisted entity ────────────
  -- DRIFT PAIR: this dispatch must stay in step with the client's entity whitelist on schema,
  -- table, allowed, numeric, groupable and requiresTimeRange for every entity. A column added on
  -- one side must be added on the other. sales_margin_daily.bom_coverage_pct is intentionally NOT
  -- numeric — it is a ratio and summing it is meaningless; do not "fix" that by adding it here.
  case v_entity
    when 'sales_daily_revenue' then
      v_schema := 'reporting'; v_table := 'sales_daily_revenue'; v_requires_time := true;
      v_allowed   := array['revenue_date','channel','esb_code','branch_code','branch_name','transactions','clean_revenue','snapshot_as_of'];
      v_numeric   := array['transactions','clean_revenue'];
      v_groupable := array['channel','esb_code','branch_code'];
    when 'sales_margin_daily' then
      v_schema := 'reporting'; v_table := 'sales_margin_daily'; v_requires_time := true;
      v_allowed   := array['margin_date','esb_code','branch_code','branch_name','revenue','cogs_interim_sm','cogs_budget_bom','margin_interim','margin_interim_pct','bom_coverage_pct','snapshot_as_of'];
      v_numeric   := array['revenue','cogs_interim_sm','cogs_budget_bom','margin_interim','margin_interim_pct'];
      v_groupable := array['esb_code','branch_code'];
    when 'tasks' then
      v_schema := 'mos'; v_table := 'tasks'; v_requires_time := true;
      v_allowed   := array['id','title','business_unit_id','team_id','status','responsible_person_id','accountable_person_id','due_date','last_activity_at','archived_at','created_at','updated_at','objective_id','work_line_id'];
      v_numeric   := array[]::text[];
      v_groupable := array['status','business_unit_id','team_id','responsible_person_id','objective_id','work_line_id'];
    when 'weekly_updates' then
      v_schema := 'mos'; v_table := 'weekly_updates'; v_requires_time := true;
      v_allowed   := array['id','person_id','week_start','status','submitted_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array['status','person_id'];
    when 'objectives' then
      v_schema := 'mos'; v_table := 'objectives'; v_requires_time := false;
      v_allowed   := array['id','name','archived_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array[]::text[];
    when 'work_lines' then
      v_schema := 'mos'; v_table := 'work_lines'; v_requires_time := false;
      -- objective_id is both readable and groupable here, which is what makes the DD-WAY-15 edge
      -- usable for roll-up ("how many Projects/Processes per Objective") rather than only for a join.
      v_allowed   := array['id','name','type','objective_id','archived_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array['type','objective_id'];
    when 'people' then
      v_schema := 'shared'; v_table := 'people'; v_requires_time := false;
      v_allowed   := array['id','full_name','email','archived_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array[]::text[];
    when 'business_units' then
      v_schema := 'shared'; v_table := 'business_units'; v_requires_time := false;
      v_allowed   := array['id','name','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array[]::text[];
    else
      raise invalid_parameter_value using
        message = 'aggregate_compiled: entity not whitelisted';
  end case;

  if v_requires_time and not v_has_time_range then
    raise invalid_parameter_value using
      message = 'aggregate_compiled: entity requires a resolvedTimeRange';
  end if;

  if v_agg_fn is null or v_agg_fn = '' then
    raise invalid_parameter_value using message = 'aggregate_compiled: resolvedAggregate.fn required';
  end if;
  if v_agg_fn not in ('count','sum','avg','min','max') then
    raise invalid_parameter_value using message = 'aggregate_compiled: unsupported aggregate fn';
  end if;
  -- count operates on rows; every other function needs a column that is actually numeric.
  if v_agg_fn <> 'count' then
    if v_agg_col is null or v_agg_col = '' then
      raise invalid_parameter_value using message = 'aggregate_compiled: resolvedAggregate.column required for non-count fn';
    end if;
    if not (v_agg_col = any(v_numeric)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: aggregate column not in numeric allow-set';
    end if;
  end if;

  if v_group_by is not null and v_group_by <> '' then
    if not (v_group_by = any(v_groupable)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: groupBy column not in groupable allow-set';
    end if;
  end if;

  -- Validate every filter column and operator BEFORE building any SQL, so a rejected payload never
  -- reaches string assembly at all.
  for v_i in 0..v_filter_count - 1 loop
    v_f := v_filters->v_i;
    v_col := v_f->>'column';
    v_op := lower(coalesce(v_f->>'op', ''));
    if v_col is null or not (v_col = any(v_allowed)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: filter column not in allow-set';
    end if;
    if v_op not in ('eq','neq','in','gt','gte','lt','lte','between','date-range') then
      raise invalid_parameter_value using message = 'aggregate_compiled: unsupported filter op';
    end if;
  end loop;

  if v_agg_fn = 'count' then
    v_agg_expr := 'count(*)';
  else
    v_agg_expr := format('%s(%I)', v_agg_fn, v_agg_col);
  end if;

  if v_group_by is not null and v_group_by <> '' then
    v_select := format(
      'select to_jsonb(%I) as group_key, %s::numeric as agg_value from %I.%I',
      v_group_by, v_agg_expr, v_schema, v_table);
    v_group_clause := format(' group by %I', v_group_by);
  else
    v_select := format(
      'select null::jsonb as group_key, %s::numeric as agg_value from %I.%I',
      v_agg_expr, v_schema, v_table);
  end if;

  for v_i in 0..v_filter_count - 1 loop
    v_f := v_filters->v_i;
    v_col := v_f->>'column';
    v_op := lower(v_f->>'op');
    if v_i = 0 then v_where := v_where || ' where '; else v_where := v_where || ' and '; end if;

    case v_op
      when 'eq','neq','gt','gte','lt','lte' then
        v_val := coalesce(v_f->>'value', '');
        v_where := v_where || format('%I %s %L', v_col,
          case v_op when 'eq' then '=' when 'neq' then '<>' when 'gt' then '>'
                    when 'gte' then '>=' when 'lt' then '<' when 'lte' then '<=' end,
          v_val);
      when 'in' then
        v_arr := array[]::text[];
        for v_j in 0..jsonb_array_length(v_f->'value') - 1 loop
          v_arr := array_append(v_arr, v_f->'value'->>v_j);
        end loop;
        v_where := v_where || format('%I = any(%L::text[])', v_col, v_arr);
      when 'between','date-range' then
        v_val_from := v_f #>> '{value,0}';
        v_val_to   := v_f #>> '{value,1}';
        v_where := v_where || format('%I between %L and %L', v_col, v_val_from, v_val_to);
      else
        raise invalid_parameter_value using message = 'aggregate_compiled: unreachable filter op';
    end case;
  end loop;

  if v_has_time_range then
    v_col := p_compiled->'resolvedTimeRange'->>'column';
    if v_col is null or not (v_col = any(v_allowed)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: timeRange column not in allow-set';
    end if;
    if v_filter_count = 0 then v_where := v_where || ' where '; else v_where := v_where || ' and '; end if;
    v_where := v_where || format('%I between %L and %L',
      v_col,
      p_compiled->'resolvedTimeRange'->>'from',
      p_compiled->'resolvedTimeRange'->>'to');
  end if;

  -- ORDER BY may only target the reduced output, never an arbitrary column: ordering by something
  -- not in the result would need it in the GROUP BY and would silently change the aggregate.
  if v_order_col is not null and v_order_col <> '' then
    if v_order_col = coalesce(v_group_by, '') then
      v_order_clause := format(' order by group_key %s', case when v_order_dir = 'asc' then 'asc' else 'desc' end);
    elsif v_order_col = coalesce(v_agg_alias, '') then
      v_order_clause := format(' order by agg_value %s', case when v_order_dir = 'asc' then 'asc' else 'desc' end);
    else
      raise invalid_parameter_value using
        message = 'aggregate_compiled: orderBy must target the groupBy or aggregate alias';
    end if;
  end if;

  v_sql := v_select || v_where || v_group_clause || v_order_clause;
  return query execute v_sql;
end;
$$;
comment on function mos.aggregate_compiled(jsonb) is
  'DB-side aggregate over a compiled query. SECURITY INVOKER so base-table RLS fires; the hard-coded entity dispatch is the second trust boundary; identifiers via format(%I) and values via format(%L); 2s timeout and a required time bound on the reporting entities.';
revoke execute on function mos.aggregate_compiled(jsonb) from public, anon;
grant  execute on function mos.aggregate_compiled(jsonb) to authenticated;

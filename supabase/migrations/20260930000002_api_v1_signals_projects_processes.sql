-- Shared operation layer, slice (b): Signals and Projects/Processes in `api_v1`, a 200-character cap on
-- every `q` search input, and no implicit PUBLIC execute on functions created later in api_v1 and
-- api_private (integration-operation-layer.spec.md, ADR-0060).
--
-- Rules this migration keeps (same as slice (a)):
--   * Every api_v1 function is SECURITY INVOKER with an empty search_path, executable by
--     `authenticated` only, so RLS and every guard trigger decide exactly as for a direct table write.
--   * No function accepts an actor, author, creator, org or channel; they come from the claims.
--   * create_signal delegates to mos.create_signal_with_mentions; edit_signal leaves content
--     author-only and revision writing to the existing guard.
--
-- DOWN (manual, before production):
--   drop function api_v1.list_signals, api_v1.get_signal, api_v1.create_signal, api_v1.edit_signal,
--     api_v1.link_signal_task, api_v1.list_projects_processes, api_v1.get_project_process,
--     api_v1.create_project_process, api_v1.edit_project_process (each with its argument list);
--   drop function api_private.signal_json(mos.signals), api_private.signal_detail(uuid),
--     api_private.work_line_json(mos.work_lines), api_private.work_line_detail(uuid);
--   re-create api_v1.list_people, list_teams and list_tasks from 20260930000001 (the only change
--     here is the `q` line: `nullif(btrim(<fn>.q), '')`);
--   alter default privileges for role postgres grant execute on functions to public;
--   and drop the per-schema entries: alter default privileges for role postgres in schema <s>
--     revoke execute on functions from public; for every schema except api_v1 and api_private.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_private: record shapes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_private.signal_json(s mos.signals)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'body', s.body,
    'attention', s.attention,
    'category', s.category,
    'occurred_at', s.occurred_at,
    'author_id', s.author_id,
    'audience', s.audience,
    'owning_team_id', s.owning_team_id,
    'source', s.source,
    'retracted_at', s.retracted_at,
    'retract_reason', s.retract_reason,
    'edited_at', s.edited_at,
    'created_at', s.created_at,
    'updated_at', s.updated_at)
$$;

-- The Signal as get_signal returns it (null when the caller cannot read it).
create function api_private.signal_detail(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api_private.signal_json(s) || jsonb_build_object(
    'mentions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', case m.mention_kind when 'bu' then 'business_unit' else m.mention_kind end,
               'id', coalesce(m.target_person_id, m.target_team_id, m.target_bu_id))
             order by m.created_at, m.id)
        from mos.signal_mentions m where m.signal_id = s.id and m.revoked_at is null), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'author_id', m.author_id, 'body', m.body,
                                          'created_at', m.created_at, 'updated_at', m.updated_at)
                       order by m.created_at desc, m.id desc)
        from (select * from mos.comments k where k.entity_type = 'signal' and k.entity_id = s.id
               order by k.created_at desc, k.id desc limit 50) m), '[]'::jsonb),
    'acknowledged_by_me', exists (
      select 1 from mos.signal_acknowledgements a
       where a.signal_id = s.id and a.person_id = shared.current_person_id()),
    'task_ids', coalesce((
      select jsonb_agg(t.task_id order by t.created_at, t.task_id)
        from mos.signal_tasks t where t.signal_id = s.id), '[]'::jsonb))
  from mos.signals s
  where s.id = p_id
$$;

create function api_private.work_line_json(w mos.work_lines)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'type', w.type,
    'objective_id', w.objective_id,
    'business_unit_id', w.business_unit_id,
    'accountable_person_id', w.accountable_person_id,
    'responsible_person_id', w.responsible_person_id,
    'archived_at', w.archived_at,
    'created_at', w.created_at,
    'updated_at', w.updated_at)
$$;

create function api_private.work_line_detail(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api_private.work_line_json(w) from mos.work_lines w where w.id = p_id
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: Signal reads
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.list_signals(
  attention text[] default null, author_id uuid default null,
  occurred_from timestamptz default null, occurred_to timestamptz default null,
  linked_task_id uuid default null, updated_since timestamptz default null,
  q text default null, include_retracted boolean default false,
  cursor text default null, "limit" integer default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_attention text[] := list_signals.attention;
  v_author_id uuid := list_signals.author_id;
  v_occurred_from timestamptz := list_signals.occurred_from;
  v_occurred_to timestamptz := list_signals.occurred_to;
  v_linked_task_id uuid := list_signals.linked_task_id;
  v_updated_since timestamptz := list_signals.updated_since;
  v_query text := api_private.text_arg(list_signals.q, 'q', 200, false);
  v_include_retracted boolean := coalesce(list_signals.include_retracted, false);
  v_page_size integer := api_private.page_limit(list_signals."limit");
  v_cursor jsonb := api_private.decode_cursor(list_signals.cursor);
  v_cursor_occurred_at timestamptz;
  v_items jsonb; v_has_more boolean; v_last_key timestamptz; v_last_id uuid;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_attention is not null and exists (
       select 1 from unnest(v_attention) a where a is null or a <> all (array['FYI', 'Needs attention', 'Urgent'])) then
    perform api_private.invalid('attention', 'attention must hold only FYI, Needs attention, Urgent.');
  end if;
  if v_cursor is not null then
    begin
      v_cursor_occurred_at := (v_cursor ->> 0)::timestamptz;
    exception when others then
      perform api_private.invalid('cursor', 'cursor is not valid.');
    end;
  end if;

  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_page_size), '[]'::jsonb),
         coalesce(max(r.rn) > v_page_size, false),
         (array_agg(r.occurred_at order by r.rn) filter (where r.rn = v_page_size))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_page_size))[1]
    into v_items, v_has_more, v_last_key, v_last_id
    from (
      select s.id, s.occurred_at,
             row_number() over (order by s.occurred_at desc, s.id desc) as rn,
             api_private.signal_json(s) as item
        from mos.signals s
       where s.org_id = shared.current_org_id()
         and (v_include_retracted or s.retracted_at is null)
         and (v_attention is null or s.attention = any (v_attention))
         and (v_author_id is null or s.author_id = v_author_id)
         and (v_occurred_from is null or s.occurred_at >= v_occurred_from)
         and (v_occurred_to is null or s.occurred_at <= v_occurred_to)
         and (v_linked_task_id is null or exists (
               select 1 from mos.signal_tasks st where st.signal_id = s.id and st.task_id = v_linked_task_id))
         and (v_updated_since is null or s.updated_at >= v_updated_since)
         and (v_query is null or s.body ilike api_private.like_pattern(v_query))
         and (v_cursor is null or (s.occurred_at, s.id) < (v_cursor_occurred_at, (v_cursor ->> 1)::uuid))
       order by s.occurred_at desc, s.id desc
       limit v_page_size + 1) r;
  return jsonb_build_object('items', v_items,
    'next_cursor', case when v_has_more then api_private.encode_cursor(
      to_char(v_last_key at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), v_last_id) end);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.get_signal(id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id     uuid := get_signal.id;
  v_item   jsonb;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then
    perform api_private.invalid('id', 'id is required.');
  end if;
  v_item := api_private.signal_detail(v_id);
  if v_item is null then
    perform api_private.not_found('Signal');
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
-- api_v1: Signal writes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.create_signal(
  body text, occurred_at timestamptz default null, attention text default 'FYI',
  mentions jsonb default null, link_task_ids uuid[] default null, idempotency_key text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_body   text := api_private.text_arg(create_signal.body, 'body', 4000, true);
  v_attention text := coalesce(create_signal.attention, 'FYI');
  v_mentions  jsonb := coalesce(create_signal.mentions, '[]'::jsonb);
  v_link_ids  uuid[] := coalesce(create_signal.link_task_ids, '{}');
  v_key    text := create_signal.idempotency_key;
  v_delegate_mentions jsonb := '[]'::jsonb;
  v_mention   jsonb;
  v_kind   text;
  v_task_id   uuid;
  v_prior_record_id  uuid;
  v_item   jsonb;
  v_id     uuid;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_attention <> all (array['FYI', 'Needs attention', 'Urgent']) then
    perform api_private.invalid('attention', 'attention must be one of FYI, Needs attention, Urgent.');
  end if;
  if jsonb_typeof(v_mentions) <> 'array' then
    perform api_private.invalid('mentions', 'mentions must be a list.');
  end if;
  if jsonb_array_length(v_mentions) > 50 then
    perform api_private.invalid('mentions', 'mentions holds at most 50 entries.');
  end if;
  for v_mention in select x from jsonb_array_elements(v_mentions) x loop
    v_kind := case when jsonb_typeof(v_mention) = 'object' then v_mention ->> 'kind' end;
    if v_kind is null or v_kind <> all (array['person', 'team', 'business_unit']) then
      perform api_private.invalid('mentions', 'Each mention needs a kind of person, team or business_unit.');
    end if;
    v_delegate_mentions := v_delegate_mentions || jsonb_build_object(
      'kind', case v_kind when 'business_unit' then 'bu' else v_kind end,
      'targetId', api_private.json_uuid(v_mention -> 'id', 'mentions', false));
  end loop;
  if cardinality(v_link_ids) > 10 then
    perform api_private.invalid('link_task_ids', 'link_task_ids holds at most 10 ids.');
  end if;
  if array_position(v_link_ids, null) is not null then
    perform api_private.invalid('link_task_ids', 'link_task_ids must hold only ids.');
  end if;

  v_prior_record_id := api_private.begin_write('create_signal', v_key);
  if v_prior_record_id is not null then
    v_item := api_private.signal_detail(v_prior_record_id);
    if v_item is not null then
      return jsonb_build_object('item', v_item, 'replayed', true);
    end if;
  end if;

  foreach v_task_id in array v_link_ids loop
    perform 1 from mos.tasks t where t.id = v_task_id;
    if not found then
      perform api_private.not_found('Task', 'link_task_ids');
    end if;
  end loop;

  v_id := mos.create_signal_with_mentions(v_body, coalesce(create_signal.occurred_at, now()), v_delegate_mentions, v_attention);
  insert into mos.signal_tasks (signal_id, task_id)
  select v_id, l.task_id from (select distinct unnest(v_link_ids) as task_id) l;

  perform api_private.log_write('create_signal', 'signal', v_id, v_key);
  return jsonb_build_object('item', api_private.signal_detail(v_id), 'replayed', false);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.edit_signal(id uuid, changes jsonb, expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id       uuid := edit_signal.id;
  v_changes  jsonb := edit_signal.changes;
  v_expected_updated_at timestamptz := edit_signal.expected_updated_at;
  v_key      text;
  v_value    jsonb;
  v_old      mos.signals;
  v_new      mos.signals;
  v_row_count   integer;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then perform api_private.invalid('id', 'id is required.'); end if;
  if v_changes is null or jsonb_typeof(v_changes) <> 'object' or v_changes = '{}'::jsonb then
    perform api_private.invalid('changes', 'changes must be an object with at least one field.');
  end if;
  if v_changes ?| array['archived', 'archived_at', 'retracted', 'retracted_at', 'retract_reason'] then
    perform api_private.refuse('refused.archive');
  end if;
  if v_changes ?| array['audience', 'owning_team_id', 'mentions'] then
    perform api_private.refuse('refused.permissions');
  end if;
  for v_key in select k from jsonb_object_keys(v_changes) k loop
    if v_key <> all (array['body', 'occurred_at', 'category', 'attention']) then
      perform api_private.invalid(v_key, v_key || ' is not an editable field.');
    end if;
  end loop;

  perform api_private.begin_write('edit_signal', null);

  perform 1 from mos.signals s where s.id = v_id;
  if not found then
    perform api_private.not_found('Signal');
  end if;
  select * into v_old from mos.signals s where s.id = v_id for update;
  if not found then
    -- Not the author and not a retraction authority: the same answer the guard gives an authority.
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;
  if v_expected_updated_at is not null and v_old.updated_at is distinct from v_expected_updated_at then
    raise exception using errcode = 'PT409', detail = 'conflict',
      message = 'This Signal changed since you read it. Read it again and retry.';
  end if;

  v_new := v_old;
  for v_key, v_value in select k, x from jsonb_each(v_changes) as e(k, x) loop
    case v_key
      when 'body' then v_new.body := api_private.json_text(v_value, 'body', 4000, true);
      when 'attention' then
        v_new.attention := api_private.json_text(v_value, 'attention', 20, true);
        if v_new.attention <> all (array['FYI', 'Needs attention', 'Urgent']) then
          perform api_private.invalid('attention', 'attention must be one of FYI, Needs attention, Urgent.');
        end if;
      when 'category' then
        v_new.category := api_private.json_text(v_value, 'category', 40, false);
        if v_new.category is not null and v_new.category <> all (array['Supply/vendor', 'Equipment/facility',
             'Inventory/availability', 'Quality', 'Customer', 'People', 'Process', 'Other']) then
          perform api_private.invalid('category', 'category must be one of Supply/vendor, Equipment/facility, Inventory/availability, Quality, Customer, People, Process, Other, or null.');
        end if;
      when 'occurred_at' then
        begin
          v_new.occurred_at := api_private.json_text(v_value, 'occurred_at', 40, true)::timestamptz;
        exception when others then
          perform api_private.invalid('occurred_at', 'occurred_at must be a timestamp.');
        end;
    end case;
  end loop;

  if v_new is not distinct from v_old then
    return jsonb_build_object('item', api_private.signal_detail(v_id));
  end if;

  update mos.signals s set
    body = v_new.body, occurred_at = v_new.occurred_at, category = v_new.category, attention = v_new.attention
  where s.id = v_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;

  perform api_private.log_write('edit_signal', 'signal', v_id, null);
  return jsonb_build_object('item', api_private.signal_detail(v_id));
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.link_signal_task(signal_id uuid, task_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_signal_id uuid := link_signal_task.signal_id;
  v_task_id   uuid := link_signal_task.task_id;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_signal_id is null then perform api_private.invalid('signal_id', 'signal_id is required.'); end if;
  if v_task_id is null then perform api_private.invalid('task_id', 'task_id is required.'); end if;

  perform api_private.begin_write('link_signal_task', null);

  perform 1 from mos.signals s where s.id = v_signal_id;
  if not found then
    perform api_private.not_found('Signal', 'signal_id');
  end if;
  perform 1 from mos.tasks t where t.id = v_task_id;
  if not found then
    perform api_private.not_found('Task', 'task_id');
  end if;

  insert into mos.signal_tasks (signal_id, task_id) values (v_signal_id, v_task_id)
  on conflict (signal_id, task_id) do nothing;

  perform api_private.log_write('link_signal_task', 'signal', v_signal_id, null);
  return jsonb_build_object('item', api_private.signal_detail(v_signal_id));
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- api_v1: Project/Process reads and writes
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function api_v1.list_projects_processes(
  type text default null, business_unit_id uuid default null, updated_since timestamptz default null,
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
  v_type   text := list_projects_processes.type;
  v_business_unit_id uuid := list_projects_processes.business_unit_id;
  v_updated_since timestamptz := list_projects_processes.updated_since;
  v_query  text := api_private.text_arg(list_projects_processes.q, 'q', 200, false);
  v_include_archived boolean := coalesce(list_projects_processes.include_archived, false);
  v_page_size integer := api_private.page_limit(list_projects_processes."limit");
  v_cursor jsonb := api_private.decode_cursor(list_projects_processes.cursor);
  v_items jsonb; v_has_more boolean; v_last_key text; v_last_id uuid;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_type is not null and v_type <> all (array['project', 'process']) then
    perform api_private.invalid('type', 'type must be project or process.');
  end if;

  select coalesce(jsonb_agg(r.item order by r.rn) filter (where r.rn <= v_page_size), '[]'::jsonb),
         coalesce(max(r.rn) > v_page_size, false),
         (array_agg(r.name order by r.rn) filter (where r.rn = v_page_size))[1],
         (array_agg(r.id order by r.rn) filter (where r.rn = v_page_size))[1]
    into v_items, v_has_more, v_last_key, v_last_id
    from (
      select w.id, w.name,
             row_number() over (order by w.name, w.id) as rn,
             api_private.work_line_json(w) as item
        from mos.work_lines w
       where w.org_id = shared.current_org_id()
         and (v_include_archived or w.archived_at is null)
         and (v_type is null or w.type = v_type)
         and (v_business_unit_id is null or w.business_unit_id = v_business_unit_id)
         and (v_updated_since is null or w.updated_at >= v_updated_since)
         and (v_query is null or w.name ilike api_private.like_pattern(v_query))
         and (v_cursor is null or (w.name, w.id) > (v_cursor ->> 0, (v_cursor ->> 1)::uuid))
       order by w.name, w.id
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

create function api_v1.get_project_process(id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id     uuid := get_project_process.id;
  v_item   jsonb;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then
    perform api_private.invalid('id', 'id is required.');
  end if;
  v_item := api_private.work_line_detail(v_id);
  if v_item is null then
    perform api_private.not_found('Project or Process');
  end if;
  return jsonb_build_object('item', v_item);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.create_project_process(
  name text, type text, business_unit_id uuid default null, objective_id uuid default null,
  accountable_person_id uuid default null, responsible_person_id uuid default null,
  idempotency_key text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_name   text := api_private.text_arg(create_project_process.name, 'name', 200, true);
  v_type   text := create_project_process.type;
  v_business_unit_id uuid := create_project_process.business_unit_id;
  v_key    text := create_project_process.idempotency_key;
  v_prior_record_id uuid;
  v_item   jsonb;
  v_id     uuid := gen_random_uuid();
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_type is null or v_type <> all (array['project', 'process']) then
    perform api_private.invalid('type', 'type must be project or process.');
  end if;

  v_prior_record_id := api_private.begin_write('create_project_process', v_key);
  if v_prior_record_id is not null then
    v_item := api_private.work_line_detail(v_prior_record_id);
    if v_item is not null then
      return jsonb_build_object('item', v_item, 'replayed', true);
    end if;
  end if;

  if v_business_unit_id is not null and not exists (
       select 1 from shared.business_units b
        where b.id = v_business_unit_id and b.org_id = shared.current_org_id() and b.archived_at is null) then
    perform api_private.not_found('Business Unit', 'business_unit_id');
  end if;

  insert into mos.work_lines (id, name, type, business_unit_id, objective_id, accountable_person_id, responsible_person_id)
  values (v_id, v_name, v_type, v_business_unit_id, create_project_process.objective_id,
          create_project_process.accountable_person_id, create_project_process.responsible_person_id);

  perform api_private.log_write('create_project_process', 'project_process', v_id, v_key);
  return jsonb_build_object('item', api_private.work_line_detail(v_id), 'replayed', false);
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

create function api_v1.edit_project_process(id uuid, changes jsonb, expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_id       uuid := edit_project_process.id;
  v_changes  jsonb := edit_project_process.changes;
  v_expected_updated_at timestamptz := edit_project_process.expected_updated_at;
  v_key      text;
  v_value    jsonb;
  v_old      mos.work_lines;
  v_new      mos.work_lines;
  v_row_count   integer;
  v_sqlstate text; v_message text; v_detail text; v_hint text; v_column_name text;
begin
  if v_id is null then perform api_private.invalid('id', 'id is required.'); end if;
  if v_changes is null or jsonb_typeof(v_changes) <> 'object' or v_changes = '{}'::jsonb then
    perform api_private.invalid('changes', 'changes must be an object with at least one field.');
  end if;
  if v_changes ?| array['archived', 'archived_at'] then
    perform api_private.refuse('refused.archive');
  end if;
  for v_key in select k from jsonb_object_keys(v_changes) k loop
    if v_key <> all (array['name', 'objective_id', 'business_unit_id', 'accountable_person_id', 'responsible_person_id']) then
      perform api_private.invalid(v_key, v_key || ' is not an editable field.');
    end if;
  end loop;

  perform api_private.begin_write('edit_project_process', null);

  perform 1 from mos.work_lines w where w.id = v_id;
  if not found then
    perform api_private.not_found('Project or Process');
  end if;
  select * into v_old from mos.work_lines w where w.id = v_id for update;
  if not found then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;
  if v_expected_updated_at is not null and v_old.updated_at is distinct from v_expected_updated_at then
    raise exception using errcode = 'PT409', detail = 'conflict',
      message = 'This Project or Process changed since you read it. Read it again and retry.';
  end if;

  v_new := v_old;
  for v_key, v_value in select k, x from jsonb_each(v_changes) as e(k, x) loop
    case v_key
      when 'name' then v_new.name := api_private.json_text(v_value, 'name', 200, true);
      when 'objective_id' then v_new.objective_id := api_private.json_uuid(v_value, 'objective_id', true);
      when 'business_unit_id' then v_new.business_unit_id := api_private.json_uuid(v_value, 'business_unit_id', true);
      when 'accountable_person_id' then v_new.accountable_person_id := api_private.json_uuid(v_value, 'accountable_person_id', true);
      when 'responsible_person_id' then v_new.responsible_person_id := api_private.json_uuid(v_value, 'responsible_person_id', true);
    end case;
  end loop;

  if v_new is not distinct from v_old then
    return jsonb_build_object('item', api_private.work_line_detail(v_id));
  end if;

  update mos.work_lines w set
    name = v_new.name, objective_id = v_new.objective_id, business_unit_id = v_new.business_unit_id,
    accountable_person_id = v_new.accountable_person_id, responsible_person_id = v_new.responsible_person_id
  where w.id = v_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception using errcode = 'PT403', detail = 'forbidden',
      message = 'You don''t have permission to do this in MOS.';
  end if;

  perform api_private.log_write('edit_project_process', 'project_process', v_id, null);
  return jsonb_build_object('item', api_private.work_line_detail(v_id));
exception when others then
  get stacked diagnostics v_sqlstate = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_column_name = column_name;
  perform api_private.raise_mapped(v_sqlstate, v_message, v_detail, v_hint, v_column_name);
  return null;
end
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Hardening 1: every search input is capped at 200 characters, on the slice (a) lists too
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname as name
      from pg_proc p
     where p.pronamespace = 'api_v1'::regnamespace
       and p.proname in ('list_people', 'list_teams', 'list_tasks')
  loop
    v_def := pg_get_functiondef(r.sig);
    v_new := replace(v_def,
      format('nullif(btrim(%s.q), '''')', r.name),
      format('api_private.text_arg(%s.q, ''q'', 200, false)', r.name));
    if v_new = v_def then
      raise exception 'api_v1.% did not change: q line not found', r.name;
    end if;
    execute v_new;
    execute format('comment on function %s is %L', r.sig,
      replace(obj_description(r.sig, 'pg_proc'), 'Errors: invalid_input (', 'Errors: invalid_input (q over 200 characters, '));
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Hardening 2: a function created later in api_v1 or api_private is not executable by public
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A schema-level revoke changes nothing: the implicit PUBLIC execute comes from the owner's global
-- default. So the global default drops it, and every other existing schema gets it back explicitly,
-- which leaves them exactly as before. New functions in api_v1 and api_private then start closed.
alter default privileges for role postgres revoke execute on functions from public;
do $$
declare
  r record;
begin
  for r in
    select n.nspname from pg_namespace n
     where n.nspname not like 'pg\_%' and n.nspname not in ('information_schema', 'api_v1', 'api_private')
  loop
    execute format('alter default privileges for role postgres in schema %I grant execute on functions to public', r.nspname);
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Function comments (the source of the generated reference)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
comment on function api_v1.list_signals(text[], uuid, timestamptz, timestamptz, uuid, timestamptz, text, boolean, text, integer) is
  'Purpose: Signals the caller can read, newest occurred_at first. Inputs: attention (list of FYI, Needs attention, Urgent), author_id (a filter, never an actor), occurred_from, occurred_to, linked_task_id, updated_since, q (body contains, at most 200 characters), include_retracted (default false), cursor, limit (default 50, at most 100). Returns: {items [Signal], next_cursor}. Errors: invalid_input (attention, q, cursor, limit).';
comment on function api_v1.get_signal(uuid) is
  'Purpose: one Signal with its active mentions [{kind person, team or business_unit; id}], latest 50 comments, acknowledged_by_me and linked Task ids. Inputs: id. Returns: {item}. Errors: not_found (missing or not readable), invalid_input (id).';
comment on function api_v1.create_signal(text, timestamptz, text, jsonb, uuid[], text) is
  'Purpose: post an org-wide Signal as the caller through the app''s posting function, so mention rules, the recipient cap and notifications are unchanged. Inputs: body (at most 4000 characters), occurred_at (default now), attention (FYI, Needs attention or Urgent; default FYI), mentions (at most 50 of {kind person, team or business_unit; id}), link_task_ids (at most 10 Tasks to link), idempotency_key (1 to 200 characters; the same person repeating it within 24 hours gets the same Signal back with replayed true). Returns: {item, replayed}. Errors: invalid_input, not_found (link_task_ids), forbidden (posting or mention rules), rate_limited (60 writes a minute per person).';
comment on function api_v1.edit_signal(uuid, jsonb, timestamptz) is
  'Purpose: change a Signal''s content; only its author may. Inputs: id; changes, an object holding any of body, occurred_at, category (or null), attention; expected_updated_at (the updated_at you read; a newer one is a conflict). The guard records each changed field as a revision. Audience, owning-team and mention keys are refused.permissions; retraction and archive keys are refused.archive. Returns: {item} (the Signal as get_signal returns it). Errors: invalid_input (unknown key or bad value), refused.permissions, refused.archive, not_found, forbidden, conflict, rate_limited.';
comment on function api_v1.link_signal_task(uuid, uuid) is
  'Purpose: link a Signal to a Task; an existing link is success. Inputs: signal_id, task_id. Returns: {item} (the Signal as get_signal returns it). Errors: invalid_input, not_found (signal_id or task_id), forbidden, rate_limited.';
comment on function api_v1.list_projects_processes(text, uuid, timestamptz, text, boolean, text, integer) is
  'Purpose: Projects and Processes in the caller''s org by name. Inputs: type (project or process), business_unit_id, updated_since, q (name contains, at most 200 characters), include_archived (default false), cursor, limit (default 50, at most 100). Returns: {items [Project/Process], next_cursor}. Errors: invalid_input (type, q, cursor, limit).';
comment on function api_v1.get_project_process(uuid) is
  'Purpose: one Project or Process. Inputs: id. Returns: {item}. Errors: not_found, invalid_input (id).';
comment on function api_v1.create_project_process(text, text, uuid, uuid, uuid, uuid, text) is
  'Purpose: create a Project or Process. Inputs: name (at most 200 characters), type (project or process), business_unit_id, objective_id, accountable_person_id, responsible_person_id, idempotency_key (1 to 200 characters; the same person repeating it within 24 hours gets the same record back with replayed true). Returns: {item, replayed}. Errors: invalid_input, not_found (business_unit_id), forbidden (only a person who manages that unit''s definitions), rate_limited (60 writes a minute per person).';
comment on function api_v1.edit_project_process(uuid, jsonb, timestamptz) is
  'Purpose: change a Project or Process. Inputs: id; changes, an object holding any of name, objective_id, business_unit_id, accountable_person_id, responsible_person_id (type and the internal code are never accepted: invalid_input); expected_updated_at (the updated_at you read; a newer one is a conflict). Archive keys are refused. Returns: {item}. Errors: invalid_input, refused.archive, not_found, forbidden, conflict, rate_limited.';

comment on function api_private.signal_json(mos.signals) is 'Helper: the Signal record shape returned by every Signal read and write.';
comment on function api_private.signal_detail(uuid) is 'Helper: the Signal record plus active mentions, latest comments, acknowledged_by_me and linked Task ids; null when the caller cannot read it.';
comment on function api_private.work_line_json(mos.work_lines) is 'Helper: the Project/Process record shape; the internal code and definition version are not part of it.';
comment on function api_private.work_line_detail(uuid) is 'Helper: the Project/Process record for an id; null when the caller cannot read it.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Execute grants: authenticated only, on every function in both schemas
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace in ('api_v1'::regnamespace, 'api_private'::regnamespace)
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;

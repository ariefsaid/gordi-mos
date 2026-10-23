-- Task description becomes a block document (#1838).
--
-- mos.tasks.body holds one BlockNote document (a top-level JSON array of blocks), guarded exactly
-- like mos.objectives.write_up: array shape and a 256 KB cap. Edit rights are unchanged: the tasks
-- UPDATE policy (mos.can_edit_task) already decides who may change any Task column.
--
-- mos.tasks.description stays as the plain-text copy that search and the agent API read. A BEFORE
-- trigger keeps the two in step:
--   body written (or changed)      -> description := the document's plain text (a @mention reads as
--                                     @Name, a record link has no text, capped at the column's
--                                     2000 characters)
--   only description written       -> body := one paragraph block per line (the agent API and older
--                                     clients write description alone)
-- A document with no text and no mention or record link is stored as NULL.
--
-- Change history: description is the audit copy (the generic trigger records its new text), so body
-- is excluded from the history trigger; recording both would log every edit twice.
--
-- Inbox: each person newly mentioned in a Task document (or the active members of a mentioned Team)
-- gets one notice, once per Task, at most 50 people per save (as Signal mentions), delivered from the
-- database so every write path is covered.
--
-- DOWN (ordered):
--   drop trigger tasks_mention_notify_update on mos.tasks;
--   drop trigger tasks_mention_notify_insert on mos.tasks;
--   drop trigger tasks_sync_body on mos.tasks;
--   drop trigger record_history_tasks on mos.tasks;
--   create trigger record_history_tasks after insert or update or delete on mos.tasks
--     for each row execute function shared._record_history_write('-last_activity_at');
--   drop function mos._notify_task_mentions();
--   drop function mos._sync_task_body();
--   drop function mos._task_body_mentions(jsonb);
--   drop function mos._block_document_is_blank(jsonb);
--   drop function mos._block_document_plain_text(jsonb, uuid);
--   drop function mos._block_inline_plain_text(jsonb, uuid);
--   drop function mos._block_document_from_text(text);
--   alter table mos.tasks drop constraint tasks_body_size_limit,
--     drop constraint tasks_body_is_array, drop column body;
--   (description already holds the plain-text copy, so no data is lost.)

begin;

alter table mos.tasks add column body jsonb;
comment on column mos.tasks.body is
  'The Task description as one BlockNote document (#1838): a top-level JSON array of blocks, '
  'validated for shape and size only. mos.tasks.description is its plain-text copy, kept in step '
  'by mos._sync_task_body.';
alter table mos.tasks add constraint tasks_body_is_array
  check (body is null or jsonb_typeof(body) = 'array');
alter table mos.tasks add constraint tasks_body_size_limit
  check (body is null or pg_column_size(body) <= 262144);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Helpers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One paragraph block per line of plain text; NULL for text with no content.
create function mos._block_document_from_text(p_text text)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_text is null or btrim(p_text) = '' then null else (
    select jsonb_agg(
      case when line.value = ''
        then jsonb_build_object('type', 'paragraph', 'content', '[]'::jsonb)
        else jsonb_build_object('type', 'paragraph', 'content',
          jsonb_build_array(jsonb_build_object('type', 'text', 'text', line.value, 'styles', '{}'::jsonb)))
      end order by line.ordinality)
    from unnest(string_to_array(replace(p_text, E'\r\n', E'\n'), E'\n')) with ordinality as line(value, ordinality)
  ) end;
$$;
comment on function mos._block_document_from_text(text) is
  'Converts a plain-text description into BlockNote paragraph blocks, one per line (NULL when blank).';
revoke execute on function mos._block_document_from_text(text) from public, anon;
grant execute on function mos._block_document_from_text(text) to authenticated, service_role;

-- A document is blank when it has no non-blank text and no mention or record link.
create function mos._block_document_is_blank(p_blocks jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select not exists (
    select 1
      from jsonb_path_query(p_blocks, 'lax $.** ? (@.type == "text")') as node(value)
     where btrim(coalesce(node.value ->> 'text', '')) <> ''
  ) and not jsonb_path_exists(p_blocks, 'lax $.** ? (@.type == "mention" || @.type == "recordLink")');
$$;
comment on function mos._block_document_is_blank(jsonb) is
  'True when a block document holds no authored text, mention or record link.';
revoke execute on function mos._block_document_is_blank(jsonb) from public, anon;
grant execute on function mos._block_document_is_blank(jsonb) to authenticated, service_role;

-- The visible text of one inline-content array (or string).
create function mos._block_inline_plain_text(p_content jsonb, p_org uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case jsonb_typeof(p_content)
    when 'string' then p_content #>> '{}'
    when 'array' then coalesce((
      select string_agg(
        case node.value ->> 'type'
          when 'text' then coalesce(node.value ->> 'text', '')
          when 'link' then mos._block_inline_plain_text(node.value -> 'content', p_org)
          when 'mention' then coalesce('@' || case node.value #>> '{props,kind}'
            when 'person' then (select p.full_name from shared.people p
                                 where p.org_id = p_org and p.id::text = node.value #>> '{props,id}')
            when 'team' then (select tm.name from shared.teams tm
                               where tm.org_id = p_org and tm.id::text = node.value #>> '{props,id}')
          end, '')
          else ''
        end, '' order by node.ordinality)
      from jsonb_array_elements(p_content) with ordinality as node(value, ordinality)
    ), '')
    else ''
  end;
$$;
revoke execute on function mos._block_inline_plain_text(jsonb, uuid) from public, anon;
grant execute on function mos._block_inline_plain_text(jsonb, uuid) to authenticated, service_role;

-- The document's plain text, one line per block (children follow their parent).
create function mos._block_document_plain_text(p_blocks jsonb, p_org uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_lines text[] := '{}';
  v_block jsonb;
  v_child text;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    return '';
  end if;
  for v_block in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(v_block) <> 'object' then
      continue;
    end if;
    v_lines := v_lines || mos._block_inline_plain_text(v_block -> 'content', p_org);
    if jsonb_typeof(v_block -> 'children') = 'array' then
      v_child := mos._block_document_plain_text(v_block -> 'children', p_org);
      if v_child <> '' then
        v_lines := v_lines || v_child;
      end if;
    end if;
  end loop;
  return array_to_string(v_lines, E'\n');
end;
$$;
comment on function mos._block_document_plain_text(jsonb, uuid) is
  'The visible text of a block document: one line per block, @Name for a mention, nothing for a record link.';
revoke execute on function mos._block_document_plain_text(jsonb, uuid) from public, anon;
grant execute on function mos._block_document_plain_text(jsonb, uuid) to authenticated, service_role;

-- Distinct {kind, id} of every person or Team mention in a document (garbage ids are ignored).
create function mos._task_body_mentions(p_body jsonb)
returns table (kind text, id uuid)
language sql
immutable
parallel safe
set search_path = ''
as $$
  select distinct node.value #>> '{props,kind}', (node.value #>> '{props,id}')::uuid
    from jsonb_path_query(coalesce(p_body, '[]'::jsonb), 'lax $.** ? (@.type == "mention")') as node(value)
   where node.value #>> '{props,kind}' in ('person', 'team')
     and node.value #>> '{props,id}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;
revoke execute on function mos._task_body_mentions(jsonb) from public, anon;
grant execute on function mos._task_body_mentions(jsonb) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Existing descriptions become paragraph blocks (triggers off: no history row, no updated_at move)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table mos.tasks disable trigger user;
update mos.tasks set body = mos._block_document_from_text(description) where description is not null;
alter table mos.tasks enable trigger user;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. body <-> description stay in step
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function mos._sync_task_body()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A body that is not an array is left for the tasks_body_is_array check to refuse.
  if new.body is not null and jsonb_typeof(new.body) <> 'array' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.body is not null)
     or (tg_op = 'UPDATE' and new.body is distinct from old.body) then
    -- The document wins when both were written.
    if mos._block_document_is_blank(new.body) then
      new.body := null;
      new.description := null;
    else
      new.description := nullif(left(btrim(mos._block_document_plain_text(new.body, new.org_id), E' \n'), 2000), '');
    end if;
  elsif tg_op = 'INSERT' or new.description is distinct from old.description then
    new.body := mos._block_document_from_text(new.description);
  end if;
  return new;
end;
$$;
comment on function mos._sync_task_body() is
  'Keeps mos.tasks.body and its plain-text copy mos.tasks.description in step: a document write sets '
  'the text, a text-only write (agent API, older clients) rebuilds the paragraphs.';
revoke execute on function mos._sync_task_body() from public, anon, authenticated;
create trigger tasks_sync_body
  before insert or update of body, description on mos.tasks
  for each row execute function mos._sync_task_body();

-- description is the history copy; body would double-record every edit.
drop trigger record_history_tasks on mos.tasks;
create trigger record_history_tasks
  after insert or update or delete on mos.tasks
  for each row execute function shared._record_history_write('-last_activity_at', '-body');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Inbox notice for each newly mentioned person (or Team member)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create function mos._notify_task_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := shared.current_person_id();
  v_actor_name text;
  v_old        jsonb := case when tg_op = 'UPDATE' then old.body end;
  v_recipients uuid[];
begin
  select p.full_name into v_actor_name
    from shared.people p where p.id = v_actor and p.org_id = new.org_id;

  select coalesce(array_agg(distinct r.pid), '{}') into v_recipients
    from (
      select m.id as pid
        from mos._task_body_mentions(new.body) m
       where m.kind = 'person'
         and not exists (select 1 from mos._task_body_mentions(v_old) o where o.kind = 'person' and o.id = m.id)
      union
      select tmb.person_id
        from mos._task_body_mentions(new.body) m
        join shared.teams tm on tm.id = m.id and tm.org_id = new.org_id and tm.archived_at is null
        join shared.team_memberships tmb on tmb.team_id = tm.id
       where m.kind = 'team'
         and tmb.effective_from <= current_date and (tmb.effective_to is null or tmb.effective_to >= current_date)
         and not exists (select 1 from mos._task_body_mentions(v_old) o where o.kind = 'team' and o.id = m.id)
    ) r
    join shared.people p on p.id = r.pid and p.org_id = new.org_id and p.archived_at is null
   where r.pid is distinct from v_actor
     and not exists (
       select 1 from mos.notifications n
        where n.owner_id = r.pid
          and n.metadata ->> 'source' = 'task_mention'
          and n.metadata #>> '{entity,id}' = new.id::text);

  -- Same cap as Signal mention fan-out: one save may notify at most 50 people.
  if cardinality(v_recipients) > 50 then
    raise exception 'mention fan-out exceeds cap of 50 recipients (%)', cardinality(v_recipients)
      using errcode = '22023';
  end if;

  insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
  select new.org_id, r, 'info', 'You were mentioned in a Task', left(new.title, 200),
         jsonb_build_object('source', 'task_mention',
           'actor', jsonb_build_object('id', v_actor, 'name', v_actor_name),
           'entity', jsonb_build_object('type', 'task', 'id', new.id,
                                        'route', '/work/tasks?record=' || new.id))
    from unnest(v_recipients) r;
  return null;
end;
$$;
comment on function mos._notify_task_mentions() is
  'Once per Task, notifies each person newly mentioned in its document (or the active members of a newly '
  'mentioned active Team), never the author, at most 50 per save. SECURITY DEFINER: the notice lands in another person''s Inbox.';
revoke execute on function mos._notify_task_mentions() from public, anon, authenticated;

create trigger tasks_mention_notify_insert
  after insert on mos.tasks
  for each row when (new.body is not null)
  execute function mos._notify_task_mentions();
create trigger tasks_mention_notify_update
  after update of body on mos.tasks
  for each row when (new.body is not null and new.body is distinct from old.body)
  execute function mos._notify_task_mentions();

commit;

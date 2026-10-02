-- Normalize Objective write-up updates before the generic history trigger sees them.
-- Empty documents represent no write-up; BlockNote block IDs are editor identity, not content.
--
-- DOWN:
--   drop trigger objectives_write_up_normalize on mos.objectives;
--   drop function mos._normalize_objective_write_up();
--   drop function mos._objective_write_up_history_value(jsonb);
--   drop function mos._write_up_without_block_ids(jsonb);

begin;

create function mos._write_up_without_block_ids(p_value jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'array' then
      select coalesce(
        jsonb_agg(mos._write_up_without_block_ids(item.value) order by item.ordinality),
        '[]'::jsonb)
        into v_result
        from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return v_result;
    when 'object' then
      select coalesce(
        jsonb_object_agg(entry.key, mos._write_up_without_block_ids(entry.value)),
        '{}'::jsonb)
        into v_result
        from jsonb_each(p_value) as entry(key, value)
       where not (
         entry.key = 'id'
         and coalesce(p_value ->> 'type' in (
           'paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote'
         ), false)
       );
      return v_result;
    else
      return p_value;
  end case;
end;
$$;
comment on function mos._write_up_without_block_ids(jsonb) is
  'Canonicalizes an Objective write-up for history comparison by removing BlockNote block IDs; '
  'all other JSON content and block order remain significant.';
revoke execute on function mos._write_up_without_block_ids(jsonb) from public, anon;
grant execute on function mos._write_up_without_block_ids(jsonb) to authenticated, service_role;

create function mos._objective_write_up_history_value(p_document jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if p_document is null then
    return null;
  end if;
  if jsonb_typeof(p_document) <> 'array' then
    return p_document;
  end if;

  -- Only known text-block documents with no authored text are empty. Unknown block/content shapes
  -- remain intact rather than being discarded by this normalization.
  if not exists (
       select 1
         from jsonb_path_query(p_document, '$.**.text') as text_node(value)
        where jsonb_typeof(text_node.value) = 'string'
          and btrim(text_node.value #>> '{}') <> ''
     )
     and not exists (
       select 1
         from jsonb_path_query(p_document, '$.**.content') as content_node(value)
        where jsonb_typeof(content_node.value) = 'string'
          and btrim(content_node.value #>> '{}') <> ''
     )
     and not exists (
       with recursive block_nodes(value) as (
         select item.value
           from jsonb_array_elements(p_document) as item(value)
         union all
         select child.value
           from block_nodes parent
           cross join lateral jsonb_array_elements(
             case when jsonb_typeof(parent.value -> 'children') = 'array'
                  then parent.value -> 'children' else '[]'::jsonb end
           ) as child(value)
          where jsonb_typeof(parent.value) = 'object'
       )
       select 1 from block_nodes
        where jsonb_typeof(value) <> 'object'
           or coalesce(value ->> 'type', '') not in (
             'paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote'
           )
     )
     and not exists (
       select 1
         from jsonb_path_query(p_document, '$.**.type') as typed_node(value)
        where jsonb_typeof(typed_node.value) <> 'string'
           or typed_node.value #>> '{}' not in (
             'paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote',
             'text', 'link'
           )
     )
     and not exists (
       select 1
         from jsonb_path_query(p_document, '$.**.content') as content_node(value)
        where jsonb_typeof(content_node.value) not in ('array', 'string')
     )
     and not exists (
       select 1
         from jsonb_path_query(p_document, '$.**.children') as children_node(value)
        where jsonb_typeof(children_node.value) <> 'array'
     ) then
    return null;
  end if;

  return mos._write_up_without_block_ids(p_document);
end;
$$;
comment on function mos._objective_write_up_history_value(jsonb) is
  'Normalizes an Objective write-up for content comparison: empty text-block documents become '
  'NULL, BlockNote-generated IDs are ignored, and other content remains significant.';
revoke execute on function mos._objective_write_up_history_value(jsonb) from public, anon;
grant execute on function mos._objective_write_up_history_value(jsonb) to authenticated, service_role;

create function mos._normalize_objective_write_up()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_content jsonb := mos._objective_write_up_history_value(new.write_up);
begin
  if tg_op = 'UPDATE' then
    if v_new_content is not distinct from mos._objective_write_up_history_value(old.write_up) then
      -- Keep the stored representation stable so the existing history trigger sees no change.
      new.write_up := old.write_up;
    elsif v_new_content is null then
      new.write_up := null;
    end if;
  elsif v_new_content is null then
    new.write_up := null;
  end if;
  return new;
end;
$$;
comment on function mos._normalize_objective_write_up() is
  'Runs after the Objective authority guard: stores empty documents as NULL and restores the old '
  'write-up value when normalized content is unchanged, so record history sees only real edits.';
revoke execute on function mos._normalize_objective_write_up() from public, anon, authenticated;

-- objectives_guard runs first, so normalization cannot turn an unauthorized attempted edit into a no-op.
create trigger objectives_write_up_normalize
  before insert or update of write_up on mos.objectives
  for each row execute function mos._normalize_objective_write_up();

commit;

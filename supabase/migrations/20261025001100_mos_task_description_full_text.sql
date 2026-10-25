-- Task documents (#1838): the plain-text copy is the whole document.
--
-- mos.tasks.description is the plain-text copy of mos.tasks.body that search and the agent API read.
-- The sync trigger cut it at 2000 characters, so the end of a long document was neither searchable nor
-- readable by the agent API. The trigger now keeps the whole text. The column check follows the document
-- cap: a document is at most 256 KB, so its text is at most 262144 characters. No index reads this column.
--
-- DOWN: supabase/rollbacks/20261025001100_mos_task_description_full_text.sql

alter table mos.tasks drop constraint tasks_description_length_ck;
alter table mos.tasks add constraint tasks_description_length_ck
  check (description is null or char_length(description) <= 262144);

create or replace function mos._sync_task_body()
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
      new.description := nullif(btrim(mos._block_document_plain_text(new.body, new.org_id), E' \n'), '');
    end if;
  elsif tg_op = 'INSERT' or new.description is distinct from old.description then
    new.body := mos._block_document_from_text(new.description);
  end if;
  return new;
end;
$$;

-- DOWN for 20261025001100. Restores the 2000-character cut. Refuses while any Task text is longer, since
-- the earlier check could not hold it.
begin;
do $$
begin
  if exists (select 1 from mos.tasks where char_length(description) > 2000) then
    raise exception 'a Task text is longer than 2000 characters; shorten it before rolling back';
  end if;
end $$;
alter table mos.tasks drop constraint tasks_description_length_ck;
alter table mos.tasks add constraint tasks_description_length_ck
  check (description is null or char_length(description) <= 2000);

create or replace function mos._sync_task_body()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.body is not null and jsonb_typeof(new.body) <> 'array' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.body is not null)
     or (tg_op = 'UPDATE' and new.body is distinct from old.body) then
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
commit;

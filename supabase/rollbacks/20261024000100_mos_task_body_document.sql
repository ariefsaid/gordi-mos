-- DOWN for 20261024000100. Description already holds the plain-text copy, so dropping body loses no text.
drop trigger tasks_mention_notify_update on mos.tasks;
drop trigger tasks_mention_notify_insert on mos.tasks;
drop trigger tasks_sync_body on mos.tasks;
drop trigger record_history_tasks on mos.tasks;
create trigger record_history_tasks
  after insert or update or delete on mos.tasks
  for each row execute function shared._record_history_write('-last_activity_at');
drop function mos._notify_task_mentions();
drop function mos._sync_task_body();
drop function mos._task_body_mentions(jsonb);
drop function mos._block_document_is_blank(jsonb);
drop function mos._block_document_plain_text(jsonb, uuid);
drop function mos._block_inline_plain_text(jsonb, uuid);
drop function mos._block_document_from_text(text);
alter table mos.tasks
  drop constraint tasks_body_size_limit,
  drop constraint tasks_body_is_array,
  drop column body;

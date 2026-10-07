-- Retention keeps any sent outbox row that a café receipt portion still references.
-- A portion's push link is its only "already sent" marker (the enqueue selects queued portions with
-- no link), so removing the row or its link would let a later link or release enqueue it again.
--
-- DOWN: recreate integrations.prune_esb_pushes() as defined in 20261007008500_integrations_outbox_hardening.sql.

create or replace function integrations.prune_esb_pushes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pruned integer;
begin
  with expired as (
    select p.id
      from integrations.esb_push p
     where p.status = 'posted'
       and p.posted_at < clock_timestamp() - interval '30 days'
       and not exists (select 1 from ops.cafe_receipt_portions q where q.push_id = p.id)
     order by p.posted_at
     limit 1000
     for update skip locked
  )
  delete from integrations.esb_push p
   using expired
   where p.id = expired.id;
  get diagnostics v_pruned = row_count;
  return v_pruned;
end;
$$;
comment on function integrations.prune_esb_pushes() is
  'Removes a bounded batch of posted outbox rows after the retention interval, except rows a café receipt portion still references.';
revoke execute on function integrations.prune_esb_pushes() from public, anon, authenticated;
grant execute on function integrations.prune_esb_pushes() to service_role;

-- Durable retry scheduling, bounded claims, tenant-scoped enqueue identity, and sent-row retention.
--
-- DOWN (manual): restore integrations.esb_push's global dedup constraint after ensuring its keys
-- are globally unique; restore ops._approve_kitchen_log_impl(uuid,text) with ON CONFLICT (dedup_key);
-- drop integrations.esb_push_state_transition, integrations._guard_esb_push_transition(),
-- integrations.claim_esb_pushes(uuid[]), integrations.reap_esb_pushes(), and
-- integrations.prune_esb_pushes(); restore esb_push_pending_idx on (status, created_at), drop
-- esb_push_lease_idx and esb_push_posted_retention_idx, remove next_attempt_at and locked_at,
-- then recreate the prior table comment.

alter table integrations.esb_push
  add column next_attempt_at timestamptz,
  add column locked_at timestamptz;

update integrations.esb_push
   set next_attempt_at = clock_timestamp()
 where status = 'failed' and next_attempt_at is null;
update integrations.esb_push
   set locked_at = clock_timestamp()
 where status = 'in_flight' and locked_at is null;

alter table integrations.esb_push
  drop constraint esb_push_dedup_key_key,
  add constraint esb_push_org_dedup_key_key unique (org_id, dedup_key);

comment on table integrations.esb_push is
  'Module-agnostic ERP outbox. Enqueue identity is unique within an org and retains the target-environment component.';
comment on column integrations.esb_push.next_attempt_at is
  'The earliest time a failed or recovered row may return to the claim queue.';
comment on column integrations.esb_push.locked_at is
  'The start time of the current worker lease.';

drop index integrations.esb_push_pending_idx;
create index esb_push_pending_idx on integrations.esb_push (status, next_attempt_at, created_at)
  where status in ('pending','failed');
create index esb_push_lease_idx on integrations.esb_push (locked_at)
  where status = 'in_flight';
create index esb_push_posted_retention_idx on integrations.esb_push (posted_at)
  where status = 'posted' and posted_at is not null;

create or replace function integrations._guard_esb_push_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim_owner name;
  v_reaper_owner name;
  v_delay_seconds integer;
begin
  if old.status = 'pending' and new.status = 'in_flight' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_claim_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('integrations.claim_esb_pushes(uuid[])');
    if current_user <> v_claim_owner then
      raise exception 'pending rows enter flight through the claim routine' using errcode = '42501';
    end if;
    new.locked_at := clock_timestamp();
    new.next_attempt_at := null;
    return new;
  end if;

  if old.status = 'in_flight' and new.status in ('posted','failed','dead_letter') then
    new.locked_at := null;
    if new.status = 'failed' then
      v_delay_seconds := least(3600, 60 * power(2, least(greatest(new.retry_count - 1, 0), 6))::integer);
      new.next_attempt_at := clock_timestamp() + make_interval(secs => v_delay_seconds);
    else
      new.next_attempt_at := null;
    end if;
    return new;
  end if;

  if old.status = 'in_flight' and new.status = 'pending' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_reaper_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('integrations.reap_esb_pushes()');
    if current_user <> v_reaper_owner
       or old.locked_at is null
       or old.locked_at >= clock_timestamp() - interval '10 minutes' then
      raise exception 'an active lease cannot return to pending' using errcode = '42501';
    end if;
    new.retry_count := old.retry_count + 1;
    new.locked_at := null;
    v_delay_seconds := least(3600, 60 * power(2, least(greatest(new.retry_count - 1, 0), 6))::integer);
    new.next_attempt_at := clock_timestamp() + make_interval(secs => v_delay_seconds);
    return new;
  end if;

  if old.status = 'failed' and new.status = 'pending' then
    select pg_catalog.pg_get_userbyid(p.proowner) into v_reaper_owner
      from pg_catalog.pg_proc p
     where p.oid = pg_catalog.to_regprocedure('integrations.reap_esb_pushes()');
    if current_user <> v_reaper_owner
       or old.next_attempt_at is null
       or old.next_attempt_at > clock_timestamp() then
      raise exception 'retry promotion is due through the reaper' using errcode = '42501';
    end if;
    new.locked_at := null;
    new.next_attempt_at := null;
    return new;
  end if;

  if old.status in ('pending','failed') and new.status = 'dead_letter'
     and exists (select 1 from shared.orgs o where o.id = old.org_id and o.is_sample) then
    new.locked_at := null;
    new.next_attempt_at := null;
    return new;
  end if;

  raise exception 'illegal outbox status transition: % -> %', old.status, new.status
    using errcode = '42501';
end;
$$;
revoke execute on function integrations._guard_esb_push_transition() from public, anon, authenticated;

create trigger esb_push_state_transition
  before update of status on integrations.esb_push
  for each row when (old.status is distinct from new.status)
  execute function integrations._guard_esb_push_transition();

create or replace function integrations.claim_esb_pushes(p_row_ids uuid[])
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimable uuid[];
begin
  if p_row_ids is null or cardinality(p_row_ids) = 0
     or cardinality(p_row_ids) <> (select count(distinct requested.id)
                                     from unnest(p_row_ids) as requested(id)) then
    return;
  end if;

  select array_agg(locked.id order by locked.id) into v_claimable
    from (
      select p.id
        from integrations.esb_push p
       where p.id = any(p_row_ids)
         and p.status = 'pending'
         and (p.next_attempt_at is null or p.next_attempt_at <= clock_timestamp())
       order by p.id
       for update skip locked
    ) locked;

  if coalesce(cardinality(v_claimable), 0) <> cardinality(p_row_ids) then
    return;
  end if;

  return query
    update integrations.esb_push p
       set status = 'in_flight', locked_at = clock_timestamp()
     where p.id = any(v_claimable)
     returning p.id;
end;
$$;
comment on function integrations.claim_esb_pushes(uuid[]) is
  'Atomically claims the requested pending outbox rows and starts their worker lease.';
revoke execute on function integrations.claim_esb_pushes(uuid[]) from public, anon, authenticated;
grant execute on function integrations.claim_esb_pushes(uuid[]) to service_role;

create or replace function integrations.reap_esb_pushes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered integer;
  v_retried integer;
begin
  with expired as (
    select p.id
      from integrations.esb_push p
     where p.status = 'in_flight'
       and p.locked_at < clock_timestamp() - interval '10 minutes'
     order by p.locked_at
     for update skip locked
  ), recovered as (
    update integrations.esb_push p
       set status = 'pending', locked_at = null
      from expired e
     where p.id = e.id
     returning p.id
  )
  select count(*)::integer into v_recovered from recovered;

  with due as (
    select p.id
      from integrations.esb_push p
     where p.status = 'failed'
       and p.next_attempt_at <= clock_timestamp()
     order by p.next_attempt_at
     for update skip locked
  ), promoted as (
    update integrations.esb_push p
       set status = 'pending', next_attempt_at = null
      from due d
     where p.id = d.id
     returning p.id
  )
  select count(*)::integer into v_retried from promoted;

  return v_recovered + v_retried;
end;
$$;
comment on function integrations.reap_esb_pushes() is
  'Returns expired worker leases and due retries to the pending queue.';
revoke execute on function integrations.reap_esb_pushes() from public, anon, authenticated;
grant execute on function integrations.reap_esb_pushes() to service_role;

create or replace function integrations.prune_esb_pushes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pruned integer;
  v_expired_ids uuid[];
begin
  select array_agg(expired.id) into v_expired_ids
    from (
      select p.id
        from integrations.esb_push p
       where p.status = 'posted'
         and p.posted_at < clock_timestamp() - interval '30 days'
       order by p.posted_at
       limit 1000
       for update skip locked
    ) expired;

  update ops.cafe_receipt_portions q
     set push_id = null, updated_at = clock_timestamp()
   where q.push_id = any(v_expired_ids);

  delete from integrations.esb_push p
   where p.id = any(v_expired_ids);
  get diagnostics v_pruned = row_count;
  return v_pruned;
end;
$$;
comment on function integrations.prune_esb_pushes() is
  'Removes a bounded batch of posted outbox rows after the retention interval.';
revoke execute on function integrations.prune_esb_pushes() from public, anon, authenticated;
grant execute on function integrations.prune_esb_pushes() to service_role;

-- Keep the active approval writer aligned with the tenant-scoped conflict target.
do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef('ops._approve_kitchen_log_impl(uuid,text)'::regprocedure)
    into v_definition;
  if pg_catalog.strpos(pg_catalog.lower(v_definition), 'on conflict (org_id, dedup_key)') = 0 then
    if pg_catalog.strpos(pg_catalog.lower(v_definition), 'on conflict (dedup_key)') = 0 then
      raise exception 'approval writer has no supported outbox conflict target';
    end if;
    v_definition := pg_catalog.regexp_replace(
      v_definition,
      'on conflict [(]dedup_key[)]',
      'on conflict (org_id, dedup_key)',
      'i');
    execute v_definition;
  end if;
end;
$$;

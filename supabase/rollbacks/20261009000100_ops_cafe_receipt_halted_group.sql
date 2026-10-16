-- Rollback for 20261009000100_ops_cafe_receipt_halted_group.sql (#1533).
-- Refuses once a person has resolved a group or the worker has adopted a hand-recorded number.
begin;
do $$
begin
  if exists (select 1 from ops.cafe_receipt_posting_resolutions)
     or exists (select 1 from integrations.esb_push_groups where posting_stage = 'operator_confirmed') then
    raise exception 'manual rollback blocked: halted goods-receipt resolutions exist; retain their history first';
  end if;
end;
$$;

-- Restore the outbox transition guard before removing the RPC whose owner gates dead-letter requeue.
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
    if current_user is distinct from v_claim_owner then
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
    if current_user is distinct from v_reaper_owner
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
    if current_user is distinct from v_reaper_owner
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

DROP TRIGGER record_history_cafe_receipt_posting_resolutions ON ops.cafe_receipt_posting_resolutions;
delete from shared.record_history_readers
 where schema_name = 'ops' and table_name = 'cafe_receipt_posting_resolutions';
delete from shared.record_history
 where schema_name = 'ops' and table_name = 'cafe_receipt_posting_resolutions';
drop function shared._history_reader_ops_cafe_receipt_posting_resolutions(text, text, jsonb);
drop function ops.resolve_cafe_receipt_halted_group(uuid, text, text);
drop function ops.list_cafe_receipt_halted_groups();
drop table ops.cafe_receipt_posting_resolutions;

alter table integrations.esb_push_groups
  drop constraint esb_push_groups_posting_stage_check,
  add constraint esb_push_groups_posting_stage_check check (
    posting_stage is null
    or (posting_stage = 'create_sent' and esb_doc_num is null)
    or (posting_stage = 'awaiting_authorization' and esb_doc_num is not null)
  );
comment on column integrations.esb_push_groups.posting_stage is
  'Goods-receipt groups only. create_sent: a create may have reached ESB with its answer lost, so the worker looks the MOS key up before any create. awaiting_authorization: esb_doc_num is a created goods receipt ESB has not authorized. Null: nothing is pending in ESB; with status posted, esb_doc_num is authorized.';

commit;

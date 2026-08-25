-- Round 3: destination is part of the ERP document grain.
-- DOWN: restore the function body from 20260822000001_ops_esb_approval_groups.sql;
-- this migration is a CREATE OR REPLACE and its rollback is not a DROP.
-- Defensive drop: on a fresh replay both migrations already carry the table return shape, but an
-- environment that applied the PRE-round-4 version (uuid return) cannot take this via CREATE OR
-- REPLACE (a return type cannot change in place). The drop is a no-op on fresh replays and heals
-- drifted local/staging stacks. Grants are re-stated below because DROP discards them.
drop function if exists ops.approve_kitchen_logs(uuid[], text);
create function ops.approve_kitchen_logs(p_log_ids uuid[], p_review_note text)
returns table(group_id uuid, batch_ids text[]) language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid := gen_random_uuid(); v_env text := integrations.current_esb_target_env();
  v_endpoint text; v_org uuid; v_log_id uuid; v_ids uuid[]; v_batch_id text; v_batch_ids text[] := '{}';
  v_dedup text := 'kitchen-group|' || v_group::text || '|' || v_env;
begin
  if p_log_ids is null or cardinality(p_log_ids) = 0 then raise exception 'bulk approval requires at least one log' using errcode='22023'; end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_log_ids) x;
  select l.org_id, ops.esb_endpoint_for(l.action,l.branch_id,l.destination_branch_id)
    into v_org, v_endpoint
    from ops.kitchen_logs l where l.id = v_ids[1];
  -- The first member supplies scalar values; all endpoint fields, including destination, are homogeneous.
  if v_org is null then raise exception 'kitchen log not found' using errcode='P0002'; end if;
  if exists (select 1 from ops.kitchen_logs l where l.id = any(v_ids)
             and (l.org_id is distinct from shared.current_org_id() or l.status <> 'Submitted'))
    then raise exception 'bulk approval contains a log that is not eligible' using errcode='P0003'; end if;
  if (select count(*) from ops.kitchen_logs where id = any(v_ids)) <> cardinality(v_ids)
    then raise exception 'bulk approval contains a log that is not eligible' using errcode='P0003'; end if;
  if exists (select 1 from ops.kitchen_logs l where l.id = any(v_ids)
             and (ops.esb_endpoint_for(l.action,l.branch_id,l.destination_branch_id) <> v_endpoint
               or l.destination_branch_id is distinct from (select destination_branch_id from ops.kitchen_logs where id=v_ids[1])
               or l.branch_id is distinct from (select branch_id from ops.kitchen_logs where id=v_ids[1])
               or l.activity is distinct from (select activity from ops.kitchen_logs where id=v_ids[1])
               or l.log_date is distinct from (select log_date from ops.kitchen_logs where id=v_ids[1])))
    then raise exception 'bulk approval requires one ERP endpoint, stream, and date per document' using errcode = '22023'; end if;
  if v_endpoint = 'noop' then
    raise exception 'bulk approval cannot mint a document for noop-only movements' using errcode = '22023';
  end if;
  if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin'))
    then raise exception 'only ops_lead/admin may approve' using errcode='42501'; end if;

  insert into integrations.esb_push_groups(id,org_id,target_env,dedup_key)
    values (v_group,v_org,v_env,v_dedup);
  foreach v_log_id in array v_ids loop
    select ops.approve_kitchen_log(v_log_id,p_review_note) into v_batch_id;
    v_batch_ids := array_append(v_batch_ids, v_batch_id);
    update ops.kitchen_logs set push_group_id=v_group where id=v_log_id;
    update integrations.esb_push set push_group_id=v_group
      where org_id=v_org and source_module='kitchen' and source_ref=(select batch_id from ops.kitchen_logs where id=v_log_id);
  end loop;
  return query select v_group, v_batch_ids;
end; $$;
comment on function ops.approve_kitchen_logs(uuid[],text) is
  'Atomic bulk approval session: one endpoint-homogeneous group document. Partial failure is whole-document failure; ERP document number is fanned out to all member logs by the worker. Off-plan individual approvals remain ungrouped.';
revoke execute on function ops.approve_kitchen_logs(uuid[],text) from public, anon;
grant execute on function ops.approve_kitchen_logs(uuid[],text) to authenticated;

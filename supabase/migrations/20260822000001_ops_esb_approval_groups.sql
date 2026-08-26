-- Grouped ERP approval sessions (OD-WAY-76 / OD-WAY-76 owner ruling).
-- DOWN (reverse dependency order; execute explicitly): revoke execute on function ops.approve_kitchen_logs(uuid[],text);
-- drop function ops.approve_kitchen_logs(uuid[],text); drop policy esb_push_groups_select_ops_lead_or_admin on integrations.esb_push_groups; -- renamed by 20260825000001 (#467)
-- revoke all on integrations.esb_push_groups from authenticated, service_role;
-- drop trigger esb_push_groups_set_updated_at on integrations.esb_push_groups;
-- drop index esb_push_push_group_idx; drop index kitchen_logs_push_group_idx;
-- alter table integrations.esb_push drop column push_group_id;
-- alter table ops.kitchen_logs drop column push_group_id;
-- drop table integrations.esb_push_groups. Existing per-log objects remain baseline-owned.
--
-- A bulk approval is one transaction and creates one group document. Partial failure policy:
-- the group is atomic; a rejected line rejects the whole document and no line is stamped posted.
-- esb_doc_num is fanned out to every member log after a successful ERP post. The group owns the
-- document. The group key is an IDENTITY, not a dedup mechanism: it can never collide, and the
-- no-duplicate guarantee lives in the per-log dedup keys plus Submitted eligibility. Members must
-- share endpoint, stream (branch + activity), destination, and date.

create table integrations.esb_push_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  source_module text not null default 'kitchen' check (source_module = 'kitchen'),
  target_env text not null check (target_env in ('goo','gkid','dry_run')),
  dedup_key text not null unique,
  status text not null default 'pending' check (status in ('pending','in_flight','posted','failed','dead_letter')),
  esb_doc_num text,
  last_error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table integrations.esb_push_groups is
  'One ERP document per explicit bulk approval session. The group key is an identity, not a dedup mechanism: per-log keys plus Submitted eligibility prevent duplicates. Members must share endpoint, stream (branch + activity), and log date; member logs fan out the returned ERP document number.';

alter table ops.kitchen_logs add column push_group_id uuid references integrations.esb_push_groups(id);
alter table integrations.esb_push add column push_group_id uuid references integrations.esb_push_groups(id);
create index kitchen_logs_push_group_idx on ops.kitchen_logs(push_group_id);
create index esb_push_push_group_idx on integrations.esb_push(push_group_id);
create trigger esb_push_groups_set_updated_at before update on integrations.esb_push_groups
for each row execute function shared.set_updated_at();

alter table integrations.esb_push_groups enable row level security;
alter table integrations.esb_push_groups force row level security;
create policy esb_push_groups_select_ops on integrations.esb_push_groups
  for select to authenticated using (org_id = shared.current_org_id()
    and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
grant select on integrations.esb_push_groups to authenticated;
grant select, update on integrations.esb_push_groups to service_role;

create or replace function ops.approve_kitchen_logs(p_log_ids uuid[], p_review_note text)
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
  -- min(uuid) is not available on PostgreSQL; the first member supplies scalar values.
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

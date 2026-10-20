-- DOWN (executable statements, to be applied in reverse by the migration operator):
-- drop policy esb_push_select_ops_lead_admin_or_retail_ops_manager on integrations.esb_push;
-- create policy esb_push_select_ops_lead_admin_or_retail_ops_manager on integrations.esb_push
--   for select to authenticated using (
--     org_id = shared.current_org_id()
--     and (shared.has_access_role('ops_lead') or shared.has_access_role('admin') or (
--       shared.has_access_role('manager') and exists (
--         select 1
--         from shared.person_roles pr
--         join shared.roles r on r.id = pr.role_id
--         join shared.business_units bu on bu.id = r.business_unit_id
--         where pr.person_id = shared.current_person_id()
--           and pr.org_id = shared.current_org_id()
--           and r.org_id = pr.org_id and bu.org_id = r.org_id
--           and bu.code = 'retail_ops'
--       )
--     ))
--   );
-- revoke all on function shared.can_read_cafe_pushes() from authenticated, service_role;
-- drop function shared.can_read_cafe_pushes();

create or replace function shared.can_read_cafe_pushes()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    shared.current_org_id() is not null
    and (
      shared.has_access_role('ops_lead')
      or shared.has_access_role('admin')
      or (
        shared.has_access_role('manager')
        and exists (
          select 1
          from shared.person_roles pr
          join shared.roles r on r.id = pr.role_id
          join shared.business_units bu on bu.id = r.business_unit_id
          where pr.person_id = shared.current_person_id()
            and pr.org_id = shared.current_org_id()
            and r.org_id = pr.org_id
            and bu.org_id = r.org_id
            and bu.code = 'retail_ops'
        )
      )
    ),
    false
  );
$$;

revoke all on function shared.can_read_cafe_pushes() from public, anon;
grant execute on function shared.can_read_cafe_pushes() to authenticated, service_role;

-- The single read fact is shared by RLS and the viewer's navigation; org isolation remains explicit.
drop policy esb_push_select_ops_lead_admin_or_retail_ops_manager on integrations.esb_push;
create policy esb_push_select_ops_lead_admin_or_retail_ops_manager on integrations.esb_push
for select to authenticated
using (
  org_id = (select shared.current_org_id())
  and (select shared.can_read_cafe_pushes())
);

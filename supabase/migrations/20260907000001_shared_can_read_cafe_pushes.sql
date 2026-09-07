-- Café pushes read gate as one viewer fact (#785).
-- The RLS policy on integrations.esb_push (added by #778) admits ops_lead/admin plus a
-- manager whose position is in a Retail Ops business unit. The client mirrors that rule
-- through this ONE fact — asked as an RPC that runs the same predicate the policy runs, so
-- no surface re-derives the rule. Fail closed: a failed read answers false. RLS, never
-- this function, is the read authority.

-- DOWN (executable statements, applied in reverse):
--   revoke execute on function shared.can_read_cafe_pushes() from authenticated;
--   drop function if exists shared.can_read_cafe_pushes();

create or replace function shared.can_read_cafe_pushes()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('ops_lead')
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
$$;
comment on function shared.can_read_cafe_pushes() is
  'Café pushes read admission mirrored as one viewer fact — the SAME predicate the integrations.esb_push select policy consults, so the client never re-derives it. Fail closed on read failure; RLS is the authority (#785).';
grant execute on function shared.can_read_cafe_pushes() to authenticated;

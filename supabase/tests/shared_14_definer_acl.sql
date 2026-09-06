-- shared — every SECURITY DEFINER function in an exposed application schema is closed to PUBLIC and anon.
begin;
create extension if not exists pgtap with schema extensions;
create temporary table definer_acl_anon_allowlist (
  schema_name name not null,
  function_name name not null,
  identity_arguments text not null,
  reason text not null
) on commit drop;
insert into definer_acl_anon_allowlist (schema_name, function_name, identity_arguments, reason) values
  ('mos', 'can_read_signal', 'p_signal_id uuid', 'authenticated signal read policy'),
  ('mos', 'capture_budget', 'p_menu_item_esb_code text, p_menu_item_name text, p_scenario_label text, p_scenario_type text, p_owning_bu_id uuid, p_cost_basis_as_of timestamp with time zone, p_certified_metric_key text, p_is_complete boolean, p_notes text, p_lines mos.budget_line_input[]', 'authenticated budget RPC'),
  ('mos', 'complete_process_run', 'p_run_id uuid', 'authenticated process RPC'),
  ('mos', 'create_notification', 'p_owner uuid, p_severity text, p_title text, p_body text, p_metadata jsonb', 'authenticated notification RPC'),
  ('mos', 'fan_out_signal_mention', 'p_signal_id uuid', 'authenticated mention RPC'),
  ('mos', 'resolve_pending_task', 'p_pending_id uuid, p_pic_person_id uuid', 'authenticated task RPC'),
  ('mos', 'spawn_process_run', 'p_work_line_id uuid, p_owning_team_id uuid, p_target_date date', 'authenticated process RPC'),
  ('mos', 'transition_follow_up', 'p_follow_up_id uuid, p_transition text, p_options jsonb', 'authenticated follow-up RPC'),
  ('shared', '_count_active_admins', '', 'authenticated auth hook'),
  ('shared', '_current_person_is_live', '', 'authenticated auth hook'),
  ('shared', '_current_person_must_change_password', '', 'authenticated auth hook'),
  ('shared', 'admin_create_login', 'p_person uuid, p_password text', 'authenticated admin RPC'),
  ('shared', 'admin_list_login_status', '', 'authenticated admin RPC'),
  ('shared', 'admin_reset_password', 'p_person uuid, p_password text', 'authenticated admin RPC'),
  ('shared', 'admin_set_login_enabled', 'p_person uuid, p_enabled boolean', 'authenticated admin RPC');
-- The unauthenticated API role has no deliberate SECURITY DEFINER entry points today: empty.
-- An exposed function must be inserted here with its exact identity arguments and one-line reason.
-- 34 current functions plus the non-empty-enumeration guard below.
select plan(58);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('mos', 'ops', 'shared', 'integrations', 'reporting')
      and not exists (
        select 1
        from definer_acl_anon_allowlist a
        where a.schema_name = n.nspname
          and a.function_name = p.proname
          and a.identity_arguments = pg_get_function_identity_arguments(p.oid))
  ),
  'SECURITY DEFINER function enumeration is non-empty'
);

select ok(
  not has_function_privilege('public', p.oid, 'EXECUTE')
    and (
      exists (
        select 1
        from definer_acl_anon_allowlist a
        where a.schema_name = n.nspname
          and a.function_name = p.proname
          and a.identity_arguments = pg_get_function_identity_arguments(p.oid))
      or not has_function_privilege('anon', p.oid, 'EXECUTE')),
  format('%I.%I(%s) does not grant EXECUTE to public or anon',
    n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and n.nspname in ('mos', 'ops', 'shared', 'integrations', 'reporting')
order by n.nspname, p.proname, p.oid;

select ok(
  not has_function_privilege('authenticated', p.oid, 'EXECUTE')
    or exists (
      select 1 from definer_acl_anon_allowlist a
      where a.schema_name = n.nspname
        and a.function_name = p.proname
        and a.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ),
  format('%I.%I(%s) does not grant EXECUTE to authenticated unless allow-listed',
    n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and n.nspname in ('mos', 'shared')
order by n.nspname, p.proname, p.oid;

select * from finish();
rollback;

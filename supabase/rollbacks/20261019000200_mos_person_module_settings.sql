-- Remove per-person module settings after deploying the pre-feature app and edge functions.
-- Export personal settings and audit first if they must be recoverable.
begin;

drop function mos.save_person_module_settings(uuid, jsonb, uuid);
drop function mos.list_person_module_settings(uuid);
drop function mos.viewer_module_availability();

create function mos.viewer_module_availability()
returns table(module_id text, enabled boolean, revision text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_revision text;
begin
  if v_org is null then
    raise exception 'signed-in org required' using errcode = '42501';
  end if;

  select pg_catalog.md5(pg_catalog.string_agg(
           c.id || ':' || coalesce(s.row_version, 0)::text,
           ',' order by case c.id
             when 'work' then 1 when 'money' then 2 when 'cafe' then 3
             when 'roastery' then 4 when 'ecommerce' then 5
             when 'assistant' then 6 else 7 end))
    into v_revision
    from mos.module_catalog c
    left join mos.org_module_settings s
      on s.org_id = v_org and s.module_id = c.id;

  return query
    select c.id, coalesce(s.enabled, c.id <> 'assistant'), v_revision
      from mos.module_catalog c
      left join mos.org_module_settings s
        on s.org_id = v_org and s.module_id = c.id
     order by case c.id
       when 'work' then 1 when 'money' then 2 when 'cafe' then 3
       when 'roastery' then 4 when 'ecommerce' then 5
       when 'assistant' then 6 else 7 end;
end;
$$;
comment on function mos.viewer_module_availability() is
  'Returns the caller org''s six module availability values and a shared revision hash, without exposing other orgs.';
revoke execute on function mos.viewer_module_availability()
  from public, anon, authenticated, service_role;
grant execute on function mos.viewer_module_availability() to authenticated;

drop trigger person_module_settings_audit_append_only
  on mos.person_module_settings_audit;
drop table mos.person_module_settings_audit;
drop table mos.person_module_settings;
alter table shared.people
  drop constraint people_org_id_id_module_settings_key;

commit;

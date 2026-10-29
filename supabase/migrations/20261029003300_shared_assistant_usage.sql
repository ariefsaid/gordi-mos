-- DOWN: run supabase/rollbacks/20261029003300_shared_assistant_usage.sql.
create table shared.assistant_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id),
  person_id uuid not null references shared.people(id),
  units integer not null check (units > 0),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);
create index assistant_usage_org_time_idx on shared.assistant_usage (org_id, created_at desc);
alter table shared.assistant_usage enable row level security;
alter table shared.assistant_usage force row level security;
revoke all on shared.assistant_usage from public, anon, authenticated;

create function shared.reserve_assistant_usage(p_org uuid, p_person uuid, p_units integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_now timestamptz;
  v_org_active bigint;
  v_person_active bigint;
  v_org_minute bigint;
  v_person_minute bigint;
  v_org_daily bigint;
  v_person_daily bigint;
begin
  if p_org is null or p_person is null or p_units is null or p_units <= 0 or p_units > 147456 then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('assistant_usage:' || p_org::text, 0));
  v_now := clock_timestamp();
  if not exists (select 1 from shared.people where id = p_person and org_id = p_org) then
    return null;
  end if;
  delete from shared.assistant_usage where org_id = p_org and created_at <= v_now - interval '2 days';
  select count(*) filter (where finished_at is null and created_at > v_now - interval '2 minutes'),
         count(*) filter (where finished_at is null and created_at > v_now - interval '2 minutes' and person_id = p_person),
         count(*) filter (where created_at > v_now - interval '1 minute'),
         count(*) filter (where created_at > v_now - interval '1 minute' and person_id = p_person),
         coalesce(sum(units) filter (where created_at > v_now - interval '1 day'), 0),
         coalesce(sum(units) filter (where created_at > v_now - interval '1 day' and person_id = p_person), 0)
    into v_org_active, v_person_active, v_org_minute, v_person_minute, v_org_daily, v_person_daily
    from shared.assistant_usage
   where org_id = p_org and created_at > v_now - interval '1 day';
  if v_org_active >= 10 or v_person_active >= 2 or v_org_minute >= 200 or v_person_minute >= 20
     or v_org_daily + p_units > 20000000 or v_person_daily + p_units > 1000000 then
    return null;
  end if;
  insert into shared.assistant_usage (org_id, person_id, units) values (p_org, p_person, p_units) returning id into v_id;
  return v_id;
end $$;

create function shared.finish_assistant_usage(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update shared.assistant_usage set finished_at = clock_timestamp() where id = p_id and finished_at is null;
$$;
revoke execute on function shared.reserve_assistant_usage(uuid,uuid,integer) from public, anon, authenticated;
revoke execute on function shared.finish_assistant_usage(uuid) from public, anon, authenticated;
grant execute on function shared.reserve_assistant_usage(uuid,uuid,integer) to service_role;
grant execute on function shared.finish_assistant_usage(uuid) to service_role;

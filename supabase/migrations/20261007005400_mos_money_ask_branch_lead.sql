-- #1436 — "Ask branch lead" on the Money Branch page (OD-2026-10-06-MONEY-BUILD).
--
-- One function creates a Task for the lead of the branch's Team that carries a link to the Branch
-- view and never a money figure: Tasks are readable beyond Money's tiers, so the caller cannot pass
-- free text at all. The title and the description are built here from the branch name, the day and
-- the link. Caller input reaches the Task only as validated parts of that link: the app URL (which
-- must match the request's Origin header), the branch code, the period and the day.
--
-- Why SECURITY DEFINER: the lead is read from shared.team_lead_assignments, which only the Team's
-- own members may read, and the Task's PIC is the lead, whom mos._guard_tasks admits only for the
-- lead themselves, an org-wide writer or the lead's manager. Money's margin tier (finance, manager)
-- asks across the org's branches, so the function stands in for both checks, narrowly: the caller
-- holds that tier, the branch is the caller's org's, the Team is the branch's live Café Team
-- (shared.cafe_opening_team: kitchen first, then bar) and the PIC is that Team's active lead.
--
-- Rollback: supabase/rollbacks/20261007005400_mos_money_ask_branch_lead.sql.

create or replace function mos.ask_branch_lead(
  p_branch_code text,
  p_period integer,
  p_day date,
  p_app_url text,
  p_locale text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org         uuid := shared.current_org_id();
  v_caller      uuid := shared.current_person_id();
  v_branch_id   uuid;
  v_branch_name text;
  v_team_id     uuid;
  v_bu_id       uuid;
  v_lead_id     uuid;
  v_link        text;
  v_day_text    text;
  v_title       text;
  v_task_id     uuid;
  v_origin      text := nullif(current_setting('request.headers', true), '')::json ->> 'origin';
begin
  if v_org is null or v_caller is null
     or not (shared.has_access_role('finance') or shared.has_access_role('manager')) then
    raise exception 'only the margin tier may ask a branch lead' using errcode = '42501';
  end if;
  if p_period is null or p_period not in (7, 30, 60) then
    raise exception 'period must be 7, 30 or 60' using errcode = '22023';
  end if;
  if p_day is null then
    raise exception 'day is required' using errcode = '22023';
  end if;
  if p_locale is null or p_locale not in ('en', 'id') then
    raise exception 'locale must be en or id' using errcode = '22023';
  end if;
  -- Scheme, host, optional port and path only, and on the request's Origin header. A browser sets
  -- that header to the app's own origin; a direct API call can set any, so this keeps the app's
  -- own asks on the app and is not an allowlist.
  if p_app_url is null
     or p_app_url !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~-]+)*$'
     or v_origin is null
     or not (p_app_url = v_origin or starts_with(p_app_url, v_origin || '/')) then
    raise exception 'app URL must be scheme, host and path on the request origin' using errcode = '22023';
  end if;
  -- A day the Money read can show (its 120-day window), so a varied date cannot mint Tasks.
  if p_day > (now() at time zone 'Asia/Jakarta')::date
     or p_day < (now() at time zone 'Asia/Jakarta')::date - 120 then
    raise exception 'day is outside the Money window' using errcode = '22023';
  end if;
  if p_branch_code is null or p_branch_code !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'branch code is malformed' using errcode = '22023';
  end if;

  -- The ERP code's MOS branch, as the reporting rows link it in the caller's org.
  select r.branch_id into v_branch_id
    from reporting.sales_daily_revenue r
   where r.org_id = v_org and r.branch_code = p_branch_code and r.branch_id is not null
   order by r.revenue_date desc
   limit 1;
  select b.name into v_branch_name
    from shared.branches b
   where b.org_id = v_org and b.id = v_branch_id and b.archived_at is null;
  if v_branch_name is null then
    raise exception 'no MOS branch for this code' using errcode = 'P0002';
  end if;

  v_team_id := shared.cafe_opening_team(v_branch_id);
  select t.business_unit_id into v_bu_id from shared.teams t where t.id = v_team_id;
  select a.lead_person_id into v_lead_id
    from shared.team_lead_assignments a
    join shared.people p on p.id = a.lead_person_id and p.archived_at is null
   where a.org_id = v_org and a.team_id = v_team_id;
  if v_lead_id is null then
    raise exception 'the branch has no Team lead' using errcode = 'P0002';
  end if;

  v_link := p_app_url || '/money/branch/' || p_branch_code
         || '?period=' || p_period::text || '&d=' || to_char(p_day, 'YYYY-MM-DD');
  if p_locale = 'id' then
    v_day_text := (array['Min','Sen','Sel','Rab','Kam','Jum','Sab'])[extract(dow from p_day)::int + 1]
               || ' ' || extract(day from p_day)::int::text || ' '
               || (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from p_day)::int];
    v_title := 'Periksa penjualan ' || v_branch_name || ' untuk ' || v_day_text;
  else
    v_day_text := (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_day)::int + 1]
               || ' ' || extract(day from p_day)::int::text || ' '
               || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p_day)::int];
    v_title := 'Check ' || v_branch_name || ' sales for ' || v_day_text;
  end if;

  -- Asking again about the same view returns the caller's open Task; a double click makes one.
  perform pg_advisory_xact_lock(hashtextextended(v_caller::text || v_link, 0));
  select k.id into v_task_id
    from mos.tasks k
   where k.org_id = v_org and k.created_by = v_caller and k.team_id = v_team_id
     and k.description = v_link and k.archived_at is null and k.status <> 'Done'
   limit 1;
  if v_task_id is not null then
    return v_task_id;
  end if;

  insert into mos.tasks (org_id, title, description, status, business_unit_id, team_id,
                         responsible_person_id, accountable_person_id, created_by)
  values (v_org, v_title, v_link, 'Open', v_bu_id, v_team_id, v_lead_id, v_caller, v_caller)
  returning id into v_task_id;
  insert into mos.task_events (task_id, actor_person_id, event_type)
  values (v_task_id, v_caller, 'created');
  return v_task_id;
end;
$$;

comment on function mos.ask_branch_lead(text, integer, date, text, text) is
  'Money Branch page "Ask branch lead" (#1436): margin tier only (finance, manager). Creates, or returns the caller''s open, Task for the lead of the branch''s live Café Team (kitchen, else bar); the title names the branch and day, the description is the Branch-view link. No caller text and no money figure reaches the Task.';

revoke execute on function mos.ask_branch_lead(text, integer, date, text, text) from public, anon;
grant execute on function mos.ask_branch_lead(text, integer, date, text, text) to authenticated;

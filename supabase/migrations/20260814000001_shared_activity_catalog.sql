-- Activity catalog: the single vocabulary for every (branch, activity) production stream.
-- DOWN (only while no post-migration activity exists): drop the five activity foreign keys,
-- restore the prior kitchen/bar CHECK constraints, then drop shared.activities and its policy.

create table shared.activities (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_code_not_blank check (btrim(code) <> ''),
  constraint activities_name_not_blank check (btrim(name) <> '')
);
comment on table shared.activities is
  'Canonical Activity vocabulary for the (branch, activity) production stream. This is the one source of activity codes.';
insert into shared.activities (code, name) values
  ('kitchen', 'Kitchen'),
  ('bar', 'Bar');

revoke all on shared.activities from public, anon, authenticated;
grant select on shared.activities to authenticated;
alter table shared.activities enable row level security;
alter table shared.activities force row level security;
create policy activities_select_all on shared.activities
  for select to authenticated using (true);

-- Applied databases have the old checks; fresh databases do not, because the source migrations
-- are kept free of the obsolete duplicated vocabulary.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid in (
      'shared.teams'::regclass,
      'ops.kitchen_plans'::regclass,
      'ops.kitchen_logs'::regclass,
      'ops.kitchen_stock'::regclass,
      'ops.stream_completeness'::regclass)
      and c.conname in (
        'teams_activity_check',
        'kitchen_plans_activity_check',
        'kitchen_logs_activity_check',
        'kitchen_stock_activity_check',
        'stream_completeness_activity_check')
  loop
    execute format('alter table %s drop constraint %I',
      (select quote_ident(n.nspname) || '.' || quote_ident(r.relname)
       from pg_class r join pg_namespace n on n.oid = r.relnamespace
       where r.oid = (select conrelid from pg_constraint where conname = v_constraint.conname limit 1)),
      v_constraint.conname);
  end loop;
end;
$$;

alter table shared.teams add constraint teams_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.kitchen_plans add constraint kitchen_plans_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.kitchen_logs add constraint kitchen_logs_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.kitchen_stock add constraint kitchen_stock_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.stream_completeness add constraint stream_completeness_activity_fkey
  foreign key (activity) references shared.activities(code);

comment on column shared.teams.activity is
  'Activity half of the production stream; resolves to shared.activities. Set and null together with branch_id.';
comment on column ops.kitchen_plans.activity is
  'Activity half of the production stream; resolves to shared.activities.';
comment on column ops.kitchen_logs.activity is
  'Activity half of the production stream; resolves to shared.activities. The current catalog yields six distinct streams across the three production branches.';
comment on column ops.kitchen_stock.activity is
  'Activity half of the production stream; resolves to shared.activities.';
comment on column ops.stream_completeness.activity is
  'Activity half of the production stream; resolves to shared.activities.';

create or replace function shared.seed_stream_teams()
returns void language plpgsql set search_path = '' as $$
declare
  organization record;
  v_missing text;
begin
  for organization in select id as org_id from shared.orgs loop
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
    select organization.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code
    from shared.branches b
    cross join shared.activities a
    join shared.business_units bu on bu.org_id = organization.org_id
      and bu.code = 'retail_ops' and bu.archived_at is null
    where b.org_id = organization.org_id and b.code in ('gordi_hq', 'rumah_rames', 'radiant')
      and b.archived_at is null
    on conflict (org_id, code) do nothing;

    select string_agg(b.code || '/' || a.code, ', ' order by b.code, a.code)
      into v_missing
    from shared.branches b cross join shared.activities a
    where b.org_id = organization.org_id and b.code in ('gordi_hq', 'rumah_rames', 'radiant')
      and b.archived_at is null
      and exists (select 1 from shared.business_units bu
                  where bu.org_id = organization.org_id and bu.code = 'retail_ops'
                    and bu.archived_at is null)
      and not exists (select 1 from shared.teams t
                      where t.org_id = organization.org_id and t.branch_id = b.id
                        and t.activity = a.code and t.archived_at is null);
    if v_missing is not null then
      raise exception 'stream-team seed shortfall for org %: missing %', organization.org_id, v_missing;
    end if;
  end loop;
end;
$$;
comment on function shared.seed_stream_teams() is
  'Seeds one live stream Team for every non-roastery production branch and every shared Activity.';
revoke execute on function shared.seed_stream_teams() from public, anon, authenticated;
select shared.seed_stream_teams();

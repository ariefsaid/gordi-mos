-- DOWN: drop policy deployment_stamp_read on shared.deployment_stamp; drop table shared.deployment_stamp;
begin;

create table shared.deployment_stamp (
  id boolean primary key default true check (id),
  backend_sha text not null check (backend_sha ~ '^[0-9a-f]{40}$'),
  deployed_at timestamptz not null default now()
);
comment on table shared.deployment_stamp is
  'Deployment-wide backend identity; this describes the shared environment, not tenant data, so it has no org_id.';

revoke all on shared.deployment_stamp from public, anon, authenticated, service_role;
grant select on shared.deployment_stamp to authenticated;
alter table shared.deployment_stamp enable row level security;
alter table shared.deployment_stamp force row level security;
create policy deployment_stamp_read on shared.deployment_stamp
  for select to authenticated using (true);

commit;

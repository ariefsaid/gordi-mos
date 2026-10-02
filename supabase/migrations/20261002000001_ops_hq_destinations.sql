-- OD-CAFE-MVP-7: cross-branch destination permissions are stored as org-scoped route data.
-- The initial route rows and their derivation are added by 20261002000002; this relation keeps
-- future destination changes data-only rather than encoding branch codes in the SQL function.
--
-- DOWN: after reverting 20261002000002, drop ops.cafe_destinations and its policy.

create table ops.cafe_destinations (
  org_id uuid not null references shared.orgs(id) on delete cascade,
  origin_branch_id uuid not null,
  origin_activity text not null references shared.activities(code),
  destination_branch_id uuid not null,
  primary key (org_id, origin_branch_id, origin_activity, destination_branch_id),
  foreign key (org_id, origin_branch_id) references shared.branches(org_id, id) on delete cascade,
  foreign key (org_id, destination_branch_id) references shared.branches(org_id, id) on delete cascade,
  check (origin_branch_id <> destination_branch_id)
);
comment on table ops.cafe_destinations is
  'Org-scoped reference rows authorizing cross-branch Café movements. Add destinations as rows; '
  'ops.allowed_kitchen_destinations contains no branch-code routing rules.';

alter table ops.cafe_destinations enable row level security;
alter table ops.cafe_destinations force row level security;
grant select on ops.cafe_destinations to authenticated;
create policy cafe_destinations_select_org on ops.cafe_destinations
  for select to authenticated using (org_id = shared.current_org_id());
comment on policy cafe_destinations_select_org on ops.cafe_destinations is
  'A viewer reads route data only for the org in their current authenticated context.';

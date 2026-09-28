-- Per-account interface preferences (#927). Language belongs to the signed-in person, not to the
-- browser: a row exists only after that person explicitly chose a value; no row means the product
-- default. Every read and write is the caller's own row in the caller's own org.
--
-- Its own table rather than a column on shared.people: people is org-readable (people_select_org)
-- and admin-written, while a preference is private to its owner and self-written.
--
-- DOWN (manual, before production):
--   drop table shared.person_preferences;

create table shared.person_preferences (
  person_id  uuid primary key references shared.people(id) on delete cascade,
  org_id     uuid not null default shared.current_org_id() references shared.orgs(id) on delete cascade,
  locale     text not null,
  updated_at timestamptz not null default now(),
  constraint person_preferences_locale_ck check (locale in ('en', 'id'))
);
comment on table shared.person_preferences is
  'A person''s own interface preferences. Absent row = product defaults. Readable and writable only '
  'by that person, in their own org.';
comment on column shared.person_preferences.locale is
  'Interface language chosen by the person: en or id. Written only on an explicit change.';

create index person_preferences_org_idx on shared.person_preferences (org_id);

create trigger person_preferences_set_updated_at
  before update on shared.person_preferences
  for each row execute function shared.set_updated_at();

alter table shared.person_preferences enable row level security;
alter table shared.person_preferences force  row level security;

-- No DELETE: clearing a choice is not a feature. service_role bypasses RLS for admin repair.
revoke all on shared.person_preferences from public, anon, authenticated;
grant select, insert, update on shared.person_preferences to authenticated;

create policy person_preferences_select_self on shared.person_preferences
  for select to authenticated
  using (person_id = shared.current_person_id() and org_id = shared.current_org_id());

create policy person_preferences_insert_self on shared.person_preferences
  for insert to authenticated
  with check (person_id = shared.current_person_id() and org_id = shared.current_org_id());

create policy person_preferences_update_self on shared.person_preferences
  for update to authenticated
  using      (person_id = shared.current_person_id() and org_id = shared.current_org_id())
  with check (person_id = shared.current_person_id() and org_id = shared.current_org_id());

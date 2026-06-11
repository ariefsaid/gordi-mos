-- P1-2 — touch updated_at on every UPDATE. One function, schema-qualified, attached per table.
create or replace function shared.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orgs_set_updated_at
  before update on shared.orgs
  for each row execute function shared.set_updated_at();

create trigger business_units_set_updated_at
  before update on shared.business_units
  for each row execute function shared.set_updated_at();

create trigger roles_set_updated_at
  before update on shared.roles
  for each row execute function shared.set_updated_at();

create trigger people_set_updated_at
  before update on shared.people
  for each row execute function shared.set_updated_at();
-- person_roles is immutable (insert/delete only), so it has updated_at-free shape and no trigger.

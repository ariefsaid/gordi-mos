-- #136 / GHSA-mgxm-685w-62mm — refuse a role hierarchy edge that would close a cycle.
--
-- shared.roles.reports_to_role_id had no CHECK, no trigger and no cycle guard. A cycle is not a
-- wrong answer, it is a HANG: shared.is_manager_of and the SPA's deriveIsManager both walk the
-- hierarchy, so one bad re-parent by an admin takes out every surface that asks who reports to
-- whom. There is no in-app way back, because the admin screen that would fix it also walks.
--
-- A CHECK cannot express this: it sees one row, and a cycle is a property of the whole graph. So
-- it is a BEFORE trigger that walks upward from the proposed parent and refuses if the walk
-- reaches the row being written.
--
-- Second hole closed here: reports_to_role_id is a bare self-FK with no org predicate, so nothing
-- stopped a role pointing at another org's role — a tenancy leak shaped like an org chart.
--
-- Rollback:
--   drop trigger guard_role_hierarchy on shared.roles;
--   drop function shared._guard_role_hierarchy();

create or replace function shared._guard_role_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor uuid := new.reports_to_role_id;
  v_parent_org uuid;
  v_hops   int  := 0;
begin
  -- A root closes nothing.
  if v_cursor is null then
    return new;
  end if;

  -- Self-reference is checked BEFORE the org lookup, and the order is load-bearing: on INSERT the
  -- row does not exist yet, so looking up its org would return NULL and raise the cross-org error
  -- for what is really the shortest possible cycle. Wrong errcode, wrong diagnosis.
  if v_cursor = new.id then
    raise exception 'role hierarchy would contain a cycle' using errcode = '23514';
  end if;

  select org_id into v_parent_org from shared.roles where id = v_cursor;
  if v_parent_org is distinct from new.org_id then
    raise exception 'a role may only report to a role in the same org' using errcode = '42501';
  end if;

  -- Walk upward from the proposed parent. Reaching new.id means this edge closes a loop.
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'role hierarchy would contain a cycle' using errcode = '23514';
    end if;

    -- Belt and braces: if a cycle ALREADY exists (this migration installs the guard after the fact,
    -- and nothing validated the existing rows), the walk would never terminate and would hang the
    -- writing session rather than the reader. Bail loudly instead. 1000 is far beyond any real org
    -- chart — at ~30 people the true depth is single digits.
    v_hops := v_hops + 1;
    if v_hops > 1000 then
      raise exception 'role hierarchy walk exceeded 1000 hops — pre-existing cycle?'
        using errcode = '23514';
    end if;

    select reports_to_role_id into v_cursor from shared.roles where id = v_cursor;
  end loop;

  return new;
end;
$$;

comment on function shared._guard_role_hierarchy() is
  '#136: refuses a reports_to_role_id edge that would close a cycle, and refuses a cross-org parent. '
  'SECURITY DEFINER so the walk sees the true graph — under RLS the writer sees only their own org, '
  'and a caller whose org resolves to NULL (#131 rotation gate) would see nothing and wave a cycle '
  'through.';

-- Only ever reached as a trigger, which fires in the table''s own context and needs no EXECUTE
-- grant, so the full revoke is safe (unlike shared._current_person_must_change_password(), which
-- policies call and which therefore needs an explicit grant back to authenticated).
revoke execute on function shared._guard_role_hierarchy() from public, anon, authenticated;

-- Fires on INSERT always, and on UPDATE only when the edge actually moves — an unrelated rename or
-- business_unit change should not pay for a hierarchy walk.
drop trigger if exists guard_role_hierarchy on shared.roles;
create trigger guard_role_hierarchy
before insert or update of reports_to_role_id, org_id on shared.roles
for each row
execute function shared._guard_role_hierarchy();

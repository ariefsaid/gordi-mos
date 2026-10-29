create or replace function shared.end_team_membership(p_person_id uuid, p_team_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update shared.team_memberships
     set effective_to = current_date - 1
   where person_id = p_person_id
     and team_id   = p_team_id
     -- The GATES' definition of live, not `is null` alone: a future-dated end is still a live
     -- membership, the screen renders it as one, and this is the only way to remove it. Matching
     -- `is null` alone made Remove a silent no-op on exactly those rows.
     and (effective_to is null or effective_to >= current_date);
$$;

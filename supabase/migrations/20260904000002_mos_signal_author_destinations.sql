-- Tightens the live read gate with tm.org_id = shared.current_org_id() and exposes the same
-- canonical predicates to the composer destination list.

drop function if exists mos._can_read_signal_rules(uuid, uuid, uuid);

create or replace function mos._can_read_signal_rules(
  p_signal_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from shared.teams tm
    where tm.id = p_team_id
      and tm.org_id = shared.current_org_id()
      and (
        exists ( -- R1 active member of the owning Team
          select 1 from shared.team_memberships m
          where m.team_id = p_team_id and m.person_id = shared.current_person_id()
            and m.org_id = shared.current_org_id()
            and m.effective_from <= current_date
            and (m.effective_to is null or m.effective_to >= current_date))
        or exists ( -- R2 holds a role scoped to the owning Team's parent BU
          select 1 from shared.person_roles pr
          join shared.roles r on r.id = pr.role_id
          where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()
            and r.business_unit_id = tm.business_unit_id)
        or ( -- R3 strictly higher BU visibility rank
          coalesce((select max(coalesce(bu.signal_visibility_rank, 0))
                    from shared.person_roles pr
                    join shared.roles r on r.id = pr.role_id
                    join shared.business_units bu on bu.id = r.business_unit_id
                    where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()), 0)
          > coalesce((select bu2.signal_visibility_rank
                      from shared.business_units bu2
                      where bu2.id = tm.business_unit_id), 0))
        or ( -- R4 needs a real Signal and is intentionally absent from a destination list
          p_signal_id is not null and exists (
            select 1 from mos.signal_mentions sm
            where sm.signal_id = p_signal_id and sm.revoked_at is null and (
              (sm.mention_kind = 'person' and sm.target_person_id = shared.current_person_id())
              or (sm.mention_kind = 'team' and exists (
                select 1 from shared.team_memberships m2
                where m2.team_id = sm.target_team_id and m2.person_id = shared.current_person_id()
                  and m2.effective_from <= current_date
                  and (m2.effective_to is null or m2.effective_to >= current_date)))
              or (sm.mention_kind = 'bu' and exists (
                select 1 from shared.person_roles pr2
                join shared.roles r2 on r2.id = pr2.role_id
                where pr2.person_id = shared.current_person_id() and r2.business_unit_id = sm.target_bu_id))))
        )
        or shared.can('signal.read_all') -- R5 override
      )
  )
$$;

comment on function mos._can_read_signal_rules(uuid, uuid) is
  'Canonical R1-R5 Signal read predicates. A NULL signal id evaluates destination eligibility without R4, whose mention requires a real Signal.';
revoke execute on function mos._can_read_signal_rules(uuid, uuid) from public, anon;
grant execute on function mos._can_read_signal_rules(uuid, uuid) to authenticated;

create or replace function mos.can_read_signal(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from mos.signals s
    where s.id = p_signal_id
      and s.org_id = shared.current_org_id()
      and mos._can_read_signal_rules(s.id, s.owning_team_id)
  )
$$;

create or replace function mos.teams_author_can_read_back(
  p_author_id uuid default shared.current_person_id()
)
returns table (id uuid, name text, business_unit_id uuid, site_id uuid, is_primary boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select tm.id, tm.name, tm.business_unit_id, tm.site_id,
         exists (
           select 1 from shared.team_memberships m
           where m.team_id = tm.id and m.person_id = shared.current_person_id()
             and m.org_id = shared.current_org_id()
             and m.is_primary
             and m.effective_from <= current_date
             and (m.effective_to is null or m.effective_to >= current_date)
         ) as is_primary
  from shared.teams tm
  where tm.org_id = shared.current_org_id()
    and tm.archived_at is null
    and p_author_id = shared.current_person_id()
    and mos.can_post_signal_for_team(tm.id)
    and mos._can_read_signal_rules(null, tm.id)
  order by is_primary desc, tm.name
$$;
comment on function mos.teams_author_can_read_back(uuid) is
  'Returns destination Teams where the current user can post and a Signal would pass mos.can_read_signal. The optional author id must equal the current user. Destination rules also require tm.org_id = shared.current_org_id() (fail-closed). R4 explicit mentions are out of scope because no destination mention exists yet.';
revoke execute on function mos.teams_author_can_read_back(uuid) from public, anon;
grant execute on function mos.teams_author_can_read_back(uuid) to authenticated;

-- DOWN (apply in this order): restore the pre-branch inline read gate, then drop the helper and
-- destination function.
-- create or replace function mos.can_read_signal(p_signal_id uuid)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = ''
-- as $$
--   select exists (
--     select 1
--     from mos.signals s
--     join shared.teams tm on tm.id = s.owning_team_id
--     where s.id = p_signal_id
--       and s.org_id = shared.current_org_id()
--       and (
--         exists ( -- R1 active member of the owning Team
--           select 1 from shared.team_memberships m
--           where m.team_id = s.owning_team_id and m.person_id = shared.current_person_id()
--             and m.org_id = shared.current_org_id()
--             and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date))
--         or exists ( -- R2 holds a role scoped to the owning Team's parent BU
--           select 1 from shared.person_roles pr join shared.roles r on r.id = pr.role_id
--           where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()
--             and r.business_unit_id = tm.business_unit_id)
--         or ( -- R3 strictly higher BU visibility rank. Every rank defaults to 0, so this is INERT
--              -- until an admin configures ranks — fail-closed by construction.
--           coalesce((select max(coalesce(bu.signal_visibility_rank,0))
--                     from shared.person_roles pr join shared.roles r on r.id = pr.role_id
--                     join shared.business_units bu on bu.id = r.business_unit_id
--                     where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()), 0)
--           > coalesce((select bu2.signal_visibility_rank from shared.business_units bu2 where bu2.id = tm.business_unit_id), 0))
--         or exists ( -- R4 an explicit, unrevoked mention reaching the caller
--           select 1 from mos.signal_mentions sm
--           where sm.signal_id = s.id and sm.revoked_at is null and (
--             (sm.mention_kind='person' and sm.target_person_id = shared.current_person_id())
--             or (sm.mention_kind='team' and exists (
--                 select 1 from shared.team_memberships m2 where m2.team_id = sm.target_team_id
--                   and m2.person_id = shared.current_person_id()
--                   and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)))
--             or (sm.mention_kind='bu' and exists (
--                 select 1 from shared.person_roles pr2 join shared.roles r2 on r2.id = pr2.role_id
--                 where pr2.person_id = shared.current_person_id() and r2.business_unit_id = sm.target_bu_id))))
--         or shared.can('signal.read_all') -- R5 override; the capability is unregistered, so inert
--       ));
-- $$;
-- comment on function mos.can_read_signal(uuid) is
--   'Default-deny Signal read gate, rules R1..R5 (ADR-0050 D4). SECURITY DEFINER to break self-referential RLS recursion; org-gated first; returns only a boolean computed for the JWT caller.';
-- drop function mos.teams_author_can_read_back(uuid);
-- drop function mos._can_read_signal_rules(uuid, uuid);

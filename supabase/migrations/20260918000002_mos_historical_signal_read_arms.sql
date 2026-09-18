-- Signals: historical Team rows keep their author and retraction-authority read arms (ticket 874).

begin;

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
      left join shared.teams tm on tm.id = s.owning_team_id and tm.org_id = s.org_id
     where s.id = p_signal_id
       and s.org_id = shared.current_org_id()
       and (
         (s.audience = 'org' and shared._current_person_is_live())
         or (s.audience = 'team' and (
           -- An author may have posted for a Team outside their own membership or BU read path.
           s.author_id = shared.current_person_id()
           -- No active-row condition: a retraction authority must reach the row to retract it, and
           -- still inspect the tombstone afterwards, including once the owning Team is archived.
           -- tm.id keeps the left join fail-closed: an unresolved Team never reaches the grant.
           or (tm.id is not null
               and shared.role_authority_allows(
                     'signal.retract', tm.business_unit_id, s.owning_team_id, s.author_id))
           or mos._can_read_signal_rules(s.id, s.owning_team_id)
         ))
       )
  )
$$;
comment on function mos.can_read_signal(uuid) is
  'Default-deny Signal read gate. All Teams (org) rows are readable by every active same-org '
  'member. Historical team rows are readable by their author, by an effective signal.retract '
  'authority (valid on a tombstone), and through the Team-rooted R1..R3 grants plus additive R4 '
  'mention and inert R5. SECURITY DEFINER to break self-referential RLS recursion; org-gated first; '
  'returns only a boolean computed for the JWT caller.';
revoke execute on function mos.can_read_signal(uuid) from public, anon, authenticated;
grant  execute on function mos.can_read_signal(uuid) to authenticated;

comment on function shared._role_authority_defaults() is
  'Complete settings surface. signal.tag defaults to org for every role; signal.post defaults to '
  'org for member, ops_lead and admin, and member is the live-membership baseline, so every active '
  'same-org member posts and tags org-wide. signal.retract keeps scoped defaults.';

-- DOWN:
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
--     where s.id = p_signal_id
--       and s.org_id = shared.current_org_id()
--       and (
--         (s.audience = 'org' and shared._current_person_is_live())
--         or (s.audience = 'team' and mos._can_read_signal_rules(s.id, s.owning_team_id))
--       )
--   )
-- $$;
-- comment on function mos.can_read_signal(uuid) is
--   'Default-deny Signal read gate. All Teams (org) rows are readable by every active same-org '
--   'member; historical team rows keep the Team-rooted R1..R3 grants plus additive R4 mention and '
--   'inert R5. SECURITY DEFINER to break self-referential RLS recursion; org-gated first; returns only '
--   'a boolean computed for the JWT caller.';
-- comment on function shared._role_authority_defaults() is
--   'Complete settings surface. signal.post and signal.tag default to org for every role — every '
--   'active same-org member posts and tags org-wide; signal.retract keeps scoped defaults.';

commit;

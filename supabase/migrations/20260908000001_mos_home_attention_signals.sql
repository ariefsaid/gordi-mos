-- Home "Needs you now" for Signals — OD-WAY-96 (3, 6). #773.
--
-- FYI is feed-only. Needs-attention reaches every lead of the owning Team until any lead of that
-- Team acknowledges the row (any lead's ack clears the leads' amber for all leads). Urgent adds
-- every mentioned person and every unit head of the owning Team's business unit; a mentioned
-- viewer's Seen ✓ toggle is their own private clear and never removes the row from the leads.
-- Nobody must acknowledge to complete anything; acknowledgement changes no lifecycle field.
--
-- SECURITY INVOKER over the existing read gate (mos.can_read_signal), so the caller's own R1-R5
-- visibility is what returns rows. Org-walled (shared.current_org_id). No GUC / test bypass.
--
-- Reversal (paste into a transaction to restore the released predecessor — this migration adds
-- one function, so DOWN is the drop):
--   drop function if exists mos.home_attention_signals();

-- The Home "Needs you now" read for Signals. Answers "which Signals should this caller see on
-- Home right now, and is the caller a mentioned viewer for each" — used to render the row plus
-- pick the Seen ✓ chip state (prompted for mentioned, plain otherwise).
--
-- SECURITY INVOKER: mos.can_read_signal is the R1-R5 read gate and it stays the authority for
-- what the caller may see. The two arms below narrow that set; they never widen it.
--
-- Arms:
--   A. leads arm — the caller is a lead of the owning Team AND no lead of that Team has ack'd
--      yet. Includes both the lead-tier holders (arm 2 of mos.is_team_lead) and the unit head
--      (arm 3), because both are "leads" per the OD-WAY-96 predicate.
--   B. mentioned arm — Urgent only — the caller is mentioned (Person / Team member / BU role
--      holder) AND the caller has not personally ack'd yet. A mentioned viewer's ack removes
--      only their own view; leads still see the row through arm A until a lead ack's.
--
-- "Any lead ack'd" (arm A's clear condition) is answered inline rather than through a
-- person-parametrized helper. A helper that took (person, team) and answered lead facts about
-- arbitrary people would be executable by every authenticated user — a lead-graph oracle over
-- the whole org. mos.is_team_lead(team) stays the ONE lead question the caller may ask directly,
-- and it only ever answers about the caller. The three arms below mirror the shape of
-- mos.is_team_lead's three arms (20260906000001), evaluated for a.person_id — the acknowledger.
--
-- Nothing here writes; attention changes no lifecycle column (retracted_at, body,
-- owning_team_id, author_id, owning_team_id are guarded by mos._guard_signals, which this
-- read is deliberately independent of).
create or replace function mos.home_attention_signals()
returns table (
  id uuid,
  owning_team_id uuid,
  author_id uuid,
  body text,
  occurred_at timestamptz,
  attention text,
  category text,
  is_mentioned boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.owning_team_id,
    s.author_id,
    s.body,
    s.occurred_at,
    s.attention,
    s.category,
    exists (
      select 1 from mos.signal_mentions sm
      where sm.signal_id = s.id
        and sm.revoked_at is null
        and (
          (sm.mention_kind = 'person' and sm.target_person_id = shared.current_person_id())
          or (sm.mention_kind = 'team' and exists (
            select 1 from shared.team_memberships m
            where m.team_id = sm.target_team_id
              and m.person_id = shared.current_person_id()
              and m.org_id = shared.current_org_id()
              and m.effective_from <= current_date
              and (m.effective_to is null or m.effective_to >= current_date)))
          or (sm.mention_kind = 'bu' and exists (
            select 1 from shared.person_roles pr
            join shared.roles r on r.id = pr.role_id
            where pr.person_id = shared.current_person_id()
              and pr.org_id = shared.current_org_id()
              and r.business_unit_id = sm.target_bu_id))
        )
    ) as is_mentioned
  from mos.signals s
  join shared.teams owning_team
    on owning_team.id = s.owning_team_id
   and owning_team.org_id = shared.current_org_id()
  where s.org_id = shared.current_org_id()
    and s.retracted_at is null
    and s.attention in ('Needs attention', 'Urgent')
    and mos.can_read_signal(s.id)
    and (
      (
        mos.is_team_lead(s.owning_team_id)
        and not exists (
          -- "any lead of the owning Team ack'd" — inlined mirror of mos.is_team_lead's three arms,
          -- evaluated for a.person_id (the acknowledger) rather than the caller. Reads
          -- shared.person_access_roles directly (the JWT is a per-caller cache and cannot answer
          -- for a different person).
          select 1 from mos.signal_acknowledgements a
          where a.signal_id = s.id
            and (
              exists (
                select 1 from shared.person_access_roles par
                where par.person_id = a.person_id
                  and par.org_id = shared.current_org_id()
                  and par.access_role = 'admin'
                  and par.revoked_at is null
              )
              or (
                exists (
                  select 1 from shared.person_access_roles par
                  where par.person_id = a.person_id
                    and par.org_id = shared.current_org_id()
                    and par.access_role in ('ops_lead', 'supervisor', 'manager')
                    and par.revoked_at is null
                )
                and exists (
                  select 1
                  from shared.team_memberships home_membership
                  join shared.teams home_team on home_team.id = home_membership.team_id
                  where home_membership.person_id = a.person_id
                    and home_membership.org_id = shared.current_org_id()
                    and home_team.org_id = shared.current_org_id()
                    and (home_membership.is_primary or not exists (
                      select 1 from shared.team_memberships primary_membership
                      where primary_membership.person_id = a.person_id
                        and primary_membership.org_id = shared.current_org_id()
                        and primary_membership.is_primary
                        and primary_membership.effective_from <= current_date
                        and (primary_membership.effective_to is null or primary_membership.effective_to >= current_date)
                    ))
                    and home_membership.effective_from <= current_date
                    and (home_membership.effective_to is null or home_membership.effective_to >= current_date)
                    and home_team.business_unit_id = owning_team.business_unit_id
                )
              )
              or exists (
                select 1
                from shared.person_roles head_pr
                join shared.roles head_role on head_role.id = head_pr.role_id
                where head_pr.person_id = a.person_id
                  and head_pr.org_id = shared.current_org_id()
                  and head_role.business_unit_id = owning_team.business_unit_id
                  and head_role.reports_to_role_id is null
              )
            )
        )
      )
      or (
        s.attention = 'Urgent'
        and exists (
          select 1 from mos.signal_mentions sm
          where sm.signal_id = s.id
            and sm.revoked_at is null
            and (
              (sm.mention_kind = 'person' and sm.target_person_id = shared.current_person_id())
              or (sm.mention_kind = 'team' and exists (
                select 1 from shared.team_memberships m
                where m.team_id = sm.target_team_id
                  and m.person_id = shared.current_person_id()
                  and m.org_id = shared.current_org_id()
                  and m.effective_from <= current_date
                  and (m.effective_to is null or m.effective_to >= current_date)))
              or (sm.mention_kind = 'bu' and exists (
                select 1 from shared.person_roles pr
                join shared.roles r on r.id = pr.role_id
                where pr.person_id = shared.current_person_id()
                  and pr.org_id = shared.current_org_id()
                  and r.business_unit_id = sm.target_bu_id))
            )
        )
        and not exists (
          select 1 from mos.signal_acknowledgements a
          where a.signal_id = s.id
            and a.person_id = shared.current_person_id()
        )
      )
    )
  order by
    case s.attention when 'Urgent' then 2 when 'Needs attention' then 1 else 0 end desc,
    s.occurred_at desc;
$$;
comment on function mos.home_attention_signals() is
  'Home "Needs you now" for Signals (#773 / OD-WAY-96 (3, 6)). SECURITY INVOKER over '
  'mos.can_read_signal. Returns Needs-attention and Urgent Signals the caller should see now, '
  'with is_mentioned so the row picks its Seen ✓ chip state. Two arms: a lead of the owning '
  'Team (until any lead of that Team acks), and — Urgent only — a mentioned viewer (until they '
  'personally ack). Attention level changes no lifecycle column; the guard on mos.signals is '
  'unchanged.';
revoke execute on function mos.home_attention_signals() from public, anon;
grant  execute on function mos.home_attention_signals() to authenticated;

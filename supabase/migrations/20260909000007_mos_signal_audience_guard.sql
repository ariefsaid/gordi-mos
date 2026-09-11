-- Prevent new Signal audience rows after a Signal has become a tombstone.
-- Existing mention rows remain readable and author UPDATE remains available only for revocation.

-- DOWN (manual, before production): drop the tombstone guard and policy below and restore the
-- 20260909000006 insert-policy body without the parent `retracted_at is null` predicate. Restore the
-- unchanged 20260909000006 mention UPDATE policy only after dropping the tombstone guard; authors
-- retain the revoke-only path for active Signals.
--   drop trigger signal_mentions_tombstone_guard on mos.signal_mentions;
--   drop function mos._guard_signal_mention_tombstone_audience();

drop policy signal_mentions_insert on mos.signal_mentions;

create policy signal_mentions_insert on mos.signal_mentions
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and mos._is_signal_author(signal_id)
    and exists (
      select 1
        from mos.signals s
       where s.id = signal_id
         and s.org_id = shared.current_org_id()
         and s.retracted_at is null
    )
    and case mention_kind
      when 'person' then
        shared.role_authority_allows('signal.tag', null, null, null)
        and exists (
          select 1 from shared.people p
           where p.id = target_person_id
             and p.org_id = shared.current_org_id()
             and p.archived_at is null
        )
      when 'team' then
        shared.role_authority_allows('signal.tag', null, target_team_id, null)
        and exists (
          select 1 from shared.teams t
           where t.id = target_team_id
             and t.org_id = shared.current_org_id()
             and t.archived_at is null
        )
      when 'bu' then
        shared.role_authority_allows('signal.tag', target_bu_id, null, null)
        and exists (
          select 1 from shared.business_units b
           where b.id = target_bu_id
             and b.org_id = shared.current_org_id()
             and b.archived_at is null
        )
      else false
    end
  );
comment on policy signal_mentions_insert on mos.signal_mentions is
  'Only an author may add active same-org person/Team/BU audience rows to an active Signal. A '
  'retracted Signal retains its original audience but cannot acquire new mention rows.';

create or replace function mos._guard_signal_mention_tombstone_audience()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.revoked_at is distinct from old.revoked_at
     and exists (
       select 1
         from mos.signals s
        where s.id = old.signal_id
          and s.org_id = old.org_id
          and s.retracted_at is not null
     ) then
    raise exception 'a retracted Signal''s original audience is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_signal_mention_tombstone_audience() is
  'Freezes revoked_at after the parent Signal becomes a tombstone. Active Signal mention '
  'revocation and un-revocation remain available through the existing author-only UPDATE policy.';
revoke execute on function mos._guard_signal_mention_tombstone_audience() from public, anon, authenticated;
create trigger signal_mentions_tombstone_guard
  before update on mos.signal_mentions
  for each row execute function mos._guard_signal_mention_tombstone_audience();

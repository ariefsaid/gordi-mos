-- Serialize audience changes with the parent Signal and stamp report creation time.
create or replace function mos._guard_signal_mention_tombstone_audience()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_retracted_at timestamptz;
begin
  if tg_op = 'INSERT' or new.revoked_at is distinct from old.revoked_at then
    select s.retracted_at into parent_retracted_at
      from mos.signals s where s.id = new.signal_id and s.org_id = new.org_id
      for share;
    if parent_retracted_at is not null then
      raise exception 'a retracted Signal''s original audience is immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function mos._guard_signal_mention_tombstone_audience() from public, anon, authenticated;
drop trigger signal_mentions_tombstone_guard on mos.signal_mentions;
create trigger signal_mentions_tombstone_guard before insert or update on mos.signal_mentions
  for each row execute function mos._guard_signal_mention_tombstone_audience();

create or replace function ops._guard_cafe_missing_item_report()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.org_id is distinct from shared.current_org_id()
       or new.reported_by is distinct from shared.current_person_id()
       or not new.needs_attention
       or new.resolved_by is not null
       or new.resolved_at is not null then
      raise exception 'Café missing-item report attribution and open state are server-owned'
        using errcode = '42501';
    end if;
    if not (shared.is_cafe_affiliated()
            or shared.has_access_role('ops_lead')
            or shared.has_access_role('admin')) then
      raise exception 'only Café capturers may report missing items' using errcode = '42501';
    end if;
    if not exists (
      select 1 from shared.teams team
       where team.org_id = new.org_id
         and team.branch_id = new.branch_id
         and team.activity = new.activity
         and team.archived_at is null
    ) then
      raise exception 'Café missing-item report requires a live stream' using errcode = '23514';
    end if;
    new.reported_at := clock_timestamp();
    return new;
  end if;

  if new.org_id is distinct from old.org_id
     or new.branch_id is distinct from old.branch_id
     or new.activity is distinct from old.activity
     or new.item_name is distinct from old.item_name
     or new.reported_by is distinct from old.reported_by
     or new.reported_at is distinct from old.reported_at
     or new.needs_attention is distinct from false
     or old.needs_attention is distinct from true
     or new.resolved_by is distinct from old.resolved_by
     or new.resolved_at is distinct from old.resolved_at then
    raise exception 'Café missing-item reports may only be resolved once' using errcode = '42501';
  end if;
  new.resolved_by := shared.current_person_id();
  new.resolved_at := now();
  return new;
end;
$$;
revoke execute on function ops._guard_cafe_missing_item_report() from public, anon, authenticated;
